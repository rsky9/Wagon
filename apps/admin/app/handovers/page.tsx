"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow, StatCard } from "../../components/ui";

interface HandoverRow {
  id: string;
  ref: string;
  entityType: string;
  entityId?: string | null;
  condition?: string | null;
  quantity?: number | null;
  unit?: string | null;
  evidenceKey?: string | null;
  nextResponsibility?: string | null;
  performedAt: string;
  status: string;
  fromOrg?: { name: string } | null;
  toOrg?: { name: string } | null;
  facility?: { name: string } | null;
}

const ENTITY_LABEL: Record<string, string> = {
  cargo_unit: "Cargo",
  container: "Container",
  vehicle: "Vehicle",
  shipment: "Shipment",
};

export default function Handovers() {
  const [handovers, setHandovers] = useState<HandoverRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHandovers = useCallback(() => {
    api
      .get<{ handovers: HandoverRow[] }>("/handovers")
      .then((res) => setHandovers(res.handovers))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load handovers"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHandovers();
  }, [fetchHandovers]);

  const completed = handovers.filter((h) => h.status === "completed").length;
  const disputed = handovers.filter((h) => h.status === "disputed").length;

  return (
    <ShellLayout>
      <PageHeader title="Chain of Custody" subtitle="Every custody transfer — who gave what to whom, in what condition, with evidence" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Handovers" value={String(handovers.length)} icon="🤝" tone="slate" />
        <StatCard label="Completed" value={String(completed)} icon="✅" tone="emerald" />
        <StatCard label="Disputed" value={String(disputed)} icon="⚠️" tone="red" />
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
                <Th>Entity</Th>
                <Th>From → To</Th>
                <Th>Facility</Th>
                <Th>Condition</Th>
                <Th>Next responsibility</Th>
                <Th>When</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {handovers.length === 0 && <EmptyRow colSpan={8}>No handovers yet.</EmptyRow>}
              {handovers.map((h) => (
                <tr key={h.id}>
                  <Td className="font-mono text-xs">{h.ref}</Td>
                  <Td>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">{ENTITY_LABEL[h.entityType] ?? h.entityType}</span>
                    {h.entityId && <div className="mt-0.5 font-mono text-[10px] text-slate-400">{h.entityId.slice(-8)}</div>}
                  </Td>
                  <Td className="text-xs">
                    <div className="font-semibold text-slate-700 dark:text-slate-300">{h.fromOrg?.name ?? "—"}</div>
                    <div className="text-slate-400">↓ {h.toOrg?.name ?? "—"}</div>
                  </Td>
                  <Td className="text-xs">{h.facility?.name ?? "—"}</Td>
                  <Td className="text-xs text-slate-500">{h.condition ?? "—"}</Td>
                  <Td className="text-xs">{h.nextResponsibility ?? "—"}</Td>
                  <Td className="text-xs tabular-nums text-slate-500">{new Date(h.performedAt).toLocaleString()}</Td>
                  <Td><Badge tone={h.status === "completed" ? "emerald" : h.status === "disputed" ? "red" : "amber"}>{h.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </ShellLayout>
  );
}