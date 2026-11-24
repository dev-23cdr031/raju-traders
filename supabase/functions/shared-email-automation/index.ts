import { createSharedEmailHandler } from './handler.ts'

Deno.serve(createSharedEmailHandler({
  schedulerSecret: Deno.env.get('AJR_SCHEDULER_SECRET') || '',
  mailSecret: Deno.env.get('AJR_MAIL_SECRET') || '',
  cronSecret: Deno.env.get('AJR_CRON_SECRET') || '',
  appUrl: Deno.env.get('APP_URL') || '',
  resendApiKey: Deno.env.get('RESEND_API_KEY') || '',
  resendFromEmail: Deno.env.get('RESEND_FROM_EMAIL') || '',
  supabaseUrl: Deno.env.get('SUPABASE_URL') || '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
}))
