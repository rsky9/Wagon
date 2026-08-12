"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, StatusBadge, Th, Td, SkeletonRows } from "../../components/ui";

interface OrgRow {
  id: string;
  name: string;
  kind: string;
  countryCode: string;
  verified: boolean;
  shipmentCount: number;
  members: { id: string; role: string; user: { name: string | null; mobile: string } }[];
  createdAt: string;
}

interface ShipmentRow {
  id: string;
  ref: string;
  commodity: string | null;
  status: string;
  mode: string;
  ownerOrg?: { id: string; name: string } | null;
  legs: { id: string; mode: string }[];
  createdAt: string;
}

interface PlanRow {
  id: string;
  ref: string;
  source: string;
  status: string;
  cost: number | null;
  etaHours: number | null;
  shipment: { id: string; ref: string; commodity: string | null } | null;
  createdAt: string;
}

interface ClaimRow {
  id: string;
  reason: string;
  amount: number | null;
  status: string;
  shipment: { ref: string } | null;
  claimant?: { name: string } | null;
  createdAt: string;
}

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  status: string;
  eventTypes: string[];
  org: { name: string } | null;
  createdAt: string;
}

interface FacilityRow {
  id: string;
  name: string;
  kind: string;
  city: string | null;
  operator?: { name: string } | null;
  capacitySlots: number;
}

interface SettlementRow {
  id: string;
  type: string;
  amount: number | null;
  status: string;
  shipment: { ref: string } | null;
  payer?: { name: string } | null;
  payee?: { name: string } | null;
}

interface DeliveryRow {
  id: string;
  eventCode: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  subscription: { name: string; org: { name: string } | null } | null;
  createdAt: string;
}

type Tab = "orgs" | "shipments" | "plans" | "claims" | "webhooks" | "facilities" | "settlements" | "deliveries";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "orgs", label: "Organizations" },
  { key: "shipments", label: "Shipments" },
  { key: "plans", label: "Plans" },
  { key: "claims", label: "Claims" },
  { key: "webhooks", label: "Webhooks" },
  { key: "deliveries", label: "Webhook deliveries" },
  { key: "facilities", label: "Facilities" },
  { key: "settlements", label: "Settlements" },
];

function ActionBtn({ label, tone = "orange", disabled, onClick }: { label: string; tone?: "orange" | "green" | "red" | "slate"; disabled?: boolean; onClick: () => void }) {
  const tones: Record<string, string> = {
    orange: "bg-orange-500 hover:bg-orange-600 text-white",
    green: "bg-emerald-500 hover:bg-emerald-600 text-white",
    red: "bg-red-500 hover:bg-red-600 text-white",
    slate: "bg-slate-500 hover:bg-slate-600 text-white",
  };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-semibold transition ${tones[tone]} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  );
}

