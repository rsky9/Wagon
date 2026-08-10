# Wagon — Product & Engineering Plan
## Rebuild of the Truck-Hiring Marketplace (2026)

*Companion to `BUSINESS_CASE_STUDY.md`. This doc is the blueprint: 4 surfaces (Transporter app, Supplier app, Admin console, Backend), brand-new UI/UX, evolved from the legacy WagonTransporter.*

---

## 1. Product ecosystem

```
                        ┌─────────────────────────────┐
                        │        ADMIN CONSOLE        │  (Web — Next.js)
                        │  verify, disputes, content  │
                        └──────────────┬──────────────┘
                                       │ HTTPS / RPC
┌──────────────────┐     ┌─────────────▼─────────────┐     ┌──────────────────┐
│  TRANSPORTER APP │◄───►│          BACKEND          │◄───►│   SUPPLIER APP   │
│  (Flutter)       │     │  NestJS + PostgreSQL +     │     │   (Flutter)      │
│  find & take     │     │  Redis + FCM + UPI         │     │  post & track    │
│  loads           │     └───────────────────────────┘     │  loads           │
└──────────────────┘                                        └──────────────────┘
```

**Who is who (from legacy + market):**
- **Supplier (Shipper)** — posts loads, wants trucks. Business identity (GST/PAN/company).
- **Transporter (Owner)** — owns trucks, wants loads. The decision-maker; drivers execute under them.
- **Admin/Ops** — approves KYC, resolves disputes, seeds liquidity, manages rate cards & content.

---

## 2. Design principles (new UI/UX, evolved)

Derived from the legacy product + market UX research (BlackBuck/Vahak):

1. **Vernacular-first** — top 10 Indian languages + English: Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada, Odia, Malayalam (+ EN). Language picker on first launch (kept from legacy), overridable in settings. New languages are content-strings only, not code changes.
2. **Icon + number-first** — big amounts, dates, route cards. Low text density. Amount/route/date as the three anchors of every load card.
3. **Phone-call-first** — "Call transporter" and "WhatsApp" as primary actions, not chat. Share load via WhatsApp.
4. **Trust surfacing** — verification badge, star rating, "X trips completed", payment-protected badge on every card.
5. **Offline-tolerant** — cached feed, queued actions, silent retry. Works on 2G-ish connectivity.
6. **One-hand, thumb-zone** bottom navigation; large touch targets (min 48dp); readable at 20ft (trucker cab).
7. **Dark + light themes**, design system with consistent tokens across all 4 surfaces.
8. **Maps everywhere** — MapLibre route visualization, live tracking, tap-to-navigate.
9. **Progressive onboarding** — basic usage unlocks immediately; advanced features unlock after KYC/KVV verification (tiered trust).

---

## 3. Feature scope by app

Priority legend: **P0** = must ship v1 · **P1** = v1.1 · **P2** = v2.

**Trust tiers (progressive unlock):**
- **Tier 0 — Guest/Basic** (OTP login only): browse load feed, view rate cards, contact by phone. No money features.
- **Tier 1 — KYC-lite** (mobile OTP verified + profile): post loads, accept/quote, receive notifications.
- **Tier 2 — KYC-full (KVV = Know Your Customer + Vehicle/Document Verification)**: admin-reviewed docs (PAN, Aadhaar, RC, license, bank). Unlocks payments/escrow, payouts, full quoting, live tracking, ratings.
- KVV is the trust backbone: vehicle registration (Vahan-style), driving license, and document verification drive the badge shown on cards.

### 3.1 Transporter App (React Native/Expo, Android-first + iOS)

