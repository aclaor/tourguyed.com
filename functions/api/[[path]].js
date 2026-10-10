// TourGuyed API — Cloudflare Pages Function. Bindings: DB (D1), optional FILES (R2), optional RESEND_KEY (email).
const FEE = 0.20, CANCEL_WINDOW_MIN = 30;
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
const err = (m, s = 400) => J({ error: m }, s);
const arr = s => { try { return JSON.parse(s || '[]') } catch { return [] } };

async function hash(pw, salt) {
  salt = salt || crypto.randomUUID();
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100000 }, k, 256);
  return salt + ':' + [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function verify(pw, stored) {
  if (stored === 'DEMO') return pw === 'demo1234';
  if (stored === 'OAUTH') return false; // social-login account: use Google/Facebook, or set a password via 'Forgot password'
  return (await hash(pw, stored.split(':')[0])) === stored;
}
const shortName = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : (p[0] || 'Traveler'); };
const reqPublic = r => ({ id: r.id, name: shortName(r.tourist_name), city: r.city, country: r.country, start_date: r.start_date, end_date: r.end_date, flexible: r.flexible, adults: r.adults, children: r.children,
  budget: r.budget, currency: r.currency, interests: arr(r.interests), languages: arr(r.languages), tour_style: r.tour_style, pace: r.pace, hours_per_day: r.hours_per_day, guide_gender: r.guide_gender, student_ok: r.student_ok,
  offers: r.offers || 0, created_at: r.created_at });
const reqFull = r => ({ ...reqPublic(r), meeting_place: r.meeting_place, accommodation: r.accommodation, accommodation_help: r.accommodation_help, transport: r.transport, requirements: r.requirements, dietary: r.dietary, notes: r.notes, status: r.status });
const relayEmail = u => `${u.role}-${u.id}@relay.tourguyed.com`; // masked "sudo" email

async function me(env, req) {
  const t = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!t) return null;
  return env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?').bind(t, Date.now()).first();
}
async function session(env, uid) {
  const token = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(token, uid, Date.now() + 30 * 864e5).run();
  return token;
}
async function notify(env, toUserId, subject, text) {
  const u = await env.DB.prepare('SELECT email FROM users WHERE id=?').bind(toUserId).first();
  if (!env.RESEND_KEY || !u) return;
  await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'TourGuyed <noreply@tourguyed.com>', to: u.email, subject, text }) }).catch(() => {});
}
function shapeGuide(g) {
  for (const k of ['places', 'languages', 'activities', 'includes', 'excludes', 'media']) g[k] = arr(g[k]);
  const total = g.accepted + g.declined; g.acceptance = total ? Math.round(g.accepted / total * 100) : 100;
  g.id = g.user_id; delete g.wise_email; return g;
}

// ---------- PayMongo ----------
async function pm(env, method, path, attributes) {
  const r = await fetch('https://api.paymongo.com/v1' + path, { method, headers: { 'content-type': 'application/json', authorization: 'Basic ' + btoa(env.PAYMONGO_SECRET_KEY + ':') },
    body: attributes ? JSON.stringify({ data: { attributes } }) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Payment service error: ' + (d.errors?.[0]?.detail || r.status) + '. Please try again.');
  return d.data;
}
async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
// mark a booking paid after confirming with PayMongo (used by webhook and by return-from-checkout)
async function syncPayment(env, b) {
  if (!b.pm_checkout || b.pm_payment) return b;
  const cs = await pm(env, 'GET', '/checkout_sessions/' + b.pm_checkout);
  const pay = (cs.attributes.payments || []).find(x => x.attributes.status === 'paid');
  if (pay) {
    await env.DB.prepare("UPDATE bookings SET pm_payment=?, payout_status='held' WHERE id=?").bind(pay.id, b.id).run();
    await notify(env, b.guide_id, 'Tourist paid for the tour', `Booking #${b.id} on ${b.day} ${b.slot} is paid and held by TourGuyed.`);
    return { ...b, pm_payment: pay.id, payout_status: 'held' };
  }
  return b;
}
async function refundIfPaid(env, b, amount) {
  if (b.pay_method !== 'online' || !b.pm_payment || amount <= 0) return;
  await pm(env, 'POST', '/refunds', { amount: Math.round(amount * 100), payment_id: b.pm_payment, reason: 'requested_by_customer', notes: `TourGuyed booking #${b.id}` });
}

// ---------- R2 uploads (free-tier guard rails) ----------
const R2_TOTAL_CAP = 9 * 1024 ** 3, MAX_VIDEO = 50 * 1024 ** 2, MAX_IMAGE = 10 * 1024 ** 2, MAX_MEDIA_PER_USER = 30;
async function rawUpload(env, req, url) {
  const u = await me(env, req); if (!u) return err('Please sign in', 401);
  if (!env.FILES) return err('File storage is not enabled');
  const kind = url.searchParams.get('kind'), fname = (url.searchParams.get('name') || '').toLowerCase();
  let type = (req.headers.get('content-type') || '').split(';')[0];
  if (!type || type === 'application/octet-stream') type = /\.(mp4|m4v)$/.test(fname) ? 'video/mp4' : /\.mov$/.test(fname) ? 'video/quicktime' : /\.webm$/.test(fname) ? 'video/webm' : /\.(heic|heif)$/.test(fname) ? 'image/heic' : /\.jpe?g$/.test(fname) ? 'image/jpeg' : /\.png$/.test(fname) ? 'image/png' : type;
  if (!['id', 'video', 'photo', 'school', 'profile'].includes(kind)) return err('Bad kind');
  if (!/^(image|video)\//.test(type) && type !== 'application/pdf') return err('Only photos, videos or PDFs are allowed');
  const len = +req.headers.get('content-length') || 0, cap = type.startsWith('video') ? MAX_VIDEO : 25 * 1024 ** 2;
  if (!len || len > cap) return err(!len ? 'Empty file' : `File too large — max ${cap / 1024 ** 2}MB for ${type.startsWith('video') ? 'videos' : 'photos'}`);
  if (['photo', 'video'].includes(kind)) {
    const c = await env.DB.prepare("SELECT COUNT(*) n FROM media WHERE user_id=? AND kind IN('photo','video')").bind(u.id).first();
    if (c.n >= MAX_MEDIA_PER_USER) return err(`You can upload up to ${MAX_MEDIA_PER_USER} photos/videos`);
  }
  const tot = await env.DB.prepare('SELECT COALESCE(SUM(size),0) n FROM media').first();
  if (tot.n + len > R2_TOTAL_CAP) return err('Uploads are temporarily paused (storage full). Please contact support.');
  const name = (url.searchParams.get('name') || 'file').replace(/[^\w.-]/g, '').slice(0, 60);
  const key = `${u.id}/${kind}/${Date.now()}-${name}`, buf = await req.arrayBuffer();
  await env.FILES.put(key, buf, { httpMetadata: { contentType: type } });
  const r = await env.DB.prepare('INSERT INTO media(user_id,kind,key,status,size) VALUES(?,?,?,?,?)').bind(u.id, kind, key, kind === 'profile' ? 'approved' : 'pending', buf.byteLength).run();
  const mid = r.meta.last_row_id;
  if (kind === 'id') await env.DB.prepare("UPDATE users SET id_status='pending' WHERE id=?").bind(u.id).run();
  if (kind === 'profile') await env.DB.prepare('UPDATE guides SET photo=? WHERE user_id=?').bind(`/api/media/${mid}`, u.id).run();
  return J({ ok: 1, url: `/api/media/${mid}` });
}

// Exchange rates (free, no key), cached 6h at the edge. Used for "≈ your currency" and paying cash in the tourist's currency.
async function rates(base) {
  base = (base || 'USD').toUpperCase(); if (!/^[A-Z]{3}$/.test(base)) base = 'USD';
  const key = new Request('https://rates.tourguyed.internal/' + base), cache = caches.default;
  let hit = await cache.match(key); if (hit) return hit.json();
  const r = await fetch('https://open.er-api.com/v6/latest/' + base).catch(() => null);
  const d = r && r.ok ? await r.json() : null;
  if (!d || d.result !== 'success') return { base, rates: { [base]: 1 }, ok: false };
  const out = { base, rates: d.rates, ok: true, updated: d.time_last_update_utc };
  await cache.put(key, new Response(JSON.stringify(out), { headers: { 'cache-control': 'max-age=21600', 'content-type': 'application/json' } }));
  return out;
}

async function resetLink(env, uid, origin) {
  const t = crypto.randomUUID() + crypto.randomUUID();
  await env.DB.prepare('INSERT INTO resets(token,user_id,expires) VALUES(?,?,?)').bind(t, uid, Date.now() + 3600e3).run();
  return `${origin}/app.html#/reset?t=${t}`;
}
async function serveFile(env, m, req) {
  if (m.data) {
    const [meta, b64] = m.data.split(',');
    return new Response(Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { headers: { 'content-type': meta.slice(5).split(';')[0], 'cache-control': 'private, max-age=3600' } });
  }
  if (env.FILES) {
    const range = req?.headers.get('range');
    const o = await env.FILES.get(m.key, range ? { range: req.headers } : undefined);
    if (o) {
      const h = new Headers({ 'content-type': o.httpMetadata?.contentType || 'application/octet-stream', 'accept-ranges': 'bytes', 'cache-control': 'private, max-age=3600' });
      if (range && o.range) { const st = o.range.offset ?? 0, ln = o.range.length ?? (o.size - st); h.set('content-range', `bytes ${st}-${st + ln - 1}/${o.size}`); h.set('content-length', ln); return new Response(o.body, { status: 206, headers: h }); }
      h.set('content-length', o.size); return new Response(o.body, { headers: h });
    }
  }
  return new Response('File not stored', { status: 404 });
}
const money = (n, cur = 'PHP') => { try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(n || 0) } catch { return `${cur} ${(+n || 0).toFixed(2)}` } };
// UTC time of a local date+time in a given IANA time zone
function zonedToUtc(day, slot, tz = 'Asia/Manila') {
  const guess = Date.UTC(...day.split('-').map((v, i) => i === 1 ? v - 1 : +v), ...slot.split(':').map(Number));
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
    const asLocal = Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return guess - (asLocal - guess);
  } catch { return guess - 8 * 3600e3; }
}
const minsUntil = b => (zonedToUtc(b.day, b.slot, b.tz) - Date.now()) / 60000;
const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } };

