import { randomUUID } from "node:crypto";
import { test, expect, login, seedNote, openNote } from "./fixture.ts";

test("chat and archive remarks can subscribe together and reopen without crashing", async ({
  page,
  accounts,
}) => {
  const account = await accounts.create("chat-subscriptions");
  const noteId = await seedNote(account, "A conversation with its archive counter");
  const errors: string[] = [];
  const joined = new Set<string>();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      try {
        const packet = JSON.parse(payload.toString());
        const [topic, event, reply] = Array.isArray(packet)
          ? [packet[2], packet[3], packet[4]]
          : [packet.topic, packet.event, packet.payload];
        if (
          typeof topic === "string" &&
          topic.startsWith(`realtime:remarks:${account.archiveId}:`) &&
          event === "phx_reply" &&
          reply?.status === "ok"
        )
          joined.add(topic);
      } catch {
        // The editor's binary WebSocket is not the Realtime subscription.
      }
    });
  });
  await login(page, account);
  await openNote(page, noteId);
  await expect.poll(() => joined.size).toBe(1);
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = joined.size;
    await page.locator("button[aria-label=Chat]").click();
    const chat = page.getByRole("complementary", { name: "Chat about this note" });
    await expect(chat.getByRole("textbox", { name: "Message", exact: true })).toBeVisible();
    await expect.poll(() => joined.size).toBe(before + 1);
    const body = `A live message after opening ${attempt + 1}`;
    const inserted = await account.client.from("note_comments").insert({
      id: randomUUID(),
      archive_id: account.archiveId,
      note_id: noteId,
      thread_id: noteId,
      author_id: account.id,
      body,
    });
    expect(inserted.error).toBeNull();
    await expect(chat.getByText(body, { exact: true })).toBeVisible();
    await chat.getByRole("button", { name: "Close chat", exact: true }).click();
    await expect(chat).toBeHidden();
  }
  expect(errors).toEqual([]);
});
