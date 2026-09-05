-- Keep the existing private bucket and membership policies; add video MIME types.
update storage.buckets
set allowed_mime_types = array(select distinct unnest(allowed_mime_types || array['video/mp4', 'video/webm', 'video/quicktime']))
where id = 'note-images' and allowed_mime_types is not null;
