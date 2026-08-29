#!/usr/bin/env node

import {
  decryptBytes,
  decryptFolder,
  decryptJson,
  decryptNote,
  decryptTag,
  importArchiveKey,
  unwrapArchiveKey,
} from "../src/lib/crypto.ts";
import { anonClient, assert, fail, loadEnv, requireEnv } from "./lib/env.mjs";

const apply = process.argv.includes("--apply");

function attachmentType(label) {
  const extension = label.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return (
    {
      pdf: "application/pdf",
      txt: "text/plain",
      md: "text/markdown",
      csv: "text/csv",
    }[extension] ?? "application/octet-stream"
  );
}

function sniffType(bytes) {
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

function referencedObjects(notes) {
  const types = new Map();
  for (const note of notes) {
    for (const match of note.body.matchAll(/napp-image:([0-9a-f-]{36})/gi)) {
      types.set(match[1], "image/webp");
    }
    for (const match of note.body.matchAll(/\[([^\]]+)]\(napp-file:([0-9a-f-]{36})\)/gi)) {
      types.set(match[2], attachmentType(match[1]));
    }
  }
  return types;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function listObjects(supabase, archiveId) {
  const objects = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.storage
      .from("note-images")
      .list(archiveId, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    fail(result.error);
    objects.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 1000) return objects;
  }
}

const env = await loadEnv();
requireEnv(env, [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "USER_ONE_EMAIL",
  "USER_ONE_PASSWORD",
]);

const supabase = anonClient(env);

