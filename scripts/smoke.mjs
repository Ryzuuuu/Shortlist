/**
 * scripts/smoke.mjs   —   npm run smoke
 *
 * End-to-end checks against a RUNNING deployment, using real HTTP: sign-in for each role,
 * who can reach what, client isolation, security headers, cookie flags and (optionally) a
 * real CV upload. It needs the demo accounts created by `npm run db:seed`.
 *
 *   BASE_URL       default http://localhost:3000
 *   SEED_PASSWORD  the demo accounts' password (required)
 *   UPLOAD_PDF     optional path to a NEW CV (not already in the seeded requisition) to test uploads
 *
 * Sign-in is rate limited (about 3 per 10 s), so the script spaces sign-ins out and takes ~30 s.
 * It prints PASS/FAIL per check and exits non-zero on any failure. It never prints a credential.
 */
import { readFileSync } from 'node:fs'

const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const password = process.env.SEED_PASSWORD
if (!password) {
  console.error('SEED_PASSWORD is required (the password given to the demo accounts when seeding).')
  process.exit(2)
}

const results = []
const check = (name, ok, extra = '') => results.push({ ok, line: `${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}` })
const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/** fetch with a couple of retries, so one dropped connection does not fail the whole run. */
async function request(url, init) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, init)
    } catch (err) {
      if (attempt >= 3) throw err
      await pause(1500 * attempt)
    }
  }
}
const isHttps = base.startsWith('https://')

async function signIn(email, pw = password) {
  await pause(4500)
  const res = await request(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password: pw }),
  })
  const raw = res.headers.getSetCookie()
  return { status: res.status, cookie: raw.map((c) => c.split(';')[0]).join('; '), setCookie: raw }
}
const get = (path, who, init = {}) => request(base + path, { redirect: 'manual', ...init, headers: { cookie: who?.cookie ?? '', ...(init.headers ?? {}) } })
const html = async (path, who) => (await get(path, who)).text()

// ── Public surface ───────────────────────────────────────────────────────────
const login = await get('/login')
const h = (name) => login.headers.get(name)
check('login page is public', login.status === 200, `(${login.status})`)
check('security headers present', !!h('x-content-type-options') && h('x-frame-options') === 'DENY' && !!h('referrer-policy') && !!h('permissions-policy'))
check('no framework fingerprint header (x-powered-by)', h('x-powered-by') === null)
check('search engines are told to stay away (X-Robots-Tag)', /noindex/.test(h('x-robots-tag') ?? ''))
if (isHttps) {
  const csp = h('content-security-policy') ?? ''
  check('Content-Security-Policy blocks framing, plugins and foreign scripts', /frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /default-src 'self'/.test(csp))
  check('HSTS is set', /max-age=\d+/.test(h('strict-transport-security') ?? ''))
}
const robots = await (await request(`${base}/robots.txt`)).text()
check('robots.txt disallows everything', /Disallow:\s*\/\s*$/m.test(robots))
const missing = await request(`${base}/this-page-does-not-exist`)
check('unknown path is a real 404 with the branded page', missing.status === 404 && /Page not found/.test(await missing.text()), `(${missing.status})`)

// ── Authentication ───────────────────────────────────────────────────────────
const rec = await signIn('recruiter@shortlist.test')
const cli = await signIn('client.meridian@shortlist.test')
const kes = await signIn('client.kestrel@shortlist.test')
const head = await signIn('head@shortlist.test')
check('recruiter signs in', rec.status === 200, `(${rec.status})`)
check('client signs in', cli.status === 200, `(${cli.status})`)
check('second client signs in', kes.status === 200, `(${kes.status})`)
check('delivery head signs in', head.status === 200, `(${head.status})`)
check('wrong password is rejected', (await signIn('recruiter@shortlist.test', `${password}x`)).status >= 400)

const sessionCookie = rec.setCookie.find((c) => /session_token/.test(c)) ?? ''
check('session cookie is HttpOnly with SameSite', /HttpOnly/i.test(sessionCookie) && /SameSite=(Lax|Strict)/i.test(sessionCookie))
if (isHttps) check('session cookie is Secure', /Secure/i.test(sessionCookie))

