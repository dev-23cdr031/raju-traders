'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import {
  AlertCircle, Archive, ArrowUpRight, Check, ChevronDown, Clock3, Copy, Eye, FileClock,
  FileImage, Globe2, ImagePlus, LoaderCircle, Megaphone, Monitor, Package,
  Plus, RefreshCw, Save, Search, Shield, Smartphone, Trash2, Upload, Users, Utensils,
  X, type LucideIcon,
} from 'lucide-react'
import './website-content.css'

type Status = 'draft' | 'published' | 'scheduled' | 'archived' | string
type ContentObject = {
  announcement: { enabled: boolean; text: string; href: string; color: string }
  home: {
    heroEyebrow: string; heroTitle: string; heroAccent: string; heroDescription: string
    heroPrimaryLabel: string; heroSecondaryLabel: string; introEyebrow: string
    introTitle: string; introDescription: string
  }
  about: {
    heading: string; description: string; story: string; mission: string; vision: string
    quality: string; customerPromise: string
  }
  footer: {
    description: string; email: string; phone: string; whatsapp: string; address: string
    instagram: string; facebook: string; businessHours: string
  }
  navigation: Array<{ label: string; href: string; visible: boolean; sort_order: number }>
}
type Banner = {
  id?: string; title: string; description: string; desktop_image: string; mobile_image: string
  alt_text: string; cta_label: string; cta_href: string; status: Status
  starts_at: string; expires_at: string; sort_order: number; draft_changed?: boolean
}
type Recipe = {
  id?: string; title: string; description: string; image: string; alt_text: string
  ingredients: string[]; instructions: string[]; prep_minutes: number
  product_ids: string[]; sort_order: number; visible: boolean; status?: Status; draft_changed?: boolean
}
type MediaItem = { id: string; url: string; alt_text?: string; category?: string; filename?: string; created_at?: string; used?: boolean }
type ContentProduct = {
  id: number
  name: string
  detail: string
  image: string
  benefits: string[]
  ingredients: string[]
  seo_title: string
  seo_description: string
  active: boolean
}
type Version = { id: string; created_at?: string; updated_at?: string; published_at?: string; status?: string; label?: string; author?: string }
type RoleEntry = { userId?: string; user_id?: string; email?: string; role: string; updated_at?: string }
type ContentResponse = {
  role?: string
  metrics?: Record<string, unknown>
  content: { draft: Partial<ContentObject>; published?: Partial<ContentObject>; scheduledAt?: string | null; updatedAt?: string | null; publishedAt?: string | null }
  banners?: Banner[]; recipes?: Recipe[]; media?: MediaItem[]; products?: ContentProduct[]; versions?: Version[]; roles?: RoleEntry[]
}
type TabKey = 'storefront' | 'banners' | 'recipes' | 'products' | 'media' | 'history'

const emptyContent: ContentObject = {
  announcement: { enabled: false, text: '', href: '', color: '#173c31' },
  home: { heroEyebrow: '', heroTitle: '', heroAccent: '', heroDescription: '', heroPrimaryLabel: '', heroSecondaryLabel: '', introEyebrow: '', introTitle: '', introDescription: '' },
  about: { heading: '', description: '', story: '', mission: '', vision: '', quality: '', customerPromise: '' },
  footer: { description: '', email: '', phone: '', whatsapp: '', address: '', instagram: '', facebook: '', businessHours: '' },
  navigation: [],
}
const blankBanner = (): Banner => ({ title: '', description: '', desktop_image: '', mobile_image: '', alt_text: '', cta_label: '', cta_href: '', status: 'draft', starts_at: '', expires_at: '', sort_order: 0 })
const blankRecipe = (): Recipe => ({ title: '', description: '', image: '', alt_text: '', ingredients: [], instructions: [], prep_minutes: 0, product_ids: [], sort_order: 0, visible: false })
const tabs: { id: TabKey; label: string; icon: LucideIcon }[] = [
  { id: 'storefront', label: 'Storefront content', icon: Globe2 },
  { id: 'banners', label: 'Banners', icon: Megaphone },
  { id: 'recipes', label: 'Recipes', icon: Utensils },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'media', label: 'Media library', icon: FileImage },
  { id: 'history', label: 'History & access', icon: FileClock },
]
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not published yet'
const localDateTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const formDateTime = (value: string) => value ? new Date(value).toISOString() : null
const inputClass = 'wc-input'
const isValidLink = (value: string) => {
  if (!value) return true
  if (['/', '/about', '/shop', '/contact', '/cart'].includes(value)) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
const isHttpsLink = (value: string) => {
  if (!value) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}
const contentValidationError = (content: ContentObject) => {
  if (content.footer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(content.footer.email)) return 'Enter a valid contact email address.'
  const links = [
    ['Announcement destination', content.announcement.href],
    ...content.navigation.map((item, index) => [`Navigation link ${index + 1}`, item.href] as [string, string]),
    ['Instagram URL', content.footer.instagram],
    ['Facebook URL', content.footer.facebook],
  ] as [string, string][]
  const invalid = links.find(([, value]) => !isValidLink(value))
  if (invalid) return `${invalid[0]} must be a site path or an https URL.`
  const invalidSocial = [['Instagram URL', content.footer.instagram], ['Facebook URL', content.footer.facebook]]
    .find(([, value]) => !isHttpsLink(String(value)))
  return invalidSocial ? `${invalidSocial[0]} must be an HTTPS URL.` : ''
}

function Field({ label, value, onChange, hint, multiline = false, type = 'text', required = false, maxLength }: {
  label: string; value: string; onChange: (value: string) => void; hint?: string
  multiline?: boolean; type?: string; required?: boolean; maxLength?: number
}) {
  const generatedId = useId()
  const id = `wc-${generatedId}`
  return <label className="wc-field" htmlFor={id}>
    <span className="wc-field-label">{label}{required && <i aria-hidden="true"> *</i>}</span>
    {multiline
      ? <textarea id={id} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={maxLength} rows={4} />
      : <input id={id} className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} maxLength={maxLength} />}
    {hint && <small className="wc-hint">{hint}</small>}
    {maxLength && <small className="wc-counter">{value.length}/{maxLength}</small>}
  </label>
}

