'use client'

import { useCallback, useEffect, useState } from 'react'

type Faq = { id?: string; question: string; answer: string; published: boolean; sort_order: number }
const blank = (): Faq => ({ question: '', answer: '', published: false, sort_order: 0 })

export default function AiAssistantFaqs() {
  const [faqs, setFaqs] = useState<Faq[]>([])
  const [draft, setDraft] = useState<Faq>(blank)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const token = window.localStorage.getItem('ajr-access-token')
      if (!token) throw new Error('Sign in as an administrator.')
      const response = await fetch('/api/admin/ai-assistant/faqs', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not load FAQs.')
      setFaqs(data.faqs)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load FAQs.')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const save = async (faq: Faq) => {
    setSaving(true)
    setNotice('')
    try {
      const token = window.localStorage.getItem('ajr-access-token')
      if (!token) throw new Error('Sign in as an administrator.')
      const response = await fetch('/api/admin/ai-assistant/faqs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(faq),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || 'Could not save FAQ.')
      setDraft(blank())
      await load()
      setNotice('FAQ saved. Public caches may take up to 90 seconds to refresh.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save FAQ.')
    } finally { setSaving(false) }
  }

  const editor = (faq: Faq, change: (next: Faq) => void) => (
    <fieldset className="ai-admin-faq">
      <label>Question<input value={faq.question} maxLength={200} onChange={(event) => change({ ...faq, question: event.target.value })} /></label>
      <label>Public answer<textarea value={faq.answer} maxLength={2000} onChange={(event) => change({ ...faq, answer: event.target.value })} /></label>
      <label>Order<input type="number" min={-1000} max={1000} value={faq.sort_order} onChange={(event) => change({ ...faq, sort_order: Number(event.target.value) })} /></label>
      <label><input type="checkbox" checked={faq.published} onChange={(event) => change({ ...faq, published: event.target.checked })} /> Publish publicly</label>
      <button type="button" disabled={saving || !faq.question.trim() || !faq.answer.trim()} onClick={() => void save(faq)}>Save FAQ</button>
    </fieldset>
  )

  return (
    <section>
      <h3>Public FAQs</h3>
      <p>Only publish approved public information. Do not enter private customer or business information.</p>
      {notice && <p role="status">{notice}</p>}
      {faqs.map((faq, index) => <div key={faq.id}>{editor(faq, (next) => setFaqs((current) => current.map((item, i) => i === index ? next : item)))}</div>)}
      <h4>New FAQ</h4>
      {editor(draft, setDraft)}
    </section>
  )
}
