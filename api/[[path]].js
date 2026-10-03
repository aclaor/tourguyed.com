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
  return (await hash(pw, stored.split(':')[0])) === stored;
}
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
const minsUntil = b => (new Date(`${b.day}T${b.slot}:00+08:00`) - Date.now()) / 60000;

export async function onRequest({ request: req, env, params }) {
  if (!env.DB) return err('Database not bound. See README.', 500);
  const p = params.path || [], M = req.method, url = new URL(req.url);
  const body = M === 'POST' || M === 'PUT' ? await req.json().catch(() => ({})) : {};
  const route = `${M} /${p.map((x, i) => (/^\d+$/.test(x) ? ':id' : x)).join('/')}`;
  const id = +p.find(x => /^\d+$/.test(x));

  try {
    // ---------- public ----------
    if (route === 'POST /signup') {
      const { role, email, password, name } = body;
      if (!['tourist', 'guide'].includes(role) || !email || !name || (password || '').length < 8) return err('Name, email, role and 8+ char password required');
      const r = await env.DB.prepare('INSERT INTO users(role,email,name,pass) VALUES(?,?,?,?)').bind(role, email.toLowerCase(), name, await hash(password)).run().catch(() => null);
      if (!r) return err('Email already registered');
      const uid = r.meta.last_row_id;
      if (role === 'guide') await env.DB.prepare('INSERT INTO guides(user_id,invited_by) VALUES(?,?)').bind(uid, body.invited_by || null).run();
      return J({ token: await session(env, uid) });
    }
    if (route === 'POST /login') {
      const u = await env.DB.prepare('SELECT * FROM users WHERE email=?').bind((body.email || '').toLowerCase()).first();
      if (!u || !(await verify(body.password || '', u.pass))) return err('Wrong email or password', 401);
      return J({ token: await session(env, u.id) });
    }
    if (route === 'GET /guides') {
      const q = url.searchParams; const where = ['g.verified=1', 'g.price>0']; const b = [];
      if (q.get('place')) { where.push('(g.location LIKE ? OR g.places LIKE ?)'); b.push(`%${q.get('place')}%`, `%${q.get('place')}%`); }
      if (q.get('activity')) { where.push('g.activities LIKE ?'); b.push(`%${q.get('activity')}%`); }
      if (q.get('gender')) { where.push('g.gender=?'); b.push(q.get('gender')); }
      if (q.get('language')) { where.push('g.languages LIKE ?'); b.push(`%${q.get('language')}%`); }
      if (q.get('student') === 'yes') where.push('g.is_student=1');
      if (q.get('student') === 'no') where.push('g.is_student=0');
      // ranking: ratings + review volume + acceptance rate decide visibility
      const rows = await env.DB.prepare(`SELECT g.*,u.name FROM guides g JOIN users u ON u.id=g.user_id WHERE ${where.join(' AND ')}
        ORDER BY (g.rating*20 + MIN(g.reviews,200)*0.1 + (CASE WHEN g.accepted+g.declined=0 THEN 100 ELSE g.accepted*100.0/(g.accepted+g.declined) END)*0.3) DESC`).bind(...b).all();
      return J({ guides: rows.results.map(shapeGuide) });
    }
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
      return J({ slots: a.results });
    }

    // ---------- signed in ----------
    const u = await me(env, req);
    if (!u) return err('Please sign in', 401);

    if (route === 'GET /me') {
      const g = u.role === 'guide' ? await env.DB.prepare('SELECT * FROM guides WHERE user_id=?').bind(u.id).first() : null;
      return J({ user: { id: u.id, role: u.role, name: u.name, email: u.email, id_status: u.id_status, relay: relayEmail(u) }, guide: g && { ...shapeGuide(g), wise_email: g.wise_email } });
    }
    if (route === 'POST /logout') { await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id).run(); return J({ ok: 1 }); }

    if (route === 'PUT /guide/profile' && u.role === 'guide') {
      const f = ['photo', 'bio', 'gender', 'occupation', 'school', 'location', 'transport', 'package_title', 'wise_email'];
      const n = ['is_student', 'school_permission', 'price', 'duration_hours', 'offers_local'];
      const a = ['places', 'languages', 'activities', 'includes', 'excludes'];
      const sets = [], vals = [];
      for (const k of f) if (k in body) { sets.push(`${k}=?`); vals.push(String(body[k] ?? '')); }
      for (const k of n) if (k in body) { sets.push(`${k}=?`); vals.push(+body[k] || 0); }
      for (const k of a) if (k in body) { sets.push(`${k}=?`); vals.push(JSON.stringify(body[k] || [])); }
      if (body.is_student && !body.school_permission) return err('Student guides must confirm school permission');
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
      const kind = body.kind; if (!['id', 'video', 'photo', 'school'].includes(kind)) return err('Bad kind');
      const key = `${u.id}/${kind}/${Date.now()}-${(body.name || 'file').replace(/[^\w.-]/g, '')}`;
      if (env.FILES && body.dataUrl) {
        const [meta, b64] = body.dataUrl.split(',');
        await env.FILES.put(key, Uint8Array.from(atob(b64), c => c.charCodeAt(0)), { httpMetadata: { contentType: meta.slice(5).split(';')[0] } });
      }
      await env.DB.prepare('INSERT INTO media(user_id,kind,key) VALUES(?,?,?)').bind(u.id, kind, key).run();
      if (kind === 'id') await env.DB.prepare("UPDATE users SET id_status='pending' WHERE id=?").bind(u.id).run();
      return J({ ok: 1, key });
    }

    if (route === 'POST /bookings' && u.role === 'tourist') {
      if (u.id_status === 'none') return err('Upload your ID before booking');
      const g = await env.DB.prepare('SELECT * FROM guides WHERE user_id=?').bind(body.guide_id).first();
      if (!g) return err('Guide not found');
      const slot = await env.DB.prepare('SELECT 1 FROM availability WHERE guide_id=? AND day=? AND slot=?').bind(g.user_id, body.day, body.slot).first();
      if (!slot) return err('That time is not available');
      const pm = body.pay_method === 'online' ? 'online' : 'cash';
      const r = await env.DB.prepare('INSERT INTO bookings(tourist_id,guide_id,day,slot,timeline,pay_method,amount,platform_fee,payout_status) VALUES(?,?,?,?,?,?,?,?,?)')
        .bind(u.id, g.user_id, body.day, body.slot, body.timeline || '', pm, g.price, +(g.price * FEE).toFixed(2), pm === 'cash' ? 'cash_due' : 'held').run();
      await notify(env, g.user_id, 'New TourGuyed booking request', `You have a new request for ${body.day} ${body.slot}. Open your dashboard to accept or decline.`);
      return J({ id: r.meta.last_row_id });
    }
    if (route === 'GET /bookings') {
      const col = u.role === 'guide' ? 'guide_id' : 'tourist_id';
      const rows = await env.DB.prepare(`SELECT b.*, gu.name guide_name, tu.id tourist_uid, tu.name tourist_name, g.photo guide_photo,
        (SELECT 1 FROM reviews r WHERE r.booking_id=b.id) reviewed FROM bookings b JOIN users gu ON gu.id=b.guide_id JOIN users tu ON tu.id=b.tourist_id
        JOIN guides g ON g.user_id=b.guide_id WHERE b.${col}=? ORDER BY b.day DESC, b.slot DESC`).bind(u.id).all();
      // guides only ever see the tourist's masked relay email
      return J({ bookings: rows.results.map(b => ({ ...b, tourist_contact: relayEmail({ role: 'tourist', id: b.tourist_uid }) })) });
    }
    if (route.startsWith('POST /bookings/:id/')) {
      const action = p[2];
      const b = await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();
      if (!b || (b.guide_id !== u.id && b.tourist_id !== u.id)) return err('Not found', 404);
      const isG = b.guide_id === u.id, set = (s, extra = '', ...v) => env.DB.prepare(`UPDATE bookings SET status=?${extra} WHERE id=?`).bind(s, ...v, id).run();
      if (action === 'accept' && isG && b.status === 'requested') {
        await set('accepted'); await env.DB.prepare('UPDATE guides SET accepted=accepted+1 WHERE user_id=?').bind(u.id).run();
        await notify(env, b.tourist_id, 'Your tourguide accepted!', `Your tour on ${b.day} ${b.slot} is confirmed. You can now chat in TourGuyed.`);
      } else if (action === 'decline' && isG && b.status === 'requested') {
        if (!(body.reason || '').trim()) return err('A reason is required to decline');
        await set('declined', ',decline_reason=?,refund=amount', body.reason); await env.DB.prepare('UPDATE guides SET declined=declined+1 WHERE user_id=?').bind(u.id).run();
        await notify(env, b.tourist_id, 'Booking declined', `Reason: ${body.reason}`);
      } else if (action === 'cancel' && !isG && ['requested', 'accepted'].includes(b.status)) {
        if (b.payout_status === 'partial_released' || b.payout_status === 'released') return err('Payment already released — no refund possible');
        const late = minsUntil(b) < CANCEL_WINDOW_MIN;
        if (late && !body.confirm_late) return J({ needs_confirm: true, message: 'Less than 30 minutes before the tour: you will only get half of the package back.' });
        await set('cancelled', ',refund=?', late ? b.amount / 2 : b.amount);
      } else if (action === 'noshow' && !isG && b.status === 'accepted') {
        if (minsUntil(b) > -CANCEL_WINDOW_MIN) return err('You can report a no-show once the guide is 30 minutes late');
        await set('no_show', ",refund=amount,payout_status='refunded'");
      } else if (action === 'start' && !isG && b.status === 'accepted' && b.pay_method === 'online') {
        // tourist confirms meeting → first half paid out to guide
        await env.DB.prepare("UPDATE bookings SET status='in_progress', payout_status='partial_released' WHERE id=?").bind(id).run();
      } else if (action === 'release' && !isG && ['accepted', 'in_progress'].includes(b.status)) {
        // tourist confirms tour complete → full payout; refund no longer possible
        await env.DB.prepare(`UPDATE bookings SET status='completed', payout_status=? WHERE id=?`).bind(b.pay_method === 'cash' ? 'cash_due' : 'released', id).run();
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
      return J({ messages: m.results.map(x => ({ ...x, mine: x.sender_id === u.id })), meet: `https://meet.jit.si/tourguyed-${id}-${b.tourist_id * 7919 + b.guide_id}` });
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
    return err('Not found', 404);
  } catch (e) { return err('Server error: ' + e.message, 500); }
}
