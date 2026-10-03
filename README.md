# TourGuyed — tourguyed.com

Tourist ↔ tourguide marketplace. Static site + Cloudflare Pages Functions (API) + Cloudflare D1 (database). Hosted free on Cloudflare Pages, code on GitHub.

## What's inside
- `public/index.html` — landing page (styled after the "Tourism Promotion" theme)
- `public/app.html` + `public/js/app.js` — dashboard for tourists and tourguides
- `functions/api/[[path]].js` — the API (sign up/in, guides, availability, bookings, payments state, chat, reviews, block, support, invites, uploads)
- `schema.sql` — database tables + 4 demo guides (login: mia@demo.tourguyed.com / demo1234)

## 1. Put it on GitHub
1. Create an empty repo on github.com called `tourguyed`.
2. In this folder (Command Prompt):
```
git init
git add .
git commit -m "TourGuyed first version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/tourguyed.git
git push -u origin main
```

## 2. Create the database (one time)
```
npm install
npx wrangler login
npx wrangler d1 create tourguyed-db
```
Copy the `database_id` it prints into `wrangler.toml`, then:
```
npm run db:remote
```
(Warning: `schema.sql` drops tables — run it only once on the live database.)

## 3. Deploy on Cloudflare Pages
1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick `tourguyed`.
2. Build command: *(leave empty)* · Output directory: `public`.
3. After the first deploy: Settings → Bindings → add **D1 database**, variable name `DB`, select `tourguyed-db`. Redeploy.
4. Custom domains → add `tourguyed.com` (and `www.tourguyed.com`). If the domain is on Cloudflare DNS it connects automatically.

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
