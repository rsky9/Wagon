# Wagon — Logistics Enablement Network (not an operating system that executes)

*Researched and grounded against the 28-page ULOS thesis (12 Aug 2026), the current Wagon codebase, live logistics data-model standards, and the real execution histories of Flexport, Project44, FourKites, Freightos, uShip, Raft, Loadsmart, Manbang, Convoy, Cargonexx, and Trunkrs.*

**Status: experimental — do not merge to `main` until validated.**

---

## 0. What we are (and are not)

**We are not a logistics company.** We do not own trucks, warehouses, containers, or execute physical work. **Executing a task remains the user's problem — we enable them to do it.**

We are an **enablement platform + network**:

- **Enable** — we give every participant (shipper, transporter, forwarder, driver, warehouse, carrier) the **onboarding, planning, and execution tools** to do their job better.
- **Connect** — everyone connects through us: one trusted identity, one shared operational graph, matching, visibility, documents, and settlement. **Freedom of choice** for every participant at every step (which load to take, which transporter to use, which carrier to book, which tool to use).
- **Integrate** — their existing ERP/TMS/WMS/forwarding software stays; we're the interop layer between all of them.

**What we own:**
- Canonical identities, the shared logistics graph, event/visibility data, matching/marketplace, planning & decision tools, documents, commercial ledger, integrations, permissions and audit.

**What we do NOT own:**
- Physical execution. Loading, driving, warehousing, handling, clearing — that's the user's job. We give them the tools and data to do it, and we make every handover an evidence-backed, coordinated event. If a task isn't done, that's a user action gap we surface — not something we silently do for them.

