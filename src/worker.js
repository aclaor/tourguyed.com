// Cloudflare Worker entry: /api/* → API, SEO pages rendered on the server, everything else from /public
import { onRequest } from '../functions/api/[[path]].js';

const SITE = 'https://tourguyed.com';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const arr = s => { try { return JSON.parse(s || '[]') } catch { return [] } };
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH');
const abs = u => !u ? `${SITE}/og.jpg` : u.startsWith('http') ? u : SITE + u;
const html = (b, status = 200) => new Response(b, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });

const page = ({ title, desc, path, img, body, ld }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="website"><meta property="og:site_name" content="TourGuyed"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${path}"><meta property="og:image" content="${esc(img || SITE + '/og.jpg')}"><meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#173e4d">
<link rel="icon" type="image/svg+xml" href="/favicon.svg"><link rel="icon" type="image/png" href="/favicon.png"><link rel="stylesheet" href="/css/style.css">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}</head><body><div class="wrap">
<nav class="nav"><a class="brand" href="/"><span class="logo">T</span><b>TourGuyed</b></a><ul><li><a href="/tourguides">Tour guides</a></li><li><a href="/#how">How it works</a></li><li><a href="/app.html#/start?role=guide">Become a guide</a></li></ul><a class="btn sm" href="/app.html#/login">Sign in</a></nav>
${body}
<footer>© ${new Date().getFullYear()} TourGuyed · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a> · <a href="/tourguides">All tour guides</a></footer></div></body></html>`;

async function guidesList(env, city) {
  const q = city ? ' AND g.location LIKE ?' : '';
  const r = await env.DB.prepare(`SELECT g.*,u.name FROM guides g JOIN users u ON u.id=g.user_id WHERE g.verified=1 AND g.price>0${q} ORDER BY g.rating DESC, g.reviews DESC LIMIT 200`).bind(...(city ? [`%${city}%`] : [])).all();
  return r.results;
}

async function guidesPage(env, url) {
  const city = (url.searchParams.get('city') || '').slice(0, 60);
  const gs = await guidesList(env, city), cities = [...new Set((await guidesList(env)).map(g => g.location).filter(Boolean))];
  const title = city ? `Tour Guides in ${city} — Book Local & Student Guides | TourGuyed` : 'Local & Student Tour Guides in the Philippines | TourGuyed';
  const desc = city ? `Book verified tour guides in ${city}. Compare packages, languages and ratings, set your own itinerary and pay by cash or GCash.` : 'Browse verified local and student tour guides across the Philippines. Compare packages, languages and ratings, then book in minutes.';
  const body = `<section><h1 class="h2" style="font-size:clamp(34px,5vw,56px)">${city ? `Tour guides in ${esc(city)}` : 'Local & student tour guides'}</h1>
    <p class="lead" style="margin-bottom:18px">${esc(desc)}</p>
    <p style="margin-bottom:24px">${cities.map(c => `<a class="tag ${c === city ? 'fill' : ''}" href="/tourguides?city=${encodeURIComponent(c)}">${esc(c)}</a>`).join(' ')} ${city ? '<a class="tag" href="/tourguides">All</a>' : ''}</p>
    <div class="grid3">${gs.map(g => `<a class="card" href="/tourguide/${g.user_id}" style="text-decoration:none"><div class="pic"><img src="${esc(g.photo)}" alt="Tour guide ${esc(g.name)} in ${esc(g.location)}" loading="lazy"><span class="badge">✓ Verified</span></div>
      <div class="body"><h2 style="font-size:20px">${esc(g.name)}</h2><p class="muted">${g.is_student ? '🎓 ' + esc(g.school) : esc(g.occupation)} · ${esc(g.location)}</p>
      <p class="stars">★ ${g.rating} <span class="muted">(${g.reviews} reviews)</span></p><p>${esc(g.package_title)} — <b>${peso(g.price)}</b></p></div></a>`).join('') || '<p class="muted">No guides here yet.</p>'}</div></section>`;
  const ld = { '@context': 'https://schema.org', '@type': 'ItemList', name: title, itemListElement: gs.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/tourguide/${g.user_id}`, name: g.name })) };
  return html(page({ title, desc, path: '/tourguides' + (city ? `?city=${encodeURIComponent(city)}` : ''), body, ld }));
}

