// TourGuyed dashboard SPA (hash routes)
const $ = s => document.querySelector(s), V = () => $('#view');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n, cur = 'PHP') => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'PHP', maximumFractionDigits: 2 }).format(n || 0) } catch { return (cur || '') + ' ' + Number(n || 0).toLocaleString() } };
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'KRW', 'CNY', 'HKD', 'TWD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'INR', 'AUD', 'NZD', 'CAD', 'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'ZAR', 'EGP', 'MAD', 'KES', 'NGN', 'AED', 'SAR', 'QAR', 'TRY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'ILS'];
const COUNTRIES = (() => { try { const d = new Intl.DisplayNames(['en'], { type: 'region' }); return 'AF AL DZ AD AO AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF KH CM CA CV CL CN CO CR HR CU CY CZ DK DO EC EG SV EE ET FJ FI FR GE DE GH GR GT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KR KW KG LA LV LB LT LU MO MG MY MV MT MU MX MD MC MN ME MA MZ MM NA NP NL NZ NI NG MK NO OM PK PA PG PY PE PH PL PT PR QA RO RU RW SA SN RS SC SG SK SI ZA ES LK SE CH TW TZ TH TL TN TR UG UA AE GB US UY UZ VE VN ZM ZW'.split(' ').map(c => d.of(c)).sort(); } catch { return [] } })();
const myTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' } };
let ME = null;
// ---------- social sign-in (shared Leeys Technology Supabase project) ----------
const SOCIAL = ['google']; // add 'facebook' here once Facebook is enabled in Supabase → Authentication → Providers
const SUPA_URL = 'https://gkxpwqryakgzgvvprbkl.supabase.co', SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdreHB3cXJ5YWtnemd2dnByYmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0MDAxNTUsImV4cCI6MjA5Mzk3NjE1NX0.oMSZx15YsodlOdzPxg4d7a0WesYQRuPCRUZxZcqGA1I';
let supa = null; try { supa = window.supabase.createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }); } catch { }
const SOCIAL_UI = { google: ['Continue with Google', '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>'],
  facebook: ['Continue with Facebook', '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>'] };
const socialButtons = (note = '') => supa ? `<div class="social">${SOCIAL.map(p => `<button type="button" class="sbtn ${p}" data-social="${p}">${SOCIAL_UI[p][1]}<span>${SOCIAL_UI[p][0]}</span></button>`).join('')}</div>${note}<div class="or"><span>or use email</span></div>` : '';
function wireSocial(getRole) {
  document.querySelectorAll('[data-social]').forEach(b => b.onclick = async () => {
    try { localStorage.tg_role = getRole ? getRole() : 'tourist'; } catch { }
    b.disabled = true; b.querySelector('span').textContent = 'Opening…';
    const { error } = await supa.auth.signInWithOAuth({ provider: b.dataset.social, options: { redirectTo: location.origin + '/app.html' } });
    if (error) { toast('Sign-in failed: ' + error.message); b.disabled = false; b.querySelector('span').textContent = SOCIAL_UI[b.dataset.social][0]; }
  });
}
async function finishSocial() {
  if (!supa || localStorage.tg) return false;
  const { data } = await supa.auth.getSession().catch(() => ({ data: {} }));
  const at = data?.session?.access_token; if (!at) return false;
  try {
    const d = await api('/oauth', { method: 'POST', body: { access_token: at, role: localStorage.tg_role } });
    localStorage.tg = d.token; localStorage.removeItem('tg_role'); await supa.auth.signOut().catch(() => { });
    await loadMe(); toast(d.isNew ? '🎉 Welcome to TourGuyed!' : 'Signed in'); 
    location.hash = d.isNew && d.role === 'guide' ? '#/profile' : '#/dashboard'; return true;
  } catch (e) { toast(e.message); await supa.auth.signOut().catch(() => { }); return false; }
}
const api = async (path, opt = {}) => {
  const r = await fetch('/api' + path, { method: opt.method || 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (localStorage.tg || '') }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const d = await r.json().catch(() => ({ error: 'Network error' }));
  if (!r.ok) throw new Error(d.error || 'Error'); return d;
};
const toast = m => { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(t._); t._ = setTimeout(() => t.style.display = 'none', 3200); };
const modal = html => { $('#modalBody').innerHTML = html + '<p style="margin-top:14px"><button class="btn ghost sm" onclick="closeModal()">Close</button></p>'; $('#modal').classList.add('open'); };
const closeModal = () => $('#modal').classList.remove('open');
const qs = () => Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
const tags = (a, fill) => (a || []).map(x => `<span class="tag ${fill ? 'fill' : ''}">${esc(x)}</span>`).join('');
const fileToDataUrl = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });

async function loadMe() { try { ME = localStorage.tg ? await api('/me') : null } catch { ME = null; localStorage.removeItem('tg') } renderMenu(); }
function renderMenu() {
  const r = ME?.user.role, cur = location.hash.split('?')[0];
  const items = !ME ? [['#/start', 'Get started'], ['#/guides', 'Browse guides'], ['#/login', 'Sign in'], ['#/signup', 'Sign up']]
    : r === 'admin' ? [['#/admin', 'Overview'], ['#/admin-verify', 'Verify IDs & media'], ['#/admin-chats', 'All messages'], ['#/admin-tickets', 'Support tickets'], ['#/admin-users', 'Users'], ['#/admin-bookings', 'Bookings & fees'], ['#/admin-payouts', 'Guide payouts']]
    : r === 'guide' ? [['#/dashboard', 'Dashboard'], ['#/bookings', 'Bookings'], ['#/messages', 'Messages'], ['#/availability', 'Availability'], ['#/profile', 'My profile & package'], ['#/invite', 'Invite guides'], ['#/support', 'Customer service']]
    : [['#/dashboard', 'Dashboard'], ['#/guides', 'Find guides'], ['#/bookings', 'My bookings'], ['#/messages', 'Messages'], ['#/profile', 'Verify ID'], ['#/support', 'Customer service']];
  const mode = r === 'guide' ? `<div class="mode guide"><small>You're in</small><b>🧭 Tourguide mode</b><button class="switch" data-to="tourist">Switch to Tourist mode →</button></div>`
    : r === 'tourist' ? `<div class="mode tourist"><small>You're in</small><b>🎒 Tourist mode</b><button class="switch" data-to="guide">${ME.user.has_guide ? 'Switch to Tourguide mode →' : 'Become a tourguide →'}</button></div>`
    : r === 'admin' ? `<div class="mode admin"><small>You're in</small><b>🛡 Admin</b></div>` : '';
  $('#menu').innerHTML = mode + items.map(([h, t]) => `<a class="item ${cur === h ? 'on' : ''}" href="${h}">${t}</a>`).join('');
  document.querySelectorAll('.switch').forEach(b => b.onclick = () => switchRole(b.dataset.to));
  document.body.dataset.mode = r || 'guest';
  const mt = document.querySelector('.mobile-top .brand'); if (mt) mt.innerHTML = `<span class="logo">T</span><b>TourGuyed</b>${r && r !== 'admin' ? `<span class="pill ${r}">${r === 'guide' ? 'Tourguide' : 'Tourist'}</span>` : ''}`;
  $('#who').innerHTML = ME ? `${esc(ME.user.name)}<br><small>${esc(ME.user.email)}</small><br><a href="#" onclick="logout();return false" style="color:inherit">Sign out</a>` : '';
}
async function switchRole(to) {
  if (to === 'guide' && !ME.user.has_guide && !confirm('Set up a tourguide profile? You can switch back to Tourist mode anytime.')) return;
  try { await api('/switch-role', { method: 'POST', body: { to } }); await loadMe(); toast(to === 'guide' ? '🧭 Now in Tourguide mode' : '🎒 Now in Tourist mode');
    location.hash = to === 'guide' && !ME.guide?.price ? '#/profile' : '#/dashboard'; route(); } catch (e) { toast(e.message) }
}
async function logout() { await api('/logout', { method: 'POST' }).catch(() => {}); localStorage.removeItem('tg'); ME = null; location.hash = '#/login'; }
const need = role => { if (!ME) { location.hash = '#/login'; return false } if (role && ME.user.role !== role) { V().innerHTML = '<p>Not available for your account type.</p>'; return false } return true; };

