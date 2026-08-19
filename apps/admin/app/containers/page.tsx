"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow, StatCard } from "../../components/ui";

interface ContainerRow {
  id: string;
  number: string;
  type: string;
  status: string;
  sealNo?: string | null;
  vessel?: string | null;
  voyage?: string | null;
  emptyReturnRequired: boolean;
  locationRef?: string | null;
  lastInspectionNote?: string | null;
  ownerOrg?: { name: string } | null;
  operatorOrg?: { name: string } | null;
  currentFacility?: { name: string; city?: string | null } | null;
}

export default function Containers() {
  const [containers, setContainers] = useState<ContainerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState("");

  const fetchContainers = useCallback(() => {
    api
      .get<{ containers: ContainerRow[] }>("/containers")
      .then((res) => setContainers(res.containers))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load containers"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  const register = async () => {
    if (!newNumber.trim()) return;
    setBusy("register");
    try {
      await api.post("/containers", { number: newNumber.trim(), type: "20GP" });
      setNewNumber("");
      fetchContainers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register container");
    } finally {
      setBusy(null);
    }
  };

  const transition = async (id: string, status: string) => {
    setBusy(`${id}:${status}`);
    try {
      await api.patch(`/containers/${id}/status`, { status });
      fetchContainers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update container");
    } finally {
      setBusy(null);
    }
  };

  const NEXT: Record<string, string[]> = {
    available: ["reserved", "on_hold", "repair"],
    reserved: ["stuffed", "available"],
    stuffed: ["gate_in", "loaded"],
    gate_in: ["loaded"],
    loaded: ["discharged"],
    discharged: ["released", "empty_return"],
    released: ["empty_return", "available"],
    empty_return: ["available", "repair"],
    repair: ["available"],
    on_hold: ["available"],
  };

  const counts = containers.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <ShellLayout>
      <PageHeader title="Containers" subtitle="Equipment digital twin — status, seal, custody and empty-return" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total" value={String(containers.length)} icon="📦" tone="slate" />
        <StatCard label="Available" value={String(counts.available ?? 0)} icon="🟢" tone="emerald" />
        <StatCard label="Loaded" value={String((counts.loaded ?? 0) + (counts.gate_in ?? 0))} icon="🚢" tone="sky" />
        <StatCard label="In repair" value={String(counts.repair ?? 0)} icon="🔧" tone="amber" />
        <div className="flex items-end gap-2">
          <input
            className="input flex-1"
            placeholder="Container number (e.g. MSCU1234567)"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
          />
          <button onClick={register} disabled={busy === "register" || !newNumber.trim()} className="btn btn-primary">
            {busy === "register" ? "…" : "Register"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={6} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Container</Th>
                <Th>Type</Th>
                <Th>Owner → Operator</Th>
                <Th>Location</Th>
                <Th>Seal / Vessel</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {containers.length === 0 && <EmptyRow colSpan={7}>No containers yet — register the first one.</EmptyRow>}
              {containers.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <div className="font-mono text-xs font-semibold">{c.number}</div>
                    {c.emptyReturnRequired && <div className="text-[11px] font-semibold text-amber-600">↩ empty return</div>}
                  </Td>
                  <Td><span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.type}</span></Td>
                  <Td className="text-xs">{c.ownerOrg?.name ?? "—"} → {c.operatorOrg?.name ?? "—"}</Td>
                  <Td className="text-xs">
                    {c.currentFacility ? `${c.currentFacility.name}${c.currentFacility.city ? `, ${c.currentFacility.city}` : ""}` : (c.locationRef ?? "—")}
                  </Td>
                  <Td className="text-xs tabular-nums text-slate-500">
                    {c.sealNo ? `SEAL ${c.sealNo}` : "—"}
                    {c.vessel ? <div>{c.vessel} {c.voyage}</div> : null}
                  </Td>
                  <Td>
                    <Badge tone={c.status === "available" ? "emerald" : c.status === "repair" || c.status === "on_hold" ? "amber" : c.status === "scrap" ? "red" : "sky"}>{c.status}</Badge>
                    {c.lastInspectionNote && <div className="text-[10px] text-slate-400">🛠 {c.lastInspectionNote}</div>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(NEXT[c.status] ?? []).map((n) => (
                        <button
                          key={n}
                          onClick={() => transition(c.id, n)}
                          disabled={busy === `${c.id}:${n}`}
                          className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {n}
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