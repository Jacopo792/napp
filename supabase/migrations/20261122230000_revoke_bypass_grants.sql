-- Row level security never sees TRUNCATE, and REFERENCES/TRIGGER are table
-- owner tools. Supabase's default grants hand all three to the API roles, so a
-- client role that ever reached SQL directly could empty any table outright.
-- `anon` (no session at all; guests sign in anonymously as `authenticated`) is
-- given no policy to write anything, so it keeps no write grant either.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;

alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke insert, update, delete on tables from anon;
