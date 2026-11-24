-- Deploy shared-email-automation and configure the Vault secrets first.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
declare edge_url text; scheduler_secret text; existing_job bigint;
begin
  select decrypted_secret into edge_url from vault.decrypted_secrets where name = 'ajr_shared_email_edge_url' limit 1;
  select decrypted_secret into scheduler_secret from vault.decrypted_secrets where name = 'ajr_scheduler_secret' limit 1;
  if edge_url is null or edge_url !~ '^https://[a-zA-Z0-9.-]+/functions/v1/shared-email-automation$'
    or scheduler_secret is null or length(scheduler_secret) < 32 then
    raise exception 'Configure ajr_shared_email_edge_url and ajr_scheduler_secret in Vault before scheduling.';
  end if;
  for existing_job in select jobid from cron.job
    where jobname in ('ajr-abandoned-cart-reminders', 'ajr-product-reminders', 'ajr-shared-email-reminders')
  loop
    perform cron.unschedule(existing_job);
  end loop;
  perform cron.schedule('ajr-shared-email-reminders', '*/5 * * * *', $command$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'ajr_shared_email_edge_url' limit 1),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ajr-scheduler-secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'ajr_scheduler_secret' limit 1)),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $command$);
end $$;
