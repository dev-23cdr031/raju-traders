import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'

export type AuthAuditEvent = 'login_success' | 'login_failure' | 'logout'

function describeAgent(userAgent: string) {
  const ua = userAgent.slice(0, 1000)
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /Firefox\//i.test(ua) ? 'Firefox'
      : /Chrome\//i.test(ua) ? 'Chrome'
        : /Safari\//i.test(ua) ? 'Safari'
          : 'Other'
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Windows/i.test(ua) ? 'Windows'
        : /Mac OS/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux'
            : 'Other'
  const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobile|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop'
  return { browser, os, device }
}

export async function recordAuthEvent(input: {
  eventType: AuthAuditEvent
  userId?: string | null
  userAgent?: string | null
  loginMethod?: string
  sessionRef?: string
}) {
  try {
    const agent = describeAgent(input.userAgent || '')
    const { error } = await supabaseAdmin().from('auth_login_events').insert({
      user_id: input.userId || null,
      event_type: input.eventType,
      device: agent.device,
      browser: agent.browser,
      os: agent.os,
      login_method: input.loginMethod || 'password',
      session_ref: input.sessionRef || (input.eventType === 'login_success' ? randomUUID() : null),
    })
    if (error) console.warn('Authentication audit event could not be recorded.')
  } catch {
    console.warn('Authentication audit event could not be recorded.')
  }
}
