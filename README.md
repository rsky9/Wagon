# Wagon — Truck-Hiring Marketplace

A complete rebuild of the Wagon truck-hiring marketplace: one monorepo, three surfaces, and **one unified mobile app** with role-based navigation (Transporter, Supplier, Driver).

- **Mobile app** — React Native (Expo), role-aware tabs, live tracking, payments, chat
- **Admin console** — Next.js dashboard for operations (KYC, disputes, loads, KPIs)
- **Backend API** — NestJS + Prisma, REST + WebSockets, Postgres/Redis/MinIO

> Docs: [`BUSINESS_CASE_STUDY.md`](./BUSINESS_CASE_STUDY.md) (why) · [`PRODUCT_PLAN.md`](./PRODUCT_PLAN.md) (what/how) · [`DEPLOYMENT.md`](./DEPLOYMENT.md) (run + ship)

---

## Highlights

- **One app, three roles** — a single login → role selection → role-specific tabs:
  - *Transporter*: Loads / Trips / Wallet / Profile (plus Fleet, Bids, Reviews)
  - *Supplier*: Home / Post / Trips / Profile (post loads, manage responses)
  - *Driver*: maps onto transporter trips with execution tooling
- **Trip execution state machine** — pickup/delivery OTP proofs, POD, exceptions
- **Smart load matching** — match % scores, return-load discovery
- **Payments & trust** — idempotent escrow → POD → payout, passbook, ratings, disputes with admin resolution + audit log
- **Live tracking** — MapLibre mobile map, WebSocket live location broadcast, lane alerts, offline feed cache, deep links (`wagon://load/:id`, `wagon://trip/:id`)
- **Production-grade flows** — OTP-only auth, chat + notifications + tickets + emergency, system states (offline/error/retry/empty), account deletion
- **Premium UI/UX** — navy + orange design system, light/dark themes, INR formatting, shimmer skeletons, empty states, A→B route rails, status steppers, wallet header with hide-balance, sticky money-CTAs

---

## Status

Phases 0–4 implemented & verified end-to-end, plus a delivered backlog:

| Phase | Scope |
|---|---|
| **0 — Foundation** | pnpm + Turborepo monorepo, Prisma schema, fresh seed, CI |
| **1 — Core loop** | OTP auth + JWT, supplier posts → transporter feed/accept → trip state machine → notifications. RBAC |
| **2 — Payments & trust** | Idempotent mock escrow/UPI → POD → payout, passbook, ratings, disputes + admin resolution + audit log |
| **3 — Live tracking** | MapLibre mobile map, WebSocket live broadcast, lane alerts, offline feed cache, deep links |
| **4 — Hardening** | Rate limiting, security review, 24 e2e tests, audit fixes, deployment guide |
| **Backlog delivered** | Presigned S3/MinIO uploads (KYC + POD), FCM push service, e-way bill (mock GSTN), live admin console |

---

## Repository layout

```
WagonV2/
├── apps/
│   ├── admin/          # Next.js admin console (Next 16, Tailwind 4)
│   ├── backend/        # NestJS API (REST + WebSockets, Prisma)
│   └── mobile/         # React Native (Expo) unified app + native Android
├── packages/           # Shared workspace packages
│   ├── api-client/     # Typed API client used by mobile + admin
│   ├── components/     # Shared React components
│   ├── config/         # Shared config (eslint, tsconfig)
│   ├── contracts/      # Shared TS types/DTOs between apps
│   ├── design/         # Design system (tokens, themes)
│   └── i18n/           # Localization (EN + 10 Indian languages)
├── scripts/            # Curl E2E suites + audit helper
├── docker-compose.yml  # Postgres, Redis, MinIO
├── turbo.json          # Turborepo pipeline
└── pnpm-workspace.yaml
```

### Mobile screens (`apps/mobile/src/screens/`)

Login · Home Cockpit · Load Feed/Detail · Post Load Wizard · Trips · Trip Execution · Tracking · Return Loads · Fleet Dashboard · My Trucks/Drivers · Bids · Negotiation · Decision Room · Bookings · Wallet/Passbook · Finance · Invoices · Bank · Reviews/Ratings · Disputes · Chat · Notifications · Tickets · Emergency · Quests · Rate Cards · Search/Filters · Favorites · KYC · Onboarding (Supplier/Transporter) · Settings

### Backend modules (`apps/backend/src/`)

auth · onboarding · loads · trips · bidding · chat · tracking · payments · ratings · disputes · kyc · uploads · ewb · fcm/push · notifications · notif-prefs · exceptions · drivers · trucks · favorites · reference · support · audit · admin · alerts · health · home · redis

### Admin console (`apps/admin/app/`)

Dashboard · Loads · Trips · Users · KYC · Payments · Disputes · Tickets · Rate Cards · Reports · Broadcast · Audit log

---

## Tech stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm + Turborepo |
| Mobile | React Native 0.86 + Expo 57, React Navigation, MapLibre GL, socket.io-client |
| Admin | Next.js 16, React 19, Tailwind CSS 4 |
| Backend | NestJS 10/11, Prisma 5, class-validator, helmet, @nestjs/throttler, ioredis |
| Auth | OTP-only (SMS/WhatsApp behind `OtpProvider`), JWT access (15m) + rotating refresh (30d) |
| DB / cache / storage | PostgreSQL 16, Redis 7, MinIO (S3-compatible) |
| Payments | Mock escrow/UPI behind `PaymentProvider` interface (swap for Razorpay/UPI in prod) |
| Push | FCM via `PushService` (real when credentials set, mock otherwise) |
| Realtime | WebSocket (socket.io) location broadcast |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