// ---------- views ----------
const views = {
  async start() {
    const q = qs(); let role = q.role === 'guide' ? 'guide' : q.role === 'tourist' ? 'tourist' : null;
    const draw = () => {
      V().innerHTML = `<h1>Are you a tourist<br>or a tourguide?</h1>
      <div class="choices" style="margin-bottom:24px"><div class="choice ${role === 'tourist' ? 'on' : ''}" data-r="tourist">I'm a tourist</div><div class="choice ${role === 'guide' ? 'on' : ''}" data-r="guide">I'm a tourguide</div></div>
      <div class="panel" style="max-width:620px">${role === 'tourist' ? `
        <label>Where are you going?</label><input id="place" placeholder="City or country — e.g. Kyoto, Lisbon, Bali, Manila">
        <label>What would you like to do?</label><select id="activity"><option value="">Anything</option>${['History', 'Food', 'Walking', 'Nightlife', 'Shopping', 'Culture', 'Beaches', 'Hiking', 'Adventure'].map(x => `<option>${x}</option>`)}</select>
        <label>Male or female tourguide?</label><select id="gender"><option value="">No preference</option><option>Female</option><option>Male</option></select>
        <label>Preferred language</label><input id="language" placeholder="e.g. English">
        <label>Would you like a student to be your tourguide?</label><select id="student"><option value="">Either</option><option value="yes">Yes</option><option value="no">No</option></select>
        <p class="muted" style="font-size:13px;margin-top:6px">Student guides are limited to their school campus and approved areas.</p>
        <button class="btn" style="margin-top:16px" id="go">Show tourguides</button>`
        : role === 'guide' ? `<p>Create your guide account, then set up the places you're expert in, your languages, transport, package and verification documents.</p>
        <a class="btn" style="margin-top:14px" href="#/signup?role=guide${q.ref ? '&ref=' + esc(q.ref) : ''}">Sign up as a tourguide</a>` : '<p class="muted">Pick one to continue.</p>'}</div>`;
      document.querySelectorAll('.choice').forEach(c => c.onclick = () => { role = c.dataset.r; draw(); });
      $('#go') && ($('#go').onclick = () => { const p = new URLSearchParams(); for (const k of ['place', 'activity', 'gender', 'language', 'student']) if ($('#' + k).value) p.set(k, $('#' + k).value); location.hash = '#/guides?' + p; });
    }; draw();
  },
  login() {
    V().innerHTML = `<h1>Sign in</h1><div class="panel" style="max-width:420px">${socialButtons()}<label>Email</label><input id="e" type="email"><label>Password</label><input id="p" type="password">
    <button class="btn" style="margin-top:16px" id="b">Sign in</button><p style="margin-top:12px">New here? <a href="#/signup">Create an account</a> · <a href="#/forgot">Forgot password?</a></p>
    </div>`;
    wireSocial();
    $('#b').onclick = async () => { try { const d = await api('/login', { method: 'POST', body: { email: $('#e').value, password: $('#p').value } }); localStorage.tg = d.token; await loadMe(); location.hash = ME.user.role === 'admin' ? '#/admin' : '#/dashboard'; } catch (e) { toast(e.message) } };
  },
  signup() {
    const q = qs();
    V().innerHTML = `<h1>Sign up</h1><div class="panel" style="max-width:460px"><label>I am a</label><select id="r"><option value="tourist">Tourist</option><option value="guide" ${q.role === 'guide' ? 'selected' : ''}>Tourguide</option></select>
    <div style="margin-top:14px">${socialButtons('<p class="muted" style="font-size:12px;text-align:center;margin-top:8px">By continuing you accept the <a href="/terms.html" target="_blank">Terms</a> and <a href="/privacy.html" target="_blank">Privacy Policy</a>.</p>')}</div>
    <label>Full name <span class="req">*</span></label><input id="n" required><label>Email <span class="req">*</span></label><input id="e" type="email" required><label>Password (8+ characters) <span class="req">*</span></label><input id="p" type="password" required>
    <label style="font-weight:400"><input type="checkbox" id="t" style="width:auto"> I agree to be respectful and professional and accept the TourGuyed <a href="/terms.html" target="_blank">Terms</a> (cancellation, refund and 20% platform fee rules) and <a href="/privacy.html" target="_blank">Privacy Policy</a>.</label>
    <button class="btn" style="margin-top:16px" id="b">Create account</button></div>`;
    wireSocial(() => $('#r').value);
    $('#b').onclick = async () => {
      const miss = ['n', 'e', 'p'].filter(k => !$('#' + k).value.trim()); document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid')); miss.forEach(k => $('#' + k).classList.add('invalid'));
      if (miss.length) return toast('Please fill in the fields marked in red');
      if ($('#p').value.length < 8) { $('#p').classList.add('invalid'); return toast('Password must be at least 8 characters'); }
      if (!$('#t').checked) return toast('Please accept the Terms and Privacy Policy');
      try { const d = await api('/signup', { method: 'POST', body: { role: $('#r').value, name: $('#n').value, email: $('#e').value, password: $('#p').value, invited_by: q.ref } }); localStorage.tg = d.token; await loadMe(); location.hash = '#/profile'; } catch (e) { toast(e.message) }
    };
  },
  forgot() {
    V().innerHTML = `<h1>Forgot password</h1><div class="panel" style="max-width:420px"><label>Your email</label><input id="e" type="email"><button class="btn" style="margin-top:14px" id="b">Send reset link</button><p id="m" class="muted" style="margin-top:12px"></p></div>`;
    $('#b').onclick = async () => { const d = await api('/forgot', { method: 'POST', body: { email: $('#e').value } }); $('#m').textContent = d.emailed ? 'If that email has an account, a reset link is on its way. Check your inbox and spam.' : 'Email sending is not set up yet. Please contact customer service at support@tourguyed.com to reset your password.'; };
  },
  reset() {
    V().innerHTML = `<h1>Set a new password</h1><div class="panel" style="max-width:420px"><label>New password (8+ characters)</label><input id="p" type="password"><button class="btn" style="margin-top:14px" id="b">Save password</button></div>`;
    $('#b').onclick = async () => { try { const d = await api('/reset', { method: 'POST', body: { token: qs().t, password: $('#p').value } }); localStorage.tg = d.token; await loadMe(); toast('Password updated'); location.hash = '#/dashboard'; } catch (e) { toast(e.message) } };
  },
  async guides() {
    const q = qs(); V().innerHTML = '<h1>Tourguides</h1><p class="muted">Loading…</p>';
    const d = await api('/guides?' + new URLSearchParams(q));
    V().innerHTML = `<h1>Tourguides</h1><div class="panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end">
      <div><label>Country</label><select id="country"><option value="">Anywhere</option>${(await api('/countries')).countries.map(c => `<option ${q.country === c.country ? 'selected' : ''}>${esc(c.country)}</option>`).join('')}</select></div>
      <div><label>City / place</label><input id="place" value="${esc(q.place || '')}"></div><div><label>Activity</label><input id="activity" value="${esc(q.activity || '')}"></div>
      <div><label>Gender</label><select id="gender"><option value="">Any</option>${['Female', 'Male'].map(x => `<option ${q.gender === x ? 'selected' : ''}>${x}</option>`)}</select></div>
      <div><label>Language</label><input id="language" value="${esc(q.language || '')}"></div>
      <div><label>Student</label><select id="student"><option value="">Either</option><option value="yes" ${q.student === 'yes' ? 'selected' : ''}>Students only</option><option value="no" ${q.student === 'no' ? 'selected' : ''}>Non-students</option></select></div>
      <button class="btn" id="f">Filter</button></div>
      <p class="muted" style="margin-bottom:14px">${d.guides.length} guide(s) online · ranked by ratings and acceptance</p>
      <div class="grid3">${d.guides.map(g => `<div class="card"><div class="pic"><img src="${esc(g.photo)}" alt="${esc(g.name)}">${g.verified ? `<span class="badge">✓ Verified</span>` : `<span class="badge" style="background:#5d7f88">Verification pending</span>`}</div><div class="body">
        <h3>${esc(g.name)}</h3>
        <p class="muted">${g.is_student ? '🎓 ' + esc(g.school) : esc(g.occupation)} · ${esc(g.location)}${g.country ? ', ' + esc(g.country) : ''}</p>
        <p class="stars">★ ${g.rating} <span class="muted">(${g.reviews} surveys) · ${g.acceptance}% acceptance</span></p>
        <p>${tags(g.languages)}</p><p style="margin-top:8px"><b>${peso(g.price, g.currency)}</b> / ${esc(g.package_title)}</p>
        <a class="btn sm" style="margin-top:10px" href="#/guide/${g.id}">View profile</a></div></div>`).join('') || '<p>No guides match. Try fewer filters.</p>'}</div>`;
    $('#f').onclick = () => { const p = new URLSearchParams(); for (const k of ['country', 'place', 'activity', 'gender', 'language', 'student']) if ($('#' + k).value) p.set(k, $('#' + k).value); location.hash = '#/guides?' + p; };
  },
  async guide(id) {
    const { guide: g, reviews } = await api('/guides/' + id);
    V().innerHTML = `<p><a href="#/guides">← All guides</a></p><div class="two" style="gap:28px;align-items:start;margin-top:10px">
      <div><img src="${esc(g.photo)}" style="height:420px;width:100%;border:4px solid #fff;border-radius:22px">
      <div class="grid3" style="margin-top:12px;gap:10px">${g.media.map(m => /\.(mp4|webm)/.test(m) ? `<video src="${esc(m)}" controls style="width:100%"></video>` : `<img src="${esc(m)}" style="height:110px;width:100%">`).join('')}</div></div>
      <div><h1>${esc(g.name)}</h1><p class="muted">${g.is_student ? '🎓 Student · ' + esc(g.school) + ' (campus-limited)' : esc(g.occupation)} · ${esc(g.gender)}</p>
      <p class="stars" style="margin:8px 0">★ ${g.rating} · ${g.reviews} surveys · ${g.acceptance}% acceptance ${g.verified ? '· ✓ ID verified' : ''}</p>
      <p>${esc(g.bio)}</p>
      <div class="panel" style="margin-top:16px"><h3>${esc(g.package_title)}</h3><p style="font:600 28px Lexend;color:var(--mint)">${peso(g.price, g.currency)} <span class="muted" style="font:14px Inter">/ ${g.duration_hours} hrs</span></p>
      <p><b>Places:</b> ${tags(g.places)}</p><p><b>Expertise:</b> ${tags(g.activities)}</p><p><b>Languages:</b> ${tags(g.languages)}</p>
      <p><b>Transport:</b> ${esc(g.transport)}</p>${g.offers_local ? '<p>✓ Can arrange other local guides</p>' : ''}
      <div class="two" style="gap:12px;margin-top:10px;align-items:start"><div><b>Included</b><ul style="margin-left:18px">${g.includes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><b>Not included</b><ul style="margin-left:18px">${g.excludes.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
      <button class="btn" style="margin-top:14px" id="book">Set appointment</button></div>
      <h3 style="margin-top:20px">Survey reviews</h3>${reviews.map(r => `<div class="panel" style="padding:12px;margin:8px 0"><b>${'★'.repeat(r.stars)}</b> ${esc(r.comment)}</div>`).join('') || '<p class="muted">No reviews yet.</p>'}</div></div>`;
    $('#book').onclick = () => bookFlow(g);
  },
  async dashboard() {
    if (!need()) return; if (ME.user.role === 'admin') return views.admin();
    const { bookings: b } = await api('/bookings'), isG = ME.user.role === 'guide';
    const up = b.filter(x => ['requested', 'accepted', 'in_progress'].includes(x.status));
    const done = b.filter(x => x.status === 'completed');
    const earned = done.reduce((s, x) => s + x.amount - x.platform_fee, 0);
    const feeDue = b.filter(x => x.pay_method === 'cash' && x.status === 'completed' && x.payout_status === 'cash_due').reduce((s, x) => s + x.platform_fee, 0);
    V().innerHTML = `<div class="mode-banner ${isG ? 'guide' : 'tourist'}">${isG ? '🧭 Tourguide dashboard — manage requests, availability and your package' : '🎒 Tourist dashboard — find guides and manage your trips'}<button class="switch2" data-to="${isG ? 'tourist' : 'guide'}">Switch to ${isG ? 'Tourist' : (ME.user.has_guide ? 'Tourguide' : 'Tourguide (set up)')} mode</button></div><h1>Hello, ${esc(ME.user.name.split(' ')[0])}</h1>
     ${!isG && ME.user.id_status === 'none' ? '<div class="panel">⚠ Upload your ID before booking. <a href="#/profile">Verify now</a></div>' : ''}
     ${isG && !ME.guide.price ? '<div class="panel">⚠ Finish your profile & set a package price so tourists can find you. <a href="#/profile">Set up profile</a></div>' : ''}${isG && !ME.guide.verified ? '<div class="panel">⏳ Tourists won\'t see you until your ID is verified by TourGuyed. Upload your ID in <a href="#/profile">My profile</a>.</div>' : ''}${isG ? '<div class="panel">📅 Tourists can only book times you open in <a href="#/availability">Availability</a>.</div>' : ''}
     <div class="stats">${isG ? `<div class="stat"><b>${b.filter(x => x.status === 'requested').length}</b>New requests</div><div class="stat"><b>★ ${ME.guide.rating}</b>${ME.guide.reviews} surveys</div>
       <div class="stat"><b>${ME.guide.acceptance}%</b>Acceptance rate</div><div class="stat"><b>${peso(earned, ME.guide.currency)}</b>Earned (after 20%)</div>`
      : `<div class="stat"><b>${up.length}</b>Upcoming tours</div><div class="stat"><b>${done.length}</b>Completed</div><div class="stat"><b>${ME.user.id_status}</b>ID status</div><div class="stat"><b>${new Set(b.map(x => x.guide_id)).size}</b>Guides used</div>`}</div>
     ${isG && feeDue ? `<div class="panel">💵 Cash tours: you owe the platform <b>${peso(feeDue, ME.guide.currency)}</b> (20%). Mark each as paid in Bookings.</div>` : ''}
     <h2 style="font-size:28px;margin:10px 0">Upcoming</h2>${bookingTable(up)}`;
    document.querySelectorAll('.switch2').forEach(b => b.onclick = () => switchRole(b.dataset.to));
    wireBookingActions();
  },
  async bookings() {
    if (!need()) return; const paid = qs().paid;
    if (paid) { await api(`/bookings/${paid}/pay`.replace('/pay', '/check_payment'), { method: 'POST' }).catch(() => {}); toast('Thank you! Your payment is being confirmed.'); history.replaceState(null, '', '#/bookings'); }
    const { bookings } = await api('/bookings'); V().innerHTML = '<h1>Bookings</h1>' + bookingTable(bookings); wireBookingActions(); },
  async messages() {
    if (!need()) return;
    const { bookings } = await api('/bookings'), open = bookings.filter(b => ['accepted', 'in_progress', 'completed'].includes(b.status));
    const isG = ME.user.role === 'guide'; let cur = +(qs().b) || open[0]?.id;
    V().innerHTML = `<h1>Messages</h1>${open.length ? `<div class="chat"><div class="list">${open.map(b => `<div data-b="${b.id}" class="${b.id === cur ? 'on' : ''}"><b>${esc(isG ? b.tourist_contact : b.guide_name)}</b><br><small class="muted">${b.day} ${b.slot}</small></div>`).join('')}</div>
      <div class="msgs"><div style="padding:10px;border-bottom:2px solid var(--ink);display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" id="meet">📹 Start video call</a>
      ${!isG ? '<button class="btn ghost sm" id="blk">Block this guide</button>' : ''}</div><div class="log" id="log"></div>
      <form id="mf"><input id="mi" placeholder="Write a message…" autocomplete="off"><button class="btn">Send</button></form></div></div>` : '<p class="muted">Chat opens once a tourguide accepts a booking.</p>'}`;
    if (!open.length) return;
    const load = async (send) => {
      const d = await api('/messages/' + cur, send ? { method: 'POST', body: { body: send } } : {});
      $('#log').innerHTML = d.messages.map(m => `<div class="bubble ${m.mine ? 'me' : ''}">${esc(m.body)}</div>`).join('') || '<p class="muted">Say hi 👋</p>';
      $('#log').scrollTop = 1e9; $('#meet').href = '#/call?b=' + cur;
    };
    document.querySelectorAll('.list div').forEach(el => el.onclick = () => { location.hash = '#/messages?b=' + el.dataset.b; });
    $('#mf').onsubmit = async e => { e.preventDefault(); const v = $('#mi').value; $('#mi').value = ''; try { await load(v) } catch (er) { toast(er.message) } };
    $('#blk') && ($('#blk').onclick = async () => { const b = open.find(x => x.id === cur); await api('/block', { method: 'POST', body: { guide_id: b.guide_id } }); toast('Guide blocked from messaging you'); });
    await load(); clearInterval(window._poll); window._poll = setInterval(() => location.hash.startsWith('#/messages') ? load().catch(() => {}) : clearInterval(window._poll), 5000);
  },

  async call() {
    if (!need()) return; const bid = qs().b;
    V().innerHTML = `<h1>Video call</h1><div class="panel" style="padding:12px">
      <div style="position:relative;background:#06161d;border-radius:18px;overflow:hidden;aspect-ratio:16/9;max-height:70vh">
        <video id="rv" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>
        <div id="cs" style="position:absolute;inset:0;display:grid;place-items:center;color:#fff;text-align:center;padding:20px">Starting camera…</div>
        <video id="lv" autoplay playsinline muted style="position:absolute;right:12px;bottom:12px;width:24%;min-width:110px;border-radius:12px;border:2px solid #fff;transform:scaleX(-1)"></video></div>
      <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap">
        <button class="btn ghost" id="bm">🎤 Mute</button><button class="btn ghost" id="bc">📷 Camera off</button><button class="btn" style="background:#d9534f;border-color:#d9534f" id="bh">Leave call</button></div>
      <p class="muted" style="text-align:center;margin-top:10px;font-size:13px">The other person gets a notice. Keep this page open — the call connects when they join.</p></div>`;
    const st = t => $('#cs') && ($('#cs').innerHTML = t);
    let stream; try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true }); }
    catch { try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return st('⚠ Please allow camera/microphone access in your browser, then reload this page.'); } }
    $('#lv').srcObject = stream;
    const { iceServers } = await api('/ice').catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
    const send = (type, data) => api('/call/' + bid, { method: 'POST', body: { type, data } });
    let pc = null, gen = 0, pending = [], since = 0, role, alive = true;
    const newPc = g => {
      pc && pc.close(); pending = []; gen = g;
      pc = new RTCPeerConnection({ iceServers }); stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.onicecandidate = e => e.candidate && send('ice', { gen, c: e.candidate });
      pc.ontrack = e => { $('#rv').srcObject = e.streams[0]; st(''); };
      pc.onconnectionstatechange = () => { const s = pc.connectionState; if (s === 'connected') st(''); if (s === 'failed') st('Connection failed — your networks may block direct calls. Try again, or switch to mobile data.'); if (s === 'disconnected') st('Reconnecting…'); };
      return pc;
    };
    const offer = async () => { const p = newPc(Date.now()); await p.setLocalDescription(await p.createOffer()); await send('offer', { gen, sdp: p.localDescription }); };
    const j = await send('join'); since = j.id - 1;
    const first = await api(`/call/${bid}?since=${since}`); role = first.role;
    st(role === 'guide' ? 'Waiting for the tourist to join…' : 'Waiting for your tourguide to join…');
    if (role === 'guide') await offer();
    const handle = async sig => {
      const d = sig.data;
      if (sig.type === 'join' && role === 'guide') return offer();
      if (sig.type === 'join' && role === 'tourist') return; // guide will send a fresh offer
      if (sig.type === 'offer' && role === 'tourist') { const p = newPc(d.gen); await p.setRemoteDescription(d.sdp); await p.setLocalDescription(await p.createAnswer()); await send('answer', { gen: d.gen, sdp: p.localDescription }); for (const c of pending) await p.addIceCandidate(c).catch(() => {}); pending = []; return; }
      if (sig.type === 'answer' && role === 'guide' && d.gen === gen && pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription(d.sdp); for (const c of pending) await pc.addIceCandidate(c).catch(() => {}); pending = []; return; }
      if (sig.type === 'ice' && d.gen === gen) { if (pc?.remoteDescription) await pc.addIceCandidate(d.c).catch(() => {}); else pending.push(d.c); return; }
      if (sig.type === 'bye') { $('#rv').srcObject = null; st('The other person left the call.'); }
    };
    const loop = async () => {
      while (alive && location.hash.startsWith('#/call')) {
        try { const r = await api(`/call/${bid}?since=${since}`); for (const sig of r.signals) { since = sig.id; await handle(sig); } } catch (e) { st('⚠ ' + e.message); }
        await new Promise(r => setTimeout(r, pc?.connectionState === 'connected' ? 4000 : 1200));
      }
      end();
    };
    const end = () => { if (!alive) return; alive = false; send('bye').catch(() => {}); pc && pc.close(); stream.getTracks().forEach(t => t.stop()); };
    $('#bm').onclick = () => { const a = stream.getAudioTracks()[0]; if (!a) return; a.enabled = !a.enabled; $('#bm').textContent = a.enabled ? '🎤 Mute' : '🔇 Unmute'; };
    $('#bc').onclick = () => { const v = stream.getVideoTracks()[0]; if (!v) return; v.enabled = !v.enabled; $('#bc').textContent = v.enabled ? '📷 Camera off' : '📷 Camera on'; };
    $('#bh').onclick = () => { end(); location.hash = '#/messages?b=' + bid; };
    window.addEventListener('beforeunload', end, { once: true });
    loop();
  },
  async profile() {
    if (!need()) return;
    const idBox = `<div class="panel"><h3>Identity verification</h3><p class="muted">Status: <b>${{ none: 'not uploaded yet', pending: 'uploaded — waiting for review', verified: '✓ verified', rejected: 'rejected — please upload a clearer photo' }[ME.user.id_status] || ME.user.id_status}</b>. Your ID is stored privately and never shown to ${ME.user.role === 'guide' ? 'tourists' : 'guides'} — they only see a verified badge.</p>
      <label>${ME.user.id_status === 'none' || ME.user.id_status === 'rejected' ? 'Choose a photo of your government or school ID — it uploads automatically' : 'Replace your ID (optional)'} <span class="req">*</span></label><input type="file" id="idf" accept="image/*${ME.user.storage === 'r2' ? ',application/pdf' : ''}"><p id="idmsg" class="muted" style="margin-top:6px"></p></div>`;
    if (ME.user.role === 'tourist') { V().innerHTML = '<h1>Verify ID</h1>' + idBox + `<p class="muted">Guides contact you via your private relay address: ${esc(ME.user.relay)}</p>
      <div class="panel"><h3>Want to be a tourguide too?</h3><p class="muted">Use the same account. Set up your guide profile, and switch between Tourist and Tourguide mode anytime from the menu.</p><button class="btn" style="margin-top:12px" id="bg">${ME.user.has_guide ? 'Switch to Tourguide mode' : 'Become a tourguide'}</button></div>`;
      $('#bg').onclick = () => switchRole('guide');
      return wireId(); }
    const g = ME.guide, L = a => (a || []).join(', ');
    const R = '<span class="req">*</span>';
    V().innerHTML = `<h1>My profile & package</h1>${idBox}<div class="panel"><p class="muted" style="margin-bottom:6px">Fields marked ${R} are required.</p><div class="two" style="gap:16px;align-items:start"><div>
      <label>Profile photo ${R}</label><div style="display:flex;gap:12px;align-items:center">${g.photo ? `<img src="${esc(g.photo)}" style="width:64px;height:64px;border-radius:50%;border:2px solid #fff">` : ''}<input type="file" id="pf" accept="image/*"></div>
      <label>Short bio ${R}</label><textarea id="bio" rows="3" required>${esc(g.bio)}</textarea>
      <label>Gender ${R}</label><select id="gender" required><option value="">Select…</option>${['Female', 'Male', 'Other'].map(x => `<option ${g.gender === x ? 'selected' : ''}>${x}</option>`)}</select>
      <label>Occupation ${R}</label><input id="occupation" required value="${esc(g.occupation)}">
      <label>Are you a student? ${R}</label><select id="is_student"><option value="0">No</option><option value="1" ${g.is_student ? 'selected' : ''}>Yes</option></select>
      <div id="stu"><label>School ${R}</label><input id="school" value="${esc(g.school)}">
      <label style="font-weight:400"><input type="checkbox" id="school_permission" ${g.school_permission ? 'checked' : ''}> I have permission from my school to give tours ${R}</label>
      <label>School permission document</label><input type="file" id="schf" accept="image/*"></div></div><div>
      <div class="two" style="gap:10px"><div><label>Country ${R}</label><input id="country" list="countries" required value="${esc(g.country || '')}" placeholder="e.g. Japan"><datalist id="countries">${COUNTRIES.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div><label>City / area ${R}</label><input id="location" required value="${esc(g.location)}" placeholder="e.g. Kyoto"></div></div>
      <label>Exact places you can take tourists ${R} <small class="muted">(comma separated)</small></label><input id="places" required value="${esc(L(g.places))}">
      <label>Expertise ${R} <small class="muted">(comma separated)</small></label><input id="activities" required value="${esc(L(g.activities))}">
      <label>Languages you speak & understand ${R}</label><input id="languages" required value="${esc(L(g.languages))}">
      <label>How will you take tourists there? ${R}</label><input id="transport" required value="${esc(g.transport)}">
      <label>Package name ${R}</label><input id="package_title" required value="${esc(g.package_title)}">
      <div class="two" style="gap:10px;grid-template-columns:1fr 1fr 1fr"><div><label>Currency ${R}</label><select id="currency" required><option value="">Select…</option>${CURRENCIES.map(c => `<option ${(g.currency || '') === c && g.price ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div><label>Price ${R}</label><input id="price" type="number" min="1" step="0.01" required value="${g.price || ''}"></div><div><label>Hours ${R}</label><input id="duration_hours" type="number" min="1" required value="${g.duration_hours || ''}"></div></div>
      <label>Included ${R} <small class="muted">(comma separated)</small></label><input id="includes" required value="${esc(L(g.includes))}">
      <label>Not included ${R} <small class="muted">(comma separated)</small></label><input id="excludes" required value="${esc(L(g.excludes))}">
      <label style="font-weight:400"><input type="checkbox" id="offers_local" ${g.offers_local ? 'checked' : ''}> I can arrange other local guides</label>
      <label>Your time zone ${R} <small class="muted">(your availability times use this)</small></label><input id="tz" required value="${esc(g.price ? g.tz : myTz())}">
      <label>Wise account email (for payouts) ${R}</label><input id="wise_email" type="email" required value="${esc(g.wise_email)}"></div></div>
      <button class="btn" style="margin-top:16px" id="save">Save profile</button></div>
      <div class="panel"><h3>Tour videos & photos</h3><p class="muted">Show tourists the places you take them — proof you know the spot. Photos are resized automatically. ${ME.user.storage === 'r2' ? 'Videos up to 50MB, max 30 uploads.' : 'Videos must be under 1MB for now.'}</p><input type="file" id="mf" accept="video/*,image/*,.heic,.mov" multiple><button class="btn sm" style="margin-top:8px;display:none" id="mb">Upload</button><p id="mmsg" class="muted" style="margin-top:6px">Pick one or more files — they upload automatically.</p>
      <h3 style="margin-top:22px;font-size:18px">My uploads</h3><div id="gal" class="grid4" style="margin-top:12px"><p class="muted">Loading…</p></div></div>`;
    wireId();
    const stu = () => { const on = $('#is_student').value === '1'; $('#stu').style.display = on ? '' : 'none'; $('#school').required = on; }; $('#is_student').onchange = stu; stu();
    $('#pf').onchange = async () => { try { await upload('profile', $('#pf').files[0]); await loadMe(); toast('Profile photo updated'); route(); } catch (e) { toast(e.message) } };
    $('#save').onclick = async () => {
      const bad = [...document.querySelectorAll('.main [required]')].filter(el => el.offsetParent && !String(el.value).trim());
      document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid')); bad.forEach(el => el.classList.add('invalid'));
      if (!g.photo && !$('#pf').files[0]) { $('#pf').classList.add('invalid'); bad.push($('#pf')); }
      if ($('#is_student').value === '1' && !$('#school_permission').checked) { $('#school_permission').parentElement.classList.add('invalid'); bad.push($('#school_permission')); }
      if (bad.length) { bad[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); return toast(`Please fill in the ${bad.length} required field${bad.length > 1 ? 's' : ''} marked in red`); }
      const v = k => $('#' + k).value, list = k => v(k).split(',').map(x => x.trim()).filter(Boolean);
      const body = { bio: v('bio'), gender: v('gender'), occupation: v('occupation'), school: v('school'), is_student: +v('is_student'), school_permission: $('#school_permission').checked ? 1 : 0,
        location: v('location'), country: v('country'), currency: v('currency'), tz: v('tz'), transport: v('transport'), package_title: v('package_title'), price: +v('price'), duration_hours: +v('duration_hours'), offers_local: $('#offers_local').checked ? 1 : 0, wise_email: v('wise_email'),
        places: list('places'), activities: list('activities'), languages: list('languages'), includes: list('includes'), excludes: list('excludes') };
      try { await api('/guide/profile', { method: 'PUT', body }); if ($('#schf').files[0]) await upload('school', $('#schf').files[0]); await loadMe(); toast('Profile saved'); } catch (e) { toast(e.message) }
    };
    const gallery = async () => {
      const { items } = await api('/my-media'); const st = { pending: ['Waiting for review', 's-requested'], approved: ['Live on your profile', 's-completed'], rejected: ['Rejected', 's-declined'] };
      $('#gal').innerHTML = items.map(m => `<div class="card" style="padding:8px"><div data-src="/api/my-media/${m.id}" data-kind="${m.kind}" style="height:130px;border-radius:12px;overflow:hidden;background:rgba(0,0,0,.25);display:grid;place-items:center"><small class="muted">${m.kind}</small></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:6px"><span class="status ${(st[m.status] || [])[1] || ''}">${(st[m.status] || [m.status])[0]}</span><button class="btn sm ghost" data-rm="${m.id}">Delete</button></div></div>`).join('') || '<p class="muted">No photos or videos yet.</p>';
      for (const el of document.querySelectorAll('[data-src]')) {
        const r = await fetch(el.dataset.src, { headers: { authorization: 'Bearer ' + localStorage.tg } }); if (!r.ok) continue;
        const u = URL.createObjectURL(await r.blob());
        el.innerHTML = el.dataset.kind === 'video' ? `<video src="${u}" controls muted style="width:100%;height:100%;object-fit:cover"></video>` : `<img src="${u}" style="width:100%;height:100%">`;
      }
      document.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (!confirm('Delete this upload?')) return; await api(`/my-media/${b.dataset.rm}/delete`, { method: 'POST' }); toast('Deleted'); gallery(); });
    };
    gallery();
    $('#mf').onchange = () => $('#mb').onclick();
    $('#mb').onclick = async () => { const fs = [...$('#mf').files]; if (!fs.length) return toast('Choose photos or videos first'); $('#mb').disabled = true;
      try { for (const [i, f] of fs.entries()) { $('#mmsg').textContent = `⏳ Uploading ${i + 1} of ${fs.length}: ${f.name}…`; await upload(f.type.startsWith('video') ? 'video' : 'photo', f); } toast('✓ Uploaded — TourGuyed will review them shortly'); $('#mmsg').textContent = '✓ Uploaded. Pick more files to add them.'; $('#mf').value = ''; } catch (e) { toast(e.message); $('#mmsg').textContent = '✗ ' + e.message; }
      $('#mb').disabled = false; gallery(); };
  },
  async availability() {
    if (!need('guide')) return;
    const { slots } = await api('/guides/' + ME.user.id + '/availability'), have = new Set(slots.map(s => s.day + ' ' + s.slot));
    const days = [...Array(28)].map((_, i) => new Date(Date.now() + (i + 1) * 864e5).toISOString().slice(0, 10)), times = ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00'];
    V().innerHTML = `<h1>Availability</h1><p class="muted">Tap the times you're free (in your local time: ${esc((ME.guide.tz || myTz()).replace(/_/g, ' '))}). Tourists can only book these.</p><div class="panel" style="overflow-x:auto"><table><tr><th>Day</th>${times.map(t => `<th>${t}</th>`).join('')}</tr>
      ${days.map(d => `<tr><td>${new Date(d).toDateString().slice(0, 10)}</td>${times.map(t => `<td><input type="checkbox" style="width:auto" data-k="${d} ${t}" ${have.has(d + ' ' + t) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</table></div>
      <button class="btn" id="sv">Save availability</button>`;
    $('#sv').onclick = async () => {
      const add = [], rem = []; document.querySelectorAll('[data-k]').forEach(c => { const [day, slot] = c.dataset.k.split(' '); if (c.checked && !have.has(c.dataset.k)) add.push({ day, slot }); if (!c.checked && have.has(c.dataset.k)) rem.push({ day, slot }); });
      await api('/availability', { method: 'POST', body: { slots: add, remove: rem } }); toast('Availability saved'); views.availability();
    };
  },
  invite() {
    if (!need('guide')) return;
    V().innerHTML = `<h1>Invite guides</h1><div class="panel" style="max-width:480px"><p>Know someone who'd be a great tourguide? Invite them.</p><label>Their email</label><input id="e" type="email"><button class="btn" style="margin-top:12px" id="b">Create invite link</button><p id="out" style="margin-top:12px;word-break:break-all"></p></div>`;
    $('#b').onclick = async () => { const d = await api('/invite', { method: 'POST', body: { email: $('#e').value } }); $('#out').innerHTML = `Share this link: <b>${esc(d.link)}</b>`; };
  },
  support() {
    if (!need()) return;
    V().innerHTML = `<h1>Customer service</h1><div class="panel" style="max-width:560px"><label>Subject</label><input id="s" placeholder="e.g. Guide was late"><label>Details</label><textarea id="d" rows="6"></textarea><button class="btn" style="margin-top:12px" id="b">Send complaint</button></div>`;
    $('#b').onclick = async () => { await api('/support', { method: 'POST', body: { subject: $('#s').value, body: $('#d').value } }); toast('Sent — our team will reply by email'); $('#d').value = ''; };
  },
  // ---------- admin ----------
  async admin() {
    if (!need('admin')) return; const o = await api('/admin/overview');
    const S = (n, t, h) => `<a class="stat" href="${h}" style="text-decoration:none"><b>${n}</b>${t}</a>`;
    V().innerHTML = `<h1>Admin overview</h1><div class="stats">${S(o.pending_ids, 'IDs to verify', '#/admin-verify')}${S(o.pending_media, 'Photos/videos to review', '#/admin-verify')}${S(o.open_tickets, 'Open tickets', '#/admin-tickets')}${S(o.bookings, 'Bookings', '#/admin-bookings')}</div>
      <div class="stats">${S(o.tourists, 'Tourists', '#/admin-users')}${S(o.guides, 'Tourguides', '#/admin-users')}${S(o.fees_earned, 'Platform fees (completed)', '#/admin-bookings')}${S(o.cash_fees_due, 'Cash fees still owed', '#/admin-bookings')}</div>
      <div class="stats">${S(o.payouts_due, 'To pay guides (Wise)', '#/admin-payouts')}${S((o.storage_used / 1024 ** 3).toFixed(2) + ' GB', o.storage === 'r2' ? 'of 9 GB free storage used (R2)' : 'stored in database (R2 off)', '#/admin-verify')}</div>
      ${o.online_enabled ? '' : '<div class="panel">⚠ Online payments are off. Add PAYMONGO_SECRET_KEY to the Worker settings to turn them on.</div>'}`;
  },
  async 'admin-verify'() {
    if (!need('admin')) return; const { items } = await api('/admin/verifications');
    const label = { id: 'Government / school ID', school: 'School permission', photo: 'Tour photo', video: 'Tour video' };
    V().innerHTML = `<h1>Verify IDs & media</h1>${items.length ? `<table><tr><th>User</th><th>Upload</th><th>Status</th><th>Actions</th></tr>${items.map(m => `<tr>
      <td><b>${esc(m.name)}</b><br><small class="muted">${esc(m.email)} · ${m.role}</small></td><td>${label[m.kind] || m.kind}<br><small class="muted">${m.created_at}</small></td>
      <td><span class="status ${m.status === 'approved' ? 's-completed' : m.status === 'rejected' ? 's-declined' : 's-requested'}">${m.status}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm ghost" data-view="${m.id}" data-kind="${m.kind}">View</button>${m.stored && m.status === 'pending' ? `<button class="btn sm" data-dec="approve" data-id="${m.id}">Approve</button><button class="btn sm ghost" data-dec="reject" data-id="${m.id}">Reject</button>` : ''}${!m.stored ? '<small class="muted">file missing — ask user to re-upload</small>' : ''}<button class="btn sm ghost" data-del="${m.id}">Remove</button></td></tr>`).join('')}</table>` : '<p class="muted">Nothing uploaded yet.</p>'}`;
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = async () => {
      const r = await fetch('/api/admin/file/' + b.dataset.view, { headers: { authorization: 'Bearer ' + localStorage.tg } });
      if (!r.ok) return toast('File not stored (uploaded before storage was enabled)');
      const url = URL.createObjectURL(await r.blob()), type = r.headers.get('content-type') || '';
      modal(type.startsWith('video') ? `<video src="${url}" controls style="width:100%"></video>` : type.includes('pdf') ? `<iframe src="${url}" style="width:100%;height:70vh;border:0"></iframe>` : `<img src="${url}" style="width:100%;border-radius:12px">`);
    });
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('Remove this upload record?')) return; await api('/admin/media/' + b.dataset.del + '/delete', { method: 'POST' }); toast('Removed'); route(); });
    document.querySelectorAll('[data-dec]').forEach(b => b.onclick = async () => {
      const note = b.dataset.dec === 'reject' ? (prompt('Reason (sent to the user):') || '') : '';
      await api('/admin/media/' + b.dataset.id, { method: 'POST', body: { decision: b.dataset.dec, note } }); toast(b.dataset.dec === 'approve' ? 'Approved' : 'Rejected'); route();
    });
  },
  async 'admin-chats'() {
    if (!need('admin')) return; const { items } = await api('/admin/conversations'); let cur = +(qs().b) || items.find(x => x.msgs)?.id || items[0]?.id;
    V().innerHTML = `<h1>All messages</h1>${items.length ? `<div class="chat"><div class="list">${items.map(c => `<div data-b="${c.id}" class="${c.id === cur ? 'on' : ''}"><b>${esc(c.tourist_name)} ↔ ${esc(c.guide_name)}</b><br><small class="muted">${c.day} ${c.slot} · ${c.status} · ${c.msgs} msg</small></div>`).join('')}</div>
      <div class="msgs"><div style="padding:10px 14px;border-bottom:1px solid var(--line)" id="hd"></div><div class="log" id="log"></div></div></div>` : '<p class="muted">No bookings yet.</p>'}`;
    if (!items.length) return;
    const c = items.find(x => x.id === cur); $('#hd').innerHTML = `<small>Tourist: <b>${esc(c.tourist_name)}</b> (${esc(c.tourist_email)}) · Guide: <b>${esc(c.guide_name)}</b> (${esc(c.guide_email)})</small>`;
    const { messages } = await api('/admin/conversations/' + cur);
    $('#log').innerHTML = messages.map(m => `<div class="bubble ${m.role === 'guide' ? 'me' : ''}"><small style="opacity:.75">${esc(m.name)} · ${m.role} · ${m.created_at}</small><br>${esc(m.body)}</div>`).join('') || '<p class="muted">No messages in this booking yet.</p>';
    document.querySelectorAll('.list div').forEach(el => el.onclick = () => { location.hash = '#/admin-chats?b=' + el.dataset.b; });
  },
  async 'admin-tickets'() {
    if (!need('admin')) return; const { items } = await api('/admin/tickets');
    V().innerHTML = `<h1>Support tickets</h1>${items.map(t => `<div class="panel"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(t.subject)}</b><span class="status ${t.status === 'open' ? 's-requested' : 's-completed'}">${t.status}</span></div>
      <small class="muted">${esc(t.name)} · ${esc(t.email)} · ${t.role} · ${t.created_at}</small><p style="margin:10px 0;white-space:pre-wrap">${esc(t.body)}</p>
      ${t.status === 'open' ? `<textarea id="r${t.id}" rows="2" placeholder="Reply (emailed to the user if email is set up)"></textarea><button class="btn sm" style="margin-top:8px" data-t="${t.id}">Resolve</button>` : ''}</div>`).join('') || '<p class="muted">No tickets.</p>'}`;
    document.querySelectorAll('[data-t]').forEach(b => b.onclick = async () => { await api('/admin/tickets/' + b.dataset.t, { method: 'POST', body: { reply: $('#r' + b.dataset.t).value } }); toast('Resolved'); route(); });
  },
  async 'admin-users'() {
    if (!need('admin')) return; const { items } = await api('/admin/users');
    V().innerHTML = `<h1>Users</h1><table><tr><th>Name</th><th>Email</th><th>Role</th><th>ID</th><th>Rating</th><th>Joined</th><th></th></tr>${items.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td>
      <td><span class="status ${u.id_status === 'verified' ? 's-completed' : u.id_status === 'pending' ? 's-requested' : 's-declined'}">${u.id_status}</span></td><td>${u.role === 'guide' ? `★ ${u.rating} (${u.reviews})` : '—'}</td><td>${(u.created_at || '').slice(0, 10)}</td><td><button class="btn sm ghost" data-rs="${u.id}">Reset link</button></td></tr>`).join('')}</table>`;
    document.querySelectorAll('[data-rs]').forEach(b => b.onclick = async () => { const d = await api('/admin/users/' + b.dataset.rs + '/reset', { method: 'POST' }); modal(`<h3>Password reset link</h3><p class="muted">Send this to the user. It works once and expires in 1 hour.</p><input value="${esc(d.link)}" onclick="this.select()" readonly>`); });
  },
  async 'admin-payouts'() {
    if (!need('admin')) return; const { items } = await api('/admin/payouts');
    V().innerHTML = `<h1>Guide payouts</h1><p class="muted" style="margin-bottom:14px">Online payments land in your PayMongo account. Send each guide their share by Wise, then click "Mark sent".</p>
      ${items.length ? `<table><tr><th>Booking</th><th>Guide</th><th>Wise email</th><th>Stage</th><th>Send now</th><th></th></tr>${items.map(b => `<tr><td>#${b.id}<br><small class="muted">${b.day} ${b.slot}</small></td><td>${esc(b.guide_name)}</td><td>${esc(b.wise_email || '—')}</td>
      <td>${b.payout_status === 'released' ? 'Tour complete (balance minus 20%)' : 'Met tourist (first 50%)'}</td><td><b>${peso(b.owed, b.currency)}</b></td><td><button class="btn sm" data-po="${b.id}">Mark sent</button></td></tr>`).join('')}</table>` : '<p class="muted">Nothing to pay out right now.</p>'}`;
    document.querySelectorAll('[data-po]').forEach(b => b.onclick = async () => { if (!confirm('Confirm you sent this amount by Wise?')) return; await api('/admin/payouts/' + b.dataset.po, { method: 'POST' }); toast('Marked as sent'); route(); });
  },
  async 'admin-bookings'() {
    if (!need('admin')) return; const { items } = await api('/admin/bookings');
    V().innerHTML = `<h1>Bookings & fees</h1><table><tr><th>When</th><th>Tourist → Guide</th><th>Amount</th><th>20% fee</th><th>Pay</th><th>Status</th><th></th></tr>${items.map(b => `<tr><td>${b.day} ${b.slot}</td><td>${esc(b.tourist_name)} → ${esc(b.guide_name)}</td>
      <td>${peso(b.amount, b.currency)}${b.refund ? `<br><small>refund ${peso(b.refund, b.currency)}</small>` : ''}</td><td>${peso(b.platform_fee, b.currency)}</td><td>${b.pay_method}<br><small class="muted">${payLabel(b.payout_status)}</small></td><td><span class="status s-${b.status}">${b.status}</span></td>
      <td>${b.pay_method === 'cash' && b.status === 'completed' && ['cash_due', 'fee_reported'].includes(b.payout_status) ? `<button class="btn sm" data-fee="${b.id}">Fee received</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">No bookings yet.</td></tr>'}</table>`;
    document.querySelectorAll('[data-fee]').forEach(b => b.onclick = async () => { await api(`/admin/bookings/${b.dataset.fee}/fee_received`, { method: 'POST' }); toast('Marked as received'); route(); });
  },
};

