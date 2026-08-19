"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow, StatCard } from "../../components/ui";

interface CustomsRow {
  id: string;
  ref: string;
  direction: string;
  regime: string;
  hsCode?: string | null;
  commodity?: string | null;
  value?: number | null;
  currency: string;
  dutyAmount?: number | null;
  taxAmount?: number | null;
  status: string;
  holdReason?: string | null;
  shipment?: { ref: string; commodity?: string | null } | null;
  brokerOrg?: { name: string } | null;
}

const fmt = (n?: number | null) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

export default function Customs() {
  const [declarations, setDeclarations] = useState<CustomsRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchDeclarations = useCallback(() => {
    api
      .get<{ declarations: CustomsRow[] }>("/customs")
      .then((res) => setDeclarations(res.declarations))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load declarations"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDeclarations();
  }, [fetchDeclarations]);

  const transition = async (id: string, status: string, extra?: Record<string, unknown>) => {
    setBusy(`${id}:${status}`);
    try {
      await api.patch(`/customs/${id}/status`, { status, ...extra });
      fetchDeclarations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update declaration");
    } finally {
      setBusy(null);
    }
  };

  const NEXT: Record<string, string[]> = {
    draft: ["filed", "rejected"],
    filed: ["under_examination", "held", "cleared", "rejected"],
    under_examination: ["held", "cleared", "rejected"],
    held: ["cleared", "under_examination"],
    cleared: ["released"],
  };

  const held = declarations.filter((d) => d.status === "held").length;
  const cleared = declarations.filter((d) => d.status === "cleared" || d.status === "released").length;

  return (
    <ShellLayout>
      <PageHeader title="Customs Declarations" subtitle="Export / import / transit declarations — classification, valuation, duty and release" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Declarations" value={String(declarations.length)} icon="🛃" tone="slate" />
        <StatCard label="Held" value={String(held)} icon="⛔" tone="red" />
        <StatCard label="Cleared/Released" value={String(cleared)} icon="✅" tone="emerald" />
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
                <Th>Direction</Th>
                <Th>Shipment / Commodity</Th>
                <Th>HS Code</Th>
                <Th>Value</Th>
                <Th>Duty</Th>
                <Th>Broker</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {declarations.length === 0 && <EmptyRow colSpan={9}>No declarations yet.</EmptyRow>}
              {declarations.map((d) => (
                <tr key={d.id}>
                  <Td className="font-mono text-xs">{d.ref}</Td>
                  <Td><Badge tone={d.direction === "import" ? "sky" : d.direction === "export" ? "emerald" : "amber"}>{d.direction}</Badge></Td>
                  <Td className="text-xs">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">{d.shipment?.ref ?? "—"}</div>
                    <div className="text-slate-400">{d.commodity ?? d.shipment?.commodity ?? "—"}</div>
                  </Td>
                  <Td className="font-mono text-xs">{d.hsCode ?? "—"}</Td>
                  <Td className="tabular-nums">{fmt(d.value)}</Td>
                  <Td className="tabular-nums text-slate-500">{fmt(d.dutyAmount)}</Td>
                  <Td className="text-xs">{d.brokerOrg?.name ?? "—"}</Td>
                  <Td>
                    <Badge tone={d.status === "released" || d.status === "cleared" ? "emerald" : d.status === "held" || d.status === "rejected" ? "red" : d.status === "under_examination" ? "amber" : "slate"}>{d.status}</Badge>
                    {d.holdReason && <div className="text-[10px] text-red-500">{d.holdReason}</div>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(NEXT[d.status] ?? []).map((n) => (
                        <button
                          key={n}
                          onClick={() => transition(d.id, n, n === "held" ? { holdReason: "On-hold pending docs" } : undefined)}
                          disabled={busy === `${d.id}:${n}`}
                          className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {n.replace("_", " ")}
                        </button>
                      ))}
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