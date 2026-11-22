import { createSchedulerHandler } from './handler.ts'

Deno.serve(createSchedulerHandler({
  schedulerSecret: Deno.env.get('AJR_SCHEDULER_SECRET') || '',
  cronSecret: Deno.env.get('AJR_CRON_SECRET') || '',
  siteOrigin: Deno.env.get('AJR_SITE_ORIGIN') || '',
}))
