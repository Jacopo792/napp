-- Some browsers report MOV as video/mov or video/x-quicktime rather than video/quicktime.
-- The upload normalises to video/quicktime via attachmentType, but a direct
-- storage upload with the browser's own MIME would otherwise be rejected before
-- the normalisation ever runs (e.g. a file picker on Windows). Accept the
-- common aliases as well; the displayed type is still derived from the
-- extension via attachmentType, so the viewer is unaffected.
update storage.buckets
set allowed_mime_types = array(
  select distinct unnest(allowed_mime_types || array['video/mov', 'video/x-quicktime', 'video/m4v'])
)
where id = 'note-images' and allowed_mime_types is not null;