---

## Prerequisites

- **Node.js >= 20**
- **pnpm >= 9** (`corepack enable && corepack prepare pnpm@11.17.0 --activate` recommended)
- **Docker** (Postgres, Redis, MinIO)
- **JDK 17 + Android SDK** (only for the native APK build)

---

## Quick start

```bash
pnpm install
pnpm db:up          # start Postgres:5440, Redis:6380, MinIO:9010/9011
pnpm db:seed        # migrate + seed fresh demo data
pnpm dev            # backend :4020, admin :3000, mobile (Metro)
```

### Demo accounts (seeded)

| Role | Mobile |
|---|---|
| Admin | `9999988888` |
| Supplier | `9963712337` |
| Transporter | `9491996633` |

**Mock OTP:** in dev the code is returned in the API response (`devCode`) and surfaced in a "DEV (mock provider)" box on the OTP screen. In production the code is only sent via SMS/WhatsApp.

---

## Verify

```bash
pnpm turbo run typecheck lint build test:e2e   # full suite
pnpm --filter @wagon/backend test:e2e          # 24 backend e2e tests
bash scripts/e2e-core-loop.sh                  # curl E2E: core loop
bash scripts/e2e-payments.sh                   # curl E2E: escrow→payout→rate→dispute
bash scripts/e2e-tracking.sh                   # curl E2E: lane alerts + tracking
bash scripts/e2e-backlog.sh                    # curl E2E: KYC/EWB/presigned uploads
```

---

## Android APK

A single unified APK lives at `dist-apks/wagon.apk` (package `com.wagon.app`).

```bash
cd apps/mobile/android
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=~/Library/Android/sdk \
  ./gradlew assembleRelease -x lint
cp app/build/outputs/apk/release/app-release.apk ../../dist-apks/wagon.apk
```

> Requires JDK 17 + Android SDK. Clear stale Metro assets before rebuilds:
> `rm -rf app/build/generated/assets/react/release app/build/intermediates/assets/release`

### Adaptive launcher icon

The app uses an **adaptive icon** (white circle background + wagon wordmark foreground):

| Resource | Path |
|---|---|
| Adaptive icon definition | `apps/mobile/android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` (+ `_round`) |
| Circle background | `apps/mobile/android/app/src/main/res/drawable/ic_wagon_bg.webp` |
| Wordmark foreground | `apps/mobile/android/app/src/main/res/drawable/ic_wagon_fg.webp` |

The foreground is a 432×432 canvas with the wordmark centered at **~54% width × 33% height** of the canvas, sized so it renders at **~75% of the launcher's visible circle** — fully inside the circle with no cropping. The source artwork lives outside the repo (`Downloads/Untitled design/1.png`); edit the foreground webp and rebuild to change the mark.

---

## Configuration (backend `.env`)

See [`DEPLOYMENT.md`](./DEPLOYMENT.md#2-configuration-backend-env) for the full list. Key vars:

```
DATABASE_URL          postgres://...   # PostgreSQL (Prisma)
REDIS_URL             redis://...      # cache/queue
MINIO_ENDPOINT / ...                  # object storage (KYC docs, POD)
JWT_ACCESS_SECRET     # ROTATE in prod
JWT_REFRESH_SECRET    # ROTATE in prod
CORS_ORIGIN           # comma-separated allowed origins
NODE_ENV=production   # disables devCode in OTP response
```

Never commit `.env` (gitignored). Generate fresh secrets in prod.

---

## Production rollout

See [`DEPLOYMENT.md`](./DEPLOYMENT.md#5-production-rollout-checklist) for the full checklist. In short:

1. Provision Postgres + Redis + S3/MinIO; set prod env vars incl. **fresh JWT secrets**.
2. `prisma migrate deploy` (not `dev`).
3. Deploy NestJS behind HTTPS; `NODE_ENV=production`.
4. Swap mock providers for real ones: `OtpProvider` (SMS/WhatsApp), `PaymentProvider` (Razorpay/UPI), `EwbProvider` (GSTN).
5. Point `EXPO_PUBLIC_API_URL` at prod; build via EAS; enable Expo Updates for OTA fixes.
6. Deploy the admin console (Vercel/self-host) and restrict access (SSO/VPN).

---

## Security posture (implemented)

- **OTP-only auth** — no passwords; 5-min TTL, single-use, bcrypt-hashed, max 5 attempts, per-IP rate limit.
- **JWT** — access (15m) + refresh (30d, rotating), separated secrets.
- **Transport** — helmet headers, TLS in prod, HSTS.
- **API** — global rate limit (100 req/10s/IP), class-validator whitelist + forbidNonWhitelisted, idempotency keys on payments.
- **RBAC** — role guard on admin/disputes/payments; audit log on verify/reject/resolve.
- **Uploads** — size/type validation + signed URLs in MinIO.

---

## Decisions (locked)

- No legacy data migration — fresh seed only
- OTP-only auth (SMS + WhatsApp), no passwords
- Top 10 Indian languages + English
- MapLibre GL + OSRM routing
- Mocks-first payments behind a `PaymentProvider` interface
- Progressive onboarding: basic → KYC-lite → KYC-full
- Top-grade security: see [`PRODUCT_PLAN.md`](./PRODUCT_PLAN.md) §4.1