async function shrinkImage(f, max = 1600, q = 0.82) {
  const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = URL.createObjectURL(f); });
  const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}
async function upload(kind, f) {
  if (!f) throw new Error('Choose a file first');
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const isVid = f.type.startsWith('video/') || ['mp4', 'mov', 'm4v', 'webm', '3gp'].includes(ext);
  const isImg = !isVid && (f.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'].includes(ext));
  if (!isImg && !isVid && f.type !== 'application/pdf') throw new Error(`"${f.name}" is not a photo or video`);
  if (ME?.user.storage === 'r2') {
    // direct upload to Cloudflare R2: photos are resized first, videos up to 50MB
    let blob = f, name = f.name;
    if (isImg) { try { blob = await (await fetch(await shrinkImage(f, 2000, 0.85))).blob(); name = f.name.replace(/\.\w+$/, '') + '.jpg'; } catch { if (f.size > 25 * 1024 ** 2) throw new Error(`"${f.name}" is too large — max 25MB`); } }
    if (isVid && f.size > 50 * 1024 ** 2) throw new Error('Videos must be under 50MB — trim it a little');
    const r = await fetch(`/api/upload?kind=${kind}&name=${encodeURIComponent(name)}`, { method: 'PUT', headers: { 'content-type': blob.type || f.type || 'application/octet-stream', authorization: 'Bearer ' + localStorage.tg }, body: blob });
    const d = await r.json().catch(() => ({ error: r.status === 413 ? 'File too large' : 'Upload failed — check your connection and try again' })); if (!r.ok) throw new Error(`${f.name}: ${d.error || 'Upload failed'}`); return d;
  }
  let dataUrl;
  if (isImg) { try { dataUrl = await shrinkImage(f); if (dataUrl.length > 1.8e6) dataUrl = await shrinkImage(f, 1100, 0.7); } catch { throw new Error(`Couldn't read "${f.name}". Please use a JPG or PNG photo (on iPhone: Settings → Camera → Formats → Most Compatible).`); } }
  else { if (f.size > 1.3e6) throw new Error(isVid ? 'Videos must be under 1MB for now — trim it or upload photos instead' : 'File must be under 1MB — take a photo of it instead'); dataUrl = await fileToDataUrl(f); }
  return api('/upload', { method: 'POST', body: { kind, name: f.name.replace(/\.\w+$/, '') + (isImg ? '.jpg' : ''), dataUrl } });
}
function wireId() { $('#idf').onchange = async () => { const f = $('#idf').files[0]; if (!f) return; $('#idmsg').textContent = '⏳ Uploading ' + f.name + '…'; try { await upload('id', f); await loadMe(); toast('✓ ID uploaded — waiting for review'); route(); } catch (e) { $('#idmsg').textContent = '✗ ' + e.message; toast(e.message); } }; }

const payLabel = s => ({ unpaid: 'not paid yet', held: 'paid · held safely', partial_released: '50% released to guide', released: 'fully released', refunded: 'refunded', partial_refund: 'half refunded', cash_due: 'cash · fee due', fee_reported: 'cash · fee reported', fee_received: 'cash · fee received', none: '—' }[s] || s);
function bookingTable(list) {
  const isG = ME.user.role === 'guide';
  if (!list.length) return '<p class="muted">No bookings yet.</p>';
  return `<table><tr><th>When</th><th>${isG ? 'Tourist' : 'Guide'}</th><th>Amount</th><th>Pay</th><th>Status</th><th>Actions</th></tr>${list.map(b => {
    const a = []; const B = (act, t, ghost) => `<button class="btn sm ${ghost ? 'ghost' : ''}" data-act="${act}" data-id="${b.id}">${t}</button>`;
    if (isG) { if (b.status === 'requested') a.push(B('accept', 'Accept'), B('decline', 'Decline', 1)); if (b.pay_method === 'cash' && b.status === 'completed' && b.payout_status === 'cash_due') a.push(B('fee_paid', `I paid ${peso(b.platform_fee, b.currency)} fee`, 1)); }
    else {
      if (b.pay_method === 'online' && b.status === 'accepted' && !b.pm_payment) a.push(B('pay', `Pay ${peso(b.amount, b.currency)} now`));
      if (b.pay_method === 'online' && b.status === 'requested') a.push('<small class="muted">Pay online after the guide accepts</small>');
      if (['requested', 'accepted'].includes(b.status)) a.push(B('cancel', 'Cancel', 1));
      if (b.status === 'accepted' && b.pay_method === 'online') a.push(B('start', 'Met guide → release 50%'));
      if (['accepted', 'in_progress'].includes(b.status)) a.push(B('release', 'Tour done → release payment'), B('noshow', 'Guide no-show', 1));
      if (b.status === 'completed' && !b.reviewed) a.push(B('rate', 'Rate guide'));
      if (b.status === 'completed') a.push(`<a class="btn sm ghost" href="#/guide/${b.guide_id}">Book again</a>`);
    }
    if (['accepted', 'in_progress', 'completed'].includes(b.status)) a.push(`<a class="btn sm ghost" href="#/messages?b=${b.id}">Chat</a>`, `<a class="btn sm ghost" href="#/call?b=${b.id}">📹 Video</a>`);
    return `<tr><td>${b.day} ${b.slot}<br><small class="muted">${esc((b.tz || '').split('/').pop().replace(/_/g, ' '))} time</small>${b.timeline ? `<br><small class="muted">${esc(b.timeline)}</small>` : ''}</td><td>${esc(isG ? b.tourist_contact : b.guide_name)}</td>
      <td>${peso(b.amount, b.currency)}${isG ? `<br><small class="muted">fee ${peso(b.platform_fee, b.currency)}</small>` : ''}${b.refund ? `<br><small>refund ${peso(b.refund, b.currency)}</small>` : ''}</td><td>${b.pay_method}<br><small class="muted">${payLabel(b.payout_status)}</small></td>
      <td><span class="status s-${b.status}">${b.status.replace('_', ' ')}</span>${b.decline_reason ? `<br><small>${esc(b.decline_reason)}</small>` : ''}</td><td style="display:flex;gap:6px;flex-wrap:wrap">${a.join('')}</td></tr>`;
  }).join('')}</table>`;
}
function wireBookingActions() {
  document.querySelectorAll('[data-act]').forEach(btn => btn.onclick = async () => {
    const act = btn.dataset.act, id = btn.dataset.id, body = {};
    if (act === 'rate') return modal(`<h3>Rate your tourguide</h3><label>Stars</label><select id="st">${[5, 4, 3, 2, 1].map(n => `<option>${n}</option>`)}</select><label>Survey comment</label><textarea id="cm" rows="4"></textarea><button class="btn" style="margin-top:12px" onclick="submitRate(${id})">Submit</button>`);
    if (act === 'decline') { body.reason = prompt('Reason for declining (required, shown to tourist):'); if (!body.reason) return; }
    if (act === 'pay') { try { const d = await api(`/bookings/${id}/pay`, { method: 'POST' }); location.href = d.checkout_url; } catch (e) { toast(e.message) } return; }
    if (act === 'release' && !confirm('Release payment? After this you can no longer get a refund.')) return;
    try {
      let d = await api(`/bookings/${id}/${act}`, { method: 'POST', body });
      if (d.needs_confirm) { if (!confirm(d.message)) return; d = await api(`/bookings/${id}/${act}`, { method: 'POST', body: { confirm_late: 1 } }); }
      toast('Done'); await loadMe(); route();
    } catch (e) { toast(e.message) }
  });
}
async function submitRate(id) { try { await api('/reviews', { method: 'POST', body: { booking_id: id, stars: +$('#st').value, comment: $('#cm').value } }); closeModal(); toast('Thanks for rating!'); route(); } catch (e) { toast(e.message) } }

async function bookFlow(g) {
  if (!ME) return location.hash = '#/signup';
  if (ME.user.role !== 'tourist') return toast('Sign in as a tourist to book');
  const { slots, tz: gtz } = await api(`/guides/${g.id}/availability`); const byDay = {}; slots.forEach(s => (byDay[s.day] ||= []).push(s.slot));
  const days = Object.keys(byDay); let day = days[0], slot = null;
  const draw = () => modal(`<h3>Set appointment with ${esc(g.name)}</h3><label>Available dates</label><div class="cal">${days.map(d => `<button data-d="${d}" class="${d === day ? 'on' : ''}">${new Date(d).toDateString().slice(4, 10)}</button>`).join('') || '<p>No open dates.</p>'}</div>
    <label>Time <small class="muted">(local time in ${esc((gtz || '').replace(/_/g, ' '))}${gtz !== myTz() ? ' — not your time zone' : ''})</small></label><div class="cal">${(byDay[day] || []).map(t => `<button data-t="${t}" class="${t === slot ? 'on' : ''}">${t}</button>`).join('')}</div>
    <label>Your tour timeline</label><textarea id="tl" rows="3" placeholder="e.g. 9:00 meet at Fort Santiago → 11:00 Binondo lunch → 13:00 end"></textarea>
    <label>Payment</label><select id="pm"><option value="cash">Cash to guide (${esc(g.currency || 'local currency')})</option>${(g.currency || 'PHP') === 'PHP' ? '<option value="online">Pay online — card, GCash, Maya, GrabPay (held safely)</option>' : ''}</select>
    <p class="muted" style="font-size:13px;margin-top:10px">${peso(g.price, g.currency)} · Free cancellation until 30 min before. Later cancellation refunds half. Guide 30+ min late or no-show = full refund. No refund after you release payment.</p>
    <button class="btn" style="margin-top:12px" id="cf">Confirm request</button>`);
  const wire = () => {
    document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { day = b.dataset.d; slot = null; draw(); wire(); });
    document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { slot = b.dataset.t; const tl = $('#tl').value; draw(); wire(); $('#tl').value = tl; });
    $('#cf') && ($('#cf').onclick = async () => {
      if (!slot) return toast('Pick a time');
      try { await api('/bookings', { method: 'POST', body: { guide_id: g.id, day, slot, timeline: $('#tl').value, pay_method: $('#pm').value } }); closeModal(); toast('Request sent! The guide has been notified.'); location.hash = '#/bookings'; } catch (e) { toast(e.message) }
    });
  }; draw(); wire();
}

async function route() {
  const [path] = location.hash.slice(2).split('?'); const [name, arg] = (path || 'start').split('/');
  renderMenu(); $('.side').classList.remove('show');
  try { await (views[name] || views.start)(arg); } catch (e) { V().innerHTML = `<h1>Oops</h1><p>${esc(e.message)}</p>`; }
}
window.addEventListener('hashchange', route);
(async () => {
  const social = await finishSocial();
  if (location.search.includes('code=')) history.replaceState(null, '', location.pathname + location.hash);
  if (!social) await loadMe();
  if (!location.hash || location.hash.startsWith('#access_token')) location.hash = ME ? (ME.user.role === 'admin' ? '#/admin' : '#/dashboard') : '#/start';
  else route();
})();