try {
  const signedIn = await supabase.auth.signInWithPassword({
    email: env.USER_ONE_EMAIL,
    password: env.USER_ONE_PASSWORD,
  });
  fail(signedIn.error);
  assert(signedIn.data.user, "Jacopo account login failed");

  const vault = await supabase
    .from("vault_keys")
    .select("archive_id, wrapped_dek, kdf_salt, kdf_iterations")
    .eq("user_id", signedIn.data.user.id)
    .single();
  fail(vault.error);
  const rawDek = await unwrapArchiveKey(
    {
      wrappedDek: vault.data.wrapped_dek,
      kdfSalt: vault.data.kdf_salt,
      kdfIterations: vault.data.kdf_iterations,
    },
    env.USER_ONE_PASSWORD,
  );
  const key = await importArchiveKey(rawDek);
  const archiveId = vault.data.archive_id;

  const plaintextProbe = await supabase.from("notes").select("id, title").limit(1);
  const hasPlaintextSchema = !plaintextProbe.error;

  const [archiveResult, notesResult, foldersResult, tagsResult, membersResult, objects] =
    await Promise.all([
      supabase
        .from("archives")
        .select(
          hasPlaintextSchema ? "id, settings, settings_ciphertext" : "id, settings_ciphertext",
        )
        .eq("id", archiveId)
        .single(),
      supabase
        .from("notes")
        .select(
          hasPlaintextSchema
            ? "id, owner, title, body, ciphertext, created_at, updated_at, trashed_at, pinned, folder_id, version"
            : "id, owner, ciphertext, created_at, updated_at, trashed_at, pinned, folder_id, version",
        )
        .eq("archive_id", archiveId)
        .order("id"),
      supabase
        .from("folders")
        .select(
          hasPlaintextSchema
            ? "id, owner, name, parent_id, ciphertext, position"
            : "id, owner, ciphertext, position",
        )
        .eq("archive_id", archiveId)
        .order("id"),
      supabase
        .from("tags")
        .select(
          hasPlaintextSchema
            ? "id, owner, name, ciphertext, color"
            : "id, owner, ciphertext, color",
        )
        .eq("archive_id", archiveId)
        .order("id"),
      supabase.from("archive_members").select("user_id, owner").eq("archive_id", archiveId),
      listObjects(supabase, archiveId),
    ]);
  for (const result of [archiveResult, notesResult, foldersResult, tagsResult, membersResult]) {
    fail(result.error);
  }
  assert(membersResult.data.length >= 2, "Expected at least two archive members");

  const notes = await Promise.all(
    notesResult.data.map(async (row) => ({
      row,
      value:
        row.title !== null && row.title !== undefined && row.body !== null && row.body !== undefined
          ? { title: row.title, body: row.body }
          : await decryptNote(row.ciphertext, key),
    })),
  );
  const folders = await Promise.all(
    foldersResult.data.map(async (row) => ({
      row,
      value:
        row.name !== null && row.name !== undefined
          ? { name: row.name, parentId: row.parent_id ?? null }
          : await decryptFolder(row.ciphertext, key),
    })),
  );
  const tags = await Promise.all(
    tagsResult.data.map(async (row) => ({
      row,
      value:
        row.name !== null && row.name !== undefined
          ? { name: row.name }
          : await decryptTag(row.ciphertext, key),
    })),
  );
  const settings =
    archiveResult.data.settings ??
    (archiveResult.data.settings_ciphertext
      ? await decryptJson(key, archiveResult.data.settings_ciphertext)
      : {});
  const objectTypes = referencedObjects(notes.map(({ value }) => value));

  const preparedObjects = await Promise.all(
    objects.map(async (object) => {
      const path = `${archiveId}/${object.name}`;
      const downloaded = await supabase.storage.from("note-images").download(path);
      fail(downloaded.error);
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      const encrypted =
        !object.metadata?.mimetype || object.metadata.mimetype === "application/octet-stream";
      const plaintext = encrypted ? await decryptBytes(key, bytes) : bytes;
      return {
        id: object.name,
        path,
        type:
          objectTypes.get(object.name) ??
          (encrypted ? sniffType(plaintext) : (object.metadata?.mimetype ?? sniffType(plaintext))),
        plaintext,
        encrypted,
      };
    }),
  );

  const checksum = await digest({
    notes: notes.map(({ row, value }) => [row.id, value.title, value.body]),
    folders: folders.map(({ row, value }) => [row.id, value.name, value.parentId ?? null]),
    tags: tags.map(({ row, value }) => [row.id, value.name]),
    settings,
    objects: preparedObjects.map(({ id, plaintext }) => [id, plaintext.byteLength]),
  });

  if (apply) {
    for (const { row, value } of notes.filter(({ row }) => row.ciphertext)) {
      const result = await supabase
        .from("notes")
        .update({ title: value.title, body: value.body, ciphertext: null })
        .eq("archive_id", archiveId)
        .eq("id", row.id);
      fail(result.error);
    }
    for (const { row, value } of folders.filter(({ row }) => row.ciphertext)) {
      const result = await supabase
        .from("folders")
        .update({
          name: value.name,
          parent_id: value.parentId ?? null,
          ciphertext: null,
        })
        .eq("archive_id", archiveId)
        .eq("id", row.id);
      fail(result.error);
    }
    for (const { row, value } of tags.filter(({ row }) => row.ciphertext)) {
      const result = await supabase
        .from("tags")
        .update({ name: value.name, ciphertext: null })
        .eq("archive_id", archiveId)
        .eq("id", row.id);
      fail(result.error);
    }
    if (archiveResult.data.settings_ciphertext) {
      const archiveUpdate = await supabase
        .from("archives")
        .update({ settings, settings_ciphertext: null })
        .eq("id", archiveId);
      fail(archiveUpdate.error);
    }

    for (const object of preparedObjects.filter(({ encrypted }) => encrypted)) {
      const upload = await supabase.storage
        .from("note-images")
        .upload(object.path, new Blob([object.plaintext.slice().buffer], { type: object.type }), {
          contentType: object.type,
          upsert: true,
        });
      fail(upload.error);
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "applied" : "preflight",
        accounts: membersResult.data.length,
        notes: notes.length,
        folders: folders.length,
        tags: tags.length,
        objects: preparedObjects.length,
        encryptedNotes: notes.filter(({ row }) => row.ciphertext).length,
        encryptedFolders: folders.filter(({ row }) => row.ciphertext).length,
        encryptedTags: tags.filter(({ row }) => row.ciphertext).length,
        encryptedObjects: preparedObjects.filter(({ encrypted }) => encrypted).length,
        referencedObjects: objectTypes.size,
        checksum,
      },
      null,
      2,
    ),
  );
} finally {
  await supabase.auth.signOut({ scope: "local" });
}