function SectionCard({ eyebrow, title, children, action }: { eyebrow: string; title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="wc-card">
    <div className="wc-card-heading"><div><span className="wc-eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</div>
    {children}
  </section>
}

export default function WebsiteContentManager() {
  const [data, setData] = useState<ContentResponse | null>(null)
  const [draft, setDraft] = useState<ContentObject>(emptyContent)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<TabKey>('storefront')
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop')
  const [scheduleAt, setScheduleAt] = useState('')
  const [bannerEdit, setBannerEdit] = useState<Banner | null>(null)
  const [recipeEdit, setRecipeEdit] = useState<Recipe | null>(null)
  const [productEdit, setProductEdit] = useState<ContentProduct | null>(null)
  const [productSearch, setProductSearch] = useState('')
  const [bannerAction, setBannerAction] = useState<'draft' | 'publish' | 'schedule'>('draft')
  const [recipeAction, setRecipeAction] = useState<'draft' | 'publish'>('draft')
  const [mediaSearch, setMediaSearch] = useState('')
  const [roleForm, setRoleForm] = useState({ userId: '', email: '', role: 'editor' })
  const [uploadAlt, setUploadAlt] = useState('')
  const [uploadCategory, setUploadCategory] = useState('general')
  const [copied, setCopied] = useState('')

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = window.localStorage.getItem('ajr-access-token') || ''
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    if (!(init.body instanceof FormData) && init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(path, { ...init, headers, cache: 'no-store' })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body?.error || body?.message || `Request failed (${response.status})`)
    return body
  }, [])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const result = await request('/api/admin/content') as ContentResponse
      setData(result)
      setDraft({ ...emptyContent, ...result.content?.draft,
        announcement: { ...emptyContent.announcement, ...result.content?.draft?.announcement },
        home: { ...emptyContent.home, ...result.content?.draft?.home },
        about: { ...emptyContent.about, ...result.content?.draft?.about },
        footer: { ...emptyContent.footer, ...result.content?.draft?.footer },
        navigation: result.content?.draft?.navigation || [],
      })
      setScheduleAt(localDateTime(result.content?.scheduledAt))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load website content.') }
    finally { setLoading(false) }
  }, [request])
  useEffect(() => { void load() }, [load])

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setError(''); setNotice('')
    try { await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.') }
    finally { setBusy('') }
  }
  const saveDraft = async () => {
    const validation = contentValidationError(draft)
    if (validation) { setError(validation); return }
    return run('save', async () => {
    await request('/api/admin/content', { method: 'PUT', body: JSON.stringify({ draft }) })
    setNotice('Draft saved.'); await load()
    })
  }
  const publish = async (date?: string) => {
    const validation = contentValidationError(draft)
    if (validation) { setError(validation); return }
    if (date && (!Number.isFinite(new Date(date).getTime()) || new Date(date).getTime() <= Date.now())) {
      setError('Choose a future date and time to schedule publication.')
      return
    }
    return run('publish', async () => {
    await request('/api/admin/content', { method: 'PUT', body: JSON.stringify({ draft }) })
    await request('/api/admin/content/publish', { method: 'POST', body: JSON.stringify({ scheduleAt: date ? formDateTime(date) : null }) })
    setNotice(date ? 'Publication scheduled.' : 'Content published.'); await load()
    })
  }
  const restore = async (versionId: string) => {
    if (!window.confirm('Restore this version as the current draft?')) return
    await run(`restore-${versionId}`, async () => {
      await request('/api/admin/content/restore', { method: 'POST', body: JSON.stringify({ versionId }) })
      setNotice('Version restored as a draft.'); await load()
    })
  }
  const updateContent = (section: keyof ContentObject, key: string, value: unknown) => {
    setDraft((current) => ({ ...current, [section]: { ...current[section], [key]: value } } as ContentObject))
  }
  const saveBanner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!bannerEdit) return
    if (bannerAction === 'schedule' && (!bannerEdit.starts_at || new Date(bannerEdit.starts_at).getTime() <= Date.now())) {
      setError('Choose a future start date to schedule this banner.')
      return
    }
    await run('banner', async () => {
      const payload = { ...bannerEdit, action: bannerAction }
      const path = bannerEdit.id ? `/api/admin/content/banners/${encodeURIComponent(bannerEdit.id)}` : '/api/admin/content/banners'
      await request(path, { method: bannerEdit.id ? 'PUT' : 'POST', body: JSON.stringify(payload) })
      setNotice(bannerAction === 'publish' ? 'Banner published.' : bannerAction === 'schedule' ? 'Banner scheduled.' : 'Banner draft saved.')
      setBannerEdit(null); await load()
    })
  }
  const deleteBanner = async (item: Banner) => {
    if (!item.id || !window.confirm(`Archive “${item.title}”?`)) return
    await run(`banner-${item.id}`, async () => { await request(`/api/admin/content/banners/${encodeURIComponent(item.id!)}`, { method: 'DELETE' }); setNotice('Banner archived.'); await load() })
  }
  const saveRecipe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!recipeEdit) return
    await run('recipe', async () => {
      const { id, ...recipe } = recipeEdit
      const path = id ? `/api/admin/content/recipes/${encodeURIComponent(id)}` : '/api/admin/content/recipes'
      await request(path, { method: id ? 'PUT' : 'POST', body: JSON.stringify({ action: recipeAction, recipe }) })
      setNotice(recipeAction === 'publish' ? 'Recipe published.' : 'Recipe draft saved.')
      setRecipeEdit(null); await load()
    })
  }
  const deleteRecipe = async (item: Recipe) => {
    if (!item.id || !window.confirm(`Archive “${item.title}”?`)) return
    await run(`recipe-${item.id}`, async () => { await request(`/api/admin/content/recipes/${encodeURIComponent(item.id!)}`, { method: 'DELETE' }); setNotice('Recipe archived.'); await load() })
  }
  const saveProductContent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!productEdit) return
    await run(`product-${productEdit.id}`, async () => {
      await request(`/api/admin/content/products/${productEdit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          detail: productEdit.detail,
          image: productEdit.image,
          benefits: productEdit.benefits,
          ingredients: productEdit.ingredients,
          seo_title: productEdit.seo_title,
          seo_description: productEdit.seo_description,
        }),
      })
      setNotice(`${productEdit.name} content updated. These product fields are live immediately.`)
      setProductEdit(null)
      await load()
    })
  }
  const uploadMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WebP image.'); event.target.value = ''; return }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be 5 MB or smaller.'); event.target.value = ''; return }
    await run('upload', async () => {
      const form = new FormData(); form.append('file', file); form.append('alt_text', uploadAlt); form.append('category', uploadCategory)
      await request('/api/admin/content/media', { method: 'POST', body: form })
      setUploadAlt(''); setNotice('Image uploaded.'); await load()
    })
    event.target.value = ''
  }
  const deleteMedia = async (item: MediaItem) => {
    if (item.used) { setError('This image is in use and cannot be deleted.'); return }
    if (!window.confirm(`Delete “${item.filename || item.url}”?`)) return
    await run(`media-${item.id}`, async () => { await request(`/api/admin/content/media/${encodeURIComponent(item.id)}`, { method: 'DELETE' }); setNotice('Unused image deleted.'); await load() })
  }
  const assignRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await run('role', async () => {
      await request('/api/admin/content/roles', { method: 'PUT', body: JSON.stringify(roleForm) })
      setRoleForm({ userId: '', email: '', role: 'editor' }); setNotice('Access updated.'); await load()
    })
  }
  const filteredMedia = useMemo(() => (data?.media || []).filter((item) => `${item.filename || ''} ${item.alt_text || ''} ${item.category || ''} ${item.url}`.toLowerCase().includes(mediaSearch.toLowerCase())), [data?.media, mediaSearch])
  const filteredProducts = useMemo(() => (data?.products || []).filter((item) => `${item.name} ${item.detail}`.toLowerCase().includes(productSearch.toLowerCase())), [data?.products, productSearch])
  const canAssignRoles = data?.role === 'super_admin'
  const canEditProducts = data?.role === 'super_admin' || data?.role === 'content_manager'
  const visibleTabs = tabs.filter((item) => item.id !== 'products' || canEditProducts)
  const onStorefront = tab === 'storefront'

  return <main className="website-content-manager">
    <header className="wc-page-header">
      <div>
        <div className="wc-breadcrumb"><span>Workspace</span><span>/</span><span>Website content</span></div>
        <div className="wc-title-row"><div><span className="wc-eyebrow">AJR NATURE · CONTENT STUDIO</span><h1>Website <em>content</em></h1>
          <p>Keep your storefront current, clear, and unmistakably yours.</p></div>
          <div className="wc-header-tools"><span className={`wc-save-state ${busy ? 'is-busy' : ''}`}><span className="wc-state-dot" />{busy ? 'Saving changes' : 'Changes save as draft'}</span><button type="button" className="wc-icon-button" aria-label="Refresh content" onClick={() => void load()} disabled={loading || !!busy}><RefreshCw size={16} /></button></div>
        </div>
      </div>
      <div className="wc-summary">
        <Summary icon={Globe2} label="Storefront" value={data?.content?.publishedAt ? 'Published' : 'Draft'} detail={data?.content?.publishedAt ? `Live ${dateLabel(data.content.publishedAt)}` : 'No published version yet'} />
        <Summary icon={Clock3} label="Next update" value={data?.content?.scheduledAt ? 'Scheduled' : 'No schedule'} detail={data?.content?.scheduledAt ? dateLabel(data.content.scheduledAt) : 'Publish whenever you are ready'} />
        <Summary icon={Megaphone} label="Banners" value={String((data?.banners || []).filter((item) => item.status !== 'archived').length)} detail="Active and draft placements" />
        <Summary icon={Utensils} label="Recipes" value={String((data?.recipes || []).filter((item) => item.status !== 'archived').length)} detail="Editorial recipe entries" />
      </div>
    </header>

    {error && <div className="wc-alert wc-alert-error" role="alert"><AlertCircle size={17} /><span><strong>Couldn’t complete that request.</strong> {error}</span><button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
    {notice && <div className="wc-alert wc-alert-success" role="status"><Check size={17} /><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}

    <div className="wc-workspace">
      <nav className="wc-tabs" aria-label="Content manager sections">
        {visibleTabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`wc-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)} aria-label={label} aria-current={tab === id ? 'page' : undefined}><Icon size={17} /><span>{label}</span>{tab === id && <ChevronDown className="wc-tab-chevron" size={14} />}</button>)}
      </nav>
      {loading ? <div className="wc-loading" role="status"><LoaderCircle size={22} />Loading content workspace…</div>
        : !data ? <div className="wc-empty-load"><AlertCircle size={24} /><h2>Content could not be loaded</h2><p>Check your connection or access, then try again.</p><button className="wc-button wc-button-primary" type="button" onClick={() => void load()}><RefreshCw size={15} /> Try again</button></div>
          : <div className="wc-tab-panel">
            {onStorefront && <StorefrontEditor draft={draft} updateContent={updateContent} preview={preview} setPreview={setPreview} scheduleAt={scheduleAt} setScheduleAt={setScheduleAt} saveDraft={saveDraft} publish={publish} busy={busy} scheduledAt={data.content?.scheduledAt} />}
            {tab === 'banners' && <BannerPanel banners={data.banners || []} edit={bannerEdit} setEdit={setBannerEdit} action={bannerAction} setAction={setBannerAction} onSubmit={saveBanner} onDelete={deleteBanner} busy={busy} />}
            {tab === 'recipes' && <RecipePanel recipes={data.recipes || []} edit={recipeEdit} setEdit={setRecipeEdit} action={recipeAction} setAction={setRecipeAction} onSubmit={saveRecipe} onDelete={deleteRecipe} busy={busy} />}
            {tab === 'products' && <ProductPanel products={filteredProducts} search={productSearch} setSearch={setProductSearch} edit={productEdit} setEdit={setProductEdit} onSubmit={saveProductContent} busy={busy} />}
            {tab === 'media' && <MediaPanel media={filteredMedia} search={mediaSearch} setSearch={setMediaSearch} uploadAlt={uploadAlt} setUploadAlt={setUploadAlt} category={uploadCategory} setCategory={setUploadCategory} onUpload={uploadMedia} onDelete={deleteMedia} busy={busy} copied={copied} setCopied={setCopied} />}
            {tab === 'history' && <HistoryPanel data={data} role={data.role || 'viewer'} canAssign={!!canAssignRoles} roleForm={roleForm} setRoleForm={setRoleForm} onAssign={assignRole} onRestore={restore} busy={busy} />}
          </div>}
    </div>
    <footer className="wc-footer-links"><span><Shield size={14} /> Changes are managed according to your account access.</span>{data?.role === 'super_admin' && <div><Link href="/admin/products">Manage products <ArrowUpRight size={13} /></Link><Link href="/admin/coupons-offers">Coupons & offers <ArrowUpRight size={13} /></Link></div>}</footer>
  </main>
}

