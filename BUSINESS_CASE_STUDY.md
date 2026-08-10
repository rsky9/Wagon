# Wagon — Truck Hiring & Load-Matching Marketplace
## Business Case Study for a Full-Stack Rebuild

*Prepared: Aug 2026. Based on analysis of the legacy `WagonTransporter` codebase + SQL dump, and market research (2025-2026).*

---

## 1. What the legacy product was

The legacy project (2020) is a two-sided truck-hiring marketplace built on a PHP/Laravel backend + old Kotlin Android app.

**Roles in the legacy schema:**
- **Supplier** (`supplier` table) — posts loads. Fields: company name, CIN, GST, TAN, PAN, attachments, OTP.
- **Transporter** (`transporter` table) — owns trucks, accepts loads. Fields: PAN, Aadhaar, RC, permit, insurance, profile pic, bank account/IFSC/account-holder.
- **Driver** (`driver` table) — linked to a transporter, license photo.
- **Admin** (`admin` table) — approves/verifies.

**Domain objects:** `loads`, `truck`, `truck_model` (9 models across 3 types: Open / Container / Trailer), `truck_capacity` (weights 4.5–40t), `material` (12 categories: packaged boxes, food, construction, tyres, etc.), `price` (flat per-model rates ₹10–30), `location`, `language`, `notification`, `fcm`, `session`.

**Load flow (from data):** supplier creates a load (pickup→drop geo, halt point, date/time, truck type, model, weight, distance, material, description, no. of trucks, payment status, amount, transaction id, load_status). Transporters see loads in a feed (tabs: All/Open/Container/Trailer), filter, accept/reject. FCM push notifications on both sides ("You have a new Order" / "Your Order has been accepted by Transporter").

**Legacy monetization signal:** a static flat rate card (`price` = ₹/km by model), OTP auth, bank-details collection for payouts. No escrow, no live tracking, no ratings, no driver app.

---

## 2. Market context (India trucking, 2025-2026)

| Metric | Figure | Source |
|---|---|---|
| India freight & logistics market | ~US$ 484 B by 2029 (~9% CAGR) | Mordor Intelligence via StartupTalky (BlackBuck success story) |
| Road share of freight | ~66–70% of freight by road | NHAI / IBEF |
| Goods vehicle fleet | ~5.6M on-road CVs; ~7.6M registered goods vehicles | Inc42 |
| Structure | Highly fragmented, majority single-truck/small owners | Inc42 |
| Unorganized share | ~85–90% [estimate] | Industry reports |
| Intracity parcel market | US$ 600–800 M (FY25) | Redseer via Mint |

**Core pains the market validates:**
1. **Empty return trips / idle trucks** — the #1 economic problem; platforms claim 20–45% idle-time reduction (BlackBuck).
2. **Broker middlemen** — traditional brokers retain ~5–10% (TruckMandi charged 2%, BlackBuck 15–20%, Porter up to 30%).
3. **Payment delays** — corporate shippers settle in 30–45 days; truckers need upfront. Same-day payout after unloading is now a core differentiator (Vahak, BlackBuck).
4. **No price transparency** — freight-rate swings of ~₹10k/load between seasons.
5. **Trust/fraud** — ghost trucks, fake posters, no fulfillment guarantee.
6. **Language/literacy barrier** — drivers/owners are vernacular-first, mobile/Android-only.

---

## 3. Competitive landscape

