'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

function storeAccessToken(token: string) {
  try {
    window.localStorage.setItem('ajr-access-token', token)
  } catch {
    console.error('Could not synchronize the current authentication session.')
  }
}

export default function AuthSessionSync() {
  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        storeAccessToken(session.access_token)
      } else if (event === 'SIGNED_OUT') {
        try {
          window.localStorage.removeItem('ajr-access-token')
          window.localStorage.removeItem('adminAccessEmail')
        } catch {
          console.error('Could not clear the local authentication session.')
        }
      }
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Could not synchronize the current authentication session.')
        return
      }
      if (active && data.session?.access_token) storeAccessToken(data.session.access_token)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return null
}
