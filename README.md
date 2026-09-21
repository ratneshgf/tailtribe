# TailTribe — Verified Pet Marketplace & Adoption Portal

MERN implementation of the TailTribe PRD v1.0. React + Vite on the front, Express + MongoDB + Socket.IO
behind it, with the listing / request / reservation state machines enforced server-side.

## Run it

Prerequisites: **Node 18+** and a **MongoDB** instance (local `mongod`, or a free Atlas cluster).

```bash
# 1. API
cd apps/api
npm install
cp .env.example .env          # set MONGODB_URI + two JWT secrets
npm run seed                  # optional local development data only
npm run dev                   # http://localhost:4001

# 2. Web (second terminal)
cd apps/web
npm install
npm run dev                   # http://localhost:5173
```

Seeded logins (password `Password123` for all three):

| Email | Role |
|---|---|
| `buyer@tailtribe.test` | Buyer / adopter |
| `seller@tailtribe.test` | KYC-approved seller |
| `admin@tailtribe.test` | Admin |

These accounts exist only after running the optional seed command. The production sign-in screen does not expose demo-account shortcuts.

## Try the core flows

1. **Moderation** — sign in as admin: Misty is waiting in the listing queue, Karan is waiting in the KYC queue. Rejecting either demands a reason.
2. **Publish** — as the seller, create a listing; it enters `Pending Review`, not the public feed.
3. **Request → hold** — as the buyer, request a pet; as the seller, accept; back as the buyer, place a 48-hour hold. A second hold on the same pet is rejected by a unique partial index, not by application timing.
4. **Expiry** — a job every 60s expires stale holds and returns the pet to `Published`.
5. **Chat** — messages stream over an authenticated Socket.IO room; phone numbers and emails get flagged (`CHAT-05`).
6. **Notifications** - listing, KYC, request and message events create private in-app notifications and update the header live.
7. **Audit** — every verification, moderation, reservation and report action appears in the admin audit log.

## Layout

```
apps/api/src
  lib/kycDocuments.js  private KYC document upload and expiring admin links
  lib/notifications.js persists notifications and emits them to the recipient's Socket.IO room
  lib/petMedia.js       image type/size checks and Cloudinary upload cleanup
  models/index.js       all collections, indexes, listing transition table
  middleware/auth.js    JWT, RBAC, account-status gate, audit helper, Zod validator
  routes/index.js       auth, KYC, pets, requests, reservations, chat, reports, admin
  server.js             Express + Socket.IO + reservation expiry job
  seed.js               demo data
apps/web/src
  lib/api.js            in-memory access token + HttpOnly refresh-cookie session client
  lib/ui.js             hand-drawn SVG icon set + species palette
  components/           Icon, PetCard, PetDialog
  components/NotificationCenter.jsx live notification menu with unread state
  pages/                Auth, role-based Dashboard, Browse, Seller, Admin, Messages
  styles.css            design tokens and component styles
```

## Dashboards

After sign-in, each role opens a workspace overview backed by the API rather than sample UI values:

- **Adopters** see their saved pets, request statuses, conversations, and current marketplace listings.
- **Rehomers** see their listing states, incoming requests, and completed rehoming counts.
- **Admins** see the live moderation queue counts, active listing and reservation totals, and recent audit events.

The dashboard links into the existing browse, messaging, and moderation flows. Pet listings use species-colored placeholders until a seller adds photos.

## Pet photo uploads

Listing creation accepts up to 6 JPEG, PNG, or WebP photos (5 MB each). The API checks the claimed content type and image signature, uploads through Cloudinary, resizes large images, and removes uploaded files if listing creation fails. Photos are public listing media. KYC documents use a separate authenticated Cloudinary upload; only admins can request a five-minute review link.

To enable uploads, add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` to `apps/api/.env`. Without these credentials, listings without photos still work; photo submissions return a setup error.

## Which PRD requirements are done

Done: AUTH-01…06, KYC-01/02/03/04/05, PET-01…08, SEARCH-01/02/03/04/05, LIST-01/02/03,
REQ-01…04, BOOK-01…05, CHAT-01/02/03/05, ADMIN-01…05, plus the business rules in §7 and the
state machines in §8.

Still open, in the order I'd tackle them:

1. **Contact verification + password reset** (AUTH-04/05) — single-use expiring tokens over email/SMS.
2. **Tests** (§20) — Vitest/Jest + Supertest on the state machines, IDOR paths and rate limits first.
3. **Blocking** (CHAT-04) and moderation rules (ADMIN-06).

## Security notes

Passwords are bcrypt at cost 12 (swap for Argon2id before production). Refresh tokens are rotated,
stored only as hashes in MongoDB, and delivered in an HttpOnly, SameSite cookie; access tokens remain
in browser memory instead of localStorage. Authorization is checked on
every route, never in the client alone. `publicPet()` is the single place that decides what leaves the
server, so street addresses, KYC document references and contact details cannot leak by accident. Login,
registration, messaging and reporting are rate-limited. Set real secrets in `.env` before deploying, and
keep `.env` out of version control.

## Password reset email

Password recovery uses a single-use token that expires after 30 minutes by default. Configure the API
environment with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, and optionally
`EMAIL_FROM_NAME` before enabling the forgot-password flow. For Gmail, use an app password with SMTP
(`smtp.gmail.com`, port `587`, `SMTP_SECURE=false`); do not put your normal Google account password in
the project. Copy the provider values into `apps/api/.env` and restart the API. Reset tokens are stored
as SHA-256 hashes and deleted after use or expiry.

## Google sign-in

Create a Web application OAuth client in Google Cloud Console and add `http://localhost:5173` under
Authorized JavaScript origins. Put its client ID in both `apps/api/.env` as `GOOGLE_CLIENT_ID` and
`apps/web/.env` as `VITE_GOOGLE_CLIENT_ID`, then restart the API and Vite servers. The API verifies the
Google ID token before creating or signing in the account; it never trusts the email sent by the browser.

## Deploy the API to Render and the web app to Vercel

`render.yaml` deploys the Express/Socket.IO API to Render (and also serves the built web app as a fallback).
The root `vercel.json` deploys the Vite frontend to Vercel and proxies `/api/*` to the Render API. In Render,
set `WEB_ORIGIN` to the Vercel production origin plus `http://localhost:5173`, separated by a comma. In Vercel,
set Root Directory to the repository root, Install Command to `npm ci --include=dev`, Build Command to
`npm run build --workspace @tailtribe/web`, Output Directory to `apps/web/dist`, and `VITE_SOCKET_URL` to the
Render API origin. Vercel serves frontend requests, while API calls use its external rewrite and Socket.IO
connects directly to Render.

For the Render Blueprint, provide `MONGODB_URI` for the Atlas `tailtribe` database, `ADMIN_SETUP_KEY`, both
Google client ID fields, and the three Cloudinary values. Render generates the JWT secrets. Add both the Vercel
production origin and localhost to the Google OAuth client's Authorized JavaScript origins. Add the Render
service's outbound IP ranges to the Atlas network access list. The free Render web service can sleep when idle,
so API requests after inactivity may take longer.

Forgot-password email needs SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`);
these are optional for deployment and can be added to Render later. Render's free web services block outbound
SMTP ports 25, 465, and 587, so SMTP-based password reset will need a paid Render plan or an HTTPS email API.
