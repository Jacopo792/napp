-- The application accepts videos up to 100 MiB. Keep the private bucket in
-- lockstep: otherwise Storage rejects a valid picker selection at 25 MiB.
update storage.buckets
set file_size_limit = 104857600
where id = 'note-images';