function Summary({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return <div className="wc-summary-card"><div className="wc-summary-top"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{detail}</small></div>
}

function StorefrontEditor({ draft, updateContent, preview, setPreview, scheduleAt, setScheduleAt, saveDraft, publish, busy, scheduledAt }: {
  draft: ContentObject; updateContent: (section: keyof ContentObject, key: string, value: unknown) => void
  preview: 'desktop' | 'mobile'; setPreview: (value: 'desktop' | 'mobile') => void
  scheduleAt: string; setScheduleAt: (value: string) => void; saveDraft: () => void
  publish: (date?: string) => void; busy: string; scheduledAt?: string | null
}) {
  const nav = draft.navigation || []
  const setNav = (index: number, patch: Partial<ContentObject['navigation'][number]>) => {
    const next = nav.map((item, current) => current === index ? { ...item, ...patch } : item)
    updateContent('navigation', 'navigation', next)
  }
  const addNav = () => updateContent('navigation', 'navigation', [...nav, { label: '', href: '', visible: true, sort_order: nav.length }])
  return <div className="wc-editor-layout">
    <div className="wc-editor-main">
      <div className="wc-panel-toolbar"><div><span className="wc-eyebrow">EDIT YOUR STORE</span><h2>Storefront content</h2><p>Write and preview the words customers see across your site.</p></div><div className="wc-toolbar-actions"><button type="button" className="wc-button wc-button-outline" onClick={saveDraft} disabled={!!busy}><Save size={15} /> Save draft</button><button type="button" className="wc-button wc-button-primary" onClick={() => publish()} disabled={!!busy}><Globe2 size={15} /> Publish now</button></div></div>
      {scheduledAt && <div className="wc-schedule-note"><Clock3 size={15} /><span>Next publication is scheduled for <strong>{dateLabel(scheduledAt)}</strong>.</span></div>}
      <div className="wc-form-stack">
        <SectionCard eyebrow="01 · SITE-WIDE" title="Announcement bar">
          <label className="wc-switch-row"><span><strong>Show announcement</strong><small>Display this message across the storefront.</small></span><input type="checkbox" checked={draft.announcement.enabled} onChange={(event) => updateContent('announcement', 'enabled', event.target.checked)} /></label>
          <div className="wc-form-grid"><Field label="Announcement text" value={draft.announcement.text} onChange={(value) => updateContent('announcement', 'text', value)} maxLength={140} /><Field label="Link destination" value={draft.announcement.href} onChange={(value) => updateContent('announcement', 'href', value)} hint="Use a site path such as /shop or a full HTTPS URL." /><label className="wc-field"><span className="wc-field-label">Bar color</span><div className="wc-color-input"><input aria-label="Announcement bar color" type="color" value={draft.announcement.color || '#173c31'} onChange={(event) => updateContent('announcement', 'color', event.target.value)} /><span>{draft.announcement.color || '#173c31'}</span></div></label></div>
        </SectionCard>
        <SectionCard eyebrow="02 · HOME PAGE" title="Hero & introduction">
          <div className="wc-subsection"><h3>Hero</h3><div className="wc-form-grid"><Field label="Eyebrow" value={draft.home.heroEyebrow} onChange={(value) => updateContent('home', 'heroEyebrow', value)} /><Field label="Headline" value={draft.home.heroTitle} onChange={(value) => updateContent('home', 'heroTitle', value)} required /><Field label="Headline accent" value={draft.home.heroAccent} onChange={(value) => updateContent('home', 'heroAccent', value)} /><Field label="Description" value={draft.home.heroDescription} onChange={(value) => updateContent('home', 'heroDescription', value)} multiline maxLength={320} /><Field label="Primary button label" value={draft.home.heroPrimaryLabel} onChange={(value) => updateContent('home', 'heroPrimaryLabel', value)} /><Field label="Secondary button label" value={draft.home.heroSecondaryLabel} onChange={(value) => updateContent('home', 'heroSecondaryLabel', value)} /></div></div>
          <div className="wc-subsection"><h3>Introduction</h3><div className="wc-form-grid"><Field label="Eyebrow" value={draft.home.introEyebrow} onChange={(value) => updateContent('home', 'introEyebrow', value)} /><Field label="Heading" value={draft.home.introTitle} onChange={(value) => updateContent('home', 'introTitle', value)} /><Field label="Description" value={draft.home.introDescription} onChange={(value) => updateContent('home', 'introDescription', value)} multiline maxLength={500} /></div></div>
        </SectionCard>
        <SectionCard eyebrow="03 · OUR BRAND" title="About page">
          <div className="wc-form-grid"><Field label="Page heading" value={draft.about.heading} onChange={(value) => updateContent('about', 'heading', value)} /><Field label="Short description" value={draft.about.description} onChange={(value) => updateContent('about', 'description', value)} multiline /><Field label="Our story" value={draft.about.story} onChange={(value) => updateContent('about', 'story', value)} multiline /><Field label="Mission" value={draft.about.mission} onChange={(value) => updateContent('about', 'mission', value)} multiline /><Field label="Vision" value={draft.about.vision} onChange={(value) => updateContent('about', 'vision', value)} multiline /><Field label="Quality statement" value={draft.about.quality} onChange={(value) => updateContent('about', 'quality', value)} multiline /><Field label="Customer promise" value={draft.about.customerPromise} onChange={(value) => updateContent('about', 'customerPromise', value)} multiline /></div></SectionCard>
        <SectionCard eyebrow="04 · GET IN TOUCH" title="Footer & contact details">
          <div className="wc-form-grid"><Field label="Footer description" value={draft.footer.description} onChange={(value) => updateContent('footer', 'description', value)} multiline /><Field label="Contact email" type="email" value={draft.footer.email} onChange={(value) => updateContent('footer', 'email', value)} /><Field label="Phone" type="tel" value={draft.footer.phone} onChange={(value) => updateContent('footer', 'phone', value)} /><Field label="WhatsApp" type="tel" value={draft.footer.whatsapp} onChange={(value) => updateContent('footer', 'whatsapp', value)} /><Field label="Address" value={draft.footer.address} onChange={(value) => updateContent('footer', 'address', value)} multiline /><Field label="Instagram URL" type="url" value={draft.footer.instagram} onChange={(value) => updateContent('footer', 'instagram', value)} /><Field label="Facebook URL" type="url" value={draft.footer.facebook} onChange={(value) => updateContent('footer', 'facebook', value)} /><Field label="Business hours" value={draft.footer.businessHours} onChange={(value) => updateContent('footer', 'businessHours', value)} multiline /></div></SectionCard>
        <SectionCard eyebrow="05 · SITE LINKS" title="Navigation" action={<button type="button" className="wc-button wc-button-outline wc-button-small" onClick={addNav}><Plus size={14} /> Add link</button>}>
          <div className="wc-table-wrap"><table className="wc-table wc-navigation-table"><thead><tr><th>Label</th><th>Destination</th><th>Order</th><th>Visible</th><th aria-label="Actions" /></tr></thead><tbody>
            {nav.map((item, index) => <tr key={`${index}-${item.label}`}><td><input aria-label={`Navigation link ${index + 1} label`} value={item.label} onChange={(event) => setNav(index, { label: event.target.value })} /></td><td><input aria-label={`${item.label || 'Navigation link'} destination`} value={item.href} onChange={(event) => setNav(index, { href: event.target.value })} /></td><td><input aria-label={`${item.label || 'Navigation link'} order`} type="number" min="0" value={item.sort_order} onChange={(event) => setNav(index, { sort_order: Number(event.target.value) })} /></td><td><input aria-label={`${item.label || 'Navigation link'} visibility`} type="checkbox" checked={item.visible} onChange={(event) => setNav(index, { visible: event.target.checked })} /></td><td><button type="button" className="wc-icon-button wc-danger-icon" aria-label={`Remove ${item.label || 'navigation link'}`} onClick={() => updateContent('navigation', 'navigation', nav.filter((_, n) => n !== index))}><Trash2 size={15} /></button></td></tr>)}
            {!nav.length && <tr><td className="wc-table-empty" colSpan={5}>No navigation links yet. Add the links your storefront needs.</td></tr>}
          </tbody></table></div>
        </SectionCard>
      </div>
      <div className="wc-publish-strip"><div><Clock3 size={17} /><div><strong>Publish or schedule</strong><small>{scheduledAt ? `Currently scheduled · ${dateLabel(scheduledAt)}` : 'Choose when these changes should go live.'}</small></div></div><div className="wc-schedule-controls"><label className="wc-date-label"><span>Schedule for</span><input aria-label="Schedule publication date and time" type="datetime-local" value={scheduleAt} min={localDateTime(new Date(Date.now() + 60000).toISOString())} onChange={(event) => setScheduleAt(event.target.value)} /></label><button type="button" className="wc-button wc-button-outline" disabled={!scheduleAt || !!busy} onClick={() => publish(scheduleAt)}>Schedule</button><button type="button" className="wc-button wc-button-primary" disabled={!!busy} onClick={() => publish()}>Publish now</button></div></div>
    </div>
    <aside className={`wc-preview wc-preview-${preview}`} aria-label={`${preview} storefront preview`}>
      <div className="wc-preview-head"><div><span className="wc-eyebrow">LIVE PREVIEW</span><strong>Storefront</strong></div><div className="wc-preview-switch"><button type="button" aria-label="Desktop preview" aria-pressed={preview === 'desktop'} className={preview === 'desktop' ? 'active' : ''} onClick={() => setPreview('desktop')}><Monitor size={15} /></button><button type="button" aria-label="Mobile preview" aria-pressed={preview === 'mobile'} className={preview === 'mobile' ? 'active' : ''} onClick={() => setPreview('mobile')}><Smartphone size={15} /></button></div></div>
      <div className="wc-device-shell"><div className="wc-preview-site">{draft.announcement.enabled && draft.announcement.text && <div className="wc-preview-announcement" style={{ backgroundColor: draft.announcement.color || '#173c31' }}>{draft.announcement.href ? <span>{draft.announcement.text} ↗</span> : draft.announcement.text}</div>}<div className="wc-preview-nav"><span>AJR<span>NATURE</span></span><div>{nav.filter((item) => item.visible && item.label).slice(0, preview === 'mobile' ? 2 : 4).map((item, index) => <span key={index}>{item.label}</span>)}</div></div><section className="wc-preview-hero"><span>{draft.home.heroEyebrow || 'A NOTE FROM AJR'}</span><h3>{draft.home.heroTitle || 'Your words, in their place.'} <em>{draft.home.heroAccent}</em></h3><p>{draft.home.heroDescription || 'Your storefront introduction will appear here as you write.'}</p><div className="wc-preview-actions">{draft.home.heroPrimaryLabel && <b>{draft.home.heroPrimaryLabel}</b>}{draft.home.heroSecondaryLabel && <i>{draft.home.heroSecondaryLabel}</i>}</div></section><section className="wc-preview-intro"><span>{draft.home.introEyebrow || 'GET TO KNOW US'}</span><strong>{draft.home.introTitle || 'A little more about us'}</strong><p>{draft.home.introDescription || 'Your introduction appears here.'}</p></section><div className="wc-preview-footer">Preview uses text only · no storefront changes until published</div></div></div>
      <p className="wc-preview-caption"><Eye size={14} /> Safe text preview · imagery and layout may differ from the live store.</p>
    </aside>
  </div>
}

function StatusPill({ status }: { status?: string }) {
  const normalized = (status || 'draft').toLowerCase()
  return <span className={`wc-status wc-status-${normalized.replace(/[^a-z0-9]+/g, '-')}`}><i />{normalized.replace(/_/g, ' ')}</span>
}

function BannerPanel({ banners, edit, setEdit, action, setAction, onSubmit, onDelete, busy }: {
  banners: Banner[]; edit: Banner | null; setEdit: (value: Banner | null) => void
  action: 'draft' | 'publish' | 'schedule'; setAction: (value: 'draft' | 'publish' | 'schedule') => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete: (item: Banner) => void; busy: string
}) {
  const visible = banners.filter((item) => item.status !== 'archived')
  const update = (key: keyof Banner, value: string | number) => setEdit(edit ? { ...edit, [key]: value } : null)
  return <div className="wc-library-layout">
    <div className="wc-panel-toolbar"><div><span className="wc-eyebrow">PROMOTIONAL PLACEMENTS</span><h2>Banners</h2><p>Manage campaign messages and their display order.</p></div><button type="button" className="wc-button wc-button-primary" onClick={() => { setEdit(blankBanner()); setAction('draft') }}><Plus size={15} /> New banner</button></div>
    <div className="wc-list-editor">
      <SectionCard eyebrow="BANNER INVENTORY" title={`${visible.length} ${visible.length === 1 ? 'banner' : 'banners'}`}>
        <div className="wc-table-wrap"><table className="wc-table"><thead><tr><th>Banner</th><th>Placement</th><th>Status</th><th>Order</th><th>Actions</th></tr></thead><tbody>
          {visible.map((item, index) => <tr key={item.id || `${item.title}-${index}`}><td><strong>{item.title || 'Untitled banner'}</strong><small>{item.description || 'No description'}</small></td><td>{item.desktop_image || item.mobile_image ? 'Image set' : 'Text only'}{item.expires_at && <small>Ends {dateLabel(item.expires_at)}</small>}</td><td><StatusPill status={item.draft_changed && item.status === 'published' ? 'published · draft changes' : item.status} /></td><td>{item.sort_order}</td><td className="wc-row-actions"><button type="button" className="wc-icon-button" aria-label={`Edit ${item.title}`} onClick={() => { setEdit({ ...blankBanner(), ...item }); setAction('draft') }}><Save size={15} /></button><button type="button" className="wc-icon-button wc-danger-icon" aria-label={`Archive ${item.title}`} onClick={() => void onDelete(item)}><Archive size={15} /></button></td></tr>)}
          {!visible.length && <tr><td colSpan={5}><EmptyState icon={Megaphone} title="No banners yet" detail="Create a banner to share a timely message with your customers." /></td></tr>}
        </tbody></table></div>
      </SectionCard>
      {edit && <SectionCard eyebrow={edit.id ? 'EDIT PLACEMENT' : 'NEW PLACEMENT'} title={edit.title || 'Untitled banner'} action={<button className="wc-icon-button" type="button" aria-label="Close banner editor" onClick={() => setEdit(null)}><X size={16} /></button>}>
        <form className="wc-form-grid" onSubmit={onSubmit}>
          <Field label="Title" value={edit.title} onChange={(value) => update('title', value)} required maxLength={120} /><Field label="Description" value={edit.description} onChange={(value) => update('description', value)} multiline maxLength={300} /><Field label="Desktop image URL" value={edit.desktop_image} onChange={(value) => update('desktop_image', value)} /><Field label="Mobile image URL" value={edit.mobile_image} onChange={(value) => update('mobile_image', value)} /><Field label="Image alt text" value={edit.alt_text} onChange={(value) => update('alt_text', value)} hint="Describe what the image shows; leave blank for text-only banners." /><Field label="Button label" value={edit.cta_label} onChange={(value) => update('cta_label', value)} /><Field label="Button destination" value={edit.cta_href} onChange={(value) => update('cta_href', value)} /><Field label="Display order" type="number" value={String(edit.sort_order)} onChange={(value) => update('sort_order', Number(value) || 0)} /><Field label="Starts at" type="datetime-local" value={localDateTime(edit.starts_at)} onChange={(value) => update('starts_at', value ? new Date(value).toISOString() : '')} required={action === 'schedule'} /><Field label="Expires at" type="datetime-local" value={localDateTime(edit.expires_at)} onChange={(value) => update('expires_at', value ? new Date(value).toISOString() : '')} />
          <label className="wc-field"><span className="wc-field-label">Save action</span><select className={inputClass} value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="draft">Save as draft</option><option value="publish">Publish now</option><option value="schedule">Schedule</option></select></label>
          {action === 'schedule' && <Field label="Schedule at" type="datetime-local" value={localDateTime(edit.starts_at)} onChange={(value) => update('starts_at', value ? new Date(value).toISOString() : '')} required />}
          <div className="wc-form-actions"><button type="button" className="wc-button wc-button-outline" onClick={() => setEdit(null)}>Cancel</button><button type="submit" className="wc-button wc-button-primary" disabled={!!busy}>{busy === 'banner' ? <LoaderCircle size={15} /> : <Save size={15} />} Save banner</button></div>
        </form>
      </SectionCard>}
    </div>
  </div>
}

function RecipePanel({ recipes, edit, setEdit, action, setAction, onSubmit, onDelete, busy }: {
  recipes: Recipe[]; edit: Recipe | null; setEdit: (value: Recipe | null) => void
  action: 'draft' | 'publish'; setAction: (value: 'draft' | 'publish') => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete: (item: Recipe) => void; busy: string
}) {
  const visible = recipes.filter((recipe) => recipe.status !== 'archived')
  const update = (key: keyof Recipe, value: string | number | boolean | string[]) => setEdit(edit ? { ...edit, [key]: value } : null)
  return <div className="wc-library-layout">
    <div className="wc-panel-toolbar"><div><span className="wc-eyebrow">EDITORIAL CONTENT</span><h2>Recipes</h2><p>Share recipe ideas and connect them to products in your catalogue.</p></div><button type="button" className="wc-button wc-button-primary" onClick={() => { setEdit(blankRecipe()); setAction('draft') }}><Plus size={15} /> New recipe</button></div>
    <div className="wc-list-editor">
      <SectionCard eyebrow="RECIPE LIBRARY" title={`${visible.length} ${visible.length === 1 ? 'recipe' : 'recipes'}`}>
        <div className="wc-table-wrap"><table className="wc-table"><thead><tr><th>Recipe</th><th>Prep time</th><th>Products</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {visible.map((item, index) => <tr key={item.id || `${item.title}-${index}`}><td><strong>{item.title || 'Untitled recipe'}</strong><small>{item.description || 'No description'}</small></td><td>{item.prep_minutes ? `${item.prep_minutes} min` : '—'}</td><td>{item.product_ids?.length || 0}</td><td><StatusPill status={item.draft_changed && item.status === 'published' ? 'published · draft changes' : item.status || (item.visible ? 'published' : 'draft')} /></td><td className="wc-row-actions"><button type="button" className="wc-icon-button" aria-label={`Edit ${item.title}`} onClick={() => { setEdit({ ...blankRecipe(), ...item }); setAction('draft') }}><Save size={15} /></button><button type="button" className="wc-icon-button wc-danger-icon" aria-label={`Archive ${item.title}`} onClick={() => void onDelete(item)}><Archive size={15} /></button></td></tr>)}
          {!visible.length && <tr><td colSpan={5}><EmptyState icon={Utensils} title="No recipes yet" detail="Add a recipe and choose whether it is visible to customers." /></td></tr>}
        </tbody></table></div>
      </SectionCard>
      {edit && <SectionCard eyebrow={edit.id ? 'EDIT RECIPE' : 'NEW RECIPE'} title={edit.title || 'Untitled recipe'} action={<button className="wc-icon-button" type="button" aria-label="Close recipe editor" onClick={() => setEdit(null)}><X size={16} /></button>}>
        <form className="wc-form-grid" onSubmit={onSubmit}>
          <Field label="Recipe title" value={edit.title} onChange={(value) => update('title', value)} required maxLength={120} /><Field label="Short description" value={edit.description} onChange={(value) => update('description', value)} multiline maxLength={300} /><Field label="Image URL" value={edit.image} onChange={(value) => update('image', value)} /><Field label="Image alt text" value={edit.alt_text} onChange={(value) => update('alt_text', value)} /><Field label="Prep time (minutes)" type="number" value={String(edit.prep_minutes)} onChange={(value) => update('prep_minutes', Math.max(0, Number(value) || 0))} /><Field label="Display order" type="number" value={String(edit.sort_order)} onChange={(value) => update('sort_order', Number(value) || 0)} /><Field label="Ingredients" value={edit.ingredients.join('\n')} onChange={(value) => update('ingredients', value.split('\n'))} multiline hint="One ingredient per line." /><Field label="Instructions" value={edit.instructions.join('\n')} onChange={(value) => update('instructions', value.split('\n'))} multiline hint="One step per line." /><Field label="Related product IDs" value={edit.product_ids.join(', ')} onChange={(value) => update('product_ids', value.split(',').map((id) => id.trim()).filter(Boolean))} hint="Separate product IDs with commas." />
          <label className="wc-switch-row wc-field-full"><span><strong>Visible to customers</strong><small>Published recipes can be hidden without deleting the entry.</small></span><input type="checkbox" checked={edit.visible} onChange={(event) => update('visible', event.target.checked)} /></label>
          <label className="wc-field"><span className="wc-field-label">Save action</span><select className={inputClass} value={action} onChange={(event) => setAction(event.target.value as typeof action)}><option value="draft">Save as draft</option><option value="publish">Publish recipe</option></select></label>
          <div className="wc-form-actions"><button type="button" className="wc-button wc-button-outline" onClick={() => setEdit(null)}>Cancel</button><button type="submit" className="wc-button wc-button-primary" disabled={!!busy}>{busy === 'recipe' ? <LoaderCircle size={15} /> : <Save size={15} />} Save recipe</button></div>
        </form>
      </SectionCard>}
    </div>
  </div>
}

function ProductPanel({ products, search, setSearch, edit, setEdit, onSubmit, busy }: {
  products: ContentProduct[]
  search: string
  setSearch: (value: string) => void
  edit: ContentProduct | null
  setEdit: (value: ContentProduct | null) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  busy: string
}) {
  const update = (key: keyof ContentProduct, value: string | string[]) => setEdit(edit ? { ...edit, [key]: value } : null)
  return <div className="wc-library-layout">
    <div className="wc-panel-toolbar"><div><span className="wc-eyebrow">CATALOGUE CONTENT</span><h2>Product details & SEO</h2><p>Edit content on existing catalogue records. Changes publish immediately.</p></div></div>
    <div className="wc-media-toolbar"><div className="wc-search"><Search size={16} /><input type="search" aria-label="Search products" placeholder="Search products…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span>{products.length} {products.length === 1 ? 'product' : 'products'}</span></div>
    <div className="wc-list-editor">
      <SectionCard eyebrow="EXISTING PRODUCTS" title="Product catalogue">
        <div className="wc-table-wrap"><table className="wc-table"><thead><tr><th>Product</th><th>Visibility</th><th>SEO</th><th>Actions</th></tr></thead><tbody>
          {products.map((item) => <tr key={item.id}>
            <td><strong>{item.name}</strong><small>{item.detail || 'No description'}</small></td>
            <td><StatusPill status={item.active ? 'visible' : 'hidden'} /></td>
            <td>{item.seo_title || item.seo_description ? 'Configured' : 'Not set'}</td>
            <td><button type="button" className="wc-icon-button" aria-label={`Edit ${item.name} content`} onClick={() => setEdit({
              ...item,
              benefits: item.benefits || [],
              ingredients: item.ingredients || [],
            })}><Save size={15} /></button></td>
          </tr>)}
          {!products.length && <tr><td colSpan={4}><EmptyState icon={Package} title="No products found" detail={search ? 'Try another search.' : 'Add products in the existing Products workspace first.'} /></td></tr>}
        </tbody></table></div>
      </SectionCard>
      {edit && <SectionCard eyebrow="EDIT PRODUCT CONTENT" title={edit.name} action={<button className="wc-icon-button" type="button" aria-label="Close product editor" onClick={() => setEdit(null)}><X size={16} /></button>}>
        <form className="wc-form-grid" onSubmit={onSubmit}>
          <Field label="Product description" value={edit.detail} onChange={(value) => update('detail', value)} multiline maxLength={2000} />
          <Field label="Product image URL" value={edit.image} onChange={(value) => update('image', value)} hint="Use an HTTPS URL or a safe site image path." />
          <Field label="Benefits" value={edit.benefits.join('\n')} onChange={(value) => update('benefits', value.split('\n'))} multiline hint="One benefit per line." maxLength={4000} />
          <Field label="Ingredients" value={edit.ingredients.join('\n')} onChange={(value) => update('ingredients', value.split('\n'))} multiline hint="One ingredient per line." maxLength={4000} />
          <Field label="SEO title" value={edit.seo_title} onChange={(value) => update('seo_title', value)} maxLength={70} />
          <Field label="SEO description" value={edit.seo_description} onChange={(value) => update('seo_description', value)} multiline maxLength={320} />
          <div className="wc-form-actions"><button type="button" className="wc-button wc-button-outline" onClick={() => setEdit(null)}>Cancel</button><button type="submit" className="wc-button wc-button-primary" disabled={!!busy}>{busy === `product-${edit.id}` ? <LoaderCircle size={15} /> : <Save size={15} />} Save product content</button></div>
        </form>
      </SectionCard>}
    </div>
  </div>
}

function MediaPanel({ media, search, setSearch, uploadAlt, setUploadAlt, category, setCategory, onUpload, onDelete, busy, copied, setCopied }: {
  media: MediaItem[]; search: string; setSearch: (value: string) => void; uploadAlt: string; setUploadAlt: (value: string) => void
  category: string; setCategory: (value: string) => void; onUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onDelete: (item: MediaItem) => void; busy: string; copied: string; setCopied: (value: string) => void
}) {
  return <div className="wc-media-page">
    <div className="wc-panel-toolbar"><div><span className="wc-eyebrow">IMAGE ASSETS</span><h2>Media library</h2><p>Upload, find, and reuse your site images. Unused files can be removed.</p></div><label className={`wc-button wc-button-primary wc-upload-button ${busy === 'upload' ? 'is-disabled' : ''}`}><Upload size={15} />{busy === 'upload' ? 'Uploading…' : 'Upload image'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} disabled={!!busy} /></label></div>
    <div className="wc-upload-options"><Field label="Alt text for next upload" value={uploadAlt} onChange={setUploadAlt} hint="Describe the image for customers using screen readers." /><label className="wc-field"><span className="wc-field-label">Category</span><select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}><option value="general">General</option><option value="banner">Banner</option><option value="recipe">Recipe</option><option value="product">Product</option></select></label><p>JPG, PNG, or WebP · maximum 5 MB.</p></div>
    <div className="wc-media-toolbar"><div className="wc-search"><Search size={16} /><input type="search" aria-label="Search media" placeholder="Search filename, alt text, category…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><span>{media.length} {media.length === 1 ? 'file' : 'files'}</span></div>
    {media.length ? <div className="wc-table-wrap"><table className="wc-table wc-media-table"><thead><tr><th>Preview</th><th>File</th><th>Category</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody>{media.map((item) => <tr key={item.id}><td><div className="wc-media-thumbnail">{item.url ? <img src={item.url} alt={item.alt_text || ''} loading="lazy" /> : <ImagePlus size={18} />}</div></td><td><strong title={item.filename || item.url}>{item.filename || item.url}</strong><small>{item.alt_text || 'Alt text not set'}</small></td><td>{item.category || 'General'}</td><td>{dateLabel(item.created_at)}</td><td className="wc-media-actions"><button type="button" className="wc-text-button" onClick={async () => { try { await navigator.clipboard.writeText(item.url); setCopied(item.id); window.setTimeout(() => setCopied(''), 1800) } catch { setCopied('error') } }}>{copied === item.id ? <Check size={13} /> : <Copy size={13} />}{copied === item.id ? 'Copied' : copied === 'error' ? 'Copy unavailable' : 'Copy URL'}</button><button type="button" className="wc-text-button wc-text-danger" disabled={!!item.used} title={item.used ? 'This image is in use' : 'Delete unused image'} onClick={() => void onDelete(item)}><Trash2 size={13} />{item.used ? 'In use' : 'Delete'}</button></td></tr>)}</tbody></table></div> : <EmptyState icon={FileImage} title={search ? 'No matching images' : 'Your media library is empty'} detail={search ? 'Try another search term.' : 'Upload an image to use across banners and recipes.'} />}
  </div>
}