async function guidePage(env, id) {
  const g = await env.DB.prepare('SELECT g.*,u.name FROM guides g JOIN users u ON u.id=g.user_id WHERE g.user_id=? AND g.verified=1 AND g.price>0').bind(id).first();
  if (!g) return html(page({ title: 'Tour guide not found | TourGuyed', desc: 'This tour guide is not available.', path: '/tourguides', body: '<section><h1 class="h2">Guide not available</h1><p><a class="btn" href="/tourguides">See all tour guides</a></p></section>' }), 404);
  const places = arr(g.places), langs = arr(g.languages), acts = arr(g.activities), inc = arr(g.includes), exc = arr(g.excludes), media = arr(g.media);
  const rv = (await env.DB.prepare('SELECT stars,comment,created_at FROM reviews WHERE guide_id=? ORDER BY created_at DESC LIMIT 10').bind(id).all()).results;
  const title = `${g.name} — Tour Guide in ${g.location} | TourGuyed`;
  const desc = `${g.package_title}: ${places.slice(0, 3).join(', ')}. ${g.duration_hours} hours for ${peso(g.price)}. Speaks ${langs.join(', ')}. ${(g.bio || '').slice(0, 90)}`;
  const body = `<section class="two" style="align-items:start">
    <div><div class="photo" style="height:440px"><img src="${esc(g.photo)}" alt="Tour guide ${esc(g.name)}"></div>
      ${media.length ? `<div class="grid3" style="margin-top:14px;gap:10px">${media.map(m => `<div class="photo" style="height:120px"><img src="${esc(m)}" alt="Tour photo by ${esc(g.name)}" loading="lazy"></div>`).join('')}</div>` : ''}</div>
    <div><h1 class="h2" style="font-size:clamp(34px,5vw,52px)">${esc(g.name)}</h1>
      <p class="muted">${g.is_student ? '🎓 Student guide · ' + esc(g.school) : esc(g.occupation)} · ${esc(g.location)}</p>
      <p class="stars" style="margin:8px 0">★ ${g.rating} · ${g.reviews} reviews · ✓ ID verified</p><p>${esc(g.bio)}</p>
      <div class="panel" style="margin-top:18px"><h2 style="font-size:24px">${esc(g.package_title)}</h2><p style="font:600 28px Lexend;color:var(--mint)">${peso(g.price)} <span class="muted" style="font:14px Poppins">/ ${g.duration_hours} hours</span></p>
        <p><b>Places:</b> ${places.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</p><p><b>Expertise:</b> ${acts.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</p>
        <p><b>Languages:</b> ${langs.map(x => `<span class="tag">${esc(x)}</span>`).join('')}</p><p><b>Transport:</b> ${esc(g.transport)}</p>
        <div class="two" style="gap:12px;margin-top:10px;align-items:start"><div><b>Included</b><ul style="margin-left:18px">${inc.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div><b>Not included</b><ul style="margin-left:18px">${exc.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
        <a class="btn" style="margin-top:16px" href="/app.html#/guide/${g.user_id}">Check availability & book</a></div>
      <h2 style="font-size:24px;margin-top:22px">Reviews</h2>${rv.map(r => `<div class="panel" style="padding:12px;margin:8px 0"><b>${'★'.repeat(r.stars)}</b> ${esc(r.comment)}</div>`).join('') || '<p class="muted">No written reviews yet.</p>'}
      <p style="margin-top:20px"><a href="/tourguides?city=${encodeURIComponent(g.location)}">More tour guides in ${esc(g.location)} →</a></p></div></section>`;
  const ld = { '@context': 'https://schema.org', '@type': 'Person', name: g.name, url: `${SITE}/tourguide/${g.user_id}`, image: abs(g.photo), jobTitle: 'Tour guide', description: g.bio,
    knowsLanguage: langs, homeLocation: { '@type': 'Place', name: g.location },
    makesOffer: { '@type': 'Offer', name: g.package_title, price: g.price, priceCurrency: 'PHP', url: `${SITE}/tourguide/${g.user_id}`, availability: 'https://schema.org/InStock' } };
  return html(page({ title, desc, path: `/tourguide/${g.user_id}`, img: abs(g.photo), body, ld }));
}

async function sitemap(env) {
  const gs = await guidesList(env), cities = [...new Set(gs.map(g => g.location).filter(Boolean))], today = new Date().toISOString().slice(0, 10);
  const urls = [['/', '1.0'], ['/tourguides', '0.9'], ...cities.map(c => [`/tourguides?city=${encodeURIComponent(c)}`, '0.8']), ...gs.map(g => [`/tourguide/${g.user_id}`, '0.7']), ['/terms.html', '0.2'], ['/privacy.html', '0.2']];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, p]) => `<url><loc>${esc(SITE + u)}</loc><lastmod>${today}</lastmod><priority>${p}</priority></url>`).join('\n')}\n</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // send www and workers.dev visitors to the main domain so Google sees one site
    if (url.hostname === 'www.tourguyed.com') return Response.redirect(SITE + url.pathname + url.search, 301);
    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(5).split('/').filter(Boolean);
      return onRequest({ request, env, ctx, params: { path } });
    }
    try {
      if (url.pathname === '/sitemap.xml') return await sitemap(env);
      if (url.pathname === '/tourguides' || url.pathname === '/tourguides/') return await guidesPage(env, url);
      const m = url.pathname.match(/^\/tourguide\/(\d+)\/?$/); if (m) return await guidePage(env, +m[1]);
    } catch (e) { return new Response('Server error', { status: 500 }); }
    const res = await env.ASSETS.fetch(request);
    if (url.hostname.endsWith('.workers.dev')) { const r = new Response(res.body, res); r.headers.set('x-robots-tag', 'noindex'); return r; }
    return res;
  }
};
