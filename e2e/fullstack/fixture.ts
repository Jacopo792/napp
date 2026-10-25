import { test as base, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { localStack } from "../local.ts";

type Client = SupabaseClient;
export interface Account {
  id: string;
  nickname: string;
  email: string;
  password: string;
  client: Client;
  archiveId: string;
}
export const test = base.extend<{
  accounts: { create(label: string): Promise<Account>; admin: Client };
}>({
  accounts: async ({ page: fixturePage }, provide) => {
    const stack = localStack();
    const admin = createClient(stack.url, stack.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ids: string[] = [];
    const clients: Client[] = [];
    try {
      await provide({
        admin,
        async create(label) {
          const email = `e2e-${label}-${randomUUID()}@example.test`;
          const password = `E2e-${randomUUID()}!`;
          const created = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          if (created.error || !created.data.user)
            throw new Error("Could not create local E2E account");
          const id = created.data.user.id;
          ids.push(id);
          const client = createClient(stack.url, stack.key, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          clients.push(client);
          // Provision the fixture session without spending the UI password
          // sign-in quota. generateLink returns a token without sending mail.
          const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
          if (link.error || !link.data.properties?.hashed_token)
            throw new Error("Could not provision local E2E session");
          const signedIn = await client.auth.verifyOtp({
            type: "magiclink",
            token_hash: link.data.properties.hashed_token,
          });
          if (signedIn.error) throw new Error("Could not sign in local E2E account");
          const profile = await client.from("profiles").insert({ user_id: id, nickname: label });
          if (profile.error) throw new Error(profile.error.message);
          const archive = await client.rpc("ensure_personal_archive");
          if (archive.error) throw new Error(archive.error.message);
          const renamed = await client
            .from("archives")
            .update({ name: `E2E ${label}` })
            .eq("id", archive.data);
          if (renamed.error) throw new Error(renamed.error.message);
          return {
            id,
            nickname: label,
            email,
            password,
            client,
            archiveId: archive.data as string,
          };
        },
      });
    } finally {
      await fixturePage.close();
      await expect
        .poll(async () => (await fetch("http://127.0.0.1:1236/idle")).status, {
          message: "The collaboration server must flush fixture documents before cleanup",
          timeout: 15_000,
        })
        .toBe(204);
      for (const client of clients) await client.removeAllChannels();
      if (ids.length) {
        const removed = await admin.from("archives").delete().in("created_by", ids);
        expect(removed.error, "E2E archive cleanup").toBeNull();
        for (const id of ids) {
          const result = await admin.auth.admin.deleteUser(id);
          if (result.error?.code !== "user_not_found")
            expect(result.error, "E2E account cleanup").toBeNull();
        }
      }
    }
  },
});
export { expect };

export async function login(page: Page, account: Account, path = "/") {
  await page.goto(path);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  // Existing accounts follow the real acceptance flow as well.
  const acceptance = page.getByRole("heading", { name: "Before you continue" });
  await expect(
    acceptance
      .or(page.locator("[data-note-row]").first())
      .or(page.getByRole("button", { name: "New note", exact: true }).first())
      .or(page.getByRole("heading", { name: "Choose an archive" })),
  ).toBeVisible();
  if (await page.getByRole("heading", { name: "Choose an archive" }).isVisible()) {
    const archives = await account.client
      .from("archives")
      .select("name")
      .eq("id", account.archiveId)
      .single();
    await page
      .getByRole("button")
      .filter({ has: page.getByText(archives.data!.name, { exact: true }) })
      .click();
  }
  await expect(
    acceptance.or(page.getByRole("button", { name: "New note", exact: true }).first()),
  ).toBeVisible();
  if (await acceptance.isVisible()) {
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Agree and continue" }).click();
  }
  await expect(page.getByRole("button", { name: "New note", exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close What's New", exact: true }).click();
}

export async function seedNote(account: Account, title: string) {
  const id = randomUUID();
  const result = await account.client.from("notes").insert({
    id,
    archive_id: account.archiveId,
    owner_id: account.id,
    title,
    body: "An initial paragraph.",
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "An initial paragraph." }] }],
    },
    content_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (result.error) throw new Error(result.error.message);
  return id;
}

export async function openNote(page: Page, id: string) {
  await page.locator(`[data-note-row="${id}"]`).click();
  await expect(page.getByRole("textbox", { name: "Note title", exact: true })).toBeEditable();
  await expect(page.locator(".tiptap[contenteditable=true]")).toBeVisible();
}

export async function showMemberNotes(page: Page, account: Account) {
  await page.getByRole("button", { name: `${account.nickname}'s notes`, exact: true }).click();
}

export async function invite(owner: Account, member: Account) {
  const result = await owner.client.rpc("create_archive_invite", {
    archive_id: owner.archiveId,
    email: member.email,
    role: "editor",
  });
  if (result.error) throw new Error(result.error.message);
  return result.data as string;
}

export async function join(owner: Account, member: Account) {
  const token = await invite(owner, member);
  const result = await member.client.rpc("claim_archive_invite", { token });
  if (result.error) throw new Error(result.error.message);
  member.archiveId = owner.archiveId;
}
