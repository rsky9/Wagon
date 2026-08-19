"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow } from "../../components/ui";

interface ContractRow {
  id: string;
  ref: string;
  type: string;
  title: string;
  status: string;
  incoterms?: string | null;
  currency: string;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  partyAOrg: { name: string; kind: string };
  partyBOrg: { name: string; kind: string };
  slaJson?: Record<string, unknown> | null;
}

export default function Contracts() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchContracts = useCallback(() => {
    api
      .get<{ contracts: ContractRow[] }>("/contracts")
      .then((res) => setContracts(res.contracts))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load contracts"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const transition = async (id: string, status: string) => {
    setBusy(`${id}:${status}`);
    try {
      await api.patch(`/contracts/${id}/status`, { status });
      fetchContracts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update contract");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ShellLayout>
      <PageHeader title="Contracts" subtitle="Customer, carrier, warehouse and service contracts with SLA, territory and liability" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={5} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Ref</Th>
                <Th>Type</Th>
                <Th>Parties</Th>
                <Th>Incoterms</Th>
                <Th>Valid</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {contracts.length === 0 && <EmptyRow colSpan={7}>No contracts yet.</EmptyRow>}
              {contracts.map((c) => (
                <tr key={c.id}>
                  <Td className="font-mono text-xs">{c.ref}</Td>
                  <Td>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.type}</span>
                  </Td>
                  <Td>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{c.partyAOrg.name} → {c.partyBOrg.name}</div>
                    <div className="text-[11px] text-slate-400">{c.title}</div>
                  </Td>
                  <Td>{c.incoterms ?? "—"}</Td>
                  <Td className="text-xs tabular-nums text-slate-500">
                    {c.effectiveAt ? new Date(c.effectiveAt).toLocaleDateString() : "—"}
                    {c.expiresAt ? ` → ${new Date(c.expiresAt).toLocaleDateString()}` : ""}
                  </Td>
                  <Td><Badge tone={c.status === "active" ? "emerald" : c.status === "expired" ? "slate" : c.status === "terminated" ? "red" : "amber"}>{c.status}</Badge></Td>
                  <Td>
                    <div className="flex gap-1">
                      {c.status === "draft" && (
                        <button
                          onClick={() => transition(c.id, "active")}
                          disabled={busy === `${c.id}:active`}
                          className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                      {c.status === "active" && (
                        <button
                          onClick={() => transition(c.id, "terminated")}
                          disabled={busy === `${c.id}:terminated`}
                          className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          Terminate
                        </button>
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