| Player | Model | Monetization | Status / Scale |
|---|---|---|---|
| **BlackBuck** (Zinka) | Full-stack digital trucking platform; load marketplace + FASTag + GPS + fuel cards + loans | 15–20% on marketplace; ~93% revenue from contract trucking; commission on toll/fuel | 1.2M+ trucks, ~963k transacting operators (FY24); IPO Nov 2024 |
| **Vahak** | Free LCV booking marketplace; post-load → bid → pay → track | Zero commission; membership, cargo insurance, GPS | 10 Lakh+ verified owners, 850+ cities, ~₹41 Cr FY24 rev |
| **Porter** | Intracity aggregation (mini trucks/tempos) | Revenue share up to 30% | FY25 ₹4,306 Cr revenue, first net profit |
| **FreightFox** | Enterprise TMS / reverse auctions for shippers | B2B SaaS + commission | US$2B+ freight procured |
| **Rivigo** (cautionary) | Asset-heavy relay trucking | Freight margins | Revenue collapsed ~99% (FY24); sold for ₹225 Cr |
| **Convoy** (US cautionary) | Asset-light brokerage marketplace | Brokerage risk | Shut down Oct 2023 despite $800M+ raised |

**The single biggest lesson:** the market winners are **asset-light** and monetize the *operating system around the trip* (toll, fuel, GPS, credit), not just the load match. Pure brokerage and asset-heavy models failed.

---

## 4. Why the legacy product underperformed (gap analysis)

1. **Classifieds-style UX, not a marketplace** — no guaranteed fulfillment, no escrow, no payment rails. (The 2014–16 wave — TruckSuvidha paid directories — proved subscription-before-liquidity kills the cold start.)
2. **No trust layer** — no ratings, no verification badges, no dispute resolution.
3. **No live tracking** — truck GPS columns exist in schema (`latitude/longitude/gps_login`) but there's no tracking product.
4. **Static rate card** — prices are flat constants (₹10–30), not distance-based or dynamic; no fare transparency/negotiation.
5. **No driver app** — the person executing the trip is invisible to the product.
6. **Single-sided app** — only a transporter app is in the repo; supplier is a separate PHP-web flow.
7. **Monolithic legacy stack** — 2020 Kotlin/View/ButterKnife + Laravel/PHP backend; hard to evolve.
8. **English-centric, low-literacy UX** — language locales exist (TE/TA/KN/ML/HI) but the app is form-heavy.
9. **No analytics/monetization data captured** — no trip history feeding lending/insurance/credit.

---

## 5. Rebuild strategy: recommended architecture

### 5.1 Product model (roles)
Split identities from day one (even if v1 ships fewer binaries):
- **Shipper / Supplier** (demand side): post load, receive bids, pay booking amount, track, rate.
- **Transporter / Owner** (supply side): load feed, accept/quote, manage trucks/drivers, receive payout, passbook.
- **Driver** (execution side): thin companion app — trip steps, ETA share, POD photo upload. *(Defer to v2.)*
- **Admin / Ops**: verification, disputes, refunds, content.

### 5.2 MVP feature set (v1)
**Shipper:** OTP login · post load (≤3 required fields: route, date, truck type) · view transporter interest · pay booking amount (escrow) via UPI · live track · rate.

**Transporter:** OTP login · truck profile (RC, type, capacity, location) · load feed with filters + lane alerts · call/WhatsApp-forward (no in-app chat in v1) · accept/quote · POD upload · passbook · FCM notifications.

**Trust & payment primitives (non-negotiable):** OTP-verified mobile + RC upload verification badge · escrow-lite booking amount released on POD · basic ratings (1–5 + count) · human dispute queue.

### 5.3 Backend services (v1)
- **Auth** — OTP via SMS (+ WhatsApp fallback)
- **Load service** — CRUD, validation, lane/date indexing
- **Matching/feed** — lane + truck-type + geohash candidate generation; rank by proximity/rating/recency; FCM push
- **Booking state machine** — posted → interested → accepted → in-transit → delivered → closed (+ cancellation rules)
- **Payments** — UPI intent + PG escrow; payout to transporter (UPI/IMPS/NEFT) on delivery; reconciliation ledger
- **Tracking** — commercial GPS feed integration + driver-shared live location
- **Notifications** — FCM/SMS/WhatsApp
- **Admin/ops console** — verification, disputes, refunds
- **Rate engine** — rule-based distance × rate card first (ML later)

### 5.4 Deferred (v2+)
Driver app (full), org/enterprise accounts, load auctions, e-way bill API integration, fuel cards/FASTag distribution, telematics hardware, lending/insurance, full ML pricing, USSD/voice agents.

