-- The four ciphertext columns, again — and this time after the client that
-- stopped naming them is actually online.
--
-- 20260829200000 dropped them while GitHub Pages was still serving a build that
-- selected them, so every query from the deployed app failed and the archive
-- looked empty. Nothing was lost — the columns had been null for a day and the
-- notes are plaintext beside them — but the application was down until the
-- columns were added back, empty, as a compatibility shim.
--
-- That is the whole lesson, and it is not about these columns: a schema that
-- drops something is only safe once the oldest client still running has stopped
-- asking for it. For a static SPA on Pages, "the oldest client still running"
-- means whatever `main` last built, plus anyone holding an open tab.
--
-- So: do not apply this until `main` has deployed a build without `ciphertext`,
-- and prefer to give open tabs a moment to reload. `supabase db push` when that
-- is true.

alter table public.notes drop column if exists ciphertext;
alter table public.folders drop column if exists ciphertext;
alter table public.tags drop column if exists ciphertext;
alter table public.archives drop column if exists settings_ciphertext;
