-- Retired: use shared-email-scheduler.sql for both marketing campaigns.
do $$ begin
  raise exception 'Legacy cart scheduler retired; apply supabase/shared-email-scheduler.sql instead.';
end $$;
