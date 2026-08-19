"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow, StatCard } from "../../components/ui";

interface ReturnRow {
  id: string;
  ref: string;
  reason: string;
  condition?: string | null;
  disposition: string;
  status: string;
  notes?: string | null;
  pickupAt?: string | null;
  receivedAt?: string | null;
  closedAt?: string | null;
  shipment?: { ref: string; commodity?: string | null } | null;
  cargoUnit?: { ref: string; kind: string } | null;
}

const REASONS: Record<string, string> = {
  customer_return: "Customer return",
  damage: "Damage",
  repair: "Repair",
  replacement: "Replacement",
  refurbishment: "Refurbishment",
  recycling: "Recycling",
  disposal: "Disposal",
  warranty: "Warranty",
};

export default function Returns() {
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchReturns = useCallback(() => {
    api
      .get<{ returns: ReturnRow[] }>("/returns")
      .then((res) => setReturns(res.returns))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load returns"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchReturns();
  }, [fetchReturns]);

  const transition = async (id: string, status: string, extra?: Record<string, unknown>) => {
    setBusy(`${id}:${status}`);
    try {
      await api.patch(`/returns/${id}/status`, { status, ...extra });
      fetchReturns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update return");
    } finally {
      setBusy(null);
    }
  };

  const NEXT: Record<string, string[]> = {
    requested: ["scheduled", "cancelled"],
    scheduled: ["picked_up"],
    picked_up: ["received"],
    in_transit: ["received"],
    received: ["closed"],
  };

  const active = returns.filter((r) => !["closed", "cancelled"].includes(r.status)).length;

  return (
    <ShellLayout>
      <PageHeader title="Reverse Logistics" subtitle="Customer returns with condition, disposition and repair/recycle lifecycle" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Total returns" value={String(returns.length)} icon="↩️" tone="slate" />
        <StatCard label="Active" value={String(active)} icon="⏳" tone="amber" />
        <StatCard label="To recycle/dispose" value={String(returns.filter((r) => ["recycling", "disposal"].includes(r.reason)).length)} icon="♻️" tone="emerald" />
      </div>

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={5} cols={5} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Ref</Th>
                <Th>Reason</Th>
                <Th>Origin</Th>
                <Th>Condition</Th>
                <Th>Disposition</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {returns.length === 0 && <EmptyRow colSpan={7}>No returns yet.</EmptyRow>}
              {returns.map((r) => (
                <tr key={r.id}>
                  <Td className="font-mono text-xs">{r.ref}</Td>
                  <Td><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{REASONS[r.reason] ?? r.reason}</span></Td>
                  <Td className="text-xs">{r.shipment?.ref ?? r.cargoUnit?.ref ?? "—"}</Td>
                  <Td className="text-xs text-slate-500">{r.condition ?? "—"}</Td>
                  <Td><Badge tone={r.disposition === "dispose" ? "red" : r.disposition === "recycle" ? "emerald" : r.disposition === "repair" || r.disposition === "refurbish" ? "amber" : "slate"}>{r.disposition}</Badge></Td>
                  <Td><Badge tone={r.status === "closed" ? "emerald" : r.status === "cancelled" ? "slate" : r.status === "received" ? "sky" : "amber"}>{r.status}</Badge></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(NEXT[r.status] ?? []).map((n) => (
                        <button
                          key={n}
                          onClick={() => transition(r.id, n)}
                          disabled={busy === `${r.id}:${n}`}
                          className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {n}
                        </button>
                      ))}
                      {r.status === "received" && r.disposition === "pending" && (
                        <select
                          className="rounded border border-slate-200 px-1 py-1 text-[11px]"
                          defaultValue=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            api.patch(`/returns/${r.id}/status`, { status: r.status, disposition: e.target.value }).then(fetchReturns).catch((err) => setError(err.message));
                          }}
                        >
                          <option value="" disabled>Set disposition</option>
                          {["repair", "refurbish", "recycle", "dispose", "restock"].map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </ShellLayout>
  );
}