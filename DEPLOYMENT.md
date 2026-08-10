# Wagon — Deployment Guide

Companion to `PRODUCT_PLAN.md`. Covers running locally, CI, and production rollout.

## 1. Local development

```bash
pnpm install
pnpm db:up          # Postgres:5440, Redis:6380, MinIO:9010/9011
pnpm db:seed        # migrate + seed fresh demo data
pnpm dev            # backend :4020, admin :3000, mobile (Metro)
```

**Demo accounts (seeded):**

| Role | Mobile | Notes |
|---|---|---|
| Admin | `9999988888` | Full RBAC, dashboard |
| Supplier | `9963712337` | Posts loads |
| Transporter | `9491996633` | Accepts loads |

**Mock OTP:** in dev the code is returned in the API response (`devCode`). The mobile apps surface it in a "DEV (mock provider)" box on the OTP screen. In production the code is only sent via SMS/WhatsApp.

## 2. Configuration (backend `.env`)

```
DATABASE_URL          postgres://...   # PostgreSQL (Prisma)
REDIS_URL             redis://...      # cache/queue
MINIO_ENDPOINT / ...                  # object storage (KYC docs, POD)
JWT_ACCESS_SECRET     # ROTATE in prod
JWT_REFRESH_SECRET    # ROTATE in prod
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
CORS_ORIGIN           # comma-separated allowed origins
NODE_ENV=production   # disables devCode in OTP response
```

Never commit `.env` (already gitignored). Generate fresh secrets in prod.

## 3. Security posture (implemented)

- **OTP-only auth**: no passwords. OTPs 5-min TTL, single-use, bcrypt-hashed, max 5 attempts, per-IP rate limit (5/10min on `/auth/otp`).
- **JWT**: access (15m) + refresh (30d, rotating), secrets separated.
- **Transport**: helmet headers, TLS in prod, HSTS.
- **API**: global rate limit (100 req/10s/IP), class-validator whitelist + forbidNonWhitelisted, idempotency keys on payments.
- **RBAC**: role guard on admin/disputes/payments; audit log on verify/reject/resolve.
- **Uploads**: (next) size/type validation + signed URLs in MinIO.
- **OWASP Top 10** reviewed — remaining hardenings tracked below.

### Known dev-tooling advisories (accepted)
`glob`, `picomatch`, `lodash`, `tmp`, `image-size` are dev/build-time only (via @nestjs/cli, Expo tooling). Runtime deps (`multer`, `body-parser`, `qs`) are pinned patched via pnpm `overrides` in `pnpm-workspace.yaml`.

## 4. CI

GitHub Actions (`.github/workflows/ci.yml`) on push/PR:
install → typecheck (turbo) → lint → build → `prisma validate` → backend e2e tests.

E2E requires Postgres; CI job should start one (service container) or reuse a managed dev DB.

## 5. Production rollout checklist

### 5.1 Backend
1. Provision PostgreSQL (RDS/Cloud SQL) + Redis (ElastiCache/Upstash) + S3 bucket.
2. Set env vars incl. **fresh JWT secrets**, production DB URL, `NODE_ENV=production`.
3. `prisma migrate deploy` (not `dev`).
4. Deploy NestJS (ECS/EKS/Fly/Render/Railway); expose on HTTPS.
5. Swap `MockOtpProvider` → real SMS/WhatsApp gateway (implement `OtpProvider`).
6. Swap `MockPaymentProvider` → Razorpay/UPI (implement `PaymentProvider`).
7. Point `EXPO_PUBLIC_API_URL` at the prod API.

### 5.2 Mobile
1. `npx expo prebuild` + configure MapLibre tile server (self-host MARTIN/tileserver or a commercial provider).
2. EAS build (`eas build --platform all`) → internal track → Play Store / App Store.
3. Enable Expo Updates for OTA string/UI fixes.
4. Configure deep links: `wagon://load/:id`, `wagon://trip/:id`.

### 5.3 Admin console
1. `next build` → deploy (Vercel/self-host Node).
2. Restrict access (SSO/VPN) — admin is a high-privilege surface.

## 6. Delivered (Phase 4+ backlog)

- **Real uploads**: presigned PUT URLs (MinIO/S3) for KYC documents and POD; bucket auto-created; size/type validation. Mobile apps upload via document/image picker.
- **FCM push**: `firebase-admin` behind a `PushService` — real pushes when `FIREBASE_SERVICE_ACCOUNT_PATH` is set, mock (logged) otherwise. Every in-app notification also triggers a push to registered FCM tokens.
- **E-way bill**: mock GSTN provider interface (`EwbProvider`); supplier generates an idempotent EWB per load (`EWB...`), stored on the load. Swap for the real GSTN API behind the interface.

## 7. Still to do (backlog)

- Real file upload with signed URLs — **done**, see §6
- FCM push payloads to devices — **done**, see §6
- E-way bill integration (v2) — **done (mock interface)**, see §6
- **Admin console wired to live API** — **done**: OTP login, dashboard KPIs, users + KYC approve/reject, loads & trips, disputes resolve, audit log
- Wire `FIREBASE_SERVICE_ACCOUNT_PATH` + SMS/WhatsApp gateway in prod
- WebSocket auth (currently origin-open for dev)
- Horizontal scale: split payments/tracking if needed

## 8. Useful commands

```bash
pnpm db:seed                    # reseed
pnpm --filter @wagon/backend test:e2e   # 24 e2e tests
bash scripts/e2e-core-loop.sh   # curl E2E: core loop
bash scripts/e2e-payments.sh    # curl E2E: escrow→payout→rate→dispute
bash scripts/e2e-tracking.sh    # curl E2E: lane alerts + tracking
bash scripts/e2e-backlog.sh     # curl E2E: KYC/EWB/presigned uploads
```