function HistoryPanel({ data, role, canAssign, roleForm, setRoleForm, onAssign, onRestore, busy }: {
  data: ContentResponse; role: string; canAssign: boolean; roleForm: { userId: string; email: string; role: string }
  setRoleForm: (value: { userId: string; email: string; role: string }) => void; onAssign: (event: FormEvent<HTMLFormElement>) => void
  onRestore: (id: string) => void; busy: string
}) {
  const versions = data.versions || []
  const roles = data.roles || []
  return <div className="wc-history-layout">
    <div className="wc-panel-toolbar"><div><span className="wc-eyebrow">AUDIT & ACCESS</span><h2>History & permissions</h2><p>Review saved snapshots and the content role on your account.</p></div><span className="wc-role-chip"><Shield size={14} /> Your role: {role.replace(/_/g, ' ')}</span></div>
    <SectionCard eyebrow="CONTENT SNAPSHOTS" title="Version history">
      <p className="wc-section-copy">Restore an earlier snapshot to your draft, then review and publish it when ready.</p>
      <div className="wc-table-wrap"><table className="wc-table"><thead><tr><th>Version</th><th>Saved</th><th>By</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {versions.map((version, index) => <tr key={version.id}><td><strong>{version.label || `Snapshot ${versions.length - index}`}</strong><small>{version.id}</small></td><td>{dateLabel(version.created_at || version.updated_at)}</td><td>{version.author || '—'}</td><td><StatusPill status={version.status || 'saved'} /></td><td><button type="button" className="wc-button wc-button-outline wc-button-small" onClick={() => void onRestore(version.id)} disabled={!!busy}>Restore to draft</button></td></tr>)}
        {!versions.length && <tr><td colSpan={5}><EmptyState icon={FileClock} title="No snapshots available" detail="Saved versions will appear here when available." /></td></tr>}
      </tbody></table></div>
      <div className="wc-publish-meta"><span>Last draft update</span><strong>{dateLabel(data.content?.updatedAt)}</strong><span>Last published</span><strong>{dateLabel(data.content?.publishedAt)}</strong></div>
    </SectionCard>
    <SectionCard eyebrow="TEAM ACCESS" title="Content roles" action={!canAssign && <span className="wc-readonly-tag"><Shield size={13} /> Super admin only</span>}>
      <p className="wc-section-copy">View current content access. Role assignments are available to super admins only.</p>
      <div className="wc-table-wrap"><table className="wc-table"><thead><tr><th>Account</th><th>Role</th><th>Updated</th></tr></thead><tbody>
        {roles.map((entry, index) => <tr key={entry.userId || entry.user_id || entry.email || index}><td><strong>{entry.email || 'Account'}</strong><small>{entry.userId || entry.user_id || '—'}</small></td><td><StatusPill status={entry.role} /></td><td>{dateLabel(entry.updated_at)}</td></tr>)}
        {!roles.length && <tr><td colSpan={3}><EmptyState icon={Users} title="No role records" detail="There are no content role assignments to show." /></td></tr>}
      </tbody></table></div>
      {canAssign ? <form className="wc-role-form" onSubmit={onAssign}><Field label="User ID" value={roleForm.userId} onChange={(userId) => setRoleForm({ ...roleForm, userId })} required /><Field label="Email" type="email" value={roleForm.email} onChange={(email) => setRoleForm({ ...roleForm, email })} required /><label className="wc-field"><span className="wc-field-label">Access role</span><select className={inputClass} value={roleForm.role} onChange={(event) => setRoleForm({ ...roleForm, role: event.target.value })}><option value="content_manager">Content manager</option><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="remove">Remove access</option></select></label><button className="wc-button wc-button-primary" type="submit" disabled={!!busy}><Users size={15} /> Update access</button></form>
        : <div className="wc-permission-note"><Shield size={15} /> You can review assignments, but only a super admin can change them.</div>}
    </SectionCard>
  </div>
}

function EmptyState({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <div className="wc-empty-state"><span><Icon size={20} /></span><strong>{title}</strong><p>{detail}</p></div>
}
