"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, StatCard, SkeletonRows } from "../../components/ui";

interface OpsData {
  trips: { total: number; inTransit: number; delivered: number; cancelled: number; onTimeRate: number };
  loads: Record<string, number>;
  containers: { total: number; status: Record<string, number>; utilization: number };
  yard: { total: number; completed: number; open: number; utilization: number };
  finance: { invoicesTotal: number; invoicesPaid: number; invoicesOutstanding: number; gmv: number; avgSettlementHrs: number; settlementsDue: number };
  exceptions: { open: number };
  edi: { last7Days: number; inbound: number; outbound: number };
  modeMix: Record<string, number>;
  loadsLast7Days: number;
  tripsLast7Days: number;
  throughput: Record<string, { total: number; done: number; open: number; last7Days: number }>;
  funnel: { posted: number; quoted: number; booked: number; delivered: number; quoteRate: number; bookingRate: number; deliveryRate: number; quoteToBook: number; bookToDeliver: number };
  market: { requests: number; quotes: number };
}

const fmt = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export default function Analytics() {
  const [data, setData] = useState<OpsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOps = useCallback(() => {
    api
      .get<OpsData>("/analytics/ops")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load analytics"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchOps();
  }, [fetchOps]);

  const loadEntries = Object.entries(data?.loads ?? {});
  const containerEntries = Object.entries(data?.containers.status ?? {});
  const modeEntries = Object.entries(data?.modeMix ?? {});

  return (
    <ShellLayout>
      <PageHeader title="Network Analytics" subtitle="Cross-domain operational health: trips, yard, containers, finance, exceptions and integration throughput" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading || !data ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={8} cols={4} />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Active trips" value={String(data.trips.inTransit)} icon="🚛" tone="blue" sub={`${data.trips.total} total`} />
            <StatCard label="On-time rate" value={`${(data.trips.onTimeRate * 100).toFixed(0)}%`} icon="⏱️" tone="emerald" sub={`${data.trips.delivered} delivered`} />
            <StatCard label="Open exceptions" value={String(data.exceptions.open)} icon="⚠️" tone="red" />
            <StatCard label="GMV (invoiced)" value={`₹${fmt(data.finance.gmv)}`} icon="💰" tone="orange" sub={`${data.finance.invoicesOutstanding} outstanding`} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Loads by status</h3>
              <div className="space-y-1.5">
                {loadEntries.length === 0 && <div className="text-xs text-slate-400">No loads.</div>}
                {loadEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-slate-500">{k}</span>
                    <span className="font-semibold tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400 dark:border-slate-800">
                {data.loadsLast7Days} new loads in last 7 days
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Containers</h3>
              <div className="space-y-1.5">
                {containerEntries.length === 0 && <div className="text-xs text-slate-400">No containers.</div>}
                {containerEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-slate-500">{k.replace(/_/g, " ")}</span>
                    <span className="font-semibold tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400 dark:border-slate-800">
                Utilization {(data.containers.utilization * 100).toFixed(0)}%
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Mode mix</h3>
              <div className="space-y-1.5">
                {modeEntries.length === 0 && <div className="text-xs text-slate-400">No legs.</div>}
                {modeEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-slate-500">{k.replace(/_/g, " ")}</span>
                    <span className="font-semibold tabular-nums">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400 dark:border-slate-800">
                EDI last 7d: <span className="font-semibold">{data.edi.last7Days}</span> ({data.edi.inbound} in / {data.edi.outbound} out)
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Yard & docks</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-2xl font-bold tabular-nums">{data.yard.open}</div>
                  <div className="text-[11px] text-slate-500">open slots</div>
                </div>
                <div className="rounded bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-2xl font-bold tabular-nums">{(data.yard.utilization * 100).toFixed(0)}%</div>
                  <div className="text-[11px] text-slate-500">utilization</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-400">{data.yard.completed} completed of {data.yard.total} appointments</div>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Invoicing</h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-xl font-bold tabular-nums">{data.finance.invoicesTotal}</div>
                  <div className="text-[11px] text-slate-500">total</div>
                </div>
                <div className="rounded bg-emerald-50 p-3 dark:bg-emerald-900/30">
                  <div className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-300">{data.finance.invoicesPaid}</div>
                  <div className="text-[11px] text-slate-500">paid</div>
                </div>
                <div className="rounded bg-amber-50 p-3 dark:bg-amber-900/30">
                  <div className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-300">{data.finance.invoicesOutstanding}</div>
                  <div className="text-[11px] text-slate-500">open</div>
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Settlement</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-2xl font-bold tabular-nums">{data.finance.avgSettlementHrs}</div>
                  <div className="text-[11px] text-slate-500">avg cycle (hrs)</div>
                </div>
                <div className="rounded bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-2xl font-bold tabular-nums">{data.finance.settlementsDue}</div>
                  <div className="text-[11px] text-slate-500">due now</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-400">Clearance speed drives cash-flow liquidity</div>
            </Card>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Task throughput by capability</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {Object.entries(data.throughput ?? {}).map(([role, t]) => (
                <Card key={role}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize text-slate-700 dark:text-slate-300">{role}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">{t.done} done</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold tabular-nums">{t.total}</div>
                      <div className="text-[10px] text-slate-500">total</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400">{t.open}</div>
                      <div className="text-[10px] text-slate-500">open</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums">{t.last7Days}</div>
                      <div className="text-[10px] text-slate-500">7d</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Load funnel · posted → delivered</h3>
              <div className="space-y-2">
                <Bar label="Posted" value={data.funnel.posted} total={data.funnel.posted} />
                <Bar label="Quoted" value={data.funnel.quoted} total={data.funnel.posted} tone="bg-sky-500" />
                <Bar label="Booked" value={data.funnel.booked} total={data.funnel.posted} tone="bg-amber-500" />
                <Bar label="Delivered" value={data.funnel.delivered} total={data.funnel.posted} tone="bg-emerald-500" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded bg-slate-50 p-2 dark:bg-slate-800">
                  <span className="font-bold tabular-nums">{data.funnel.quoteRate}%</span> quoted
                </div>
                <div className="rounded bg-slate-50 p-2 dark:bg-slate-800">
                  <span className="font-bold tabular-nums">{data.funnel.bookingRate}%</span> booked
                </div>
                <div className="rounded bg-slate-50 p-2 dark:bg-slate-800">
                  <span className="font-bold tabular-nums">{data.funnel.deliveryRate}%</span> delivered
                </div>
                <div className="rounded bg-slate-50 p-2 dark:bg-slate-800">
                  <span className="font-bold tabular-nums">{data.funnel.quoteToBook}%</span> quote→book
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Marketplace activity</h3>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-2xl font-bold tabular-nums">{data.market.requests}</div>
                  <div className="text-[11px] text-slate-500">shipment requests</div>
                </div>
                <div className="rounded bg-slate-50 p-3 dark:bg-slate-800">
                  <div className="text-2xl font-bold tabular-nums">{data.market.quotes}</div>
                  <div className="text-[11px] text-slate-500">quotes submitted</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-400">Cross-capability task routing activity</div>
            </Card>
          </div>
        </div>
      )}
    </ShellLayout>
  );
}

function Bar({ label, value, total, tone = "bg-slate-500" }: { label: string; value: number; total: number; tone?: string }) {
  const pct = total ? Math.max(4, (value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-slate-500">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold tabular-nums">{value}</span>
    </div>
  );
}