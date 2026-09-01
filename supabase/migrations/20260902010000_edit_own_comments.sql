-- Comment authors may correct their own words. Resolution remains an editor
-- action on the whole thread, so the existing UPDATE policy stays broad and
-- this trigger enforces the column-specific ownership rule.

create or replace function private.freeze_comment_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $freeze$
begin
  if new.body is distinct from old.body then
    if old.author_id <> (select auth.uid()) then
      raise insufficient_privilege using message = 'Only the author may edit this comment';
    end if;
    new.body := btrim(new.body);
  end if;

  new.author_id := old.author_id;
  new.note_id := old.note_id;
  new.archive_id := old.archive_id;
  new.thread_id := old.thread_id;
  new.created_at := old.created_at;
  return new;
end;
$freeze$;