| Area | Features | Priority |
|---|---|---|
| **Auth** | OTP-only (SMS + WhatsApp), JWT access+refresh, device FCM token sync, no password/passwords anywhere | P0 |
| **Onboarding/KYC (KVV)** | Progressive: basic profile (name, phone) → KYC-full (PAN, Aadhaar, selfie, bank acct/IFSC/holder) → vehicle verification (RC upload, permit, insurance) — unlocks payments, payouts, full quoting | P0 |
| **Load feed** | Tabs (All / Open / Container / Trailer) — evolved legacy tabs; rich load cards (route, amount, weight, distance, material, date, no. of trucks, payment tag) | P0 |
| **Filters & lane alerts** | Filter by route/date/truck type/model/weight; save favorite lanes; push alert on new matching load | P0 |
| **Load detail** | Map route (pickup→drop + optional halt), material, tonnage, schedule, fare, number of trucks | P0 |
| **Accept/Quote** | Accept at listed rate OR quote your rate (bid); status transitions; FCM to supplier | P0 |
| **My trips** | In-progress, completed, cancelled; POD photo upload on delivery | P0 |
| **Passbook** | Earnings, payout status, bank/UPI payout on POD confirmation | P0 |
| **Trucks & drivers** | Manage trucks (add/edit, model, capacity, GPS id, active status), manage drivers (name, mobile, license) — evolved legacy | P0 |
| **Notifications** | Push + in-app list, deep links to load/order | P0 |
| **Settings** | Language, logout | P0 |
| **Live tracking share** | Share driver live location during in-transit trip | P1 |
| **Ratings** | Rate supplier after completed trip; view own rating | P1 |
| **In-app chat** | Text with call/WhatsApp fallback | P2 |

### 3.2 Supplier App (React Native/Expo)

| Area | Features | Priority |
|---|---|---|
| **Auth** | OTP-only login; business verification (KYC-full: company, GST, PAN, CIN/TAN, attachments) | P0 |
| **Post a load** | Pickup/drop via map picker, date/time, truck type → model → capacity, weight, distance auto-calc, material (12 categories — legacy list), description, no. of trucks, pay-later vs advance | P0 |
| **My loads** | List + status (posted / interested / accepted / in-transit / delivered / cancelled) | P0 |
| **Quotes / interest** | View transporter interest & bids, accept one; reject others | P0 |
| **Payment** | Pay booking/advance amount (escrow) via UPI; pay-later option | P0 |
| **Tracking** | Live truck location + route on map once in-transit | P1 |
| **Ratings** | Rate transporter after delivery; view own rating | P1 |
| **Notifications** | Push (order accepted, in-transit, delivered) + in-app list | P0 |
| **Address book** | Saved pickup/drop locations & contacts | P1 |

### 3.3 Admin Console (Web — Next.js)

| Area | Features | Priority |
|---|---|---|
| **Dashboard** | KPIs: loads/week, match rate, active users by role, GMV, disputes, verification queue | P0 |
| **Users** | List/search suppliers & transporters; view KYC docs; approve/reject verification | P0 |
| **Loads & trips** | Browse all loads/trips by status; filter by corridor/date | P0 |
| **Disputes** | Queue, assign, resolve; escrow release/refund actions | P0 |
| **Rate card** | Manage truck types/models/capacities, materials, base rates ₹/km | P0 |
| **Payments** | Ledger view, payout status, refunds, transaction lookup | P0 |
| **Content** | Notifications broadcast, language/help content, locations/cities | P1 |
| **Analytics** | Corridor demand heatmap, top lanes, utilisation | P2 |

### 3.4 Backend (NestJS + PostgreSQL + Redis)

