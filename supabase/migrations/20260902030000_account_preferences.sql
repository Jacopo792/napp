-- Preferences belong to the account, not to the browser.
--
-- Appearance, reading axes, the presence palette and the privacy switches all
-- lived in localStorage, which means two browsers signed into the same account
-- disagreed about every one of them — and the disagreement was invisible until
-- one of them looked wrong. One jsonb column on the row that already carries
-- the nickname is the whole fix: the client owns the shape, Postgres owns the
-- copy, and `profiles` is already published to Realtime, so the second browser
-- is told rather than left behind.
--
-- Not everything moves here. Pane widths, collapsed groups and the per-note
-- "remarks I have seen" stamps are facts about a device looking, and they stay
-- where they are.
alter table public.profiles
  add column if not exists preferences jsonb not null default '{}'::jsonb;
