'use client'

import { useCallback, useEffect, useState } from 'react'
import AiAssistantFaqs from './AiAssistantFaqs'
import './ai-assistant.css'

type Settings = {
  enabled: boolean
  welcome_message: string
  daily_limit: number
  monthly_limit: number
  per_actor_minute_limit: number
  per_actor_daily_limit: number
  daily_request_limit: number
}

type Stats = {
  conversations: number
  requests: number
  ai_rankings: number
  failed_ai_requests: number
  daily_ai_attempts: number
  monthly_ai_attempts: number
  popular_actions: { intent: string; count: number }[]
  recommended_products: { id: number; name: string; count: number }[]
  recent: { conversation_id: string; intent: string; status: string; product_ids: number[]; created_at: string }[]
}

export default function AiAssistantAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const token = window.localStorage.getItem('ajr-access-token')
      if (!token) throw new Error('Sign in as an administrator.')
      const response = await fetch('/api/admin/ai-assistant', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not load assistant settings.')
      setSettings(data.settings)
      setStats(data.stats)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load assistant settings.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage('')
    try {
      const token = window.localStorage.getItem('ajr-access-token')
      if (!token) throw new Error('Sign in as an administrator.')
      const { enabled, welcome_message, daily_limit, monthly_limit, per_actor_minute_limit, per_actor_daily_limit, daily_request_limit } = settings
      const response = await fetch('/api/admin/ai-assistant', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, welcome_message, daily_limit, monthly_limit, per_actor_minute_limit, per_actor_daily_limit, daily_request_limit }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not save assistant settings.')
      await load()
      setMessage('Settings saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save assistant settings.')
    } finally { setSaving(false) }
  }

  const numericFields: { key: keyof Pick<Settings, 'daily_limit' | 'monthly_limit' | 'per_actor_minute_limit' | 'per_actor_daily_limit' | 'daily_request_limit'>; label: string; min: number; max: number }[] = [
    { key: 'daily_limit', label: 'AI attempts per rolling 24 hours', min: 0, max: 1000 },
    { key: 'monthly_limit', label: 'AI attempts per month', min: 0, max: 30000 },
    { key: 'per_actor_minute_limit', label: 'Requests per network or account per minute', min: 1, max: 30 },
    { key: 'per_actor_daily_limit', label: 'Requests per network or account per day', min: 1, max: 1000 },
    { key: 'daily_request_limit', label: 'Total requests per day', min: 1, max: 100000 },
  ]

  return (
    <section className="admin-panel ai-admin">
      <div className="ai-admin-heading">
        <div><p className="admin-kicker">Customer experience</p><h2>AI Assistant</h2></div>
        <button type="button" onClick={() => void load()}>Refresh</button>
      </div>
      <p>Structured shopping requests only. Customer messages and order details are never sent to Gemini.</p>
      {message && <p role="status">{message}</p>}
      {settings && stats && <>
        <div className="ai-admin-stats">
          {[
            ['Conversations', stats.conversations], ['Requests', stats.requests],
            ['AI rankings', stats.ai_rankings], ['Failed AI requests', stats.failed_ai_requests],
            ['AI attempts / 24h', stats.daily_ai_attempts], ['AI attempts / month', stats.monthly_ai_attempts],
          ].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}
        </div>
        <p>These are structured requests retained up to 90 days, not verified unique customers. Purchase attribution and revenue are not tracked.</p>
        <fieldset className="ai-admin-settings">
          <legend>Settings</legend>
          <label><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /> Enable assistant</label>
          <label>Welcome message<input maxLength={200} value={settings.welcome_message} onChange={(event) => setSettings({ ...settings, welcome_message: event.target.value })} /></label>
          {numericFields.map(({ key, label, min, max }) => (
            <label key={key}>{label}<input type="number" min={min} max={max} value={settings[key]}
              onChange={(event) => setSettings({ ...settings, [key]: Number(event.target.value) })} /></label>
          ))}
          <button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </fieldset>
        <p>Limits do not guarantee free billing: keep the Gemini project on its free tier and verify Google’s current quotas.</p>
        <div className="ai-admin-lists">
          <div><h3>Popular actions</h3>{stats.popular_actions.length ? <ul>{stats.popular_actions.map((item) => <li key={item.intent}>{item.intent}: {item.count}</li>)}</ul> : <p>No requests yet.</p>}</div>
          <div><h3>Recommended products</h3>{stats.recommended_products.length ? <ul>{stats.recommended_products.map((item) => <li key={item.id}>{item.name}: {item.count}</li>)}</ul> : <p>No recommendations yet.</p>}</div>
        </div>
        <h3>Recent structured activity</h3>
        <p>Full chat messages are kept on the customer’s device and are not available here.</p>
        {stats.recent.length ? <div className="ai-admin-table"><table><thead><tr><th>Time</th><th>Conversation</th><th>Action</th><th>Result</th></tr></thead><tbody>
          {stats.recent.map((row, index) => <tr key={`${row.conversation_id}-${row.created_at}-${index}`}><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.conversation_id.slice(0, 8)}</td><td>{row.intent}</td><td>{row.status}</td></tr>)}
        </tbody></table></div> : <p>No activity yet.</p>}
        <AiAssistantFaqs />
      </>}
    </section>
  )
}
