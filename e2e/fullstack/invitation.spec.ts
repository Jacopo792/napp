import { test, expect, seedNote, invite, showMemberNotes, type Account } from "./fixture.ts";

async function exists(admin: { from: Account["client"]["from"] }, archiveId: string) {
  const found = await admin.from("archives").select("id").eq("id", archiveId);
  expect(found.error).toBeNull();
  return found.data!.length === 1;
}

test("signing in through an invitation opens the shared archive and drops the empty default", async ({
  page,
  accounts,
}) => {
  const owner = await accounts.create("inviter");
  const member = await accounts.create("invitee");
  const id = await seedNote(owner, "Shared E2E invitation");
  const token = await invite(owner, member);
  const memberDefault = member.archiveId;

  await page.goto(`/?invite=${encodeURIComponent(token)}`);
  await page.getByLabel("Email", { exact: true }).fill(member.email);
  await page.getByLabel("Password", { exact: true }).fill(member.password);
  await page.locator("form").getByRole("button", { name: "Sign in", exact: true }).click();
  const acceptance = page.getByRole("heading", { name: "Before you continue" });
  const opened = page.getByRole("button", { name: "New note", exact: true }).first();
  await expect(acceptance.or(opened)).toBeVisible();
  if (await acceptance.isVisible()) {
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Agree and continue" }).click();
  }
  await expect(opened).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose an archive" })).toHaveCount(0);
  const session = await page.evaluate(() => localStorage.getItem("napp:archive-session"));
  expect(JSON.parse(session!).archiveId).toBe(owner.archiveId);
  await page
    .getByRole("button", { name: "Close settings", exact: true })
    .click({ position: { x: 4, y: 4 } });
  await showMemberNotes(page, owner);
  await expect(page.locator(`[data-note-row="${id}"]`)).toHaveCount(1);

  expect(await exists(accounts.admin, memberDefault)).toBe(false);
  expect(await exists(accounts.admin, owner.archiveId)).toBe(true);
});

test("redeeming keeps every default archive that holds anything, or is the shared one", async ({
  accounts,
}) => {
  const owner = await accounts.create("second-archive-owner");
  const member = await accounts.create("member-with-notes");
  const ownerDefault = owner.archiveId;
  await seedNote(member, "Mine before joining");

  const second = await owner.client.rpc("create_archive", { archive_name: "E2E second" });
  expect(second.error).toBeNull();
  owner.archiveId = second.data as string;
  const token = await invite(owner, member);
  const claimed = await member.client.rpc("claim_archive_invite", { token });
  expect(claimed.error).toBeNull();
  expect(claimed.data).toBe(owner.archiveId);

  // The member's default has a note: kept. The owner's is empty and not the
  // shared one: gone. The archive made with `create_archive` is never a default.
  expect(await exists(accounts.admin, member.archiveId)).toBe(true);
  expect(await exists(accounts.admin, ownerDefault)).toBe(false);
  expect(await exists(accounts.admin, owner.archiveId)).toBe(true);

  // An invitation from the owner's default keeps it, empty or not.
  const third = await accounts.create("third");
  const sharedDefault = await accounts.create("shares-default");
  const again = await invite(sharedDefault, third);
  const joined = await third.client.rpc("claim_archive_invite", { token: again });
  expect(joined.error).toBeNull();
  expect(await exists(accounts.admin, sharedDefault.archiveId)).toBe(true);
  expect(await exists(accounts.admin, third.archiveId)).toBe(false);
});
