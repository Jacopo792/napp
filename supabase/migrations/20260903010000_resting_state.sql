-- What counts as edited, measured against where the note was resting rather
-- than against the save two seconds ago.
--
-- `save_note_document` compared the projection with `public.notes` as it stood,
-- which is the state the *previous* debounce tick wrote — and inside one burst
-- of typing that is not where the note was, it is the middle of the same
-- sentence. Open a note from yesterday, type a word, wait the two seconds the
-- server waits, delete the word: two saves, each of them an honest difference
-- from the one before, and a note that ends the minute byte-for-byte identical
-- to how it started while its stamp has moved twice. Both members then open it
-- looking for a change that was never made.
--
-- So the comparison gets an anchor. `resting_content` is what the note said
-- when it was last still, `resting_at` is when it got there, and a projection
-- equal to that anchor puts `updated_at` *back* — the note returns to its own
-- place in the list rather than to the top of it. A projection that differs
-- stamps now, which is honest: while you are editing, the note is edited.
--
-- The anchor moves only when the previous change has stood for `settle`. That
-- window is the whole judgement here: it is how long a note must sit unchanged
-- before that state becomes the one an undo is measured against. Five minutes
-- makes a pause for coffee part of the same burst and yesterday a separate
-- one. It is not a constant anybody should tune without saying why.
alter table public.note_documents
  add column if not exists resting_content jsonb,
  add column if not exists resting_at timestamptz;

create or replace function public.save_note_document(
  target_note_id uuid,
  document_state_base64 text,
  document_format_version integer,
  projected_title text,
  projected_body text,
  projected_content jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $save$
declare
  settle constant interval := '5 minutes';
  target_archive_id uuid;
  was_content jsonb;
  was_updated_at timestamptz;
  anchor_content jsonb;
  anchor_at timestamptz;
  stamp timestamptz;
  next_version bigint;
begin
  select n.archive_id, n.content, n.updated_at
    into target_archive_id, was_content, was_updated_at
    from public.notes n
   where n.id = target_note_id;
  if target_archive_id is null then
    raise exception 'No note %', target_note_id using errcode = 'PT404';
  end if;

  insert into public.note_documents (note_id, archive_id, state, format_version, updated_at)
  values (
    target_note_id, target_archive_id, decode(document_state_base64, 'base64'),
    document_format_version, now()
  )
  on conflict (note_id) do update
    set state = excluded.state,
        format_version = excluded.format_version,
        updated_at = excluded.updated_at;

  select nd.resting_content, nd.resting_at
    into anchor_content, anchor_at
    from public.note_documents nd
   where nd.note_id = target_note_id;

  -- No anchor yet, or the last change has been standing long enough to be what
  -- the note now says. Either way the note as it is *on the way in* becomes the
  -- thing an undo returns to — taken before this save is applied, because after
  -- it there is nothing left to compare against.
  if anchor_at is null or was_updated_at < now() - settle then
    anchor_content := was_content;
    anchor_at := was_updated_at;
    update public.note_documents
       set resting_content = anchor_content,
           resting_at = anchor_at
     where note_id = target_note_id;
  end if;

  if projected_content is not distinct from anchor_content then
    stamp := anchor_at;
  else
    stamp := now();
  end if;

  -- Nothing readable changed and the stamp is already right: leave the note
  -- exactly where it is, in every list.
  update public.notes n
     set title = projected_title,
         body = projected_body,
         content = projected_content,
         content_version = 1,
         updated_at = stamp,
         version = n.version + 1
   where n.id = target_note_id
     and (
       n.title is distinct from projected_title
       or n.body is distinct from projected_body
       or n.content is distinct from projected_content
       or n.updated_at is distinct from stamp
     )
  returning n.version into next_version;

  return next_version;
end
$save$;

revoke all on function public.save_note_document(uuid, text, integer, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_note_document(uuid, text, integer, text, text, jsonb)
  to service_role;
