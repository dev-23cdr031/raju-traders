const fs = require('fs')
const path = require('path')

const ROOT = process.cwd()
const src = fs.readFileSync(path.join(ROOT, 'components/LanguageProvider.tsx'), 'utf8')

function objBlock(marker) {
  const i = src.indexOf(marker)
  const open = src.indexOf('{', i)
  let d = 0, e = -1
  for (let j = open; j < src.length; j++) {
    const c = src[j]
    if (c === '{') d++
    else if (c === '}') { d--; if (d === 0) { e = j; break } }
  }
  return src.slice(open, e + 1)
}
const ev = (b) => eval('(' + b + ')')

const t = ev(objBlock('const translations'))
const s = ev(objBlock('const supplementalTranslations'))
const h = ev(objBlock('const hindiExperienceTranslations'))
const dict = { ...t.hi, ...s.hi, ...h }

const DECODE = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&ldquo;': '\u201c', '&rdquo;': '\u201d', '&mdash;': '\u2014',
  '&ndash;': '\u2013', '&hellip;': '\u2026', '&rsquo;': '\u2019',
  '&lsquo;': '\u2018', '&nbsp;': ' ', '&middot;': '\u00b7',
}
const decode = (x) => x.replace(/&[a-z]+;/g, (m) => (m in DECODE ? DECODE[m] : m))

// Mirror translateCopy(): optional decoration prefix + core + optional punctuation suffix.
function coreOf(txt) {
  const m = txt.match(/^(\s*[\u2726\u25cf\u2022\u26a1\u2709\ud83d\udce8]?\s*)(.*?)([.!?:;,]?\s*)$/)
  if (!m) return txt
  return m[2]
}
const lookup = (txt) => {
  if (txt in dict) return dict[txt]
  const core = coreOf(txt)
  return core in dict ? dict[core] : undefined
}
const lookupIn = (d, txt) => {
  if (txt in d) return d[txt]
  const core = coreOf(txt)
  return core in d ? d[core] : undefined
}
const taExp = ev(objBlock('const tamilExperienceTranslations'))

function walk(dir) {
  let r = []
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (!['node_modules', '.next', 'ui', '.git'].includes(f)) r = r.concat(walk(p))
    } else if (/\.tsx?$/.test(f)) r.push(p)
  }
  return r
}

const files = walk(ROOT).filter((f) => !f.includes('LanguageProvider') && !f.includes('audit.cjs'))

// --- audit 1: t('...') literal keys ---
const tMiss = []
const tSeen = new Set()
for (const f of files) {
  const rel = path.relative(ROOT, f)
  const content = fs.readFileSync(f, 'utf8')
  const re = /\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g
  let m
  while ((m = re.exec(content))) {
    const key = m[2]
    if (tSeen.has(key)) continue
    tSeen.add(key)
    if (!(key in dict)) {
      const line = content.slice(0, m.index).split('\n').length
      tMiss.push(rel + ':' + line + ' | ' + key)
    }
  }
}
fs.writeFileSync(path.join(ROOT, 'tmiss.txt'), tMiss.join('\n'))
console.log('unique t() keys:', tSeen.size, '| missing hi:', tMiss.length)