// public (publishable) anon key of the shared Supabase auth project — safe to ship
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdreHB3cXJ5YWtnemd2dnByYmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDAxNTUsImV4cCI6MjA5Mzk3NjE1NX0.oMSZx15YsodlOdzPxg4d7a0WesYQRuPCRUZxZcqGA1I';
let migrated = false;
async function migrate(env) {
  if (migrated) return; migrated = true;
  const stmts = ["ALTER TABLE media ADD COLUMN data TEXT", "ALTER TABLE media ADD COLUMN status TEXT DEFAULT 'pending'",
    "ALTER TABLE bookings ADD COLUMN pm_checkout TEXT", "ALTER TABLE bookings ADD COLUMN pm_payment TEXT", "ALTER TABLE bookings ADD COLUMN guide_paid REAL DEFAULT 0",
    "CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER)", "ALTER TABLE media ADD COLUMN size INTEGER DEFAULT 0",
    "ALTER TABLE guides ADD COLUMN country TEXT", "ALTER TABLE guides ADD COLUMN currency TEXT DEFAULT 'PHP'", "ALTER TABLE guides ADD COLUMN tz TEXT DEFAULT 'Asia/Manila'",
    "ALTER TABLE bookings ADD COLUMN currency TEXT DEFAULT 'PHP'", "ALTER TABLE bookings ADD COLUMN tz TEXT DEFAULT 'Asia/Manila'",
    "ALTER TABLE bookings ADD COLUMN pay_currency TEXT", "ALTER TABLE bookings ADD COLUMN pay_amount REAL",
    `CREATE TABLE IF NOT EXISTS trip_requests(id INTEGER PRIMARY KEY AUTOINCREMENT, tourist_id INTEGER NOT NULL, city TEXT, country TEXT, start_date TEXT, end_date TEXT, flexible INTEGER DEFAULT 0,
      adults INTEGER DEFAULT 1, children INTEGER DEFAULT 0, budget REAL, currency TEXT, interests TEXT DEFAULT '[]', languages TEXT DEFAULT '[]', guide_gender TEXT, student_ok INTEGER DEFAULT 1,
      tour_style TEXT, pace TEXT, hours_per_day REAL, meeting_place TEXT, accommodation TEXT, accommodation_help INTEGER DEFAULT 0, transport TEXT, requirements TEXT, dietary TEXT, notes TEXT,
      status TEXT DEFAULT 'open', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE IF NOT EXISTS offers(id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, guide_id INTEGER NOT NULL, price REAL, currency TEXT, day TEXT, slot TEXT, hours REAL,
      message TEXT, itinerary TEXT, status TEXT DEFAULT 'pending', booking_id INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(request_id, guide_id))`,
    `CREATE TABLE IF NOT EXISTS offer_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, offer_id INTEGER, sender_id INTEGER, body TEXT, price REAL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    "CREATE TABLE IF NOT EXISTS admin_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, from_admin INTEGER DEFAULT 1, body TEXT, seen INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)",
    "CREATE TABLE IF NOT EXISTS signals(id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id INTEGER, sender_id INTEGER, type TEXT, data TEXT, created INTEGER)"];
  for (const q of stmts) await env.DB.prepare(q).run().catch(() => {}); // ignore 'duplicate column'
}

export async function onRequest({ request: req, env, params }) {
  if (!env.DB) return err('Database not bound. See README.', 500);
  await migrate(env);
  const p = params.path || [], M = req.method, url = new URL(req.url);
  if (p.join('/') === 'paymongo/webhook' && M === 'POST') {
    const raw = await req.text(), sig = Object.fromEntries((req.headers.get('paymongo-signature') || '').split(',').map(x => x.split('=')));
    const mine = await hmacHex(env.PAYMONGO_WEBHOOK_SECRET || '', `${sig.t}.${raw}`);
    if (!env.PAYMONGO_WEBHOOK_SECRET || (mine !== sig.li && mine !== sig.te)) return err('Bad signature', 401);
    const ev = JSON.parse(raw).data?.attributes;
    if (ev?.type === 'checkout_session.payment.paid') {
      const bid = +ev.data?.attributes?.metadata?.booking_id;
      const b = bid && await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(bid).first();
      if (b) await syncPayment(env, b);
    }
    return J({ ok: 1 });
  }
  if (p.join('/') === 'upload' && M === 'PUT') return rawUpload(env, req, url);
  const body = M === 'POST' || M === 'PUT' ? await req.json().catch(() => ({})) : {};
  const route = `${M} /${p.map((x, i) => (/^\d+$/.test(x) ? ':id' : x)).join('/')}`;
  const id = +p.find(x => /^\d+$/.test(x));

  try {
    // ---------- public ----------
    if (route === 'POST /signup') {
      const { role, email, password, name } = body;
      if (!['tourist', 'guide'].includes(role) || !email || !name || (password || '').length < 8) return err('Name, email, role and 8+ char password required');
      const r = await env.DB.prepare('INSERT INTO users(role,email,name,pass) VALUES(?,?,?,?)').bind(role, email.toLowerCase(), name, await hash(password)).run().catch(() => null);
      if (!r) return err('This email already has an account. Sign in instead — tourists can switch to a tourguide account from Verify ID.');
      const uid = r.meta.last_row_id;
      if (role === 'guide') await env.DB.prepare('INSERT INTO guides(user_id,invited_by) VALUES(?,?)').bind(uid, body.invited_by || null).run();
      return J({ token: await session(env, uid) });
    }
    if (route === 'POST /oauth') {
      // Google / Facebook sign-in via the shared Leeys Technology Supabase project.
      const SB = env.SUPABASE_URL || 'https://gkxpwqryakgzgvvprbkl.supabase.co', KEY = env.SUPABASE_ANON || SUPA_ANON;
      const r = await fetch(`${SB}/auth/v1/user`, { headers: { apikey: KEY, authorization: `Bearer ${body.access_token || ''}` } });
      if (!r.ok) return err('Sign-in expired. Please try again.', 401);
      const su = await r.json(), email = (su.email || '').toLowerCase();
      if (!email) return err('Your account did not share an email address. Please use email sign-up instead.');
      let u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first(), isNew = false;
      if (!u) {
        const role = body.role === 'guide' ? 'guide' : 'tourist', md = su.user_metadata || {};
        const name = (md.full_name || md.name || email.split('@')[0]).slice(0, 80);
        const ins = await env.DB.prepare('INSERT INTO users(role,email,name,pass) VALUES(?,?,?,?)').bind(role, email, name, 'OAUTH').run();
        u = { id: ins.meta.last_row_id, role };
        if (role === 'guide') await env.DB.prepare('INSERT OR IGNORE INTO guides(user_id,photo) VALUES(?,?)').bind(u.id, md.avatar_url || md.picture || null).run();
        isNew = true;
      }
      return J({ token: await session(env, u.id), isNew, role: u.role });
    }
    if (route === 'POST /login') {
      const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind((body.email || '').toLowerCase()).first();
      if (u && u.pass === 'OAUTH') return err('This account uses Google sign-in. Tap "Continue with Google" (or use Forgot password to set one).', 401);
      if (!u || !(await verify(body.password || '', u.pass))) return err('Wrong email or password', 401);
      return J({ token: await session(env, u.id) });
    }
    if (route === 'POST /forgot') {
      const u = await env.DB.prepare('SELECT id FROM users WHERE email=?').bind((body.email || '').toLowerCase()).first();
      if (u) { const link = await resetLink(env, u.id, url.origin); await notify(env, u.id, 'Reset your TourGuyed password', `Click to set a new password (valid 1 hour): ${link}`); }
      return J({ ok: 1, emailed: !!env.RESEND_KEY }); // same answer whether or not the email exists
    }
    if (route === 'POST /reset') {
      if ((body.password || '').length < 8) return err('Password must be 8+ characters');
      const r = await env.DB.prepare('SELECT user_id FROM resets WHERE token=? AND expires>?').bind(body.token || '', Date.now()).first();
      if (!r) return err('This reset link is invalid or expired');
      await env.DB.prepare('UPDATE users SET pass=? WHERE id=?').bind(await hash(body.password), r.user_id).run();
      await env.DB.batch([env.DB.prepare('DELETE FROM resets WHERE user_id=?').bind(r.user_id), env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(r.user_id)]);
      return J({ token: await session(env, r.user_id) });
    }
    if (route === 'GET /guides') {
      const q = url.searchParams; const where = ['g.verified=1', 'g.price>0']; const b = [];
      if (q.get('place')) { where.push('(g.location LIKE ? OR g.places LIKE ? OR g.country LIKE ?)'); b.push(...Array(3).fill(`%${q.get('place')}%`)); }
      if (q.get('country')) { where.push('g.country=?'); b.push(q.get('country')); }
      if (q.get('activity')) { where.push('g.activities LIKE ?'); b.push(`%${q.get('activity')}%`); }
      if (q.get('gender')) { where.push('g.gender=?'); b.push(q.get('gender')); }
      if (q.get('language')) { where.push('g.languages LIKE ?'); b.push(`%${q.get('language')}%`); }
      if (q.get('student') === 'yes') where.push('g.is_student=1');
      if (q.get('student') === 'no') where.push('g.is_student=0');
      // ranking: ratings + review volume + acceptance rate decide visibility
      const rows = await env.DB.prepare(`SELECT g.*,u.name FROM guides g JOIN users u ON u.id=g.user_id WHERE ${where.join(' AND ')}
        ORDER BY g.verified DESC, (g.rating*20 + MIN(g.reviews,200)*0.1 + (CASE WHEN g.accepted+g.declined=0 THEN 100 ELSE g.accepted*100.0/(g.accepted+g.declined) END)*0.3) DESC`).bind(...b).all();
      return J({ guides: rows.results.map(shapeGuide) });
    }
    if (route === 'GET /requests/public') {
      const rows = (await env.DB.prepare(`SELECT r.*, u.name tourist_name, (SELECT COUNT(*) FROM offers o WHERE o.request_id=r.id) offers FROM trip_requests r JOIN users u ON u.id=r.tourist_id
        WHERE r.status='open' AND (r.end_date IS NULL OR r.end_date='' OR r.end_date>=date('now')) ORDER BY r.id DESC LIMIT ?`).bind(Math.min(+url.searchParams.get('limit') || 12, 50)).all()).results;
      return J({ requests: rows.map(reqPublic) });
    }
    if (route === 'GET /rates') return J(await rates(url.searchParams.get('base')));
    if (route === 'GET /countries') return J({ countries: (await env.DB.prepare("SELECT country, COUNT(*) n FROM guides WHERE verified=1 AND price>0 AND country IS NOT NULL AND country!='' GROUP BY country ORDER BY n DESC").all()).results });
    if (route === 'GET /guides/:id') {
      const g = await env.DB.prepare('SELECT g.*,u.name FROM guides g JOIN users u ON u.id=g.user_id WHERE g.user_id=?').bind(id).first();
      if (!g) return err('Not found', 404);
      const rv = await env.DB.prepare('SELECT stars,comment,created_at FROM reviews WHERE guide_id=? ORDER BY created_at DESC LIMIT 20').bind(id).all();
      return J({ guide: shapeGuide(g), reviews: rv.results });
    }
    if (route === 'GET /guides/:id/availability') {
      const today = new Date().toISOString().slice(0, 10);
      const a = await env.DB.prepare(`SELECT day,slot FROM availability WHERE guide_id=? AND day>=? AND NOT EXISTS
        (SELECT 1 FROM bookings b WHERE b.guide_id=availability.guide_id AND b.day=availability.day AND b.slot=availability.slot AND b.status IN('requested','accepted'))
        ORDER BY day,slot`).bind(id, today).all();
      const gtz = await env.DB.prepare('SELECT tz FROM guides WHERE user_id=?').bind(id).first();
      const tz = gtz?.tz || 'Asia/Manila';
      return J({ slots: a.results.map(x => ({ ...x, utc: zonedToUtc(x.day, x.slot, tz) })).filter(x => x.utc > Date.now() + 30 * 60e3), tz });
    }

    if (route === 'GET /media/:id') {
      const m = await env.DB.prepare("SELECT * FROM media WHERE id=? AND status='approved' AND kind IN('photo','video','profile')").bind(id).first();
      if (!m) return err('Not found', 404);
      return serveFile(env, m, req);
    }

    // ---------- signed in ----------
    const u = await me(env, req);
    if (!u) return err('Please sign in', 401);

    if (route === 'GET /me') {
      const g0 = await env.DB.prepare('SELECT * FROM guides WHERE user_id=?').bind(u.id).first(); const g = u.role === 'guide' ? g0 : null;
      const ib = await env.DB.prepare('SELECT COUNT(*) n, SUM(from_admin=1 AND seen=0) unread FROM admin_msgs WHERE user_id=?').bind(u.id).first().catch(() => null);
      return J({ user: { inbox: ib?.n || 0, inbox_unread: ib?.unread || 0, id: u.id, role: u.role, name: u.name, email: u.email, id_status: u.id_status, relay: relayEmail(u), has_guide: !!g0, storage: env.FILES ? 'r2' : 'db' }, guide: g && { ...shapeGuide(g), wise_email: g.wise_email } });
    }
    if (route === 'GET /my-media') return J({ items: (await env.DB.prepare("SELECT id,kind,status,created_at FROM media WHERE user_id=? AND kind IN('photo','video') ORDER BY id DESC").bind(u.id).all()).results });
    if (route === 'GET /my-media/:id') { const m = await env.DB.prepare('SELECT * FROM media WHERE id=? AND user_id=?').bind(id, u.id).first(); return m ? serveFile(env, m, req) : err('Not found', 404); }
    if (route === 'POST /my-media/:id/delete') {
      const m = await env.DB.prepare("SELECT * FROM media WHERE id=? AND user_id=? AND kind IN('photo','video')").bind(id, u.id).first(); if (!m) return err('Not found', 404);
      if (env.FILES) await env.FILES.delete(m.key).catch(() => {});
      await env.DB.prepare('DELETE FROM media WHERE id=?').bind(id).run();
      const g = await env.DB.prepare('SELECT media FROM guides WHERE user_id=?').bind(u.id).first();
      if (g) await env.DB.prepare('UPDATE guides SET media=? WHERE user_id=?').bind(JSON.stringify(arr(g.media).filter(x => x !== `/api/media/${id}`)), u.id).run();
      return J({ ok: 1 });
    }
    if (route === 'PUT /me/name') {
      const name = String(body.name || '').replace(/\s+/g, ' ').trim();
      if (name.length < 2 || name.length > 80) return err('Name must be 2–80 characters');
      await env.DB.prepare('UPDATE users SET name=? WHERE id=?').bind(name, u.id).run();
      return J({ ok: 1, name });
    }
    if (route === 'GET /inbox') {
      const items = await env.DB.prepare('SELECT body,from_admin,created_at FROM admin_msgs WHERE user_id=? ORDER BY id').bind(u.id).all();
      await env.DB.prepare('UPDATE admin_msgs SET seen=1 WHERE user_id=? AND from_admin=1').bind(u.id).run();
      return J({ items: items.results });
    }
    if (route === 'POST /inbox') {
      const t = String(body.body || '').trim().slice(0, 4000); if (!t) return err('Write a message');
      await env.DB.prepare('INSERT INTO admin_msgs(user_id,from_admin,body) VALUES(?,0,?)').bind(u.id, t).run();
      return J({ ok: 1 });
    }
    if ((route === 'POST /switch-role' || route === 'POST /become-guide') && u.role !== 'admin') {
      const to = route === 'POST /become-guide' ? 'guide' : body.to;
      if (!['tourist', 'guide'].includes(to)) return err('Bad role');
      if (to === 'guide') await env.DB.prepare('INSERT OR IGNORE INTO guides(user_id) VALUES(?)').bind(u.id).run();
      await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(to, u.id).run();
      return J({ ok: 1, role: to });
    }
    if (route === 'POST /logout') { await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run(); return J({ ok: 1 }); }

    if (route === 'PUT /guide/profile' && u.role === 'guide') {
      const f = ['photo', 'bio', 'gender', 'occupation', 'school', 'location', 'country', 'currency', 'tz', 'transport', 'package_title', 'wise_email'];
      const n = ['is_student', 'school_permission', 'price', 'duration_hours', 'offers_local'];
      const a = ['places', 'languages', 'activities', 'includes', 'excludes'];
      const sets = [], vals = [];
      for (const k of f) if (k in body) { sets.push(`${k}=?`); vals.push(String(body[k] ?? '')); }
      for (const k of n) if (k in body) { sets.push(`${k}=?`); vals.push(+body[k] || 0); }
      for (const k of a) if (k in body) { sets.push(`${k}=?`); vals.push(JSON.stringify(body[k] || [])); }
      if (body.is_student && !body.school_permission) return err('Student guides must confirm school permission');
      if (body.currency && !/^[A-Z]{3}$/.test(body.currency)) return err('Pick a valid currency');
      if (body.tz && !validTz(body.tz)) return err('Invalid time zone');
      const need = { country: 'Country', currency: 'Currency', bio: 'Short bio', gender: 'Gender', occupation: 'Occupation', location: 'City / area', transport: 'Transport', package_title: 'Package name', wise_email: 'Wise email' };
      for (const [k, label] of Object.entries(need)) if (!String(body[k] || '').trim()) return err(label + ' is required');
      for (const [k, label] of Object.entries({ places: 'Places', activities: 'Expertise', languages: 'Languages', includes: 'Included', excludes: 'Not included' })) if (!(body[k] || []).length) return err(label + ' is required');
      if (!(+body.price > 0)) return err('Price is required'); if (!(+body.duration_hours > 0)) return err('Hours is required');
      if (body.is_student && !String(body.school || '').trim()) return err('School is required for student guides');
      if (sets.length) await env.DB.prepare(`UPDATE guides SET ${sets.join(',')} WHERE user_id=?`).bind(...vals, u.id).run();
      return J({ ok: 1 });
    }
    if (route === 'POST /availability' && u.role === 'guide') {
      const st = env.DB.prepare('INSERT OR IGNORE INTO availability(guide_id,day,slot) VALUES(?,?,?)');
      await env.DB.batch((body.slots || []).map(s => st.bind(u.id, s.day, s.slot)));
      if (body.remove) await env.DB.batch(body.remove.map(s => env.DB.prepare('DELETE FROM availability WHERE guide_id=? AND day=? AND slot=?').bind(u.id, s.day, s.slot)));
      return J({ ok: 1 });
    }
    if (route === 'POST /upload') {
      // body: {kind:'id'|'video'|'photo'|'school', name, dataUrl}
      const kind = body.kind; if (!['id', 'video', 'photo', 'school', 'profile'].includes(kind)) return err('Bad kind');
      const key = `${u.id}/${kind}/${Date.now()}-${(body.name || 'file').replace(/[^\w.-]/g, '')}`;
      if (env.FILES && body.dataUrl) {
        const [meta, b64] = body.dataUrl.split(',');
        await env.FILES.put(key, Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { httpMetadata: { contentType: meta.slice(5).split(';')[0] } });
      }
      let inline = null;
      if (!env.FILES) {
        if (!body.dataUrl) return err('No file');
        if (body.dataUrl.length > 1900000) return err('File too large. Please use a smaller photo or a short video under 1MB.');
        inline = body.dataUrl;
      }
      const r = await env.DB.prepare("INSERT INTO media(user_id,kind,key,data,status,size) VALUES(?,?,?,?,?,?)").bind(u.id, kind, key, inline, kind === 'profile' ? 'approved' : 'pending', inline ? inline.length : 0).run();
      if (kind === 'profile') { await env.DB.prepare('UPDATE guides SET photo=? WHERE user_id=?').bind(`/api/media/${r.meta.last_row_id}`, u.id).run(); return J({ ok: 1, url: `/api/media/${r.meta.last_row_id}` }); }
      if (kind === 'id') await env.DB.prepare("UPDATE users SET id_status='pending' WHERE id=?").bind(u.id).run();
      return J({ ok: 1, key });
    }

    if (route === 'POST /bookings' && u.role === 'tourist') {
      if (u.id_status === 'none') return err('Upload your ID before booking');
      const g = await env.DB.prepare('SELECT * FROM guides WHERE user_id=?').bind(body.guide_id).first();
      if (!g) return err('Guide not found');
      if (g.user_id === u.id) return err("You can't book your own tour");
      const slot = await env.DB.prepare('SELECT 1 FROM availability WHERE guide_id=? AND day=? AND slot=?').bind(g.user_id, body.day, body.slot).first();
      if (!slot) return err('That time is not available');
      const pm = body.pay_method === 'online' ? 'online' : 'cash';
      if (pm === 'online' && !env.PAYMONGO_SECRET_KEY) return err('Online payment is not available yet. Please choose cash.');
      if (pm === 'online' && (g.currency || 'PHP') !== 'PHP') return err('Online payment is not available for this guide yet. Please choose cash.');
      const gcur = g.currency || 'PHP'; let payCur = pm === 'online' ? gcur : String(body.pay_currency || gcur).toUpperCase(), payAmt = g.price;
      if (!/^[A-Z]{3}$/.test(payCur)) payCur = gcur;
      if (payCur !== gcur) { const rt = await rates(gcur); const f = rt.rates?.[payCur]; if (!f) { payCur = gcur; } else payAmt = Math.round(g.price * f * 100) / 100; }
      const r = await env.DB.prepare('INSERT INTO bookings(tourist_id,guide_id,day,slot,timeline,pay_method,amount,platform_fee,payout_status,currency,tz,pay_currency,pay_amount) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(u.id, g.user_id, body.day, body.slot, body.timeline || '', pm, g.price, +(g.price * FEE).toFixed(2), pm === 'cash' ? 'cash_due' : 'unpaid', gcur, g.tz || 'Asia/Manila', payCur, payAmt).run();
      await notify(env, g.user_id, 'New TourGuyed booking request', `You have a new request for ${body.day} ${body.slot} (your local time). Open your dashboard to accept or decline.`);
      return J({ id: r.meta.last_row_id });
    }
    if (route === 'GET /bookings') {
      const col = u.role === 'guide' ? 'guide_id' : 'tourist_id';
      const rows = await env.DB.prepare(`SELECT b.*, gu.name guide_name, tu.id tourist_uid, tu.name tourist_name, g.photo guide_photo,
        (SELECT 1 FROM reviews r WHERE r.booking_id=b.id) reviewed FROM bookings b JOIN users gu ON gu.id=b.guide_id JOIN users tu ON tu.id=b.tourist_id
        JOIN guides g ON g.user_id=b.guide_id WHERE b.${col}=? ORDER BY b.day DESC, b.slot DESC`).bind(u.id).all();
      // guides only ever see the tourist's masked relay email
      return J({ bookings: rows.results.map(b => ({ ...b, start_utc: zonedToUtc(b.day, b.slot, b.tz), tourist_contact: relayEmail({ role: 'tourist', id: b.tourist_uid }),
        tourist_name: ['accepted', 'in_progress', 'completed'].includes(b.status) ? b.tourist_name : shortName(b.tourist_name) })) });
    }
    if (route.startsWith('POST /bookings/:id/')) {
      const action = p[2];
      const b = await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();
      if (!b || (b.guide_id !== u.id && b.tourist_id !== u.id)) return err('Not found', 404);
      const isG = b.guide_id === u.id, set = (s, extra = '', ...v) => env.DB.prepare(`UPDATE bookings SET status=?${extra} WHERE id=?`).bind(s, ...v, id).run();
      if (action === 'pay' && !isG) {
        if (b.pay_method !== 'online' || b.status !== 'accepted' || b.pm_payment) return err('Nothing to pay right now');
        const g = await env.DB.prepare('SELECT package_title FROM guides WHERE user_id=?').bind(b.guide_id).first();
        const cs = await pm(env, 'POST', '/checkout_sessions', {
          line_items: [{ name: `TourGuyed: ${g?.package_title || 'Tour'} (${b.day} ${b.slot})`, amount: Math.round(b.amount * 100), currency: 'PHP', quantity: 1 }],
          payment_method_types: ['gcash', 'paymaya', 'card', 'grab_pay'], send_email_receipt: true, show_description: true, show_line_items: true,
          description: `Booking #${b.id}`, reference_number: `TG-${b.id}-${Date.now()}`, metadata: { booking_id: String(b.id) },
          success_url: `${url.origin}/app.html#/bookings?paid=${b.id}`, cancel_url: `${url.origin}/app.html#/bookings` });
        await env.DB.prepare('UPDATE bookings SET pm_checkout=? WHERE id=?').bind(cs.id, id).run();
        return J({ checkout_url: cs.attributes.checkout_url });
      }
      if (action === 'check_payment') { await syncPayment(env, b); return J({ ok: 1 }); }
      if (action === 'accept' && isG && b.status === 'requested') {
        await set('accepted'); await env.DB.prepare('UPDATE guides SET accepted=accepted+1 WHERE user_id=?').bind(u.id).run();
        await notify(env, b.tourist_id, 'Your tourguide accepted!', `Your tour on ${b.day} ${b.slot} is confirmed. You can now chat in TourGuyed.${b.pay_method === 'online' ? ' Please pay online from your bookings page before the tour.' : ''}`);
      } else if (action === 'decline' && isG && b.status === 'requested') {
        if (!(body.reason || '').trim()) return err('A reason is required to decline');
        await set('declined', ',decline_reason=?', body.reason); await env.DB.prepare('UPDATE guides SET declined=declined+1 WHERE user_id=?').bind(u.id).run();
        await notify(env, b.tourist_id, 'Booking declined', `Reason: ${body.reason}`);
      } else if (action === 'cancel' && !isG && ['requested', 'accepted'].includes(b.status)) {
        if (b.payout_status === 'partial_released' || b.payout_status === 'released') return err('Payment already released — no refund possible');
        const late = minsUntil(b) < CANCEL_WINDOW_MIN;
        if (late && !body.confirm_late) return J({ needs_confirm: true, message: 'Less than 30 minutes before the tour: you will only get half of the package back.' });
        const refund = b.pm_payment ? (late ? b.amount / 2 : b.amount) : 0;
        await refundIfPaid(env, b, refund);
        await set('cancelled', ",refund=?,payout_status=?", refund, b.pay_method === 'cash' ? 'none' : b.pm_payment ? (late ? 'partial_refund' : 'refunded') : 'unpaid');
      } else if (action === 'noshow' && !isG && b.status === 'accepted') {
        if (minsUntil(b) > -CANCEL_WINDOW_MIN) return err('You can report a no-show once the guide is 30 minutes late');
        await refundIfPaid(env, b, b.amount);
        await set('no_show', ",refund=?,payout_status=?", b.pm_payment ? b.amount : 0, b.pm_payment ? 'refunded' : 'none');
      } else if (['start', 'release'].includes(action) && b.pay_method === 'online' && !b.pm_payment) {
        return err('Please pay for the tour first');
      } else if (action === 'start' && !isG && b.status === 'accepted' && b.pay_method === 'online') {
        // tourist confirms meeting → first half paid out to guide
        await env.DB.prepare("UPDATE bookings SET status='in_progress', payout_status='partial_released' WHERE id=?").bind(id).run();
      } else if (action === 'release' && !isG && ['accepted', 'in_progress'].includes(b.status)) {
        // tourist confirms tour complete → full payout; refund no longer possible
        await env.DB.prepare(`UPDATE bookings SET status='completed', payout_status=? WHERE id=?`).bind(b.pay_method === 'cash' ? 'cash_due' : 'released', id).run();
        if (b.pay_method === 'cash') await notify(env, b.guide_id, 'Tour completed — platform fee due', `Please pay the 20% platform fee (${money(b.platform_fee, b.currency)}) for booking #${b.id}.`);
      } else if (action === 'fee_paid' && isG && b.pay_method === 'cash') {
        await env.DB.prepare("UPDATE bookings SET payout_status='fee_reported' WHERE id=?").bind(id).run();
      } else return err('Action not allowed in this state');
      return J({ ok: 1 });
    }
    if (route === 'GET /messages/:id' || route === 'POST /messages/:id') {
      const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=? AND status IN('accepted','in_progress','completed')").bind(id).first();
      if (!b || (b.guide_id !== u.id && b.tourist_id !== u.id)) return err('Chat opens once the guide accepts', 403);
      if (M === 'POST') {
        const blocked = await env.DB.prepare('SELECT 1 FROM blocks WHERE tourist_id=? AND guide_id=?').bind(b.tourist_id, b.guide_id).first();
        if (blocked && u.id === b.guide_id) return err('This tourist has blocked messages from you', 403);
        if ((body.body || '').trim()) await env.DB.prepare('INSERT INTO messages(booking_id,sender_id,body) VALUES(?,?,?)').bind(id, u.id, body.body.slice(0, 2000)).run();
      }
      const m = await env.DB.prepare('SELECT sender_id,body,created_at FROM messages WHERE booking_id=? ORDER BY id').bind(id).all();
      return J({ messages: m.results.map(x => ({ ...x, mine: x.sender_id === u.id })) });
    }
    // ---------- in-app video call (WebRTC signaling via D1) ----------
    if (route === 'GET /call/:id' || route === 'POST /call/:id') {
      const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=? AND status IN('accepted','in_progress','completed')").bind(id).first();
      if (!b || (b.guide_id !== u.id && b.tourist_id !== u.id)) return err('Video call opens once the guide accepts', 403);
      if (M === 'POST') {
        if (!['join', 'offer', 'answer', 'ice', 'bye'].includes(body.type)) return err('Bad signal');
        await env.DB.prepare('DELETE FROM signals WHERE created<?').bind(Date.now() - 15 * 60e3).run();
        const r = await env.DB.prepare('INSERT INTO signals(booking_id,sender_id,type,data,created) VALUES(?,?,?,?,?)').bind(id, u.id, body.type, JSON.stringify(body.data ?? null).slice(0, 20000), Date.now()).run();
        if (body.type === 'join') { const other = u.id === b.guide_id ? b.tourist_id : b.guide_id; await notify(env, other, 'Video call waiting on TourGuyed', `${u.name} is waiting for you in the video call for booking #${id}.`); }
        return J({ id: r.meta.last_row_id });
      }
      const since = +url.searchParams.get('since') || 0;
      const rows = await env.DB.prepare('SELECT id,type,data FROM signals WHERE booking_id=? AND sender_id!=? AND id>? ORDER BY id').bind(id, u.id, since).all();
      return J({ role: u.id === b.guide_id ? 'guide' : 'tourist', signals: rows.results.map(x => ({ ...x, data: JSON.parse(x.data) })) });
    }
    if (route === 'GET /ice') {
      const ice = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
      if (env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN) {
        const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`, { method: 'POST', headers: { authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ ttl: 7200 }) }).catch(() => null);
        if (r?.ok) { const d = await r.json(); if (d.iceServers) ice.push(d.iceServers); }
      }
      return J({ iceServers: ice });
    }
    // ---------- trip requests (tourists post plans, guides send offers) ----------
    const STR = (v, n = 500) => String(v ?? '').trim().slice(0, n);
    const reqBody = b => ({ city: STR(b.city, 80), country: STR(b.country, 60), start_date: STR(b.start_date, 10), end_date: STR(b.end_date, 10), flexible: b.flexible ? 1 : 0,
      adults: Math.max(1, Math.min(50, +b.adults || 1)), children: Math.max(0, Math.min(50, +b.children || 0)), budget: +b.budget || null, currency: /^[A-Z]{3}$/.test(b.currency) ? b.currency : 'USD',
      interests: JSON.stringify((b.interests || []).slice(0, 15).map(x => STR(x, 40))), languages: JSON.stringify((b.languages || []).slice(0, 10).map(x => STR(x, 40))),
      guide_gender: STR(b.guide_gender, 10), student_ok: b.student_ok === 0 || b.student_ok === false ? 0 : 1, tour_style: STR(b.tour_style, 30), pace: STR(b.pace, 20), hours_per_day: +b.hours_per_day || null,
      meeting_place: STR(b.meeting_place, 200), accommodation: STR(b.accommodation, 300), accommodation_help: b.accommodation_help ? 1 : 0, transport: STR(b.transport, 200),
      requirements: STR(b.requirements, 1000), dietary: STR(b.dietary, 300), notes: STR(b.notes, 2000) });
    if (route === 'POST /requests' || route === 'PUT /requests/:id') {
      if (u.role !== 'tourist') return err('Switch to Tourist mode to post a trip plan');
      const d = reqBody(body);
      if (!d.city || !d.country || !d.start_date) return err('Destination city, country and start date are required');
      if (d.end_date && d.end_date < d.start_date) return err('End date must be after the start date');
      const cols = Object.keys(d);
      if (M === 'POST') {
        const open = await env.DB.prepare("SELECT COUNT(*) n FROM trip_requests WHERE tourist_id=? AND status='open'").bind(u.id).first();
        if (open.n >= 10) return err('You can have up to 10 open trip plans');
        const r = await env.DB.prepare(`INSERT INTO trip_requests(tourist_id,${cols}) VALUES(?,${cols.map(() => '?')})`).bind(u.id, ...Object.values(d)).run();
        return J({ id: r.meta.last_row_id });
      }
      const r = await env.DB.prepare(`UPDATE trip_requests SET ${cols.map(c => c + '=?')} WHERE id=? AND tourist_id=?`).bind(...Object.values(d), id, u.id).run();
      return r.meta.changes ? J({ ok: 1 }) : err('Not found', 404);
    }
    if (route === 'POST /requests/:id/close') {
      await env.DB.prepare("UPDATE trip_requests SET status=? WHERE id=? AND tourist_id=?").bind(body.reopen ? 'open' : 'closed', id, u.id).run();
      return J({ ok: 1 });
    }
    if (route === 'GET /my-requests') {
      const rows = (await env.DB.prepare(`SELECT r.*, u.name tourist_name, (SELECT COUNT(*) FROM offers o WHERE o.request_id=r.id) offers FROM trip_requests r JOIN users u ON u.id=r.tourist_id WHERE r.tourist_id=? ORDER BY r.id DESC`).bind(u.id).all()).results;
      const offers = (await env.DB.prepare(`SELECT o.*, gu.name guide_name, g.photo, g.rating, g.reviews, g.location, g.country g_country, g.languages, g.verified, g.is_student, g.school, g.tz g_tz
        FROM offers o JOIN users gu ON gu.id=o.guide_id JOIN guides g ON g.user_id=o.guide_id WHERE o.request_id IN (SELECT id FROM trip_requests WHERE tourist_id=?) ORDER BY o.updated_at DESC`).bind(u.id).all()).results;
      return J({ requests: rows.map(r => ({ ...reqFull(r), name: r.tourist_name, offers: offers.filter(o => o.request_id === r.id).map(o => ({ ...o, languages: arr(o.languages) })) })) });
    }
    if (route === 'GET /requests') { // guides browse
      if (u.role !== 'guide') return err('Switch to Tourguide mode to see tourist requests');
      const q = url.searchParams, w = ["r.status='open'", "(r.end_date IS NULL OR r.end_date='' OR r.end_date>=date('now'))"], b = [];
      if (q.get('country')) { w.push('r.country=?'); b.push(q.get('country')); }
      if (q.get('place')) { w.push('(r.city LIKE ? OR r.country LIKE ?)'); b.push(`%${q.get('place')}%`, `%${q.get('place')}%`); }
      const rows = (await env.DB.prepare(`SELECT r.*, u.name tourist_name, u.id_status, (SELECT COUNT(*) FROM offers o WHERE o.request_id=r.id) offers,
        (SELECT id FROM offers o WHERE o.request_id=r.id AND o.guide_id=?) my_offer FROM trip_requests r JOIN users u ON u.id=r.tourist_id WHERE ${w.join(' AND ')} ORDER BY r.start_date LIMIT 200`).bind(u.id, ...b).all()).results;
      const g = await env.DB.prepare('SELECT verified FROM guides WHERE user_id=?').bind(u.id).first();
      // meeting place / notes only for verified guides
      return J({ verified: !!g?.verified, requests: rows.map(r => ({ ...(g?.verified ? reqFull(r) : reqPublic(r)), tourist_verified: r.id_status === 'verified', my_offer: r.my_offer })) });
    }
    if (route === 'POST /requests/:id/offer') {
      if (u.role !== 'guide') return err('Switch to Tourguide mode to send offers');
      const g = await env.DB.prepare('SELECT * FROM guides WHERE user_id=?').bind(u.id).first();
      if (!g?.verified) return err('Your ID must be verified before you can send offers');
      const r = await env.DB.prepare("SELECT * FROM trip_requests WHERE id=? AND status='open'").bind(id).first();
      if (!r) return err('This request is no longer open');
      if (r.tourist_id === u.id) return err("You can't send an offer to yourself");
      const price = +body.price, cur = /^[A-Z]{3}$/.test(body.currency) ? body.currency : (g.currency || 'USD');
      if (!(price > 0)) return err('Enter your price');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.day || '') || !/^\d{2}:\d{2}$/.test(body.slot || '')) return err('Pick a proposed date and start time');
      const ex = await env.DB.prepare('SELECT * FROM offers WHERE request_id=? AND guide_id=?').bind(id, u.id).first();
      if (ex && ex.status !== 'pending' && ex.status !== 'withdrawn') return err('This offer is already ' + ex.status);
      if (ex) await env.DB.prepare("UPDATE offers SET price=?,currency=?,day=?,slot=?,hours=?,message=?,itinerary=?,status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(price, cur, body.day, body.slot, +body.hours || null, STR(body.message, 2000), STR(body.itinerary, 3000), ex.id).run();
      else await env.DB.prepare('INSERT INTO offers(request_id,guide_id,price,currency,day,slot,hours,message,itinerary) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, u.id, price, cur, body.day, body.slot, +body.hours || null, STR(body.message, 2000), STR(body.itinerary, 3000)).run();
      await notify(env, r.tourist_id, ex ? 'A guide updated their offer' : 'New offer for your trip to ' + r.city, `A verified TourGuyed guide ${ex ? 'updated their' : 'sent you an'} offer for ${r.city}: ${money(price, cur)}. Open My Trip Plans to review it.`);
      return J({ ok: 1 });
    }
    if (route === 'GET /my-offers') {
      const rows = (await env.DB.prepare(`SELECT o.*, r.city, r.country, r.start_date, r.end_date, r.adults, r.children, r.status req_status, u.name tourist_name, g.tz g_tz
        FROM offers o JOIN guides g ON g.user_id=o.guide_id JOIN trip_requests r ON r.id=o.request_id JOIN users u ON u.id=r.tourist_id WHERE o.guide_id=? ORDER BY o.updated_at DESC`).bind(u.id).all()).results;
      return J({ offers: rows.map(o => ({ ...o, tourist_name: o.status === 'accepted' ? o.tourist_name : shortName(o.tourist_name) })) });
    }
    if (route.startsWith('GET /offers/:id') || route.startsWith('POST /offers/:id/')) {
      const o = await env.DB.prepare('SELECT o.*, r.tourist_id, r.city, r.status req_status FROM offers o JOIN trip_requests r ON r.id=o.request_id WHERE o.id=?').bind(id).first();
      if (!o || (o.guide_id !== u.id && o.tourist_id !== u.id)) return err('Not found', 404);
      const isG = o.guide_id === u.id, other = isG ? o.tourist_id : o.guide_id, action = p[2];
      if (M === 'GET') {
        const m = (await env.DB.prepare('SELECT sender_id,body,price,created_at FROM offer_msgs WHERE offer_id=? ORDER BY id').bind(id).all()).results;
        return J({ offer: o, messages: m.map(x => ({ ...x, mine: x.sender_id === u.id })) });
      }
      if (action === 'message') {
        if (!['pending'].includes(o.status)) return err('This offer is closed');
        const txt = STR(body.body, 2000), pr = +body.price || null; if (!txt && !pr) return err('Write a message');
        await env.DB.prepare('INSERT INTO offer_msgs(offer_id,sender_id,body,price) VALUES(?,?,?,?)').bind(id, u.id, txt, pr).run();
        if (isG && pr) await env.DB.prepare('UPDATE offers SET price=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(pr, id).run();
        await notify(env, other, 'New message about a TourGuyed offer', pr ? `New proposed price: ${money(pr, o.currency)}. ${txt}` : txt.slice(0, 300));
        return J({ ok: 1 });
      }
      if (action === 'withdraw' && isG && o.status === 'pending') { await env.DB.prepare("UPDATE offers SET status='withdrawn' WHERE id=?").bind(id).run(); return J({ ok: 1 }); }
      if (action === 'decline' && !isG && o.status === 'pending') {
        await env.DB.prepare("UPDATE offers SET status='declined' WHERE id=?").bind(id).run();
        await notify(env, o.guide_id, 'Offer declined', `The traveler going to ${o.city} declined your offer.`); return J({ ok: 1 });
      }
      if (action === 'accept' && !isG && o.status === 'pending') {
        const g = await env.DB.prepare('SELECT * FROM guides WHERE user_id=?').bind(o.guide_id).first();
        const pm = body.pay_method === 'online' && (o.currency || 'PHP') === 'PHP' && env.PAYMONGO_SECRET_KEY ? 'online' : 'cash';
        const r = await env.DB.prepare(`INSERT INTO bookings(tourist_id,guide_id,day,slot,timeline,pay_method,amount,platform_fee,payout_status,currency,tz,pay_currency,pay_amount,status)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'accepted')`).bind(u.id, o.guide_id, o.day, o.slot, (o.itinerary || o.message || '').slice(0, 1000), pm, o.price, +(o.price * FEE).toFixed(2),
          pm === 'cash' ? 'cash_due' : 'unpaid', o.currency, g?.tz || 'UTC', o.currency, o.price).run();
        await env.DB.batch([env.DB.prepare("UPDATE offers SET status='accepted', booking_id=? WHERE id=?").bind(r.meta.last_row_id, id),
          env.DB.prepare("UPDATE trip_requests SET status='matched' WHERE id=?").bind(o.request_id),
          env.DB.prepare("UPDATE offers SET status='closed' WHERE request_id=? AND id!=? AND status='pending'").bind(o.request_id, id),
          env.DB.prepare('UPDATE guides SET accepted=accepted+1 WHERE user_id=?').bind(o.guide_id)]);
        await notify(env, o.guide_id, '🎉 Your offer was accepted!', `Your offer for ${o.city} on ${o.day} ${o.slot} is now a confirmed booking. Open Bookings to chat with your traveler.`);
        return J({ ok: 1, booking_id: r.meta.last_row_id });
      }
      return err('Action not allowed');
    }

    if (route === 'POST /reviews' && u.role === 'tourist') {
      const b = await env.DB.prepare("SELECT * FROM bookings WHERE id=? AND tourist_id=? AND status='completed'").bind(body.booking_id, u.id).first();
      if (!b) return err('You can only rate completed tours');
      const s = Math.max(1, Math.min(5, +body.stars | 0));
      const r = await env.DB.prepare('INSERT INTO reviews(booking_id,guide_id,tourist_id,stars,comment) VALUES(?,?,?,?,?)').bind(b.id, b.guide_id, u.id, s, body.comment || '').run().catch(() => null);
      if (!r) return err('Already rated');
      await env.DB.prepare('UPDATE guides SET rating=ROUND((rating*reviews+?)/(reviews+1),2), reviews=reviews+1 WHERE user_id=?').bind(s, b.guide_id).run();
      return J({ ok: 1 });
    }
    if (route === 'POST /block' && u.role === 'tourist') {
      await env.DB.prepare(body.unblock ? 'DELETE FROM blocks WHERE tourist_id=? AND guide_id=?' : 'INSERT OR IGNORE INTO blocks VALUES(?,?)').bind(u.id, body.guide_id).run();
      return J({ ok: 1 });
    }
    if (route === 'POST /support') {
      await env.DB.prepare('INSERT INTO tickets(user_id,subject,body) VALUES(?,?,?)').bind(u.id, body.subject || 'Complaint', body.body || '').run();
      return J({ ok: 1 });
    }
    if (route === 'POST /invite' && u.role === 'guide') {
      await env.DB.prepare('INSERT INTO invites(guide_id,email) VALUES(?,?)').bind(u.id, body.email).run();
      return J({ ok: 1, link: `${url.origin}/app.html#/start?role=guide&ref=${u.id}` });
    }
    // ---------- admin ----------
    if (p[0] === 'admin') {
      if (u.role !== 'admin') return err('Admins only', 403);
      const all = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).all()).results;
      if (route === 'GET /admin/overview') {
        const one = async q => (await env.DB.prepare(q).first()).n;
        const byCur = async q => (await env.DB.prepare(q).all()).results.filter(r => r.n > 0).map(r => money(r.n, r.c || 'PHP')).join(' + ') || money(0, 'USD');
        return J({
          users: await one("SELECT COUNT(*) n FROM users WHERE role!='admin'"), guides: await one("SELECT COUNT(*) n FROM users WHERE role='guide'"),
          tourists: await one("SELECT COUNT(*) n FROM users WHERE role='tourist'"), pending_ids: await one("SELECT COUNT(*) n FROM media WHERE kind IN('id','school') AND status='pending'"),
          pending_media: await one("SELECT COUNT(*) n FROM media WHERE kind IN('photo','video') AND status='pending'"), open_tickets: await one("SELECT COUNT(*) n FROM tickets WHERE status='open'"),
          bookings: await one("SELECT COUNT(*) n FROM bookings"), open_requests: await one("SELECT COUNT(*) n FROM trip_requests WHERE status='open'"), fees_earned: await byCur("SELECT currency c, SUM(platform_fee) n FROM bookings WHERE status='completed' GROUP BY currency"),
          cash_fees_due: await byCur("SELECT currency c, SUM(platform_fee) n FROM bookings WHERE status='completed' AND payout_status='cash_due' GROUP BY currency"),
          payouts_due: await byCur("SELECT currency c, SUM(CASE WHEN payout_status='released' THEN amount-platform_fee ELSE amount/2 END - guide_paid) n FROM bookings WHERE pay_method='online' AND payout_status IN('partial_released','released') GROUP BY currency"),
          online_enabled: env.PAYMONGO_SECRET_KEY ? 1 : 0, storage: env.FILES ? 'r2' : 'db', storage_used: await one('SELECT COALESCE(SUM(size),0) n FROM media')
        });
      }
      if (route === 'GET /admin/verifications') return J({ items: (await all(`SELECT m.id,m.kind,m.status,m.created_at,m.user_id,(m.data IS NOT NULL) stored,u.name,u.email,u.role,u.id_status FROM media m JOIN users u ON u.id=m.user_id ORDER BY m.status='pending' DESC, m.id DESC LIMIT 200`)).map(x => ({ ...x, stored: x.stored || !!env.FILES })) });
      if (route === 'GET /admin/file/:id') { const m = await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first(); return m ? serveFile(env, m, req) : err('Not found', 404); }
      if (route === 'POST /admin/media/:id') {
        const m = await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(id).first(); if (!m) return err('Not found', 404);
        const ok = body.decision === 'approve';
        await env.DB.prepare('UPDATE media SET status=? WHERE id=?').bind(ok ? 'approved' : 'rejected', id).run();
        if (m.kind === 'id') {
          await env.DB.prepare('UPDATE users SET id_status=? WHERE id=?').bind(ok ? 'verified' : 'rejected', m.user_id).run();
          await env.DB.prepare('UPDATE guides SET verified=? WHERE user_id=?').bind(ok ? 1 : 0, m.user_id).run();
          await notify(env, m.user_id, ok ? 'Your TourGuyed ID is verified' : 'Your TourGuyed ID was not accepted', ok ? 'You are verified!' : `Please upload a clearer ID. ${body.note || ''}`);
        }
        if (m.kind === 'school' && ok) await env.DB.prepare('UPDATE guides SET school_permission=1 WHERE user_id=?').bind(m.user_id).run();
        if (['photo', 'video'].includes(m.kind) && ok) {
          const g = await env.DB.prepare('SELECT media FROM guides WHERE user_id=?').bind(m.user_id).first();
          if (g) { const list = arr(g.media); list.push(`/api/media/${id}`); await env.DB.prepare('UPDATE guides SET media=? WHERE user_id=?').bind(JSON.stringify(list), m.user_id).run(); }
        }
        return J({ ok: 1 });
      }
      if (route === 'GET /admin/conversations') return J({ items: await all(`SELECT b.id,b.day,b.slot,b.status,gu.name guide_name,gu.email guide_email,tu.name tourist_name,tu.email tourist_email,
          (SELECT COUNT(*) FROM messages m WHERE m.booking_id=b.id) msgs,(SELECT MAX(created_at) FROM messages m WHERE m.booking_id=b.id) last
          FROM bookings b JOIN users gu ON gu.id=b.guide_id JOIN users tu ON tu.id=b.tourist_id ORDER BY last IS NULL, last DESC, b.id DESC LIMIT 200`) });
      if (route === 'GET /admin/conversations/:id') return J({ messages: await all(`SELECT m.body,m.created_at,u.name,u.role FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.booking_id=? ORDER BY m.id`, id) });
      if (route === 'GET /admin/tickets') return J({ items: await all(`SELECT t.*,u.name,u.email,u.role FROM tickets t JOIN users u ON u.id=t.user_id ORDER BY t.status='open' DESC, t.id DESC LIMIT 200`) });
      if (route === 'POST /admin/tickets/:id') {
        await env.DB.prepare("UPDATE tickets SET status='resolved' WHERE id=?").bind(id).run();
        const t = await env.DB.prepare('SELECT user_id,subject FROM tickets WHERE id=?').bind(id).first();
        if (body.reply && t) await notify(env, t.user_id, 'Re: ' + t.subject, body.reply);
        return J({ ok: 1 });
      }
      if (route === 'GET /admin/users') return J({ items: await all(`SELECT u.id,u.role,u.name,u.email,u.id_status,u.created_at,g.verified,g.rating,g.reviews,(SELECT COUNT(*) FROM admin_msgs a WHERE a.user_id=u.id AND a.from_admin=0 AND a.seen=0) unread FROM users u LEFT JOIN guides g ON g.user_id=u.id WHERE u.role!='admin' ORDER BY u.id DESC LIMIT 500`) });
      if (route === 'GET /admin/bookings') return J({ items: (await all(`SELECT b.*,gu.name guide_name,tu.name tourist_name FROM bookings b JOIN users gu ON gu.id=b.guide_id JOIN users tu ON tu.id=b.tourist_id ORDER BY b.id DESC LIMIT 300`)).map(b => ({ ...b, start_utc: zonedToUtc(b.day, b.slot, b.tz) })) });
      if (route === 'POST /admin/media/:id/delete') { const m = await env.DB.prepare('SELECT key FROM media WHERE id=?').bind(id).first(); if (m && env.FILES) await env.FILES.delete(m.key).catch(() => {}); await env.DB.prepare('DELETE FROM media WHERE id=?').bind(id).run(); return J({ ok: 1 }); }
      if (route === 'GET /admin/users/:id') {
        const user = await env.DB.prepare('SELECT id,role,name,email,id_status,created_at FROM users WHERE id=?').bind(id).first(); if (!user) return err('Not found', 404);
        const guide = await env.DB.prepare('SELECT * FROM guides WHERE user_id=?').bind(id).first();
        return J({ user, guide });
      }
      if (route === 'PUT /admin/users/:id') {
        const t = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(id).first(); if (!t) return err('Not found', 404); if (t.role === 'admin') return err('Admins can’t be edited here');
        const name = String(body.name || '').replace(/\s+/g, ' ').trim(), email = String(body.email || '').trim().toLowerCase();
        if (name.length < 2 || name.length > 80) return err('Name must be 2–80 characters');
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Invalid email');
        if (await env.DB.prepare('SELECT 1 FROM users WHERE email=? AND id!=?').bind(email, id).first()) return err('That email is used by another account');
        const ids = ['none', 'pending', 'verified', 'rejected'].includes(body.id_status) ? body.id_status : null;
        await env.DB.prepare('UPDATE users SET name=?,email=?,id_status=COALESCE(?,id_status) WHERE id=?').bind(name, email, ids, id).run();
        if (body.guide) {
          const g = body.guide, f = ['bio', 'gender', 'occupation', 'school', 'location', 'country', 'currency', 'tz', 'transport', 'package_title', 'wise_email', 'photo'],
            n = ['is_student', 'school_permission', 'price', 'duration_hours', 'offers_local', 'verified'], a = ['places', 'languages', 'activities', 'includes', 'excludes'];
          if (g.currency && !/^[A-Z]{3}$/.test(g.currency)) return err('Invalid currency'); if (g.tz && !validTz(g.tz)) return err('Invalid time zone');
          const sets = [], vals = [];
          for (const k of f) if (k in g) { sets.push(`${k}=?`); vals.push(String(g[k] ?? '')); }
          for (const k of n) if (k in g) { sets.push(`${k}=?`); vals.push(+g[k] || 0); }
          for (const k of a) if (k in g) { sets.push(`${k}=?`); vals.push(JSON.stringify(Array.isArray(g[k]) ? g[k] : [])); }
          await env.DB.prepare('INSERT OR IGNORE INTO guides(user_id) VALUES(?)').bind(id).run();
          if (sets.length) await env.DB.prepare(`UPDATE guides SET ${sets.join(',')} WHERE user_id=?`).bind(...vals, id).run();
        }
        return J({ ok: 1 });
      }
      if (route === 'POST /admin/users/:id/delete') {
        const t = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(id).first(); if (!t) return err('Not found', 404); if (t.role === 'admin') return err('Admin accounts can’t be deleted');
        const live = await env.DB.prepare("SELECT COUNT(*) n FROM bookings WHERE (tourist_id=? OR guide_id=?) AND status IN ('requested','accepted','in_progress') AND pay_method='online' AND payout_status NOT IN ('pending','refunded')").bind(id, id).first().catch(() => ({ n: 0 }));
        if (live?.n && !body.force) return err(`This user has ${live.n} active paid booking(s). Refund or finish them first, or delete anyway.`, 409);
        const keys = (await env.DB.prepare('SELECT key FROM media WHERE user_id=? AND key IS NOT NULL').bind(id).all()).results;
        if (env.FILES) for (const k of keys) await env.FILES.delete(k.key).catch(() => {});
        const bq = 'SELECT id FROM bookings WHERE tourist_id=?1 OR guide_id=?1', oq = 'SELECT id FROM offers WHERE guide_id=?1 OR request_id IN (SELECT id FROM trip_requests WHERE tourist_id=?1)';
        const qs = [`DELETE FROM messages WHERE booking_id IN (${bq}) OR sender_id=?1`, `DELETE FROM signals WHERE booking_id IN (${bq})`, `DELETE FROM reviews WHERE booking_id IN (${bq})`,
          `DELETE FROM offer_msgs WHERE offer_id IN (${oq})`, `DELETE FROM offers WHERE id IN (${oq})`, 'DELETE FROM trip_requests WHERE tourist_id=?1',
          'DELETE FROM bookings WHERE tourist_id=?1 OR guide_id=?1', 'DELETE FROM availability WHERE guide_id=?1', 'DELETE FROM blocks WHERE tourist_id=?1 OR guide_id=?1',
          'DELETE FROM tickets WHERE user_id=?1', 'DELETE FROM invites WHERE guide_id=?1', 'DELETE FROM media WHERE user_id=?1', 'DELETE FROM resets WHERE user_id=?1',
          'DELETE FROM admin_msgs WHERE user_id=?1', 'DELETE FROM sessions WHERE user_id=?1', 'DELETE FROM guides WHERE user_id=?1', 'DELETE FROM users WHERE id=?1'];
        for (const q of qs) await env.DB.prepare(q).bind(id).run().catch(() => {});
        return J({ ok: 1 });
      }
      if (route === 'GET /admin/dm/:id') {
        await env.DB.prepare('UPDATE admin_msgs SET seen=1 WHERE user_id=? AND from_admin=0').bind(id).run();
        return J({ items: await all('SELECT body,from_admin,created_at FROM admin_msgs WHERE user_id=? ORDER BY id', id) });
      }
      if (route === 'POST /admin/dm/:id') {
        const t = String(body.body || '').trim().slice(0, 4000); if (!t) return err('Write a message');
        await env.DB.prepare('INSERT INTO admin_msgs(user_id,from_admin,body) VALUES(?,1,?)').bind(id, t).run();
        await notify(env, id, 'New message from TourGuyed', t.slice(0, 500) + '\n\nReply from your dashboard → Messages from TourGuyed.');
        return J({ ok: 1 });
      }
      if (route === 'POST /admin/users/:id/reset') return J({ link: await resetLink(env, id, url.origin) });
      if (route === 'GET /admin/payouts') return J({ items: (await all(`SELECT b.id,b.day,b.slot,b.amount,b.platform_fee,b.payout_status,b.guide_paid,b.status,b.currency,u.name guide_name,g.wise_email
          FROM bookings b JOIN users u ON u.id=b.guide_id JOIN guides g ON g.user_id=b.guide_id WHERE b.pay_method='online' AND b.payout_status IN('partial_released','released') ORDER BY b.id DESC`))
          .map(b => ({ ...b, owed: +((b.payout_status === 'released' ? b.amount - b.platform_fee : b.amount / 2) - b.guide_paid).toFixed(2) })).filter(b => b.owed > 0) });
      if (route === 'POST /admin/payouts/:id') {
        const b = await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first(); if (!b) return err('Not found', 404);
        const owed = (b.payout_status === 'released' ? b.amount - b.platform_fee : b.amount / 2) - b.guide_paid;
        await env.DB.prepare('UPDATE bookings SET guide_paid=guide_paid+? WHERE id=?').bind(owed, id).run();
        await notify(env, b.guide_id, 'TourGuyed payout sent', `${money(owed, b.currency)} for booking #${b.id} was sent to your Wise account.`);
        return J({ ok: 1 });
      }
      if (route === 'POST /admin/bookings/:id/fee_received') { await env.DB.prepare("UPDATE bookings SET payout_status='fee_received' WHERE id=?").bind(id).run(); return J({ ok: 1 }); }
    }
    return err('Not found', 404);
  } catch (e) { return err('Server error: ' + e.message, 500); }
}
