begin;
-- Defence in depth where the extension owner grants revocation rights.
-- Supabase-managed pg_net is owned by supabase_admin; postgres cannot revoke its
-- PUBLIC grants on this project. The net schema MUST remain outside the Data API.
revoke all on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all sequences in schema net from public,anon,authenticated;
commit;
