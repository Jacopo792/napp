import {
  test,
  expect,
  login,
  seedNote,
  openNote,
  invite,
  join,
  showMemberNotes,
} from "./fixture.ts";

test("typing survives a reload and is persisted by the collaboration server", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("writer");
  await login(page, account);
  await page.getByRole("button", { name: "New note", exact: true }).first().click();
  const title = page.getByRole("textbox", { name: "Note title", exact: true });
  await expect(page.locator(".tiptap[contenteditable=true]")).toBeVisible();
  await title.fill("E2E durable writing");
  await page
    .locator(".tiptap[contenteditable=true]")
    .fill("Words that must survive closing the browser.");
  let id = "";
  await expect
    .poll(async () => {
      const result = await account.client
        .from("notes")
        .select("id,body")
        .eq("archive_id", account.archiveId)
        .eq("title", "E2E durable writing")
        .maybeSingle();
      id = result.data?.id ?? "";
      return result.data?.body;
    })
    .toContain("Words that must survive");
  await page.reload();
  await openNote(page, id);
  await expect(title).toHaveValue("E2E durable writing");
  await expect(page.locator(".tiptap")).toContainText("Words that must survive");
});

test("an outsider cannot read another archive through UI or PostgREST", async ({
  page,
  accounts,
}) => {
  const owner = await accounts.create("owner");
  const outsider = await accounts.create("outsider");
  const id = await seedNote(owner, "Private E2E sentinel");
  await login(page, outsider);
  await expect(page.locator(`[data-note-row="${id}"]`)).toHaveCount(0);
  const rows = await outsider.client.from("notes").select("id,title,body").eq("id", id);
  expect(rows.error).toBeNull();
  expect(rows.data).toEqual([]);
  // Tampering with the local archive selection must still not grant access.
  await page.evaluate(
    ({ archiveId }) => {
      const raw = localStorage.getItem("napp:archive-session");
      if (!raw) throw new Error("No restored archive session");
      localStorage.setItem(
        "napp:archive-session",
        JSON.stringify({ ...JSON.parse(raw), archiveId }),
      );
    },
    { archiveId: owner.archiveId },
  );
  await page.reload();
  await expect(page.getByText("Private E2E sentinel", { exact: true })).toHaveCount(0);
  await expect(page.locator(".tiptap")).toHaveCount(0);
});

test("an invitation claimed through sign-in grants access but cannot grant a stranger access", async ({
  page,
  accounts,
}) => {
  const owner = await accounts.create("inviter");
  const member = await accounts.create("invitee");
  const id = await seedNote(owner, "Shared E2E invitation");
  const token = await invite(owner, member);
  member.archiveId = owner.archiveId;
  await login(page, member, `/?invite=${encodeURIComponent(token)}`);
  await showMemberNotes(page, owner);
  await expect(page.locator(`[data-note-row="${id}"]`)).toContainText("Shared E2E invitation");
  await openNote(page, id);
  const replay = await member.client.rpc("claim_archive_invite", { token });
  expect(replay.error).toBeNull();
  expect(replay.data).toBe(owner.archiveId);
  const stranger = await accounts.create("invitation-stranger");
  const stolen = await stranger.client.rpc("claim_archive_invite", { token });
  expect(stolen.error).not.toBeNull();
  const membership = await stranger.client
    .from("archive_members")
    .select("user_id")
    .eq("archive_id", owner.archiveId);
  expect(membership.error).toBeNull();
  expect(membership.data).toEqual([]);
});

test("offline edits converge with a second browser and survive reopening", async ({
  page,
  browser,
  accounts,
}) => {
  const owner = await accounts.create("offline-writer");
  const member = await accounts.create("online-reader");
  await join(owner, member);
  const id = await seedNote(owner, "Offline E2E note");
  await login(page, owner);
  await openNote(page, id);
  const other = await browser.newContext();
  try {
    const reader = await other.newPage();
    await login(reader, member);
    await showMemberNotes(reader, owner);
    await openNote(reader, id);
    await page.context().setOffline(true);
    await page.locator(".tiptap[contenteditable=true]").press("ControlOrMeta+End");
    await page.keyboard.insertText(" A sentence written offline.");
    await expect(page.locator(".tiptap")).toContainText("A sentence written offline.");
    await expect(reader.locator(".tiptap")).not.toContainText("A sentence written offline.");
    await page.context().setOffline(false);
    await expect(reader.locator(".tiptap")).toContainText("A sentence written offline.");
    await expect
      .poll(
        async () =>
          (await owner.client.from("notes").select("body").eq("id", id).single()).data?.body,
      )
      .toContain("A sentence written offline.");
    await reader.reload();
    await showMemberNotes(reader, owner);
    await openNote(reader, id);
    await expect(reader.locator(".tiptap")).toContainText("A sentence written offline.");
  } finally {
    await page.context().setOffline(false);
    await other.close();
  }
});

test("a note locked by another member remains readable but cannot be edited", async ({
  page,
  accounts,
}) => {
  const owner = await accounts.create("lock-owner");
  const member = await accounts.create("lock-reader");
  await join(owner, member);
  const id = await seedNote(owner, "Locked E2E note");
  const locked = await owner.client.from("notes").update({ locked_by: owner.id }).eq("id", id);
  expect(locked.error).toBeNull();
  await login(page, member);
  await showMemberNotes(page, owner);
  await page.locator(`[data-note-row="${id}"]`).click();
  await expect(page.getByRole("textbox", { name: "Note title", exact: true })).not.toBeEditable();
  await expect(page.locator(".tiptap")).toContainText("An initial paragraph.");
  await expect(page.locator(".tiptap")).toHaveAttribute("contenteditable", "false");
  const write = await member.client
    .from("notes")
    .update({ title: "Tampered" })
    .eq("id", id)
    .select("id");
  expect(write.data ?? []).toEqual([]);
});