const signUp = await request(`${base}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ email: 'intruder@example.com', password: 'Passw0rd!Passw0rd!', name: 'Intruder' }),
})
check('self sign-up is refused', signUp.status >= 400, `(${signUp.status})`)

// ── Access control ───────────────────────────────────────────────────────────
const anon = await get('/recruiter')
check('anonymous visitor is sent to sign in', anon.status >= 300 && anon.status < 400 && (anon.headers.get('location') ?? '').includes('/login'), `(${anon.status})`)
check('anonymous API call is refused', (await get('/api/upload')).status !== 200)
// The page streams, so the status line is 200 even when it redirects. What matters is that the client
// is told to leave and receives none of the staff content in that response.
const staffPage = await (await get('/recruiter', cli)).text()
check(
  'a client is redirected away from recruiter pages and receives none of their content',
  /NEXT_REDIRECT|\/portal/.test(staffPage) && !/Senior Java Developer \(Noida\)|Retail Operations Analyst|New requisition/.test(staffPage),
)

const REQ = 'seed-req-java-noida'
const pages = [
  ['recruiter requisition list', rec, '/recruiter'],
  ['ranked list', rec, `/recruiter/requisitions/${REQ}`],
  ['pipeline board', rec, `/recruiter/requisitions/${REQ}/pipeline`],
  ['new requisition form', rec, '/recruiter/requisitions/new'],
  ['client portal', cli, '/portal'],
  ['client sees its own requisition', cli, `/portal/requisitions/${REQ}`],
  ['delivery dashboard', head, '/delivery'],
  ['audit log', head, '/delivery/audit'],
]
for (const [label, who, path] of pages) {
  const r = await get(path, who)
  check(`${label} renders`, r.status === 200, `(${r.status})`)
}

// ── What the screens contain ─────────────────────────────────────────────────
const ranked = await html(`/recruiter/requisitions/${REQ}`, rec)
check('ranked list has search and filter chips', /Search candidates/.test(ranked) && /Below fit/.test(ranked) && /Needs review/.test(ranked))
check('ranked list shows the JD filters', /JD filters:/.test(ranked))
const dashboard = await html('/delivery', head)
check('delivery dashboard shows the success measures and the weekly comparison', /Success measures/.test(dashboard) && /Shortlist within 48 hours/.test(dashboard) && /AI vs recruiter choices/.test(dashboard))
const board = await html(`/recruiter/requisitions/${REQ}/pipeline`, rec)
check('pipeline board shows every stage', ['Sourced', 'Screened', 'Submitted', 'Shortlisted', 'Interview', 'Offered', 'Joined'].every((s) => board.includes(s)))

// ── Isolation, judged by body content, with a control ────────────────────────
const own = await html(`/portal/requisitions/${REQ}`, cli)
const names = [...own.matchAll(/class="truncate font-medium">([^<]+)</g)].map((m) => m[1])
const other = await html(`/portal/requisitions/${REQ}`, kes)
check('control: the owning client sees its candidates', names.length > 0, `(${names.length})`)
check("another client's page contains none of them", names.every((n) => !other.includes(n)))
check('client cards show experience and notice', /years experience|days notice|immediate joiner/.test(own))
check('client page never shows expected CTC', !/CTC|LPA/i.test(own))

// ── API permissions ──────────────────────────────────────────────────────────
const probe = new FormData()
probe.set('requisitionId', REQ)
probe.set('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'x.pdf', { type: 'application/pdf' }))
check('a client cannot use the upload API', (await get('/api/upload', cli, { method: 'POST', body: probe })).status === 403)
check('a recruiter cannot export the delivery CSV', (await get('/api/delivery/agreement', rec)).status === 403)
const csv = await get('/api/delivery/agreement?week=0', head)
check('the delivery head can export the CSV', csv.status === 200 && (csv.headers.get('content-type') ?? '').includes('text/csv'), `(${csv.status})`)
check('personal-data responses are never cached', /no-store/.test(csv.headers.get('cache-control') ?? ''))

// ── Optional: a real upload (exercises storage, parsing and scoring) ─────────
if (process.env.UPLOAD_PDF) {
  const form = () => {
    const f = new FormData()
    f.set('requisitionId', REQ)
    f.set('file', new File([readFileSync(process.env.UPLOAD_PDF)], 'smoke_test_cv.pdf', { type: 'application/pdf' }))
    return f
  }
  const first = await get('/api/upload', rec, { method: 'POST', body: form() })
  const firstJson = await first.json().catch(() => ({}))
  check('a real CV is stored, parsed and scored', first.status === 201 && firstJson.status === 'scored', `(${first.status} ${firstJson.status ?? ''})`)
  const again = await (await get('/api/upload', rec, { method: 'POST', body: form() })).json().catch(() => ({}))
  check('uploading the same file again is a no-op', again.duplicate === true)
} else {
  console.log('(skipping the upload check: set UPLOAD_PDF to a new CV to include it)')
}

for (const r of results) console.log(r.line)
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed} of ${results.length} checks passed against ${base}`)
process.exit(failed ? 1 : 0)
