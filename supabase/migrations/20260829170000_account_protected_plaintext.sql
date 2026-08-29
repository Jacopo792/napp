-- Authentication and archive membership are now the only access boundary.
-- Legacy ciphertext columns remain nullable for a rolling, lossless migration:
-- the client reads old values once and writes their plaintext replacements.

alter table public.archives
  add column if not exists settings jsonb not null default '{}'::jsonb;

alter table public.archives
  alter column settings_ciphertext drop not null;

alter table public.notes
  add column if not exists title text,
  add column if not exists body text;

alter table public.notes
  alter column ciphertext drop not null;

alter table public.folders
  add column if not exists name text,
  add column if not exists parent_id uuid;

alter table public.folders
  alter column ciphertext drop not null;

alter table public.tags
  add column if not exists name text;

alter table public.tags
  alter column ciphertext drop not null;

-- Files remain private through the existing archive-membership Storage RLS,
-- but new objects keep their real MIME type instead of masquerading as bytes.
update storage.buckets
set allowed_mime_types = array[
  'application/octet-stream',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp'
]
where id = 'note-images';