export default function Enablement() {
  const [tab, setTab] = useState<Tab>("orgs");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try { await fn(); fetchTab(); }
    catch (e: any) { setError(e.message ?? "Action failed"); }
    finally { setBusy(null); }
  };

  const fetchTab = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === "orgs") {
        const r = await api.get<{ organizations: OrgRow[] }>("/admin/organizations");
        setOrgs(r.organizations);
      } else if (tab === "shipments") {
        const r = await api.get<{ shipments: ShipmentRow[] }>("/admin/shipments");
        setShipments(r.shipments);
      } else if (tab === "plans") {
        const r = await api.get<{ plans: PlanRow[] }>("/admin/plans");
        setPlans(r.plans);
      } else if (tab === "claims") {
        const r = await api.get<{ claims: ClaimRow[] }>("/admin/claims");
        setClaims(r.claims);
      } else if (tab === "webhooks") {
        const r = await api.get<{ webhooks: WebhookRow[] }>("/admin/webhooks");
        setWebhooks(r.webhooks);
      } else if (tab === "settlements") {
        const r = await api.get<{ settlements: SettlementRow[] }>("/admin/settlements");
        setSettlements(r.settlements);
      } else if (tab === "deliveries") {
        const r = await api.get<{ deliveries: DeliveryRow[] }>("/admin/webhook-deliveries");
        setDeliveries(r.deliveries);
      } else {
        const r = await api.get<{ facilities: FacilityRow[] }>("/admin/facilities");
        setFacilities(r.facilities);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchTab() }, [fetchTab]);

  return (
    <ShellLayout>
      <PageHeader title="Enablement" subtitle="Orgs · shipments · plans · claims · webhooks · facilities · settlements" />
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === t.key
                ? "bg-orange-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 p-3 text-sm">{error}</div>}

      {loading ? (
        <SkeletonRows rows={8} cols={6} />
      ) : tab === "orgs" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Name</Th><Th>Kind</Th><Th>Country</Th><Th>Verified</Th><Th>Shipments</Th><Th>Members</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <Td>{o.name}</Td>
                  <Td><StatusBadge status={o.kind} /></Td>
                  <Td>{o.countryCode}</Td>
                  <Td>{o.verified ? <StatusBadge status="verified" /> : <StatusBadge status="unverified" />}</Td>
                  <Td>{o.shipmentCount}</Td>
                  <Td>{o.members.length}</Td>
                  <Td>
                    {o.verified
                      ? <ActionBtn label="Unverify" tone="slate" disabled={busy === `org:${o.id}`} onClick={() => run(`org:${o.id}`, () => api.post(`/admin/organizations/${o.id}/verify`, { verified: false }))} />
                      : <ActionBtn label="Verify" tone="green" disabled={busy === `org:${o.id}`} onClick={() => run(`org:${o.id}`, () => api.post(`/admin/organizations/${o.id}/verify`, { verified: true }))} />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "shipments" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Ref</Th><Th>Commodity</Th><Th>Status</Th><Th>Mode</Th><Th>Owner</Th><Th>Legs</Th><Th>Actions</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shipments.map((s) => (
                <tr key={s.id}>
                  <Td className="font-mono">{s.ref}</Td>
                  <Td>{s.commodity ?? "—"}</Td>
                  <Td><StatusBadge status={s.status} /></Td>
                  <Td>{s.mode}</Td>
                  <Td>{s.ownerOrg?.name ?? "—"}</Td>
                  <Td>{s.legs.length}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {["planned", "booked", "in_transit", "delivered"].filter((st) => st !== s.status).slice(0, 2).map((st) => (
                        <ActionBtn key={st} label={st} disabled={busy === `ship:${s.id}`} onClick={() => run(`ship:${s.id}`, () => api.patch(`/admin/shipments/${s.id}/status`, { status: st }))} />
                      ))}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "plans" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Ref</Th><Th>Source</Th><Th>Status</Th><Th>Cost</Th><Th>ETA (h)</Th><Th>Shipment</Th><Th>Actions</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {plans.map((p) => (
                <tr key={p.id}>
                  <Td className="font-mono">{p.ref}</Td>
                  <Td>{p.source}</Td>
                  <Td><StatusBadge status={p.status} /></Td>
                  <Td>{p.cost != null ? `₹${p.cost.toLocaleString("en-IN")}` : "—"}</Td>
                  <Td>{p.etaHours ?? "—"}</Td>
                  <Td>{p.shipment?.ref ?? "—"}</Td>
                  <Td>
                    {p.status !== "declined" && (
                      <ActionBtn label="Cancel plan" tone="red" disabled={busy === `plan:${p.id}`} onClick={() => run(`plan:${p.id}`, () => api.post(`/admin/plans/${p.id}/cancel`))} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "claims" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Reason</Th><Th>Amount</Th><Th>Status</Th><Th>Shipment</Th><Th>Claimant</Th><Th>Actions</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {claims.map((c) => (
                <tr key={c.id}>
                  <Td>{c.reason}</Td>
                  <Td>{c.amount != null ? `₹${c.amount.toLocaleString("en-IN")}` : "—"}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td>{c.shipment?.ref ?? "—"}</Td>
                  <Td>{c.claimant?.name ?? "—"}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {c.status !== "approved" && (
                        <ActionBtn label="Approve" tone="green" disabled={busy === `claim:${c.id}`} onClick={() => run(`claim:${c.id}`, () => api.post(`/admin/claims/${c.id}/decide`, { decision: "approved" }))} />
                      )}
                      {c.status !== "rejected" && (
                        <ActionBtn label="Reject" tone="red" disabled={busy === `claim:${c.id}`} onClick={() => run(`claim:${c.id}`, () => api.post(`/admin/claims/${c.id}/decide`, { decision: "rejected" }))} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "webhooks" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Name</Th><Th>URL</Th><Th>Status</Th><Th>Events</Th><Th>Org</Th><Th>Actions</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {webhooks.map((w) => (
                <tr key={w.id}>
                  <Td>{w.name}</Td>
                  <Td className="font-mono">{w.url}</Td>
                  <Td><StatusBadge status={w.status} /></Td>
                  <Td>{w.eventTypes.join(", ")}</Td>
                  <Td>{w.org?.name ?? "—"}</Td>
                  <Td>
                    {w.status === "active"
                      ? <ActionBtn label="Pause" tone="slate" disabled={busy === `wh:${w.id}`} onClick={() => run(`wh:${w.id}`, () => api.patch(`/admin/webhooks/${w.id}/status`, { status: "paused" }))} />
                      : <ActionBtn label="Resume" tone="green" disabled={busy === `wh:${w.id}`} onClick={() => run(`wh:${w.id}`, () => api.patch(`/admin/webhooks/${w.id}/status`, { status: "active" }))} />}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "deliveries" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Event</Th><Th>Status</Th><Th>Attempts</Th><Th>HTTP</Th><Th>Webhook</Th><Th>Org</Th><Th>Actions</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {deliveries.map((d) => (
                <tr key={d.id}>
                  <Td className="font-mono">{d.eventCode}</Td>
                  <Td><StatusBadge status={d.status} /></Td>
                  <Td>{d.attempts}</Td>
                  <Td>{d.responseStatus ?? "—"}</Td>
                  <Td>{d.subscription?.name ?? "—"}</Td>
                  <Td>{d.subscription?.org?.name ?? "—"}</Td>
                  <Td>
                    {d.status !== "sent" && (
                      <ActionBtn label="Retry" tone="orange" disabled={busy === `del:${d.id}`} onClick={() => run(`del:${d.id}`, () => api.post(`/admin/webhook-deliveries/${d.id}/retry`))} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "settlements" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Type</Th><Th>Amount</Th><Th>Status</Th><Th>Shipment</Th><Th>Payer</Th><Th>Payee</Th><Th>Actions</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {settlements.map((st) => (
                <tr key={st.id}>
                  <Td>{st.type}</Td>
                  <Td>{st.amount != null ? `₹${st.amount.toLocaleString("en-IN")}` : "—"}</Td>
                  <Td><StatusBadge status={st.status} /></Td>
                  <Td>{st.shipment?.ref ?? "—"}</Td>
                  <Td>{st.payer?.name ?? "—"}</Td>
                  <Td>{st.payee?.name ?? "—"}</Td>
                  <Td>
                    {st.status !== "cleared" && (
                      <ActionBtn label="Clear" tone="green" disabled={busy === `set:${st.id}`} onClick={() => run(`set:${st.id}`, () => api.post(`/admin/settlements/${st.id}/clear`))} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Name</Th><Th>Kind</Th><Th>City</Th><Th>Operator</Th><Th>Slots</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {facilities.map((f) => (
                <tr key={f.id}>
                  <Td>{f.name}</Td>
                  <Td><StatusBadge status={f.kind} /></Td>
                  <Td>{f.city ?? "—"}</Td>
                  <Td>{f.operator?.name ?? "—"}</Td>
                  <Td>{f.capacitySlots}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ShellLayout>
  );
}
