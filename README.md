# Wagon V2

Brand-new rebuild of the Wagon truck-hiring marketplace. One monorepo, three surfaces — **one unified mobile app** with role-based navigation:

| App | Tech | Location |
|---|---|---|
| Mobile app (Transporter + Supplier + Driver in one) | React Native (Expo) | `apps/mobile` |
| Admin console | Next.js | `apps/admin` |
| Backend API | NestJS + Prisma | `apps/backend` |

One login → role selection → role-specific tabs (transporter: Loads/Trips/Wallet/Profile; supplier: Home/Post/Trips/Profile; driver maps to transporter trips).

Docs: `BUSINESS_CASE_STUDY.md` (why), `PRODUCT_PLAN.md` (what/how), `DEPLOYMENT.md` (run + ship).

## Status

Phases 0–3 implemented & verified end-to-end (12-week plan; core features live):

- **Phase 0 — Foundation**: pnpm+Turborepo monorepo, Prisma schema, fresh seed, CI.
- **Phase 1 — Core loop**: OTP-only auth + JWT, supplier posts load → transporter feed/accept → trip state machine → notifications. RBAC on roles.
- **Phase 2 — Payments & trust**: idempotent mock escrow/UPI → POD → payout, passbook, ratings, disputes with admin resolution + audit log.
- **Phase 3 — Live tracking**: MapLibre mobile map, WebSocket live location broadcast, lane alerts, offline feed cache, deep links.
- **Phase 4 — Hardening**: rate limiting, security review, 24 e2e tests, npm-audit fixes, deployment guide.
- **Backlog delivered**: real presigned S3/MinIO uploads (KYC + POD), FCM push service (mock/real), e-way bill generation (mock GSTN interface), **live admin console** (OTP login, KPIs, KYC approve/reject, loads & trips, disputes, audit log).
- **Premium UI/UX (v2)**: research-driven redesign — navy+orange design system with light/dark themes, Indian currency formatting, shimmer skeletons, empty states, A→B route rails, status steppers, wallet header with hide-balance, sticky money-CTAs, premium admin dashboard (Linear/Stripe school).
- **Production-grade flows (v3)**: one unified role-based app (transporter/supplier/driver), trip execution state machine with pickup/delivery OTP proofs, smart load matching (match %), return-load discovery, chat + notifications + tickets + emergency, system states (offline/error/retry/empty), account deletion & logout confirmation.

## APK build

A single unified debug/release APK lives in `dist-apks/`:

| APK | Package | Notes |
|---|---|---|
| `dist-apks/wagon.apk` | `com.wagon.app` | One app, role-based navigation |

Rebuild: `cd apps/mobile/android && ./gradlew assembleRelease` (needs JDK 17 + Android SDK).

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for Postgres, Redis, MinIO)

## Quick start

```bash
pnpm install
pnpm db:up          # start Postgres:5440, Redis:6380, MinIO:9010/9011
pnpm db:seed        # migrate + seed fresh data
pnpm dev            # run all apps in dev mode (or per-app)
```

Demo accounts (admin `9999988888`, supplier `9963712337`, transporter `9491996633`) — see `DEPLOYMENT.md`.

## Verify

```bash
pnpm turbo run typecheck lint build test:e2e   # full suite (13 tasks)
bash scripts/e2e-core-loop.sh                  # curl E2E: core loop
bash scripts/e2e-payments.sh                   # curl E2E: escrow→payout→rate→dispute
bash scripts/e2e-tracking.sh                   # curl E2E: lane alerts + tracking
bash scripts/e2e-backlog.sh                    # curl E2E: KYC/EWB/presigned uploads
```

## Decisions (locked)

- No legacy data migration — fresh seed only
- OTP-only auth (SMS + WhatsApp), no passwords
- Top 10 Indian languages + English
- MapLibre GL + OSRM routing
- Mocks-first payments behind a `PaymentProvider` interface
- Progressive onboarding: basic → KYC-lite → KYC-full (KVV)
- Top-grade security: see `PRODUCT_PLAN.md` §4.1
