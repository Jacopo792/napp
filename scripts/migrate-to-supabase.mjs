#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import {
  decryptFile,
  decryptMeta,
  deriveLegacySessionKeys,
  encryptBytes,
  encryptFolder,
  encryptJson,
  encryptNote,
  encryptTag,
  generateArchiveKeyBytes,
  importArchiveKey,
  unwrapArchiveKey,
  wrapArchiveKey,
} from "../src/lib/crypto.ts";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const run = promisify(execFile);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const provisionOnly = process.argv.includes("--provision-only");
const IMAGE_PATTERN =
  /!\[([^\]]*)\]\((data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+))\)/gi;

async function loadEnv() {
  const values = {};
  for (const filename of [".env", ".env.local"]) {
    try {
      const content = await readFile(resolve(root, filename), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const separator = trimmed.indexOf("=");
        values[trimmed.slice(0, separator).trim()] = trimmed
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { ...values, ...process.env };
}

function requireValues(env, names) {
  const missing = names.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing environment values: ${missing.join(", ")}`);
}

async function githubRequest(env, path, accept = "application/vnd.github+json") {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok)
    throw new Error(`GitHub ${path} failed: ${response.status} ${await response.text()}`);
  return response;
}

async function readFilesFromGitHub(env) {
  const listing = await githubRequest(env, `/repos/${env.GITHUB_REPO}/git/trees/data:notes`);
  const tree = (await listing.json()).tree.filter(
    (entry) => entry.type === "blob" && entry.path.endsWith(".napp"),
  );
  return Promise.all(
    tree.map(async (entry) => ({
      name: entry.path,
      content: await (
        await githubRequest(
          env,
          `/repos/${env.GITHUB_REPO}/git/blobs/${entry.sha}`,
          "application/vnd.github.raw",
        )
      ).text(),
    })),
  );
}

/**
 * The `data` branch is an ordinary git ref, so a clone that already has it
 * needs no API call and no token to read the archive. This is the default:
 * a personal access token is only required when reading a branch this
 * working copy does not have.
 */
async function readFilesFromGit(ref) {
  const listing = await run("git", ["ls-tree", "-r", "--name-only", ref], { cwd: root });
  const paths = listing.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("notes/") && line.endsWith(".napp"));
  if (paths.length === 0) throw new Error(`No .napp files found on ${ref}`);

  return Promise.all(
    paths.map(async (path) => ({
      name: path.slice("notes/".length),
      // A note carrying an embedded screenshot is comfortably over a megabyte
      // of base64, so the default pipe buffer is not enough.
      content: (
        await run("git", ["show", `${ref}:${path}`], { cwd: root, maxBuffer: 256 * 1024 * 1024 })
      ).stdout,
    })),
  );
}

async function readLegacyArchive(env) {
  const useGitHub = Boolean(env.GITHUB_PAT && env.GITHUB_REPO);
  const ref = env.LEGACY_GIT_REF ?? "origin/data";
  const files = useGitHub ? await readFilesFromGitHub(env) : await readFilesFromGit(ref);
  console.error(`Reading ${files.length} files from ${useGitHub ? "the GitHub API" : ref}`);

  const keys = await deriveLegacySessionKeys(env.MASTER_SEED);
  const notes = [];
  const metas = { u1: null, u2: null };
  for (const file of files) {
    const metaMatch = file.name.match(/^meta-(u[12])\.napp$/);
    if (metaMatch) {
      metas[metaMatch[1]] = await decryptMeta(file.content, keys);
      continue;
    }
    const note = await decryptFile(file.content, keys);
    if (!note) throw new Error(`Could not decrypt ${file.name}`);
    notes.push(note);
  }
  return {
    notes,
    metas: {
      u1: metas.u1 ?? { v: 1, folders: [], tags: [], notes: [] },
      u2: metas.u2 ?? { v: 1, folders: [], tags: [], notes: [] },
    },
  };
}

async function listUsers(admin) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function ensureUser(admin, email, password) {
  const existing = (await listUsers(admin)).find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    const updated = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (updated.error || !updated.data.user)
      throw updated.error ?? new Error(`Could not update ${email}`);
    return updated.data.user;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);
  return data.user;
}

async function prepareArchive(admin, env) {
  requireValues(env, [
    "USER_ONE_EMAIL",
    "USER_ONE_PASSWORD",
    "USER_ONE_PASSPHRASE",
    "USER_TWO_EMAIL",
    "USER_TWO_PASSWORD",
    "USER_TWO_PASSPHRASE",
  ]);

  const first = await ensureUser(admin, env.USER_ONE_EMAIL, env.USER_ONE_PASSWORD);
  const second = await ensureUser(admin, env.USER_TWO_EMAIL, env.USER_TWO_PASSWORD);

  const archiveResult = await admin.from("archives").select("id").limit(2);
  if (archiveResult.error) throw archiveResult.error;
  if (archiveResult.data.length > 1)
    throw new Error("More than one archive exists; select one explicitly");
  let archiveId = archiveResult.data[0]?.id;
  if (!archiveId) {
    const created = await admin
      .from("archives")
      .insert({ name: "Shared notes" })
      .select("id")
      .single();
    if (created.error) throw created.error;
    archiveId = created.data.id;
  }

  const membership = await admin.from("archive_members").upsert([
    { archive_id: archiveId, user_id: first.id, owner: "u1" },
    { archive_id: archiveId, user_id: second.id, owner: "u2" },
  ]);
  if (membership.error) throw membership.error;

  const existingKeys = await admin.from("vault_keys").select("*").eq("archive_id", archiveId);
  if (existingKeys.error) throw existingKeys.error;
  let rawDek;
  if (existingKeys.data.length > 0) {
    const candidates = [
      {
        user: first,
        credentials: [env.USER_ONE_PASSWORD, env.USER_ONE_PASSPHRASE],
      },
      {
        user: second,
        credentials: [env.USER_TWO_PASSWORD, env.USER_TWO_PASSPHRASE],
      },
    ];
    const candidate = candidates.find(({ user }) =>
      existingKeys.data.some((row) => row.user_id === user.id),
    );
    const row = existingKeys.data.find((item) => item.user_id === candidate?.user.id);
    if (!candidate || !row)
      throw new Error("Existing vault key does not belong to either configured user");
    for (const credential of new Set(candidate.credentials)) {
      try {
        rawDek = await unwrapArchiveKey(
          {
            wrappedDek: row.wrapped_dek,
            kdfSalt: row.kdf_salt,
            kdfIterations: row.kdf_iterations,
          },
          credential,
        );
        break;
      } catch {
        // Existing installations may still use the legacy archive passphrase.
      }
    }
    if (!rawDek) throw new Error("The existing archive key could not be unlocked");
  } else {
    rawDek = generateArchiveKeyBytes();
  }

  for (const { user, password } of [
    { user: first, password: env.USER_ONE_PASSWORD },
    { user: second, password: env.USER_TWO_PASSWORD },
  ]) {
    const wrapped = await wrapArchiveKey(rawDek, password);
    const result = await admin.from("vault_keys").upsert(
      {
        user_id: user.id,
        archive_id: archiveId,
        wrapped_dek: wrapped.wrappedDek,
        kdf_salt: wrapped.kdfSalt,
        kdf_iterations: wrapped.kdfIterations,
      },
      { onConflict: "user_id,archive_id" },
    );
    if (result.error) throw result.error;
  }

  return { archiveId, rawDek };
}

function deterministicImageId(noteId, index, bytes) {
  const digest = createHash("sha256")
    .update(noteId)
    .update(":")
    .update(String(index))
    .update(bytes)
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function extractImages(note, onImage) {
  let imageIndex = 0;
  let bytesSaved = 0;
  let imagesExtracted = 0;
  const replacements = [];
  for (const match of note.body.matchAll(IMAGE_PATTERN)) {
    const bytes = Buffer.from(match[3].replace(/\s/g, ""), "base64");
    const imageId = deterministicImageId(note.id, imageIndex++, bytes);
    replacements.push({
      from: match.index,
      to: match.index + match[0].length,
      text: `![${match[1] || "Image"}](napp-image:${imageId})`,
    });
    bytesSaved += Buffer.byteLength(match[0]) - Buffer.byteLength(replacements.at(-1).text);
    imagesExtracted++;
    await onImage(imageId, new Uint8Array(bytes));
  }
  let body = note.body;
  for (const replacement of replacements.reverse()) {
    body = `${body.slice(0, replacement.from)}${replacement.text}${body.slice(replacement.to)}`;
  }
  return { note: { ...note, body }, bytesSaved, imagesExtracted };
}

async function insertMissingRows(admin, table, rows, idColumn = "id") {
  if (rows.length === 0) return 0;
  const ids = rows.map((row) => row[idColumn]);
  const existing = await admin.from(table).select(idColumn).in(idColumn, ids);
  if (existing.error) throw existing.error;
  const found = new Set(existing.data.map((row) => row[idColumn]));
  const missing = rows.filter((row) => !found.has(row[idColumn]));
  if (missing.length > 0) {
    const inserted = await admin.from(table).insert(missing);
    if (inserted.error) throw inserted.error;
  }
  return missing.length;
}

async function migrate(env, legacy, admin, archiveId, rawDek) {
  const key = await importArchiveKey(rawDek);
  const metaByOwner = legacy.metas;
  const folderRows = [];
  const tagRows = [];
  for (const owner of ["u1", "u2"]) {
    for (const [position, folder] of metaByOwner[owner].folders.entries()) {
      folderRows.push({
        id: folder.id,
        archive_id: archiveId,
        owner,
        ciphertext: await encryptFolder(folder, key),
        position,
      });
    }
    for (const tag of metaByOwner[owner].tags) {
      tagRows.push({
        id: tag.id,
        archive_id: archiveId,
        owner,
        ciphertext: await encryptTag(tag, key),
        color: tag.color,
      });
    }
  }

  const existingNotesResult = await admin.from("notes").select("id").eq("archive_id", archiveId);
  if (existingNotesResult.error) throw existingNotesResult.error;
  const existingNotes = new Set(existingNotesResult.data.map((row) => row.id));
  const noteRows = [];
  const noteTagRows = [];
  let imagesExtracted = 0;
  let bytesSaved = 0;

  for (const original of legacy.notes) {
    if (existingNotes.has(original.id)) continue;
    const metadata = metaByOwner[original.owner].notes.find((item) => item.id === original.id) ?? {
      id: original.id,
      folderId: null,
      tagIds: [],
    };
    const extracted = await extractImages(original, async (imageId, bytes) => {
      const encrypted = await encryptBytes(key, bytes);
      const uploaded = await admin.storage
        .from("note-images")
        .upload(`${archiveId}/${imageId}`, encrypted, {
          contentType: "application/octet-stream",
          upsert: false,
        });
      if (uploaded.error && uploaded.error.statusCode !== "409") throw uploaded.error;
    });
    imagesExtracted += extracted.imagesExtracted;
    bytesSaved += extracted.bytesSaved;
    noteRows.push({
      id: extracted.note.id,
      archive_id: archiveId,
      owner: extracted.note.owner,
      ciphertext: await encryptNote(extracted.note, key),
      created_at: extracted.note.createdAt,
      updated_at: extracted.note.updatedAt,
      trashed_at: metadata.trashedAt ?? null,
      pinned: metadata.pinned ?? false,
      folder_id: metadata.folderId,
      version: 1,
    });
    noteTagRows.push(
      ...metadata.tagIds.map((tagId) => ({
        note_id: original.id,
        tag_id: tagId,
        archive_id: archiveId,
        owner: original.owner,
      })),
    );
  }

  if (dryRun) {
    return { notesWritten: noteRows.length, imagesExtracted, bytesSaved };
  }

  await insertMissingRows(admin, "folders", folderRows);
  await insertMissingRows(admin, "tags", tagRows);
  await insertMissingRows(admin, "notes", noteRows);
  if (noteTagRows.length > 0) {
    const relations = await admin.from("note_tags").upsert(noteTagRows, {
      onConflict: "note_id,tag_id",
      ignoreDuplicates: true,
    });
    if (relations.error) throw relations.error;
  }
  const settingsCiphertext = await encryptJson(key, {
    partnerName: metaByOwner.u1.partnerName,
  });
  const settings = await admin
    .from("archives")
    .update({ settings_ciphertext: settingsCiphertext })
    .eq("id", archiveId);
  if (settings.error) throw settings.error;

  return { notesWritten: noteRows.length, imagesExtracted, bytesSaved };
}

const env = await loadEnv();
if (provisionOnly) {
  requireValues(env, ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { archiveId } = await prepareArchive(admin, env);
  console.log(
    JSON.stringify(
      {
        provisioned: true,
        archiveId,
        accounts: [env.USER_ONE_EMAIL, env.USER_TWO_EMAIL],
      },
      null,
      2,
    ),
  );
} else {
  requireValues(env, ["MASTER_SEED"]);
  if (!/^[0-9a-f]{64}$/i.test(env.MASTER_SEED))
    throw new Error("MASTER_SEED must be 64 hex characters");

  const legacy = await readLegacyArchive(env);
  if (dryRun) {
    const rawDek = generateArchiveKeyBytes();
    const fakeAdmin = {
      from: () => ({
        select: () => ({ eq: async () => ({ data: [], error: null }) }),
      }),
      storage: {
        from: () => ({ upload: async () => ({ error: null }) }),
      },
    };
    const result = await migrate(env, legacy, fakeAdmin, crypto.randomUUID(), rawDek);
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          notesIn: legacy.notes.length,
          notesOut: result.notesWritten,
          imagesExtracted: result.imagesExtracted,
          bytesSaved: result.bytesSaved,
        },
        null,
        2,
      ),
    );
  } else {
    requireValues(env, ["VITE_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { archiveId, rawDek } = await prepareArchive(admin, env);
    const result = await migrate(env, legacy, admin, archiveId, rawDek);
    const total = await admin
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("archive_id", archiveId);
    if (total.error) throw total.error;
    console.log(
      JSON.stringify(
        {
          dryRun: false,
          archiveId,
          notesIn: legacy.notes.length,
          notesWritten: result.notesWritten,
          notesOut: total.count,
          imagesExtracted: result.imagesExtracted,
          bytesSaved: result.bytesSaved,
        },
        null,
        2,
      ),
    );
  }
}
