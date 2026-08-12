"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ShellLayout } from "../components/ShellLayout";
import { StatCard, Card, PageHeader, SkeletonRows } from "../components/ui";

interface StatusCount {
  status: string;
  count: number;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface DashboardData {
  loadsThisWeek: number;
  matchRate: number;
  activeUsers: number;
  disputesOpen: number;
  statusBreakdown: StatusCount[];
  weeklyTrend: TrendPoint[];
}

interface EnablementData {
  organizations: number;
  shipments: number;
  plans: number;
  claims: number;
  claimOpen: number;
  webhookDeliveries: number;
  webhookFailed: number;
  settlements: number;
  facilities: number;
  consolidations: number;
}

const STATUS_COLORS: Record<string, string> = {
  posted: "#3b82f6",
  interested: "#f59e0b",
  accepted: "#10b981",
  in_transit: "#f97316",
  delivered: "#059669",
  cancelled: "#94a3b8",
};

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [enablement, setEnablement] = useState<EnablementData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DashboardData>("/admin/dashboard")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load dashboard"));
    api
      .get<EnablementData>("/admin/enablement-dashboard")
      .then(setEnablement)
      .catch(() => {});
  }, []);

  const maxTrend = Math.max(1, ...(data?.weeklyTrend.map((t) => t.count) ?? [1]));

  return (
    <ShellLayout>
      <PageHeader title="Dashboard" subtitle="Live platform overview" />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* Hero strip */}
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-orange-950 p-6 text-white">
        <div className="pointer-events-none absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-orange-500/20 to-transparent" />
        <div className="relative">
          <div className="text-sm font-medium text-slate-300">Platform pulse</div>
          <div className="mt-1 text-3xl font-extrabold tracking-tight">
            {data ? `${data.activeUsers.toLocaleString()} active users` : "Loading…"}
          </div>
          <div className="mt-2 text-sm text-slate-400">
            {data ? `${data.loadsThisWeek} loads this week · ${data.matchRate}% match rate · ${data.disputesOpen} open disputes` : ""}
          </div>
        </div>
      </div>

      {!data ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={3} cols={4} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Loads this week" value={String(data.loadsThisWeek)} icon="🚛" tone="orange" />
            <StatCard label="Match rate" value={`${data.matchRate}%`} icon="🎯" tone="emerald" />
            <StatCard label="Active users" value={String(data.activeUsers)} icon="👥" tone="sky" />
            <StatCard label="Open disputes" value={String(data.disputesOpen)} icon="⚖️" tone="red" />
          </div>

          {enablement && (
            <>
              <div className="mt-6">
                <h2 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">Enablement platform</h2>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                  <StatCard label="Organizations" value={String(enablement.organizations)} icon="🏢" tone="orange" />
                  <StatCard label="Shipments" value={String(enablement.shipments)} icon="📦" tone="emerald" />
                  <StatCard label="Plans" value={String(enablement.plans)} icon="🗺️" tone="sky" />
                  <StatCard label="Open claims" value={String(enablement.claimOpen)} icon="⚖️" tone="red" />
                  <StatCard label="Webhook fails" value={String(enablement.webhookFailed)} icon="📡" tone="red" />
                </div>
              </div>
            </>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Weekly trend */}
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-slate-500">Loads · last 7 days</h2>
              <div className="mt-4 flex h-40 items-end gap-2">
                {(data.weeklyTrend ?? []).map((t) => (
                  <div key={t.date} className="group flex flex-1 flex-col items-center gap-1">
                    <div className="relative w-full overflow-hidden rounded-t-md bg-gradient-to-t from-orange-600 to-amber-400 transition-all group-hover:from-orange-500 group-hover:to-amber-300" style={{ height: `${(t.count / maxTrend) * 100}%`, minHeight: t.count > 0 ? 6 : 2 }} title={`${t.date}: ${t.count}`} />
                    <span className="text-[10px] text-slate-400">{t.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Status breakdown */}
            <Card className="p-6">
              <h2 className="text-sm font-semibold text-slate-500">Loads by status</h2>
              <div className="mt-4 space-y-3">
                {(data.statusBreakdown ?? []).map((s) => {
                  const total = (data.statusBreakdown ?? []).reduce((acc, x) => acc + x.count, 0) || 1;
                  const pct = Math.round((s.count / total) * 100);
                  return (
                    <div key={s.status}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="capitalize text-slate-600 dark:text-slate-300">{s.status.replace("_", " ")}</span>
                        <span className="tabular-nums text-slate-400">{s.count} · {pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[s.status] ?? "#94a3b8" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Quick actions */}
          <div className="mt-6">
            <Card className="p-6">
              <h2 className="mb-3 text-sm font-semibold text-slate-500">Quick actions</h2>
              <div className="flex flex-wrap gap-2">
                <QuickLink href="/users" label="Review KYC queue" icon="🛡️" />
                <QuickLink href="/disputes" label="Resolve disputes" icon="⚖️" />
                <QuickLink href="/payments" label="Escrow & refunds" icon="₹" />
                <QuickLink href="/tickets" label="Support tickets" icon="🎫" />
                <QuickLink href="/broadcast" label="Send broadcast" icon="📢" />
              </div>
            </Card>
          </div>
        </>
      )}
    </ShellLayout>
  );
}

function QuickLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  return (
    <a href={href} className="group flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:bg-orange-50 hover:text-orange-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
      <span className="transition-transform group-hover:scale-110">{icon}</span>
      {label}
      <span className="text-slate-400">→</span>
    </a>
  );
}
