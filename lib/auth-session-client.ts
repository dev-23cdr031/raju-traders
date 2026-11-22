import { supabase } from '@/lib/supabase'

type AuthSessionCredentials = {
  access_token?: string
  refresh_token?: string
}

export async function persistAuthSession(credentials: AuthSessionCredentials) {
  if (typeof window === 'undefined' || !credentials.access_token || !credentials.refresh_token) {
    return false
  }

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: credentials.access_token,
      refresh_token: credentials.refresh_token,
    })
    if (error || !data.session?.access_token) return false
    window.localStorage.setItem('ajr-access-token', data.session.access_token)
    return true
  } catch {
    return false
  }
}
