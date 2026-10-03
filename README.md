# TourGuyed — tourguyed.com

Tourist ↔ tourguide marketplace. Static site + Cloudflare Pages Functions (API) + Cloudflare D1 (database). Hosted free on Cloudflare Pages, code on GitHub.

## What's inside
- `public/index.html` — landing page (styled after the "Tourism Promotion" theme)
- `public/app.html` + `public/js/app.js` — dashboard for tourists and tourguides
- `functions/api/[[path]].js` — the API (sign up/in, guides, availability, bookings, payments state, chat, reviews, block, support, invites, uploads)
- `schema.sql` — database tables + 4 demo guides (login: mia@demo.tourguyed.com / demo1234)

## 1. Put it on GitHub (upload EVERYTHING, keep the folders)
Your repo must look like this at the top level:
```
functions/api/[[path]].js
public/index.html  public/app.html  public/css/style.css  public/js/app.js
src/worker.js
schema.sql  wrangler.toml  package.json  package-lock.json  README.md  .gitignore
```
`index.html` must be inside `public/`, not at the repo root. Do NOT upload `node_modules/`.

## 2. Create the database (one time)
Cloudflare dashboard → Storage & Databases → D1 → Create → name `tourguyed-db`.
Copy its **Database ID** into `wrangler.toml` (replace PASTE-YOUR-D1-DATABASE-ID-HERE) and commit.
Then open the database → Console → paste the whole `schema.sql` → Execute.
(Run it only once — it resets the tables.)

## 3. Connect the Worker to GitHub
Workers & Pages → `tourguyed` → Settings → Build → Connect repository → `aclaor/tourguyed.com`, branch `main`.
Build command: empty · Deploy command: `npx wrangler deploy`.
`wrangler.toml` already tells Cloudflare where the pages (`public/`), API (`src/worker.js`) and database (`DB`) are.
Then Settings → Domains & Routes → Add custom domain → `tourguyed.com` (and `www.tourguyed.com`).

Every `git push` now redeploys the site.

## Optional add-ons
- **Private ID/video storage:** `npx wrangler r2 bucket create tourguyed-files`, then add an R2 binding named `FILES`. Without it, uploads are recorded but the file isn't stored.
- **Email notifications:** create a free resend.com account, verify tourguyed.com, add env variable `RESEND_KEY` in Pages settings.
- **Run locally:** `npm run db:local` then `npm run dev` → http://localhost:8788

## Business rules built in
- 20% platform fee computed on the server; cash tours show the fee the guide owes.
- Online payments: held → 50% released when tourist confirms meeting → 100% when tourist confirms tour done (no refund after release).
- Cancel ≥30 min before = full refund; <30 min = half; guide no-show/30+ min late = full refund.
- Declines require a reason and lower the acceptance rate; ratings + acceptance decide guide ranking.
- Ratings only after completed tours (one per booking). Tourists can block guides from messaging.
- Guides only see a masked relay email for tourists. IDs are never shown to other users.
- Video meeting via a private Jitsi room per booking.

## Before taking real money
The payment states are tracked, but no card processor is connected yet. Next step: Stripe Connect or PayMongo (Philippines) for holding and splitting payments, and Wise for guide payouts. Also add an admin page to approve IDs (for now set `users.id_status='verified'` / `guides.verified=1` in the D1 console).
