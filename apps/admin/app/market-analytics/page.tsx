"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, StatCard, Card, Th, Td, SkeletonRows, EmptyRow } from "../../components/ui";

interface MarketAnalytics {
  totals: { listings: number; requests: number; quotes: number; ratings: number; bookings: number };
  topLanes: Array<{ origin: string; destination: string; mode: string; volume: number }>;
  trend7d: { requests: number; quotes: number };
  liquidityRatio: number;
}

interface CarrierService {
  id: string;
  status: string;
  originRef?: string | null;
  destinationRef?: string | null;
  mode?: string;
  vessel?: string | null;
  flight?: string | null;
  availableSlots: number;
  totalSlots: number;
  carrierOrg: { name: string };
}

export default function MarketAnalyticsPage() {
  const [data, setData] = useState<MarketAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<CarrierService[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    api
      .get<MarketAnalytics>("/admin/market/analytics")
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load market analytics"))
      .finally(() => setLoading(false));

  const loadServices = () =>
    api
      .get<{ services: CarrierService[] }>("/admin/market/carrier-services")
      .then((r) => setServices(r.services))
      .catch(() => {});

  useEffect(() => {
    load();
    loadServices();
  }, []);

  const cancelService = (id: string) => {
    setBusy(`cancel:${id}`);
    api
      .post<{ service: CarrierService }>(`/admin/market/carrier-services/${id}/cancel`)
      .then(() => loadServices())
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to cancel service"))
      .finally(() => setBusy(null));
  };

  return (
    <ShellLayout>
      <PageHeader title="Market Analytics" subtitle="Cross-type marketplace liquidity, lanes and activity" />

      {error && <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

      {loading ? (
        <SkeletonRows rows={6} cols={4} />
      ) : !data ? null : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <StatCard label="Listings" value={String(data.totals.listings)} icon="📦" tone="orange" />
            <StatCard label="Requests" value={String(data.totals.requests)} icon="🙋" tone="sky" />
            <StatCard label="Quotes" value={String(data.totals.quotes)} icon="💬" tone="emerald" />
            <StatCard label="Carrier bookings" value={String(data.totals.bookings)} icon="🚢" tone="slate" />
            <StatCard label="Ratings" value={String(data.totals.ratings)} icon="⭐" tone="amber" />
            <StatCard label="Liquidity ratio" value={`${data.liquidityRatio}%`} icon="💧" tone={data.liquidityRatio >= 60 ? "green" : "red"} sub="quotes per request" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">7-day activity</h3>
              <div className="flex gap-6">
                <div>
                  <div className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-200">{data.trend7d.requests}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">new requests</div>
                </div>
                <div>
                  <div className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-200">{data.trend7d.quotes}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">quotes submitted</div>
                </div>
              </div>
            </Card>

            <Card className="p-5 lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Top lanes by volume</h3>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><Th>Lane</Th><Th>Mode</Th><Th>Volume</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.topLanes.length === 0 && <EmptyRow colSpan={3}>No lane activity yet.</EmptyRow>}
                  {data.topLanes.map((l) => (
                    <tr key={`${l.origin}-${l.destination}`}>
                      <Td>{l.origin} → {l.destination}</Td>
                      <Td><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{l.mode}</span></Td>
                      <Td className="font-semibold">{l.volume}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">Carrier services (vessel/flight) moderation</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr><Th>Route</Th><Th>Mode</Th><Th>Carrier</Th><Th>Slots</Th><Th>Status</Th><Th>&nbsp;</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {services.length === 0 && <EmptyRow colSpan={6}>No carrier services yet.</EmptyRow>}
                {services.map((s) => (
                  <tr key={s.id}>
                    <Td>{s.originRef ?? "—"} → {s.destinationRef ?? "—"}</Td>
                    <Td><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{s.mode}</span></Td>
                    <Td>{s.carrierOrg.name}</Td>
                    <Td>{s.availableSlots}/{s.totalSlots}</Td>
                    <Td><span className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase ${s.status === "cancelled" ? "bg-red-100 text-red-700" : s.status === "sold_out" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{s.status}</span></Td>
                    <Td className="text-right">
                      {s.status !== "cancelled" && (
                        <button
                          onClick={() => cancelService(s.id)}
                          disabled={busy === `cancel:${s.id}`}
                          className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 dark:bg-red-500/10 dark:text-red-400"
                        >
                          {busy === `cancel:${s.id}` ? "…" : "Cancel"}
                        </button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </ShellLayout>
  );
}