// --- audit 2: plain JSX text literals ---
const jMiss = []
const jSeen = new Set()
for (const f of files) {
  const rel = path.relative(ROOT, f)
  const L = fs.readFileSync(f, 'utf8').split('\n')
  L.forEach((l, i) => {
    const m = l.match(/>([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</)
    if (!m) return
    const txt = decode(m[1].trim())
    if (!txt || jSeen.has(txt)) return
    jSeen.add(txt)
    if (lookup(txt) === undefined) jMiss.push(rel + ':' + (i + 1) + ' | ' + txt)
  })
}
fs.writeFileSync(path.join(ROOT, 'jsxmiss.txt'), jMiss.join('\n'))
console.log('missing JSX literals:', jMiss.length)

// --- audit 3: product-derived fields rendered in JSX ---
const fLines = []
for (const f of files) {
  const rel = path.relative(ROOT, f)
  const L = fs.readFileSync(f, 'utf8').split('\n')
  L.forEach((l, i) => {
    if (!/\{[^}]*\}/.test(l)) return
    if (!/\.name\b|\.type\b|\.origin\b|\.detail\b|\.nutrients|\.varieties|selectedVariety|selectedWeight|\bweight\b|\bvariety\b/.test(l)) return
    if (/^\s*(import|export type|const |let |function |\/\/)/.test(l)) return
    fLines.push(rel + ':' + (i + 1) + ' | ' + l.trim().slice(0, 170))
  })
}
fs.writeFileSync(path.join(ROOT, 'fields.txt'), fLines.join('\n'))
console.log('field render sites:', fLines.length)

// --- audit 4: coverage per language ---
const langs = ['ta', 'ml', 'te', 'hi']
const allKeys = new Set([...tSeen, ...jSeen])
const coverage = {}
for (const lang of langs) {
  const d = { ...t[lang], ...s[lang] }
  if (lang === 'ta') Object.assign(d, taExp)
  if (lang === 'hi') Object.assign(d, h)
  const missing = []
  for (const key of allKeys) {
    if (!(key in d) && lookupIn(d, key) === undefined) missing.push(key)
  }
  coverage[lang] = { total: allKeys.size, missing: missing.length }
  fs.writeFileSync(path.join(ROOT, 'cov-' + lang + '.txt'), missing.join('\n'))
}
console.log(JSON.stringify(coverage, null, 2))

// --- audit 5: set relationships + combined work list ---
const sets = {}
for (const lang of langs) {
  sets[lang] = new Set(fs.readFileSync(path.join(ROOT, 'cov-' + lang + '.txt'), 'utf8').split('\n').filter(Boolean))
}
const union = new Set()
for (const lang of langs) for (const k of sets[lang]) union.add(k)
const inter = [...union].filter((k) => langs.every((l) => sets[l].has(k)))
console.log('union of missing:', union.size, '| missing in ALL languages:', inter.length)
const order = []
for (const k of [...union]) {
  const where = langs.filter((l) => sets[l].has(k)).join(',')
  order.push(where + ' :: ' + k)
}
fs.writeFileSync(path.join(ROOT, 'union.txt'), order.join('\n'))

// --- audit 5b: strip non-translatable artifacts from the work list ---
// Code fragments caught by the JSX scanner, brand/email/payment identifiers,
// and pure-numeric labels that must never be translated.
const NON_TRANSLATABLE = new Set([
  ', body: Record',
  'Number(p.stock)',
  '= 1 && day',
  'AJR',
  'hello@ajrnature.com',
  'trade@ajrnature.com',
  'UPI',
])
const isTranslatable = (k) => !NON_TRANSLATABLE.has(k) && !/^\s*$/.test(k)

const workList = {}
for (const lang of langs) {
  workList[lang] = [...sets[lang]].filter(isTranslatable)
  fs.writeFileSync(path.join(ROOT, 'work-' + lang + '.json'), JSON.stringify(workList[lang], null, 0))
  console.log(lang, 'translatable missing:', workList[lang].length)
}

// --- audit 7: exact per-language authoring list (UI + product data) ---
const prod = JSON.parse(fs.readFileSync(path.join(ROOT, 'prod-missing.json'), 'utf8'))
for (const lang of langs) {
  const d = { ...t[lang], ...s[lang] }
  if (lang === 'ta') Object.assign(d, taExp)
  if (lang === 'hi') Object.assign(d, h)
  const needs = []
  const add = (k) => {
    if (!k) return
    if (lookupIn(d, k) !== undefined) return
    if (!needs.includes(k)) needs.push(k)
  }
  for (const k of workList[lang]) add(k)
  for (const grp of ['name', 'origin', 'nutrient', 'variety', 'detail']) {
    for (const k of prod[lang][grp]) add(k)
  }
  fs.writeFileSync(path.join(ROOT, 'author-' + lang + '.json'), JSON.stringify(needs, null, 1))
  console.log(lang, 'AUTHORING LIST:', needs.length)
}

// Verify encoding of a few strings straight from the file bytes.
const raw = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8')
const probe = raw.split('\n').filter((l) => /Loading messages|Served daily|Mon/.test(l)).slice(0, 3)
console.log(JSON.stringify(probe, null, 2))

// Byte-level check: are the dashes/ellipses real UTF-8 or mojibake?
for (const needle of ['Mon', 'Loading messages']) {
  const idx = raw.indexOf(needle)
  if (idx < 0) continue
  const seg = raw.slice(idx, idx + 30)
  console.log(needle, '->', JSON.stringify(seg), [...seg].map((c) => c.codePointAt(0).toString(16)).join(' '))
}

// --- audit 6: product data strings (details, origins, nutrients, variety names) ---
const pageSrc = fs.readFileSync(path.join(ROOT, 'app/page.tsx'), 'utf8')
const prodDetails = []
const prodOrigins = []
const prodNutrients = []
const prodVarieties = []
const prodNames = []
{
  const re = /detail:\s*'((?:[^'\\]|\\.)*)'/g
  let m
  while ((m = re.exec(pageSrc))) prodDetails.push(m[1].replace(/\\'/g, "'"))
}
{
  const re = /origin:\s*'((?:[^'\\]|\\.)*)'/g
  let m
  while ((m = re.exec(pageSrc))) prodOrigins.push(m[1].replace(/\\'/g, "'"))
}
{
  const re = /nutrients:\s*\[([^\]]*)\]/g
  let m
  while ((m = re.exec(pageSrc))) {
    for (const q of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) prodNutrients.push(q[1])
  }
}
{
  const re = /varieties:\s*\[([^\]]*)\]/g
  let m
  while ((m = re.exec(pageSrc))) {
    for (const q of m[1].matchAll(/name:\s*'((?:[^'\\]|\\.)*)'/g)) prodVarieties.push(q[1])
  }
}
{
  const re = /name:\s*'((?:[^'\\]|\\.)*)',\s*\n\s*type:/g
  let m
  while ((m = re.exec(pageSrc))) prodNames.push(m[1])
}
const prodSets = {
  detail: [...new Set(prodDetails)],
  origin: [...new Set(prodOrigins)],
  nutrient: [...new Set(prodNutrients)],
  variety: [...new Set(prodVarieties)],
  name: [...new Set(prodNames)],
}
for (const [k, list] of Object.entries(prodSets)) {
  console.log(k, list.length)
}
const prodMissing = { ta: {}, ml: {}, te: {}, hi: {} }
for (const lang of langs) {
  const d = { ...t[lang], ...s[lang] }
  if (lang === 'ta') Object.assign(d, taExp)
  if (lang === 'hi') Object.assign(d, h)
  for (const [k, list] of Object.entries(prodSets)) {
    prodMissing[lang][k] = list.filter((x) => !(x in d))
  }
}
for (const lang of langs) {
  const c = {}
  for (const [k, list] of Object.entries(prodMissing[lang])) c[k] = list.length
  console.log(lang, JSON.stringify(c))
}
fs.writeFileSync(path.join(ROOT, 'prod-missing.json'), JSON.stringify(prodMissing, null, 1))