**Why this model wins (vs the thesis's "orchestrate everything"):**
- **Zero balance-sheet/working-capital risk** — we never sit between payment and physical delivery. The user owns execution; we own the platform. (The thesis itself flags working-capital risk as a failure mode; this model removes it.)
- **Trust by design** — we're the neutral layer, not a competitor to the shipper/transporter/forwarder we serve.
- **Faster to scale** — no asset build-out, no operator hiring, no physical network to run.
- **Match with the research:** the SaaS-first companies (Freightos via WebCargo, Raft, Transmetrics, Loadsmart's software portfolio) survived; the ones that became operators/brokers on balance sheet (Convoy, Cargonexx) died. We take the SaaS-first path to its logical end.

**Core abstraction:** `Party → Capability → Demand → Plan (multi-option) → Choose → Book → Execute (user-owned, enabled by tools) → Event/Evidence → Settle → Learn`

**North star:** a participant describes the outcome they need; we give them feasible, comparable plans, the freedom to choose, the tools and data to execute it themselves, and close the commercial loop — without ever doing the physical work for them.

---

## 2. What the execution research actually proves

### 2.1 Nobody builds the whole platform first (and survives)

Every surviving company in this space followed **one lane → expand multimodal**:

| Company | Lane/wedge first | Expansion | Platform-first casualty? |
|---|---|---|---|
| Flexport | Ocean freight forwarding (China–US) + digital docs | Air → drayage → warehousing → trucking | **Almost died** over-scoping (Dave Clark era); retrenched |
| FourKites | FTL truckload tracking | LTL → rail → parcel → ocean → yard/dock → AI | — |
| Project44 | OTR visibility | Ocean → air → rail → yard → TMS | — |
| Freightos | Forwarder rate SaaS (WebCargo) | Air booking → ocean → index data | — |
| uShip | Reverse auctions, one vertical (vehicles) | Commercial FTL/LTL | — |
| Loadsmart | FTL instant booking via API | Drayage → dock/yard → software portfolio | Pivoted off pure brokerage to survive |
| Raft (Vector.ai) | AP reconciliation + customs entry automation | Warehousing → booking → visibility | — |
| Manbang/FTA | **Two existing matching networks merged** | Broker monetization → freight services | — |
| **Cargonexx** | "AI marketplace" from day one | TMS pivot | **Insolvent 2025 — growth < dev costs** |
| **Convoy** | "Digital freight network," chased scale + Fortune 500 | Multiple products | **Shut down Oct 2023; assets sold $16M** |

**The structural reasons one-lane-first wins:**
- **Data flywheel is mode-specific.** Each mode has different event schemas, dwell behavior, and ETA dynamics (Project44 found "no one-size-fits-all" — they run short-haul vs long-haul vs intermodal-specific models). You can't build a credible "universal" model without first owning one lane's data.
- **Supply-side trust is lane-specific.** Carriers/shippers only transact where you can price and execute reliably — proven lane by lane.
- **Marketplace density is acquired/merged or borrowed, not bootstrapped.** Manbang merged two networks; uShip borrowed demand from eBay/Ritchie Bros; Freightos leveraged WebCargo's installed base. Convoy tried to bootstrap a two-sided exchange in a consolidated market and ran out of runway.
- **Cyclicality punishes margin-light "platform" dreams.** The 2023–24 freight recession killed Convoy and Cargonexx. Survivors have SaaS/managed-services revenue or strategic (industry) capital.

### 2.2 The survivable pattern: SaaS wedge → exchange → OS

1. **Pick ONE lane/workflow with a paid, painful, high-frequency workflow; automate it end-to-end; charge.** Best India-first candidates: (a) FTL/PTL booking+tracking with API/TMS embed (Loadsmart pattern), (b) forwarder/broker back-office automation (Raft/Freightos — India has thousands of forwarders), (c) a service-experience wedge like reliable time-windowed delivery (Trunkrs).
2. **Use software (SaaS) to seed supply before adding the exchange** — free/low-cost driver/carrier app (FourKites CarrierLink) or forwarder tools (Freightos) to build data + trust density.
3. **Borrow demand from existing high-volume platforms** — e-commerce seller platforms, GST/e-way-bill ecosystem, ERP/TMS providers.
4. **Build the event architecture for multimodal from day one, but only fill it with one mode's data initially.**
5. **Anchor on unit economics, not scale.** Strategic (industry) capital > "west coast VC."
6. **Treat "super app" as the end-state vision, not the roadmap.**

### 2.3 The current moat is the execution gap, not visibility

Project44 and FourKites both sell "where is my truck" — and both now push into yard/dock/appointment execution (gate → dock → unload). **Visibility is a solved-ish commodity. Execution is the moat.** In India, the yard/dock/appointment execution layer is largely unbuilt — that's the wedge.

---

## 3. Standards as integration anchors (verified)

| Standard | Layer | Live API? | Use in Wagon |
|---|---|---|---|
| **DCSA Track & Trace** | Ocean events | Yes (v2/v3 OpenAPI, ~75% of container trade) | Adopt its event model for ocean tracking: `eventType` ∈ SHIPMENT/TRANSPORT/EQUIPMENT, `eventClassifierCode` ∈ PLN/ACT/EST, codes like ARRI/DEPA/LOAD/DISC/GTIN/GTOT/STUF/STRP |
| **IATA ONE Record** | Air cargo graph | Yes (2.2.0, production pilots) | Adopt its **Logistics Object (LO)** + immutable `LogisticsEvent` + federated ACL pattern — the best model for multi-party shared shipment records |
| **UN/CEFACT SCRDM/MMT** | Semantics | No (JSON Schema/OpenAPI artifacts) | **Adopt as your internal canonical vocabulary**: `Shipment → Consignment → TransportMovement → TransportEvent → Waybill`, `TransportCall` with `callSequenceNumber`/`loadCall`/`dischargeCall`, `TransportMeans` (Truck/Aircraft/Vessel) |
| **WCO Data Model** | Customs/border | No (DM App, XML/JSON) | Map customs filings (Declaration, LPCO, UCR) — required for cross-border, not for ops |

**The anchor strategy:** UN/CEFACT names = your internal canonical entities. DCSA event codes = your ocean tracking schema. ONE Record LO/event model = your federated shipment graph + event-store pattern. WCO = customs mapping.

---

## 4. Technology recommendations (grounded in research)

Target stack stays **NestJS + Prisma + PostgreSQL + React Native + Next.js**.

### 4.1 Events: Postgres transactional outbox → NATS JetStream (skip Kafka initially)

- **Outbox pattern (non-negotiable):** write domain rows + outbox rows in the **same `prisma.$transaction()`**. Guarantees "event sent iff transaction committed," preserves per-aggregate ordering, gives read-your-own-writes.
- Outbox table: `id, aggregate_type, aggregate_id, event_type, payload(jsonb), created_at, status`.
- Relay worker: poll with `SELECT ... FOR UPDATE SKIP LOCKED ORDER BY created_at`, publish, mark delivered. Consumers dedupe via an inbox table (`message_id` unique). Dead-letter at each stage.
- **NATS JetStream** as the bus (pub/sub + queue groups + redelivery) — ~all of Kafka's value at 1/10th the ops. Defer Kafka until you need log compaction or CDC at scale.
- **Not event sourcing** — Postgres is the system of record; the outbox doubles as the event log for audit/replay.

### 4.2 Workflows: Temporal for the shipment lifecycle

- Model **state in Postgres** (`shipment_status` enum + explicit transition map — cheap, queryable, powers the control tower).
- **Temporal owns orchestration** (durable execution): timers (a shipment sits in "awaiting customs" for weeks), Signals for human-in-the-loop approvals, retries, Event History for audit.
- XState only for short-lived in-process/UI state, never the shipment lifecycle.
- AWS Step Functions only if fully AWS-bound — weaker for code-heavy workflows.

### 4.3 Graph: Prisma + Postgres, designed graph-aware (no Neo4j initially)

- A shipment graph is **shallow** (2–3 hops). Postgres joins + recursive CTEs handle multi-hop reachability.
- Design graph-aware from day one: explicit `Shipment/Stop/Leg/Party/Event` entities, a `shipment_participants` join for cross-tenant sharing.
- Neo4j later as a **derived projection** fed by outbox events for route/network analytics — never source of truth.

### 4.4 Integration hub: canonical-model adapter architecture

- Every integration = a NestJS `Connector` (protocol: REST/webhook/SFTP/EDI-X12/EDIFACT/file intake) + **per-trading-partner mapping** (never global) → canonical JSON.
- Inbound: receive → validate → map → publish via outbox (a poisoned doc can never half-commit).
- Outbound: webhook delivery with backoff, HMAC-signed payloads, delivery-tracking table, DLQ/quarantine.
- Idempotency both directions; additive-only schema versioning (`schema_version`); async contract tests.

### 4.5 Multi-tenancy: shared schema + participant access model + Postgres RLS

- **A shipment is co-owned by multiple parties** (shipper, carrier, consignee, forwarder). Schema-per-tenant breaks this. Use **shared schema**, `org_id` columns, and **relationship-based access** via `shipment_participants`/`party_roles`.
- Postgres **RLS** as defense-in-depth (Prisma client extensions / NestJS middleware injects org/membership scope).
- Database-per-tenant only as a per-customer escalation.

### 4.6 AI: workflows before agents; permissioned, validated, audited tools

- **Workflows first** (routing, extraction, classification, draft generation) — Anthropic's guidance: simple composable patterns before autonomous agents.
- Tools = typed, permissioned functions; the LLM proposes, **deterministic NestJS code disposes** (tenant scope → capability → status validation before executing).
- Every model output passes zod/JSON-schema + domain validation (rate within range, dates coherent). Treat model output as untrusted input.
- Irreversible actions (booking, rate commit) require human approval via Temporal signals. Idempotency for tool calls. Audit everything via outbox events (`ai.action.completed`).

---

## 5. Mapping the thesis to Wagon today (gap assessment)

| Thesis layer | Wagon now | Gap |
|---|---|---|
| Identity/party | `User`, `Supplier`, `Transporter`, `Driver`, per-capability KYC | Strong; needs org/tenant hierarchy + KYB |
| Cargo | `Material` (free-text), `Load.weight` | **Missing:** Cargo Unit/Handling Unit/lineage (split/merge/consolidate) |
| Shipment | `Load` (mode-specific) | **Missing:** not generalized; no `Leg[]`, no plan alternatives |
| Equipment | `Truck`, orphaned `Vehicle`, `Driver` | Road-only; no container/wagon/ULD/vessel |
| Location | free-text addresses + lat/lng | **Missing:** facility/port/terminal master |
| Matching | `Bid`/`DecisionRoom`/negotiation | Strong — extends to RFQ/multi-round |
| Execution | `Trip` + state machine + OTP | Strong for road; no per-mode legs |
| Events | `TripLocation`, `Notification`, audit | **Missing:** unified event fabric + outbox |
| Documents | `KycDocument`, `BookingSnapshot`, e-way bill | Partial; no trade/transport doc model |
| Finance | escrow→payout, GST/TDS, Wagon Cash | Strong; no claims/multi-currency |
| Integration | API only | **Missing:** EDI/webhook/SFTP/connector marketplace |
| AI | gamification, match-score | Deterministic only; no agent layer |

**Verdict: Wagon is a credible Phase 0–1 (Foundation + Road wedge) **enablement** platform — exactly where the research says to start. We are already a SaaS + network, not an operator.**

---

## 6. The execution roadmap (opinionated, grounded in research)

Every phase is framed as **tooling + connection for the user** — never as us doing the physical work.

### Phase 0 — Foundation (do first; 2–3 weeks)
1. **Generalize `Load` → `Shipment` + `Leg[]`** (the keystone). Keep `Load`/`Trip`/`Bid` as the road specialization — nothing breaks.
2. **Add the canonical `Event` model + outbox** (`event_type`, `entity_id`, `shipment_id`, `occurred_at`, `source`, `actor`, `evidence`, `correlation_id`, `schema_version`) written in the same transaction as domain writes.
3. **Add `Organization`/`Party` + org membership** so forwarders/warehouses/carriers become first-class actors that onboard through us.
4. **Event taxonomy** aligned to DCSA/ONE Record codes.
5. Exit: core logistics state can be represented, authorized, changed and audited — and every actor has an identity + capability profile through us.

### Phase 1 — Road wedge (your current product, hardened)
Your existing `Load → Bid → Trip` flow + driver app + GPS/ETA + POD + control tower **is** Phase 1 — a SaaS tool that enables the transporter to execute. The research says: **keep it narrow, make it denser, prove corridor liquidity.** Don't expand modes until road density is real.

### Phase 2 — Storage/domestic (the execution-gap moat)
- `Facility` master + warehouse **tooling** (appointment → gate-in → receive → put-away → pick → stage → load → gate-out) — the warehouse operator executes; we give them the tool + connection to the same graph.
- Yard/dock/appointment scheduling — **where Project44/FourKites are heading and India is unbuilt.**
- Domestic multimodal (road + rail intermodal) as planning options for the user.

### Phase 3 — Forwarding/international
- Forwarder **workspace** (orders, consolidation, carrier procurement, bookings, container mgmt, customs, margins) — the forwarder does the forwarding; we enable + connect.
- Ocean/air booking + container lifecycle + customs/broker workflows + trade documents + port/terminal integration.

### Phase 4 — Multimodal
- Rail, ocean, air, inland/coastal water, transload, intermodal optimization, **multi-option planning with re-planning when a leg fails** — the user chooses the plan; we present the options and the trade-offs.

### Phase 5 — Integration ecosystem
- Connector marketplace, API/EDI gateway, partner SDK, webhooks, ERP/TMS/WMS ecosystem, IoT/telematics — **their software connects through us**; freedom to keep their stack.

### Phase 6 — Finance/risk
- Insurance partners, claims tooling, settlement, reconciliation, financing integrations, risk scoring — neutral settlement between parties; we never take working-capital exposure.

### Phase 7 — AI
- Plan/recommend agents (options + trade-offs), procurement suggestions, exception detection + suggested recovery, ETA intelligence, document drafting, network optimization — **AI recommends; the user decides and executes** (guardrails in §4.6).

### Phase 8 — Global
- Country packs (India-first: tax/transport/customs/port/payment/language adapters), data residency, regional provider networks.

---

## 7. The ten non-negotiable principles (adopt as engineering rules)

1. Shipment-first, not mode-first.
2. Cargo and equipment are separate.
3. Storage is part of logistics.
4. Every handover is a custody event.
5. Every important state change is an event.
6. External systems are adapters.
7. Standards are interoperability anchors.
8. AI recommends; policy governs; deterministic systems verify.
9. Commercial truth reconciles to operational evidence.
10. Build universal architecture but commercialize through dense corridors.
11. **The user executes; we enable.** We never substitute ourselves for the participant's execution — we give them tools, data, connection and choice.

---

## 8. Failure modes to design against (from the thesis + research)

- **Marketplace cold start** → launch corridor-first with anchor demand + quality supply.
- **Integration overload** → canonical model + connector SDK + standards; long-tail via file/manual adapters.
- **Becoming a generic TMS** → keep **network connection + enablement** as the product center; we are the interop layer, not one more system.
- **Becoming an operator by accident** → never take balance-sheet/execution exposure; execution stays with the user (this is our model's core safety).
- **AI overreach** → deterministic validation, permissions, approval thresholds, evidence, audit — and the user stays the decider.
- **Data fragmentation** → canonical IDs, domain ownership, event contracts, master-data governance.
- **Operational complexity** → universal primitives first; mode-specific extensions second.
- **Regulatory exposure** → country modules + licensed partners; never pretend the platform is the regulator or the carrier.
- **Fraud** → KYB/KYC, device signals, payment controls, anomaly detection, evidence, dispute workflows.
- **Working-capital risk** → neutral settlement only; never sit on the balance sheet between parties (your escrow model already does this well).

---

## 9. KPIs to instrument (from thesis §66)

Shipments, GMV, repeat rate, conversion · quote response, fill rate, provider liquidity · on-time pickup/delivery, ETA accuracy, exception rate · warehouse occupancy/dwell/throughput · capacity utilization + empty km · contribution margin + settlement time · claims/disputes/fraud/provider reliability · connector uptime, event latency, data completeness · AI acceptance/override/error/autonomous-action rate.

---

## 10. Concrete first build (recommended to start now)

**On this branch, build Phase 0 items 1–2 first:**

1. **`Shipment` + `ShipmentLeg` Prisma models** — mode-agnostic core (`origin`, `destination`, `commodity`, `weight`, `volume`, `timeWindows`, `value`, `mode`), with `Leg[]`; map existing `Load` → `Shipment` (keep `Load` as road projection).
2. **`LogisticsEvent` model + outbox table** — a durable, canonical event ledger with DCSA/ONE-Record-aligned codes, written atomically with domain writes.
3. **`Organization` + `OrganizationMember`** — so a forwarder/warehouse/carrier is a first-class party.

These three are the keystone of the whole thesis, self-contained, and won't disturb `main` (they live on this branch). Once the schema + migration + basic event relay are in, we validate the existing road flow still works, then expand.

### 10.1 Delivered: marketplace innovation layers (this branch)

The marketplace evolved from a listing board into a capability graph + plan engine:

1. **For-You personalization** — `GET /market/for-you` maps the user's capabilities to what they can offer / quote / need; Home shows a personalized "For you" card (what I offer, matching demand/supply, my live market state).
2. **Live-state offers** — every offer card carries `onMarketNow` (availability window), `fresh` (hours since the provider's last event), `lastEvent`, `claimRate`, `ratingCount`, `activeTrips` — the marketplace sells trust + freshness, not just capacity.
3. **Capability decomposition** — `POST /market/requests/:id/decompose` fans one need out to live listings per leg, scores them, and reassembles a single multi-party `Plan` (source `market_decompose`) the orderer selects. Unsatisfiable legs are reported honestly.
4. **Failure → instant re-procurement** — on `LEG_FAILED`, the planner sources a live replacement from the marketplace (`findReplacementForLane`) instead of a static mode flip; the re-plan carries the real provider + price.
5. **Programmatic marketplace** — connectors get a machine credential (`apiKeyHash`, raw key shown once); `x-api-key`-guarded `/programmatic/market/*` lets an ERP/TMS post demand, decompose, and browse supply with no human app.
6. **Risk/insurance as a tradable capability** — `POST /finance/plans/:id/cover-quote` prices a transparent risk-based premium per plan (mode + eta + declared value); `cover-accept` issues a real policy under a partner org.

### 10.2 Delivered: operational hardening & trust (this branch)

A full audit of the auth/verification, operational core, and mobile flows surfaced and fixed:

**Step-up verification (re-OTP before money/identity moves):**
- `POST /auth/actions/:action/request|verify` mints a short-lived, action-scoped token after a fresh OTP to the registered mobile (single-use, 5-attempt limit, throttled).
- `ActionVerifiedGuard` enforces it. Gated: **payout release**, **account deletion** (escrow + booking confirm ready to gate).
- **Payout now requires POD** (was releasing money with no proof of delivery).
- **Pickup-OTP bypass closed** — the legacy status path now enforces pickup OTP before in-transit (matches the stage machine).
- POD captures the real storage key + `POD_CAPTURED` event.

**Session security:**
- Refresh-token **rotation** with a `RefreshToken` table (hashed, per-session), reuse = theft signal, **device binding** (cross-device use revokes the family), `/auth/logout` revokes the device session.
- Mobile sends a stable per-install deviceId; logout revokes server-side.

**Role-aware Home:**
- `/home/summary` now returns money (transporter pending/collected/wallet; supplier escrowPaid/wallet) + alerts (unread notifications, KYC pending, open exceptions, pending bookings, expiring truck docs).
- Home surfaces a notifications bell with unread badge, a money strip per role, and real "Needs your attention" alerts.

**Mobile flow fixes:**
- Drivers get the full tab experience (Home/Marketplace/Trips/Finance/Account) instead of a 3-screen stack.
- Notification deep-links route to any stack screen (no more silent no-ops).
- Supplier "Responses" screen wired into My Loads (was unreachable).
- Trips: single stage-based execution path.

### 10.3 Delivered: data-integrity hardening (this branch)

A second deep audit of money/state-machine integrity + mobile flows surfaced and fixed:

**Money & state integrity**
- Closed the cancelled-trip → delivered hole; unique `Trip.loadId` + race-safe accept.
- **Escrow equals the agreed rate** (no ₹1-escrow → full-payout); split payout = net − advance (advance released at pickup); escrow capture now step-up gated.
- **Failed payments are retryable** (idempotency released); `clearSettlement` only clears on success; **cancel auto-refunds** all captured escrow/advance/balance.
- Payout **frozen while a dispute or unpaid claim settlement** is open; stage-delivery now auto-rates + sends `trip_delivered`.
- **OTP**: 5-attempt limit, constant-time compare, delivered to the supplier via push, stage/status-gated.
- **Driver pay**: `Driver.payRate` + earnings = payRate or 25% share (was the full freight).

**Mobile**
- **Cross-platform prompt** replacing 20 iOS-only `Alert.prompt` call sites (Android crash fixed).
- Trip deep-links resolve by trip id; `TripDetail`/`LoadDetail` in the deep-link registry; POD body aligned; single trip-execution path (coarse status removed).
- Supplier load-card "Pay booking" action; KYC alert routes to KYC; LoadById error state; Market search refetch debounced.

### 10.4 Delivered: marketplace authority + reputation + lifecycle integrity

A third deep audit of the enablement/marketplace layer surfaced and fixed cross-cutting gaps:

**Marketplace authority & money binding**
- **Supply-side gating**: listing publish/quote is bound to the provider's own org; quoting with **another org's listing is rejected**.
- **acceptQuote**: atomic concurrency-safe claim (was check-then-act → double-accept); the resulting **settlement binds to the actual shipment materialized by the booking** — no more arbitrary `findFirst` shipment, no fake `''` shipment FK on kinds that don't materialize a shipment (warehouse/forwarding/insurance are tracked by their operational object instead).
- **Reputation integrity**: `rateOrg` now requires a real transaction between the two orgs (delivered trip / confirmed carrier booking / cleared freight settlement) — no more review-bombing.

**Trust & lifecycle**
- **Per-document KYC verification**: admin `POST /admin/kyc-documents/:id/decide` approves/rejects individual docs with audit + user notification; recomputes overall KYC tier and a `bankVerified` flag.
- **Bank-KYC payout gate**: payouts require an admin-verified bank document (or a legacy bankAccount+IFSC on the transporter profile).
- **Load expiry**: stale `posted` loads past their bidding deadline / pickup date are lazily swept to `expired` (protected when they have shortlist activity) — no more zombie listings.
- **Truck double-booking guard fixed**: checks the *specific* truck's active bookings on *other* loads (was a global active-trip check); `Trip.loadId` unique race surfaces as a clean "already booked" error; `Bid.truckId` index added.
- **Insurance buyer fix**: plan-cover acceptance no longer requires the buyer to be an insurer org — the policy is underwritten by the plan/shipment-owner org.

**Notifications & PII**
- Finance now notifies org members: claim decisions, settlement created/cleared, policy issued (types route to shipment deep-links `wagon://shipment/:id`).
- `GET /loads/:id` masks `contactName`/`contactPhone` unless the caller owns the load or is its assigned transporter.

**Mobile**
- **Cross-platform ActionSheet** (modal list) replacing Android-capped 3-button `Alert.alert` for: 5-star rate-supplier, carrier-service picker (Forwarding + ShipmentDetail "Book carrier" now a real market booking, not a placeholder POST), container lifecycle (4 events).
- **Push-tap routing**: notification taps now forward the full payload (tripId/loadId/shipmentId) so stack routes get params on background taps; `wagon://shipment/:id` deep-link added.
- ShipmentDetail: proper error + retry state (was an infinite "Loading…"); Profile KYC row no longer crashes on missing `kycStatus`; Settings biometric toggle verifies device enrollment before enabling.
- **Data-bus refresh**: Home and Driver hub re-sync automatically when trips/finance change anywhere in the app.

### 10.5 Delivered: money-route soundness + session integrity

A fourth deep audit of money routes, sessions and mobile flows surfaced and fixed:

**Money routes (never collect-less / never double-collect / never write-off)**
- **Split-path escrow is now exact**: advance must equal the agreed advance; balance must complete the agreed rate to the rupee. Payout refuses unless the split path collected the FULL agreed rate (previously a ₹1 balance unlocked the full payout — the platform's shortfall).
- **Refunds are real provider calls**: cancel-trip, admin refund, and **load-cancel** now invoke `provider.refund()` (idempotent, per-capture, failure-recorded) instead of minting fake `succeeded` rows. `PaymentProvider` gained `refund` (mock + Razorpay).
- **Admin settlement-clear gates on success**: a failed capture stays `due` and is retryable (was written off as paid forever).
- **Claim settlements charge the liable org** (active insurer, else the booked carrier) — never the org that merely decided/reviewed the claim.
- **`createSettlement` bounds freight/commission obligations**: one per (shipment, type, payer, payee) and capped at the agreed booking rate — no minting unlimited duplicates.
- **Carrier-service booking is atomic**: slots decrement via conditional `updateMany({ availableSlots: { gt: 0 } })` so concurrent bookings can't oversell.
- **Insurance `issuePolicy` verifies the insurer org** (member + carrier/broker/other kind) unless the shipment owner self-covers.

**Sessions & auth**
- **Refresh-token reuse now revokes the whole family** (was a plain 401; the legitimate rotated pair kept working after theft).
- `/trips/accept` honors the **bidding deadline + invite shortlist** (was a direct bypass of the marketplace gates).
- **`setCapabilities` no longer 500s** on forwarder/warehouse/carrier-first selection (role derived only from UserRole-valid capabilities).
- **AI recommendations are org-scoped** for request/service entity types (was leaking every user's market/carrier agent output).
- **Market quote without a listing** now requires a matching-kind org (no silent primaryOrg fallback that let any org quote any demand kind).
- **Webhook SSRF**: private/reserved IP ranges and cloud-metadata hosts are always blocked (localhost still allowed in dev for local test receivers).
- **Chat threads** now return `otherUserId` so report/block/call work from the chat list.

**Mobile**
- **Session fix**: unified `wagon.session` storage key (was two keys — restored sessions always held a revoked old refresh token → permanent dead session after cold restart); a permanently-dead refresh now forces logout instead of sitting logged-in-but-erroring.
- **Tracking socket**: re-auths with the current access token and is torn down on logout (was a singleton frozen on the previous user's token → cross-account live-tracking leak).
- **Escrow pays the agreed booking rate** (snapshot), not the fare estimate — negotiated trips can now actually pay.
- **Wallet negatives render correctly** (`-₹…`); ShipmentDetail propose-plan / forward-order / file-claim prompt for real values (were hardcoded ₹1000s creating fake ledger rows).
- Deep-linked loads' **Bid button works** (was a no-op); PostLoadWizard **blocks publish on geocode failure** (was silently substituting Hyderabad→Chennai coords); KYC quest XP only on **identity approval** (was any single doc); invoices fetch in parallel; Bank screen has loading/error/retry.

### 10.6 Delivered: mint-proof economy + money-loop repair + tracking honesty

A fifth deep audit of the economy, money loop, and tracking surfaced and fixed:

**Economy / mint-proofing**
- **Gamification XP/cash can no longer be minted**: quest completion awards XP only on the *first* completion (atomic `updateMany` claim); the onboarding badge award is idempotent; `convertXpToCash` uses a conditional update so concurrent `state()` calls can't double-convert XP→cash.
- **Outbox relay actually retries**: `failed` messages are reclaimed and re-delivered (were parked forever); enqueue happens **before** the row is marked published so a crash re-delivers instead of losing the event (at-least-once).

**Security**
- **Webhook SSRF at delivery**: every dispatch resolves the host and rejects private/reserved IPs (v4 + v6, DNS-rebinding guard) and **never follows redirects** (a public URL can't 302 to `169.254.169.254`).
- **Masked-number leak fixed**: the relay number is now an opaque hash of the user id — the old format revealed 6 digits of the target's real mobile.
- `trips.accept` surfaces the unique-constraint race as a clean "already assigned" error (was an unhandled 500).

**Data integrity**
- **Plan `select` is race-safe** (atomic claim; two concurrent selects can't both win).
- **Cargo split enforces conservation**: parts must be positive and sum to the parent's weight/pieces; already-split units can't be split again.
- **Notification unread count is the real total** (was counting only within the last 50).
- Chat threads capped at 50 trips + composite `(tripId, createdAt)` index (was an unbounded N+1).
- Market `decompose` validates every leg's origin up front (was a 500 on a missing origin).

**Mobile — the core money loop is repaired**
- **Escrow/advance/balance payments now step-up** (fresh action OTP + optional biometric) as the backend requires, and the pay button is **supplier-gated** — previously the only money-in path failed 100% and payouts were permanently frozen.
- **Split payments are payable**: when a booking has advance/balance terms, the screen shows stage-specific "Pay advance" / "Pay balance" buttons.
- **api-client retries keep `x-action-token`** on the 401→refresh path (a step-up'd money action no longer loses its token and fails with "session expired").
- **Tracking honesty**: simulated points are tagged `simulated` end-to-end (the supplier sees "SIMULATED", not LIVE) and simulation is gated behind an explicit dev flag; LocationShare only mounts for the assigned transporter.
- **Drivers can execute trips**: `/trips/mine` now returns driver-assigned trips.
- **Passbook is role-aware**: suppliers see escrow/advance/balance as out and refunds as in; transporters see payouts as in — no more cross-side negative balances. Transporter trip money shows the **agreed booking rate**, not the fare estimate.
- Raise-Dispute splits issue-type from description; Finance "pending" excludes failed; KYC quest XP fires once per session; negotiation accept asks for confirmation; OTP error uses the right i18n key.

### 10.7 Delivered: settlement-integrity + deletion-safety + flow repair

A sixth deep audit of the money/settlement layer, deletion safety, and the least-covered screens surfaced and fixed:

**Settlement integrity**
- **`claim` settlements are guarded**: they require a real approved claim, are capped at the claim amount, and `clearSettlement` now requires the **payer's org** to authorize the real capture (a shipment owner can no longer mint a ₹10M obligation against an innocent org and capture it).
- **Every accepted market quote with an amount now creates a settlement** for all kinds (warehouse/forwarding/insurance get a canonical shipment) — providers of every kind are actually paid, not just transport.
- **Insurance premiums are billed**: issuing a policy with a premium creates a `premium` settlement (orderer → insurer).
- **Claim payouts are capped at policy coverage** (aggregate against prior payouts on the policy) and a second claim on an already-approved shipment is blocked (no policy draining).

**Deletion safety**
- **User deletion is soft + anonymized** (deactivate, scrub mobile/name, revoke sessions) — never a hard cascade that would destroy the *other* party's payout/escrow ledger through Load → Trip → Payment.

**Money/authorization edge cases**
- `submitQuote` requires a positive amount (a 0/negative quote would materialize a worthless settlement).
- **Truck availability syncs to the market listing** (pause ↔ live) and truck removal is blocked while committed to an active trip/booking.
- **Driver availability toggle no longer self-locks**: `setAvailability` resolves without the availability filter.
- **Booking confirm + negotiation accept are atomic**: `confirmBooking` claims the bid inside the truck-busy check (no TOCTOU double-book; no same-load double booking); negotiation accept atomically claims the offer and re-checks the load is open.
- **OTP send is throttled per-mobile** (30s cooldown + 5/hour via Redis) — no SMS bombing or OTP invalidation; **public load feed hides other bidders' quote amounts** (competitive-intelligence leak closed).
- **Programmatic market** attributes demand to the connector's org, not the acting member's primary org.

**Mobile flow repairs**
- **Raise Dispute no longer 400s**: the backend accepts `issueType` and persists it.
- **Trip-execution OTP gates on verification** (not just generation) with a "waiting for supplier" state — a mistyped code can be regenerated instead of blocking the trip forever.
- **"My requests" renders** (contract-shape fix); **consolidation booking** now books the consolidation with the chosen carrier (not an orphan shipment); **Decision Room** gates action buttons by bid status.
- **Insurance purchase completes**: "Accept & issue policy" calls cover-accept (the premium is billed).
- **Placeholder addresses eliminated**: Shipments/Planning/Plan proposal require real origin/destination (no 'Origin'/'Destination' sentinels in production data).
- **Claim approve asks for confirmation** (it mints a payable settlement); **bank-detail changes now step-up** (payout destination is a serious money action); Passbook "pending" excludes failed.

### 10.8 Delivered: payout-honesty + driver-recovery + stale-state fixes

A seventh deep audit of the money display, driver flows, and race-prone screens surfaced and fixed:

**Money honesty**
- **Approved claims can't double-payout a policy**: `decideClaim` rejects when a claim settlement already exists on the shipment, counts `due` settlements in the coverage aggregate, and only one open claim per shipment may exist at a time.
- **Load detail hides quote amounts** from non-owners (was leaking every competing bid to any authenticated user).
- **Refund failures are retried**: cancellation refunds run post-commit and a reconciliation sweep retries `failed` refunds every 60s — a provider failure never strands captured money.
- **Payout cashback uses the fresh `tripsCount`** (was the stale JWT value → cash minted on later payouts).
- **Home "pending payout" is net and gate-aware** (net − advance, delivered + no payout) instead of gross `booking.rate`.
- **Driver earnings use the agreed booking rate** (not the fare estimate) for negotiated trips.
- `updateShipment` reuses create-time validation (no negative weight/value or Invalid Date); `planning.decline` atomically clears `activePlanId` when declining the active plan.
- **Hot-path indexes** added on Payment (tripId+status, type+status), Settlement (payerId, payeeId, type+status), Claim (claimantId, handlerId), Trip (status, driverId), InsurancePolicy (insurerId).

**Driver recovery**
- **Driver endpoints no longer self-lock**: `home`/`myTrips`/`earnings`/`uploadPod` resolve the driver without the availability filter, so toggling offline never breaks the dashboard; the toggle rolls back on failure; a missing driver profile shows an explicit "ask your transporter" state with a disabled switch.

**Mobile stale-state / UX**
- **LoadFeed no longer sends duplicate `truckType` params** (the tab overrides the persisted filter — was a 400 → silent stale-cache fallback).
- **Pull-to-refresh spinner actually shows** on Home and Driver Home (fetch now returns a promise; refreshing cleared in `.finally`).
- **TripDetail refetches when `tripId` changes** (deps fixed — a second deep-link could show the previous trip's money/status).
- **Wallet "Withdraw" is honestly relabeled "Bank & payouts"** (no withdraw flow existed — the button just opened the bank editor).
- **Home "Need" opens the Market requests tab** (was the same listings tab as "Offer"); dead duplicate block removed; WalletHeader takes a currency prop; Passbook shows a distinct **failed** payment state.

### 10.9 Delivered: rate-binding + payout-release + delivery-confirmation

An eighth deep audit of the bidding→trips→payments chain and the classic delivery flow surfaced and fixed the last money-loop dead-ends:

**Money moves on the agreed number, and nobody is short-paid**
- **Direct accepts now bind the agreed rate**: the winning quote's amount becomes a `BookingSnapshot` on the trip (before quotes are cleared), so escrow/payout never fall back to the fare estimate for a direct accept.
- **Split-path advance no longer short-pays the transporter**: the advance is collected from the supplier but was never disbursed — the final payout is now the FULL net (the advance isn't silently deducted), matching what the supplier actually paid (advance + balance = agreed rate).
- **Admin cancel-load is complete**: it cancels active trips, refunds captured escrow/advance/balance, resets bids, and notifies the transporter (was leaving escrow stranded and a transporter hauling on a cancelled load).
- **Refund exceptions always persist a `failed` row** (a thrown provider error can no longer strand money invisibly — the reconciliation sweep retries it).
- **Admin claim decisions are guarded**: coverage-capped and no-double-settlement, matching the org path.
- Bids are **reset to withdrawn** on load cancel; `confirmBooking` rejects non-`posted` loads; `expireStaleLoads` protects `negotiating` bids; the stage machine flips `load.status` to `in_transit` on loading; payout + tracking-arrival events now carry the correct shipmentId through the outbox.

**Mobile — the delivery/payout loop now closes**
- **Supplier "Confirm delivery receipt"** unlocks payout (a pending POD previously blocked it forever, and the transporter had no recovery). Transporter surfaces now show "waiting for consignee confirmation" instead of a doomed payout button.
- **Onboarding gate consults the backend** (a skipped user is re-prompted until their profile is complete — no more permanent lockout).
- **TripDetail shows a booking-terms error + retry** instead of silently paying the fare estimate and getting rejected.
- **"My loads" uses `?mine=true`** so a both-capability user sees their own loads, not the whole network feed.
- **Driver-only sessions** hide the transporter-only POD/payout actions (no more 403 dead-ends); **cancelled/unknown-stage trips** don't show a bogus "Mark next"; OTP generation shows the code only in dev builds.
- Home supplier money includes split-path payments; EnablementFinance actions are busy-guarded; Driver Home shows a retry on network errors.

### 10.10 Delivered: double-bill closure + negotiation/bidding flow repair

A ninth deep audit of the money edges and the negotiation/bidding flows surfaced and fixed:

**Money: no double-billing, no silent bypasses**
- **Escrow and the advance+balance split are mutually exclusive** — a trip is paid one way or the other, so a supplier can no longer be billed up to 2× the agreed rate (`captureEscrow` rejects the second path once the first has captured).
- **Claim settlements can't be duplicated**: the `claim` branch now enforces one due/cleared claim settlement per shipment and caps at the liable policy's remaining coverage (was able to drain a policy repeatedly).
- **Platform-funded (null-payer) settlements require admin** to clear — any org member with shipment access can no longer trigger a capture on them.
- **`primaryOrg` is deterministic** (prefers the role-kind org, else earliest membership) so money/org-binding writes never land on a DB-arbitrary org.
- **Fresh OTP resets its attempt counter** (5 wrong guesses no longer lock a regenerated code); **carrier-quote acceptance** no longer 500s on shipment-less requester orgs (canonical shipment created).
- **Admin force-complete records a confirmed POD** so captured escrow can actually be released; **dispute resolution now carries an outcome** (`release | block | partial`) that gates payout after resolution.
- **Re-submitting a bid preserves the supplier's decision state** (a re-bid no longer silently downgrades shortlisted/negotiating to pending).

**Mobile: negotiation + bidding flows close**
- **Transporter can respond to a counteroffer** — MyBids rows in `negotiating` get a "Respond to counteroffer →" action routing to Negotiation (the endpoint existed but was unreachable).
- **Decision Room shows Confirm/Reject for `accepted` bids** and "Awaiting transporter confirmation" for `booking_pending` (was a no-button dead-end after negotiation).
- **Withdraw only shows for `pending`** bids (shortlisted was always rejected by the backend); **Marketplace mode re-syncs** when the user switches supplier/transporter.
- **Trip execution OTP button disappears after generation** (regenerating no longer invalidates the code the supplier is typing); **TripDetail refetches + emits data-bus after pay/confirm** and gates OTP buttons to the supplier; confirm-receipt shows only when a POD exists.
- **Passbook re-syncs on money changes** (data-bus subscription); **PostLoadWizard never publishes the wrong material** (explicit resolution or an error, no silent fallback).

---

## Research sources

**Standards:** UN/CEFACT SCRDM & MMT RDM (vocab.unece.org, github.com/uncefact/spec-JSONschema) · WCO Data Model (wcoomd.org, datamodel.wcoomd.org) · DCSA Track & Trace v2/v3 (github.com/dcsaorg/DCSA-OpenAPI) · IATA ONE Record 2.2 (onerecord.iata.org, github.com/IATA-Cargo/ONE-Record)

**Companies:** Flexport (Wikipedia/CNBC/Bloomberg/TechCrunch) · Project44 (ETA reimagined) · FourKites (About) · Terminal Industries (execution gap) · Freightos (Wikipedia) · uShip (Bowery Capital) · Raft (TechCrunch) · Loadsmart (10-year) · Shipwell (TechCrunch/Gartner) · Manbang/FTA (CapitalG/Reuters/SCMP) · Convoy (CNBC/Wikipedia) · Cargonexx (Dealroom/Insolvenz-Radar) · Trunkrs (Silicon Canals/RouteLogic)

**Architecture:** microservices.io outbox · Debezium outbox · Temporal docs · XState · NATS JetStream · Memgraph graph-vs-relational · Azure SaaS tenancy · Stripe idempotency · Anthropic "Building Effective Agents"
