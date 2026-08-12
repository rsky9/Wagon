# Wagon → Universal Logistics Operating System — Execution Blueprint

*Researched and grounded against the 28-page ULOS thesis (12 Aug 2026), the current Wagon codebase, live logistics data-model standards, and the real execution histories of Flexport, Project44, FourKites, Freightos, uShip, Raft, Loadsmart, Manbang, Convoy, Cargonexx, and Trunkrs.*

**Status: experimental — do not merge to `main` until validated.**

---

## 1. The thesis in one paragraph

Build a **Universal Logistics Operating System (ULOS)**: one canonical logistics graph (`Party ↔ Cargo ↔ Handling Unit ↔ Equipment ↔ Location ↔ Shipment ↔ Leg ↔ Event ↔ Document ↔ Contract ↔ Money ↔ Outcome`) that coordinates road, rail, ocean, air, inland water, warehousing, forwarding, customs, financing, claims and settlement — while letting every participant keep their own ERP/TMS/WMS/forwarding software. The platform owns the **canonical operational state and orchestration**; external systems become **adapters**.

**Core abstraction:** `Cargo → Handling Unit → Equipment → Location → Leg → Shipment → Network → Event → Decision → Money`

**North star:** a user describes the outcome they need; the system turns intent into a feasible plan, procures capabilities, coordinates execution, handles exceptions and closes the commercial transaction.

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

**Verdict: Wagon is a credible Phase 0–1 (Foundation + Road wedge) implementation — exactly where the thesis says to start.**

---

## 6. The execution roadmap (opinionated, grounded in research)

### Phase 0 — Foundation (do first; 2–3 weeks)
1. **Generalize `Load` → `Shipment` + `Leg[]`** (the keystone). Keep `Load`/`Trip`/`Bid` as the road specialization — nothing breaks.
2. **Add the canonical `Event` model + outbox** (`event_type`, `entity_id`, `shipment_id`, `occurred_at`, `source`, `actor`, `evidence`, `correlation_id`, `schema_version`) written in the same transaction as domain writes.
3. **Add `Organization`/`Party` + org membership** so forwarders/warehouses become first-class actors.
4. **Event taxonomy** aligned to DCSA/ONE Record codes.
5. Exit: core logistics state can be represented, authorized, changed and audited.

### Phase 1 — Road wedge (your current product, hardened)
Your existing `Load → Bid → Trip` flow + driver app + GPS/ETA + POD + control tower **is** Phase 1. The research says: **keep it narrow, make it denser, prove corridor liquidity.** Don't expand modes until road density is real.

### Phase 2 — Storage/domestic (the execution-gap moat)
- `Facility` + warehouse ops (appointment → gate-in → receive → put-away → pick → stage → load → gate-out).
- Yard/dock/appointment — **this is where Project44/FourKites are heading and India is unbuilt.**
- Domestic multimodal (road + rail intermodal).

### Phase 3 — Forwarding/international
- Forwarder workspace (orders, consolidation, carrier procurement, bookings, container mgmt, customs, margins).
- Ocean/air booking + container lifecycle + customs/broker workflows + trade documents + port/terminal integration.

### Phase 4 — Multimodal
- Rail, ocean, air, inland/coastal water, transload, intermodal optimization, network planning, **re-planning when a leg fails**.

### Phase 5 — Integration ecosystem
- Connector marketplace, API/EDI gateway, partner SDK, webhooks, ERP/TMS/WMS ecosystem, IoT/telematics.

### Phase 6 — Finance/risk
- Insurance partners, claims automation, settlement, reconciliation, financing integrations, risk scoring.

### Phase 7 — AI
- Planning recommendations, procurement agent, exception agent, ETA intelligence, document agent, network optimization, bounded autonomy (with the guardrails in §4.6).

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

---

## 8. Failure modes to design against (from the thesis + research)

- **Marketplace cold start** → launch corridor-first with anchor demand + quality supply.
- **Integration overload** → canonical model + connector SDK + standards; long-tail via file/manual adapters.
- **Becoming a generic TMS** → keep network orchestration as the product center.
- **AI overreach** → deterministic validation, permissions, approval thresholds, evidence, audit.
- **Data fragmentation** → canonical IDs, domain ownership, event contracts, master-data governance.
- **Operational complexity** → universal primitives first; mode-specific extensions second.
- **Regulatory exposure** → country modules + licensed partners; never pretend the platform is the regulator.
- **Fraud** → KYB/KYC, device signals, payment controls, anomaly detection, evidence, dispute workflows.
- **Working-capital risk** → separate marketplace orchestration from balance-sheet exposure (your escrow model already does this well).

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

---

## Research sources

**Standards:** UN/CEFACT SCRDM & MMT RDM (vocab.unece.org, github.com/uncefact/spec-JSONschema) · WCO Data Model (wcoomd.org, datamodel.wcoomd.org) · DCSA Track & Trace v2/v3 (github.com/dcsaorg/DCSA-OpenAPI) · IATA ONE Record 2.2 (onerecord.iata.org, github.com/IATA-Cargo/ONE-Record)

**Companies:** Flexport (Wikipedia/CNBC/Bloomberg/TechCrunch) · Project44 (ETA reimagined) · FourKites (About) · Terminal Industries (execution gap) · Freightos (Wikipedia) · uShip (Bowery Capital) · Raft (TechCrunch) · Loadsmart (10-year) · Shipwell (TechCrunch/Gartner) · Manbang/FTA (CapitalG/Reuters/SCMP) · Convoy (CNBC/Wikipedia) · Cargonexx (Dealroom/Insolvenz-Radar) · Trunkrs (Silicon Canals/RouteLogic)

**Architecture:** microservices.io outbox · Debezium outbox · Temporal docs · XState · NATS JetStream · Memgraph graph-vs-relational · Azure SaaS tenancy · Stripe idempotency · Anthropic "Building Effective Agents"
