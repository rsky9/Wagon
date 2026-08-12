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

type Tab = "orgs" | "shipments" | "plans" | "claims" | "webhooks" | "facilities";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "orgs", label: "Organizations" },
  { key: "shipments", label: "Shipments" },
  { key: "plans", label: "Plans" },
  { key: "claims", label: "Claims" },
  { key: "webhooks", label: "Webhooks" },
  { key: "facilities", label: "Facilities" },
];

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
      <PageHeader title="Enablement" subtitle="Orgs · shipments · plans · claims · webhooks · facilities" />
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
                <Th>Name</Th><Th>Kind</Th><Th>Country</Th><Th>Verified</Th><Th>Shipments</Th><Th>Members</Th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "shipments" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Ref</Th><Th>Commodity</Th><Th>Status</Th><Th>Mode</Th><Th>Owner</Th><Th>Legs</Th></tr>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "plans" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Ref</Th><Th>Source</Th><Th>Status</Th><Th>Cost</Th><Th>ETA (h)</Th><Th>Shipment</Th></tr>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "claims" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Reason</Th><Th>Amount</Th><Th>Status</Th><Th>Shipment</Th><Th>Claimant</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {claims.map((c) => (
                <tr key={c.id}>
                  <Td>{c.reason}</Td>
                  <Td>{c.amount != null ? `₹${c.amount.toLocaleString("en-IN")}` : "—"}</Td>
                  <Td><StatusBadge status={c.status} /></Td>
                  <Td>{c.shipment?.ref ?? "—"}</Td>
                  <Td>{c.claimant?.name ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === "webhooks" ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr><Th>Name</Th><Th>URL</Th><Th>Status</Th><Th>Events</Th><Th>Org</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {webhooks.map((w) => (
                <tr key={w.id}>
                  <Td>{w.name}</Td>
                  <Td className="font-mono">{w.url}</Td>
                  <Td><StatusBadge status={w.status} /></Td>
                  <Td>{w.eventTypes.join(", ")}</Td>
                  <Td>{w.org?.name ?? "—"}</Td>
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
