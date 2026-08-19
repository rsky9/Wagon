"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow } from "../../components/ui";

interface EwbLoadRow {
  id: string;
  pickupAddr: string;
  dropAddr: string;
  fareEstimate: number;
  status: string;
  ewbNumber?: string | null;
  ewbStatus: string;
  ewbValidUntil?: string | null;
  ewbGeneratedAt?: string | null;
  ewbCancelledAt?: string | null;
  supplier?: { user?: { name?: string | null } } | null;
}

const tone = (s: string) =>
  s === "generated" || s === "extended" ? "emerald" : s === "cancelled" ? "red" : s === "expired" ? "amber" : "slate";

export default function Ewb() {
  const [loads, setLoads] = useState<EwbLoadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchLoads = useCallback(() => {
    api
      .get<{ loads: EwbLoadRow[] }>("/admin/loads")
      .then((res) => setLoads(res.loads))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load loads"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLoads();
  }, [fetchLoads]);

  const act = async (id: string, action: string, body?: Record<string, unknown>) => {
    setBusy(`${id}:${action}`);
    try {
      await api.post(`/ewb/loads/${id}/${action}`, body ?? {});
      fetchLoads();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} e-way bill`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ShellLayout>
      <PageHeader title="E-Way Bills" subtitle="India GST e-way bill lifecycle — generate, extend, cancel and expiry tracking" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={7} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Route</Th>
                <Th>EWB Number</Th>
                <Th>Status</Th>
                <Th>Valid Until</Th>
                <Th>Value</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loads.length === 0 && <EmptyRow colSpan={6}>No loads.</EmptyRow>}
              {loads.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{l.pickupAddr} → {l.dropAddr}</div>
                    <div className="text-[11px] text-slate-400">{l.supplier?.user?.name ?? "—"}</div>
                  </Td>
                  <Td className="font-mono text-xs">{l.ewbNumber ?? "—"}</Td>
                  <Td><Badge tone={tone(l.ewbStatus)}>{l.ewbStatus}</Badge></Td>
                  <Td className="text-xs tabular-nums text-slate-500">{l.ewbValidUntil ? new Date(l.ewbValidUntil).toLocaleString() : "—"}</Td>
                  <Td className="text-xs tabular-nums">₹{l.fareEstimate?.toLocaleString() ?? "—"}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {(!l.ewbNumber || l.ewbStatus === "cancelled" || l.ewbStatus === "expired") && l.status !== "cancelled" && (
                        <button
                          onClick={() => act(l.id, "generate")}
                          disabled={busy === `${l.id}:generate`}
                          className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Generate
                        </button>
                      )}
                      {(l.ewbStatus === "generated") && (
                        <>
                          <button
                            onClick={() => act(l.id, "extend")}
                            disabled={busy === `${l.id}:extend`}
                            className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                          >
                            Extend
                          </button>
                          <button
                            onClick={() => act(l.id, "cancel", { reason: "Admin cancellation" })}
                            disabled={busy === `${l.id}:cancel`}
                            className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
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