-- Run only after the Edge Function and Vault secrets are configured.
-- The scheduled SQL stores secret names, not secret values.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare
  edge_url text;
  scheduler_secret text;
begin
  select decrypted_secret into edge_url
    from vault.decrypted_secrets where name = 'ajr_scheduler_edge_url';
  select decrypted_secret into scheduler_secret
    from vault.decrypted_secrets where name = 'ajr_scheduler_secret';
  if edge_url is null or edge_url !~ '^https://[a-zA-Z0-9.-]+/functions/v1/abandoned-cart-scheduler$' then
    raise exception 'Vault secret ajr_scheduler_edge_url must be the HTTPS Edge Function URL';
  end if;
  if scheduler_secret is null or length(scheduler_secret) < 32 then
    raise exception 'Vault secret ajr_scheduler_secret must have at least 32 characters';
  end if;
end;
$$;

-- A named pg_cron job is updated if this script is applied again.
select cron.schedule(
  'ajr-abandoned-cart-reminders',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ajr_scheduler_edge_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ajr-scheduler-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ajr_scheduler_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 70000
    );
  $job$
);