| Service | Responsibilities | Priority |
|---|---|---|
| **Auth** | OTP send/verify (SMS + WhatsApp), JWT, refresh tokens, FCM token registry | P0 |
| **KYC / Verification** | Upload docs, admin approval workflow, verification badge state | P0 |
| **Trucks & Drivers** | CRUD, models/capacities, driver management | P0 |
| **Loads** | CRUD, validation, lane/date indexing, geocoding of addresses | P0 |
| **Matching** | Candidate generation (lane + truck type + geohash), ranking, lane-alert triggers | P0 |
| **Booking state machine** | posted → interested → accepted → in-transit → delivered → closed; cancellation rules | P0 |
| **Payments** | UPI intent, escrow capture, release-on-POD, payouts, ledger (passbook) | P0 |
| **Tracking** | Live location ingest, geofencing events, ETA, WebSocket stream | P1 |
| **Notifications** | FCM, SMS, WhatsApp templates; in-app notification store | P0 |
| **Admin** | RBAC, audit log, dispute handling, rate-card CRUD | P0 |
| **Rate engine** | distance × rate-card per model; price estimate endpoint | P0 |

---

## 4. Technology stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile (x2) | **React Native (Expo)** | TypeScript everywhere; OTA updates; MapLibre via `@maplibre/maplibre-react-native` |
| Admin console | **Next.js 14+ (React/TS) + Tailwind** | SSR + RSC for dashboards |
| Backend | **NestJS (Node 20 + TypeScript)** | Modular monolith; service split later |
| DB | **PostgreSQL 16 + Prisma ORM** | Fresh seed data only — NO legacy migration |
| Cache/queue | **Redis** | Feed caching, job queue (OTP, notifications, payout) |
| Realtime | **WebSocket (Socket.IO)** + FCM | Live tracking, feed updates |
| Payments | **Mocks first** — in-app simulation of escrow/UPI/payout; Razorpay adapter behind a `PaymentProvider` interface (swap in later) | Idempotent ledger |
| Maps | **MapLibre GL** (self-hosted tiles + OSRM routing) | Free, privacy-friendly, offline tiles |
| Storage | **S3-compatible object storage** (MinIO locally) | KYC docs, POD photos |
| Infra | **Docker + docker-compose** dev; **GitHub Actions** CI | Lint, typecheck, tests |
| Monorepo | **pnpm + Turborepo** | Shared config, caching, one command builds |

### 4.1 Security (top-grade, OTP-only)
- **Auth:** OTP-only login (SMS + WhatsApp). No passwords. Short-lived OTPs (5 min, single-use, rate-limited, hash-only storage). JWT access (15 min) + refresh (30 days, rotating, revocable) stored httpOnly.
- **Transport:** TLS everywhere; HSTS; secure headers.
- **API hardening:** Helmet, rate limiting, request validation (class-validator), idempotency keys on payments, audit log on all mutations.
- **Data at rest:** PostgreSQL + Redis TLS; S3 bucket policies private; encryption for PII fields (PAN/Aadhaar/bank) at application layer.
- **Uploads:** size/type validation, virus scan, generated filenames, signed URLs, no arbitrary path traversal.
- **Admin:** RBAC (super-admin/ops/support), 2FA, per-action audit trail, no shared accounts.
- **Mobile:** keychain/keystore token storage, biometric lock optional, no secrets in code, SSL pinning (optional), obfuscation on release builds.
- **OWASP Top 10** review as a release gate in Phase 4.

---

## 5. Data model (PostgreSQL — v1 core)