---

## 6. Technology stack proposal

| Layer | Choice | Why |
|---|---|---|
| Mobile | **Flutter** (Android-first, Android+iOS) | SDK already local; one codebase; strong for form-heavy vernacular UI. Native Compose is the alternative if Android-only |
| Backend | **NestJS (Node/TS)** or **Laravel 11** | NestJS: typed, modular, great for service split. Laravel: closest to legacy DB, fastest migration |
| Database | PostgreSQL (or MySQL for legacy-data continuity) | Keeps legacy schema viable if migrated |
| Auth | OTP via SMS/WhatsApp + JWT | Matches market norm (Vahak/BlackBuck) |
| Payments | Razorpay/UPI + escrow ledger | Trust primitive |
| Realtime | FCM + WebSocket for live tracking/feed | — |
| Infra | Docker + CI/CD; object storage for docs | — |

---

## 7. Monetization & unit economics

1. **Seed free (zero commission)** to reach corridor liquidity — the Vahak pattern. Charging before density (TruckSuvidha) failed.
2. **Later layers:**
   - Low take-rate on confirmed trips (2–5%) once density exists
   - Transporter subscription/membership (₹8.4k–45k/yr precedent in market)
   - FASTag, fuel cards, GPS devices (BlackBuck model)
   - Cargo/driver insurance, vehicle loans — underwriting signal = trip & payment history (build this data capture from v1)
3. **Anchor demand side first** on one high-frequency corridor/transport nagar with a manual concierge desk; onboard shippers before trucks (demand capture, not supply, is the binding constraint per 2015 research).

---

## 8. Success criteria (KPIs for v1)

- Load-board liquidity: ≥100 active loads/week on the seeded corridor
- Match rate: ≥70% of posted loads get ≥1 transporter quote within 6 hours
- On-time delivery ≥90%; payment settlement same-day on POD
- Verified transporters ≥50% of supply side
- Repeat: ≥40% of shippers post again within 30 days
- App rating ≥4.2, crash-free sessions ≥99%

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cold start / empty board | Concierge-led seeding of one corridor; zero commission; assisted onboarding |
| Disintermediation (deals walk off-app) | Escrow, caller-ID verification, payment protection; monetize OS not just match |
| Fraud / ghost trucks | OTP+RC verification, ratings, escrow, dispute desk |
| Freight-rate cyclicality | Asset-light; diversify revenue (toll/fuel/finance) like BlackBuck |
| Low-literacy adoption | Vernacular-first UI (HI/TE/TA), icon-heavy, phone/WhatsApp-first support |
| Regulatory (GST, e-way bill) | Design trip data model to accommodate EWB fields; add API integration in v2 |

---

## 10. Sources

- IBEF — Roads industry: https://www.ibef.org/industry/roads-india
- StartupTalky — BlackBuck success story (market size, monetization, FY24 numbers): https://startuptalky.com/blackbuck-success-story/
- Inc42 — TruckSuvidha ($130B industry, fleet, fragmentation): https://inc42.com/startups/trucksuvidha/
- Economic Times (2015) — early load-board wave (TruckSuvidha/TruckMandi/theKarrier): https://economictimes.indiatimes.com/small-biz/startups/startups-like-trucksuvidha-truckmandi-take-on-sector-of-truck-transportation/articleshow/47451109.cms
- Mint — Porter profitability & intra-city market: https://www.livemint.com/companies/porter-profit-unicorn-how-it-cracked-india-intracity-logistics-11758533362847.html
- Wikipedia — Porter, Convoy, FASTag, Goods and Services Tax (India), Driving licence in India
- BlackBuck products / investor relations: https://www.blackbuck.com/company-products.html
- Vahak: https://vahak.in/
- FreightFox: https://www.freightfox.ai/
- Inc42 Datalabs — company profiles (Rivigo, Vahak, FreightFox, LetsTransport, LocoNav, TruckHall)
