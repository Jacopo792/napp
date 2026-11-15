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

test("a slow new-note insert is committed before collaboration opens it", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("slow-create");
  await seedNote(account, "Keep the existing note unchanged");
  let pendingId = "";
  let committed = false;
  const prematureFrames: string[] = [];
  const legacyWrites: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname === "/rest/v1/notes") {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (["title", "body", "content"].some((field) => field in body))
        legacyWrites.push(request.url());
    }
  });
  await page.routeWebSocket("ws://127.0.0.1:1235", (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((payload) => {
      if (pendingId && !committed && Buffer.from(payload).includes(Buffer.from(pendingId)))
        prematureFrames.push(pendingId);
      server.send(payload);
    });
    server.onMessage(async (payload) => {
      // Keep the title visible before its live document arrives, deterministically.
      await new Promise((resolve) => setTimeout(resolve, 750));
      socket.send(payload);
    });
  });
  await login(page, account);
  await page.route("**/rest/v1/notes*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    pendingId = (route.request().postDataJSON() as { id: string }).id;
    // A slow insert must not turn an optimistic selection into an auth refusal.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await route.fetch();
    committed = response.ok();
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "New note", exact: true }).first().click();
  // Filling as soon as the title appears must wait for its live Y.Text,
  // rather than enqueue a legacy REST write while the document is connecting.
  await page.getByRole("textbox", { name: "Note title", exact: true }).fill("Slow-created title");
  const editor = page.locator(".tiptap[contenteditable=true]");
  await expect(editor).toBeVisible();
  expect(pendingId).not.toBe("");
  expect(committed).toBe(true);
  expect(prematureFrames).toEqual([]);
  await expect(page.getByText("Unavailable", { exact: true })).toHaveCount(0);
  await editor.fill("A slow insert still opens a writable document.");
  await expect
    .poll(
      async () =>
        (await account.client.from("notes").select("title,body").eq("id", pendingId).single()).data,
    )
    .toMatchObject({
      title: "Slow-created title",
      body: "A slow insert still opens a writable document.",
    });
  expect(legacyWrites).toEqual([]);
  await page.reload();
  await openNote(page, pendingId);
  await expect(page.getByRole("textbox", { name: "Note title", exact: true })).toHaveValue(
    "Slow-created title",
  );
  await expect(page.getByRole("button", { name: "Save failed", exact: true })).toHaveCount(0);
});

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

test("a member keeps reading what the lock holder writes after locking", async ({
  page,
  browser,
  accounts,
}) => {
  const owner = await accounts.create("live-lock-owner");
  const member = await accounts.create("live-lock-reader");
  await join(owner, member);
  const id = await seedNote(owner, "Live locked note");
  await login(page, owner);
  await openNote(page, id);
  const other = await browser.newContext();
  try {
    const reader = await other.newPage();
    await login(reader, member);
    await showMemberNotes(reader, owner);
    await openNote(reader, id);
    const locked = await owner.client.from("notes").update({ locked_by: owner.id }).eq("id", id);
    expect(locked.error).toBeNull();
    await page.locator(".tiptap[contenteditable=true]").press("ControlOrMeta+End");
    await page.keyboard.insertText(" Written after locking.");
    await expect(reader.locator(".tiptap")).toContainText("Written after locking.");
    await expect(reader.locator(".tiptap")).toHaveAttribute("contenteditable", "false");
    await reader.reload();
    await showMemberNotes(reader, owner);
    await reader.locator(`[data-note-row="${id}"]`).click();
    await expect(reader.locator(".tiptap")).toContainText("Written after locking.");
  } finally {
    await other.close();
  }
});

test("a member opening a locked note sees everything written after locking", async ({
  page,
  browser,
  accounts,
}) => {
  const owner = await accounts.create("late-lock-owner");
  const member = await accounts.create("late-lock-reader");
  await join(owner, member);
  const id = await seedNote(owner, "Late locked note");
  await login(page, owner);
  await openNote(page, id);
  const locked = await owner.client.from("notes").update({ locked_by: owner.id }).eq("id", id);
  expect(locked.error).toBeNull();
  await page.locator(".tiptap[contenteditable=true]").press("ControlOrMeta+End");
  await page.keyboard.insertText(" Written before the reader arrived.");
  await expect
    .poll(
      async () =>
        (await owner.client.from("notes").select("body").eq("id", id).single()).data?.body,
    )
    .toContain("Written before the reader arrived.");
  const other = await browser.newContext();
  try {
    const reader = await other.newPage();
    await login(reader, member);
    await showMemberNotes(reader, owner);
    await reader.locator(`[data-note-row="${id}"]`).click();
    await expect(reader.locator(".tiptap")).toContainText("Written before the reader arrived.");
  } finally {
    await other.close();
  }
});

test("words the server refused under a lock do not linger on the member's screen", async ({
  page,
  browser,
  accounts,
}) => {
  const owner = await accounts.create("race-lock-owner");
  const member = await accounts.create("race-lock-reader");
  await join(owner, member);
  const id = await seedNote(owner, "Raced locked note");
  await login(page, owner);
  await openNote(page, id);
  const other = await browser.newContext();
  try {
    const reader = await other.newPage();
    // The member never hears about the lock, as in the moment before it lands.
    await reader.routeWebSocket(/\/realtime\//, () => {});
    await login(reader, member);
    await showMemberNotes(reader, owner);
    await openNote(reader, id);
    const locked = await owner.client.from("notes").update({ locked_by: owner.id }).eq("id", id);
    expect(locked.error).toBeNull();
    // Past the collaboration server's authorization cache.
    await reader.waitForTimeout(6_000);
    await reader.locator(".tiptap[contenteditable=true]").press("ControlOrMeta+End");
    await reader.keyboard.insertText(" Refused words.");
    await page.locator(".tiptap[contenteditable=true]").press("ControlOrMeta+End");
    await page.keyboard.insertText(" The holder's words.");
    await expect(reader.locator(".tiptap")).toContainText("The holder's words.");
    await expect(reader.locator(".tiptap")).not.toContainText("Refused words.");
    await expect(page.locator(".tiptap")).not.toContainText("Refused words.");
  } finally {
    await other.close();
  }
});

test("a member who trashes a note just locked by its holder gets it back", async ({
  page,
  accounts,
}) => {
  const owner = await accounts.create("trash-lock-owner");
  const member = await accounts.create("trash-lock-reader");
  await join(owner, member);
  const id = await seedNote(owner, "Trash raced lock");
  // The member never hears about the lock, as in the moment before it lands.
  await page.routeWebSocket(/\/realtime\//, () => {});
  await login(page, member);
  await showMemberNotes(page, owner);
  const row = page.locator(`[data-note-row="${id}"]`);
  await expect(row).toBeVisible();
  const locked = await owner.client.from("notes").update({ locked_by: owner.id }).eq("id", id);
  expect(locked.error).toBeNull();
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const stored = await owner.client.from("notes").select("trashed_at").eq("id", id).single();
  expect(stored.data?.trashed_at).toBeNull();
});

test("a member's trash is everybody's trash", async ({ page, accounts }) => {
  const owner = await accounts.create("shared-trash-owner");
  const member = await accounts.create("shared-trash-member");
  await join(owner, member);
  const id = await seedNote(owner, "Shared trash note");
  await login(page, member);
  await showMemberNotes(page, owner);
  const row = page.locator(`[data-note-row="${id}"]`);
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await owner.client.from("notes").select("trashed_at").eq("id", id).single()).data
          ?.trashed_at ?? null,
    )
    .not.toBeNull();
});