```
users                id, role(supplier|transporter|admin), mobile, lang, status,
                     otp_hash, created_at
suppliers            user_id FK, company_name, gst, pan, cin, tan, attachments[], kyc_status
transporters         user_id FK, name, pan, aadhar, selfie, bank_acct, ifsc, acct_holder,
                     doc_image, kyc_status
kyc_documents        id, user_id FK, kind(pan|aadhar|rc|license|bank|selfie), s3_key, status,
                     admin_note, verified_at
vehicles             id, transporter_id FK, rc_number, rc_verified, insurance_upto, permit,
                     status          -- KVV: vehicle/document verification
drivers              id, transporter_id FK, name, mobile, license_url, license_verified, status
trucks               id, transporter_id FK, truck_no, type, model_id FK, capacity_id FK,
                     driver_id FK, origin, lat, lng, gps_login, attachments[], active_status
truck_models         id, type(open|container|trailer), model, capacities[]
materials            id, name, image   (12 legacy categories)
loads                id, supplier_id FK, pickup, drop, halt?, pickup_lat/lng, drop_lat/lng,
                     date, time, truck_type, model_id, weight, distance, material_id,
                     description, no_of_trucks, fare_estimate, pay_later, status
quotes               id, load_id FK, transporter_id FK, amount, status, created_at
trips                id, load_id FK, transporter_id FK, status(accepted|in_transit|delivered|cancelled),
                     pod_url, started_at, delivered_at
payments             id, trip_id FK, type(escrow|payout|refund), amount, method(mock|upi),
                     provider_ref, idempotency_key, status, ledger key
notifications        id, user_id FK, type, title, body, is_read, data(json), created_at
fcm_tokens           id, user_id FK, token, device_id, platform
rate_cards           id, model_id FK, weight, price_per_km
disputes             id, trip_id FK, raised_by, subject, status, resolution
audit_logs           id, actor_id, action, resource, before, after, ip, created_at
```

**Decision (locked):** NO legacy data migration. Fresh seed only — the 2020 MySQL data is test data and the schema is rewritten. The legacy schema influenced these tables but is not imported.

---

## 6. API surface (REST, `/api/v1`)

```
POST   /auth/otp            POST   /loads
POST   /auth/verify         GET    /loads?lane=&type=&model=&date=   (transporter feed)
POST   /auth/refresh        GET    /loads/:id
                           POST   /loads/:id/quotes         (transporter bid)
POST   /kyc/upload          POST   /loads/:id/accept
POST   /kyc/transporter     PATCH  /trips/:id/status        (in-transit / delivered)
POST   /kyc/supplier        POST   /trips/:id/pod
POST   /vehicles            POST   /payments/escrow         (supplier pay booking amt)
PATCH  /vehicles/:id        POST   /payments/release        (release on POD)
POST   /trucks              GET    /payments/passbook
PATCH  /trucks/:id
POST   /drivers             GET    /notifications
GET    /rate-cards          POST   /fcm/register
PATCH  /rate-cards/:id      WS     /tracking/:tripId
POST   /admin/verify        POST   /admin/disputes/:id/resolve
GET    /admin/dashboard     POST   /admin/broadcast
GET    /admin/audit         GET    /me          (own profile, tiers, kyc_status)
```

---

## 7. Shared UI/UX system ("Wagon Design System")

Brand-new, inspired-by-legacy color story (legacy used gradient headers + orange accents; modernize to a logistics palette):

- **Brand:** deep navy (`#0F172A`) + signal orange (`#F97316`) + neutral grays. Semantic green/red/amber for status.
- **Tokens:** spacing 4/8/12/16/24; radii 8/12/16; type scale for 20-ft readability; both themes.
- **Reusable mobile components (in `packages/design`):** `WLoadCard`, `WRatingStars`, `WBadge`, `WStatusChip`, `WPassbookRow`, `WMapView` (MapLibre), `WOtpField`, `WStepper`, `WKycFlow`.
- **Reusable web components (admin):** `DataTable`, `KycDocViewer`, `StatusFilter`, `KpiCard`, `LedgerTable`, `RateCardEditor`.
- **Deep links:** `wagon://load/:id`, `wagon://trip/:id` for notification taps.

---

## 8. Build phases & milestones

### Phase 0 — Foundation (Week 1-2)
- Monorepo scaffold: pnpm + Turborepo, `apps/transporter`, `apps/supplier`, `apps/admin`, `apps/backend`
- Docker compose (Postgres, Redis, MinIO), Prisma schema + **fresh seed**, CI pipeline
- Design tokens + shared theming; MapLibre tile server (self-hosted/OSM demo tiles) + OSRM
- **Exit:** both mobile apps build & run, admin renders dashboard shell, backend `/health` + DB connected

