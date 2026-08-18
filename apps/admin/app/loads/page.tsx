"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, StatusBadge, Th, Td, EmptyRow, SkeletonRows } from "../../components/ui";

interface LoadRow {
  id: string;
  pickupAddr: string;
  dropAddr: string;
  truckType: string;
  weight: number;
  distanceKm: number;
  fareEstimate: number;
  status: string;
  ewbNumber?: string | null;
  date: string;
}

interface TripRow {
  id: string;
  status: string;
  podUrl?: string | null;
  load: { pickupAddr: string; dropAddr: string; fareEstimate: number };
}

export default function Loads() {
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [trips, setTrips] = useState<TripRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const cancelLoad = async (l: LoadRow) => {
    const reason = window.prompt("Cancellation reason:", "Cancelled by admin");
    if (reason === null) return;
    setBusy(l.id);
    try {
      await api.post(`/admin/loads/${l.id}/cancel`, { reason });
      setLoads((prev) => prev.map((x) => (x.id === l.id ? { ...x, status: "cancelled" } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setBusy(null);
    }
  };

  const forceComplete = async (t: TripRow) => {
    if (!window.confirm("Force-complete this trip as delivered?")) return;
    setBusy(t.id);
    try {
      await api.post(`/admin/trips/${t.id}/force-complete`);
      setTrips((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: "delivered" } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to force complete");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    api
      .get<{ loads: LoadRow[] }>("/admin/loads")
      .then((res) => setLoads(res.loads))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load loads"))
      .finally(() => setLoading(false));
    api
      .get<{ trips: TripRow[] }>("/admin/trips")
      .then((res) => setTrips(res.trips))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load trips"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ShellLayout>
      <PageHeader title="Loads & Trips" subtitle="Platform-wide activity" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
      <>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Loads</h2>
      <div className="card-shadow mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="table-head">
            <tr>
              <Th>Route</Th>
              <Th>Type</Th>
              <Th>Weight</Th>
              <Th className="text-right">Distance</Th>
              <Th className="text-right">Fare</Th>
              <Th>EWB</Th>
              <Th>Status</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {loads.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3.5">
                  <Link
                    href={`/loads/${l.id}`}
                    className="font-semibold text-orange-600 hover:underline dark:text-orange-400"
                  >
                    {l.pickupAddr}
                  </Link>
                  <span className="mx-1.5 text-slate-400">→</span>
                  <span className="text-slate-600 dark:text-slate-400">{l.dropAddr}</span>
                </td>
                <td className="px-5 py-3.5 capitalize text-slate-600 dark:text-slate-400">{l.truckType}</td>
                <td className="px-5 py-3.5 tabular-nums text-slate-600 dark:text-slate-400">{l.weight}t</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{l.distanceKm} km</td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  ₹{l.fareEstimate.toLocaleString("en-IN")}
                </td>
                <td className="px-5 py-3.5 tabular-nums text-slate-500 dark:text-slate-400">{l.ewbNumber ?? "—"}</td>
                <Td>
                  <StatusBadge status={l.status} />
                </Td>
                <td className="px-5 py-3.5 text-right">
                  {["posted", "interested", "paused"].includes(l.status) && (
                    <button
                      onClick={() => cancelLoad(l)}
                      disabled={busy === l.id}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700"
                    >
                      {busy === l.id ? "…" : "Cancel"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {loads.length === 0 && !loading && <EmptyRow colSpan={8}>No loads.</EmptyRow>}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Trips</h2>
      <div className="card-shadow overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="table-head">
            <tr>
              <Th>Route</Th>
              <Th className="text-right">Fare</Th>
              <Th>POD</Th>
              <Th>Status</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t) => (
              <tr key={t.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3.5">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{t.load.pickupAddr}</span>
                  <span className="mx-1.5 text-slate-400">→</span>
                  <span className="text-slate-600 dark:text-slate-400">{t.load.dropAddr}</span>
                </td>
                <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  ₹{t.load.fareEstimate.toLocaleString("en-IN")}
                </td>
                <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{t.podUrl ? "Uploaded" : "—"}</td>
                <Td>
                  <StatusBadge status={t.status} />
                </Td>
                <td className="px-5 py-3.5 text-right">
                  {["accepted", "in_transit"].includes(t.status) && (
                    <button
                      onClick={() => forceComplete(t)}
                      disabled={busy === t.id}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-400"
                    >
                      {busy === t.id ? "…" : "Complete"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {trips.length === 0 && !loading && <EmptyRow colSpan={5}>No trips.</EmptyRow>}
          </tbody>
        </table>
      </div>
      </>
      )}
    </ShellLayout>
  );
}
