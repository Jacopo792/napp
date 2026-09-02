import assert from "node:assert/strict";
import test from "node:test";
import type { NoteRow } from "./access.ts";
import { createAuthorizer, unverifiedSubject, type Lookup } from "./authorize.ts";

const NOTE: NoteRow = {
  id: "note",
  archive_id: "archive",
  trashed_at: null,
  locked_by: null,
};

function archive(initial: { role: string | null; note?: NoteRow | null }) {
  const state = { role: initial.role, note: initial.note === undefined ? NOTE : initial.note };
  let calls = 0;
  const lookup: Lookup = async () => {
    calls += 1;
    return { userId: "member", note: state.note, role: state.role, nickname: "Jo" };
  };
  return { state, lookup, calls: () => calls };
}

test("an editor is allowed to write and gets a server-assigned identity", async () => {
  const { lookup } = archive({ role: "editor" });
  const authorize = createAuthorizer(lookup);
  const answer = await authorize("token", "note");
  assert.equal(answer.allowed, true);
  assert.equal(answer.allowed && answer.readOnly, false);
  assert.equal(answer.allowed && answer.identity.name, "Jo");
  assert.match(answer.allowed ? answer.identity.color : "", /^hsl\(/);
});

test("the archive is asked once per short window, not once per keystroke", async () => {
  const world = archive({ role: "editor" });
  let clock = 0;
  const authorize = createAuthorizer(world.lookup, { ttl: 5000, now: () => clock });

  for (let stroke = 0; stroke < 50; stroke++) await authorize("token", "note");
  assert.equal(world.calls(), 1, "every keystroke reached the database");

  clock += 5001;
  await authorize("token", "note");
  assert.equal(world.calls(), 2, "the answer was never refreshed");
});

test("a demotion is noticed within the window, and at once when asked freshly", async () => {
  const world = archive({ role: "editor" });
  let clock = 0;
  const authorize = createAuthorizer(world.lookup, { ttl: 5000, now: () => clock });

  assert.equal((await authorize("token", "note")).allowed, true);
  world.state.role = "viewer";

  const stale = await authorize("token", "note");
  assert.equal(stale.allowed && stale.readOnly, false, "the cache is meant to be a short one");

  // A refreshed token is a reason to ask again immediately: that is what the
  // periodic `requestToken()` is for.
  const asked = await authorize("token", "note", { fresh: true });
  assert.equal(asked.allowed && asked.readOnly, true);

  clock += 5001;
  const later = await authorize("token", "note");
  assert.equal(later.allowed && later.readOnly, true);
});

test("losing membership altogether is a refusal, not a demotion", async () => {
  const world = archive({ role: "editor" });
  const authorize = createAuthorizer(world.lookup, { ttl: 0 });
  assert.equal((await authorize("token", "note")).allowed, true);

  world.state.role = null;
  assert.equal((await authorize("token", "note")).allowed, false);

  world.state.role = "editor";
  world.state.note = null; // row level security stopped returning it
  assert.equal((await authorize("token", "note")).allowed, false);
});

test("a note in the trash is read-only for everybody", async () => {
  const world = archive({ role: "editor" });
  world.state.note = { ...NOTE, trashed_at: "2026-08-31T10:00:00.000Z" };
  const authorize = createAuthorizer(world.lookup);
  const answer = await authorize("token", "note");
  assert.equal(answer.allowed && answer.readOnly, true);
});

test("a token that no longer identifies anybody is refused", async () => {
  const authorize = createAuthorizer(async () => null);
  const answer = await authorize("expired", "note");
  assert.equal(answer.allowed, false);
  assert.match(answer.allowed ? "" : answer.reason, /sign in/i);
});

test("a database that is briefly down refuses without remembering the refusal", async () => {
  let down = true;
  let calls = 0;
  const lookup: Lookup = async () => {
    calls += 1;
    if (down) throw new Error("connection reset");
    return { userId: "member", note: NOTE, role: "editor", nickname: "Jo" };
  };
  const authorize = createAuthorizer(lookup, { ttl: 60_000 });

  assert.equal((await authorize("token", "note")).allowed, false);
  down = false;
  // A cached failure would lock the writer out for the whole window.
  assert.equal((await authorize("token", "note")).allowed, true);
  assert.equal(calls, 2);
});

test("two accounts on one server never share an answer", async () => {
  const lookup: Lookup = async (token) => ({
    userId: token === "mine" ? "me" : "you",
    note: NOTE,
    role: token === "mine" ? "editor" : "viewer",
    nickname: token === "mine" ? "Me" : "You",
  });
  const authorize = createAuthorizer(lookup, { ttl: 60_000 });

  const mine = await authorize("mine", "note");
  const yours = await authorize("yours", "note");
  assert.equal(mine.allowed && mine.readOnly, false);
  assert.equal(yours.allowed && yours.readOnly, true);
  assert.notEqual(
    mine.allowed && mine.identity.color,
    yours.allowed && yours.identity.color,
    "two accounts were given the same caret colour",
  );
});

/* `unverifiedSubject` only decides which profile row is worth fetching early.
   It must never throw on a token it cannot read, because the fallback path —
   ask again once `getUser` has answered — is what its `null` selects. */
function jwt(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.signature`;
}

test("the unverified subject reads sub from a well-formed token", () => {
  assert.equal(unverifiedSubject(jwt({ sub: "member", exp: 1 })), "member");
});

test("the unverified subject refuses anything it cannot read", () => {
  for (const token of [
    "",
    "not-a-jwt",
    "header..signature",
    "header.$$$notbase64$$$.signature",
    jwt({ exp: 1 }),
    jwt({ sub: "" }),
    jwt({ sub: 42 }),
  ]) {
    assert.equal(unverifiedSubject(token), null, `accepted ${JSON.stringify(token)}`);
  }
});

test("base64url tokens decode as well as base64 ones", () => {
  /* `-` and `_` stand in for `+` and `/`, and a payload carrying them must not
     come back as a different id than the one that was signed. */
  const sub = "a?b>c~d";
  const decoded = unverifiedSubject(jwt({ sub }));
  assert.equal(decoded, sub);
});