### Phase 1 — Core loop (Week 3-5)
- OTP-only auth, supplier post-load, transporter feed + accept, trips state machine, notifications, admin verify
- Tiered onboarding: basic (OTP) → KYC-lite
- **Exit:** end-to-end on staging: supplier posts → transporter accepts → trip created → both notified

### Phase 2 — Payments & trust (Week 6-7)
- **Mock escrow/UPI/payout** (simulated payment provider), POD upload, release + payout, passbook, ratings, verification badges (KYC-full/KVV)
- **Exit:** money moves end-to-end in mock mode; admin can resolve a dispute

### Phase 3 — Tracking & polish (Week 8-9)
- Live GPS ingest + WebSocket tracking (MapLibre), lane alerts, filters, deep links, offline cache
- **Exit:** tracking visible to supplier on map during in-transit trip

### Phase 4 — Hardening & security release (Week 10-12)
- OWASP Top 10 review, E2E tests, load/scale checks, audit logging, security pass, docs
- **Exit:** v1.0 on an internal track with seeded corridor; security review sign-off

---

## 9. Decisions (locked)

1. **Legacy data**: NO migration — fresh seed only. ✔
2. **Languages**: top 10 Indian languages + English (HI, BN, MR, TE, TA, GU, UR, KN, OD, ML + EN). ✔
3. **Maps**: MapLibre GL + self-hosted/OSM tiles + OSRM routing. ✔
4. **Payments**: mocks first — simulated escrow/UPI/payout behind a `PaymentProvider` interface; Razorpay adapter swapped in later. ✔
5. **Monorepo**: pnpm + Turborepo. ✔
6. **Auth**: OTP-only (SMS + WhatsApp), no passwords. ✔
7. **Onboarding**: basic unlocks usage; advanced features unlock via KYC/KVV verification. ✔
8. **Security**: top-grade — see §4.1. ✔
9. **Mobile framework**: **React Native (Expo)** — LOCKED. ✔

---

## 10. Repo layout (target)

```
WagonV2/
├── apps/
│   ├── transporter/        # mobile app — Transporter (Expo RN)
│   ├── supplier/           # mobile app — Supplier (Expo RN)
│   ├── admin/              # Next.js admin console
│   └── backend/            # NestJS API
├── packages/
│   ├── design/             # shared design tokens + components
│   ├── contracts/          # TS types / OpenAPI spec (single source of truth)
│   ├── i18n/               # 11-language string catalogs
│   └── config/             # env, eslint, tsconfig, docker, tooling
├── docker-compose.yml
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

---

## 11. Mobile framework decision

| | Flutter 3.x | React Native (Expo) |
|---|---|---|
| Language | Dart | TypeScript (shared with NestJS backend + Next.js admin) |
| Rendering | Skia/Impeller, AOT native | JS bridge (Fabric New Arch) |
| UI parity across the 2 apps | Excellent (single engine) | Good; needs discipline |
| Low-end Android perf | Best-in-class | Good on modern, weaker on old low-end |
| Ecosystem | Large, growing | Largest (JS/TS) |
| OTA updates | Requires app-store review / custom setup | Built-in (Expo Updates) |
| Native modules | Strong | Strong (Expo modules) |
| Maps (MapLibre) | `flutter_map` mature | `@maplibre/maplibre-react-native` mature |
| Dev speed for this codebase | Fast (hot reload) | Fast (fast refresh + EAS) |
| Local state of SDK | **Corrupted at current path — needs reinstall** | Ready (pnpm/node already installed) |
| Type-sharing with backend | Manual/OpenAPI codegen | First-class (shared `packages/contracts`) |

**Recommendation: React Native (Expo)** — **LOCKED**. TypeScript across all 4 surfaces, first-class type sharing via `packages/contracts`, OTA updates for iterating vernacular UI in the field, ready immediately (no Flutter SDK reinstall).
