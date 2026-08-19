"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, StatusBadge, Th, Td, EmptyRow, SkeletonRows } from "../../components/ui";

interface Trip {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  podUrl?: string | null;
  load: {
    id: string;
    pickupAddr: string;
    dropAddr: string;
    truckType?: string;
    weight?: number;
    distanceKm?: number;
    fareEstimate?: number;
    material?: { name?: string } | null;
  };
  payments?: Array<{ status: string; amount: number }>;
}

interface Tracking {
  trip: { load: { pickupAddr: string; dropAddr: string; pickupLat?: number | null; pickupLng?: number | null; dropLat?: number | null; dropLng?: number | null } };
  latest?: { lat?: number | null; lng?: number | null; recordedAt?: string } | null;
  history: Array<{ lat: number; lng: number; recordedAt: string }>;
}

const STATUSES = ["", "in_transit", "pickup_pending", "delivered", "completed", "cancelled"];

export default function Trips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [tracking, setTracking] = useState<Tracking | null>(null);

  const fetch = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    api
      .get<{ trips: Trip[] }>(`/admin/trips?${params.toString()}`)
      .then((res) => {
        setTrips(res.trips);
        setLoading(false);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Failed to load trips");
        setLoading(false);
      });
  }, [status, q]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const nudge = async (t: Trip) => {
    const message = window.prompt("Nudge message:", "Please update this trip");
    if (message === null) return;
    setBusy(t.id);
    try {
      await api.post(`/admin/trips/${t.id}/nudge`, { message });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to nudge");
    } finally {
      setBusy(null);
    }
  };

  const forceComplete = async (t: Trip) => {
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

  const openTracking = async (t: Trip) => {
    setBusy(t.id);
    try {
      const res = await api.get<Tracking>(`/admin/trips/${t.id}/tracking`);
      setTracking(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tracking");
    } finally {
      setBusy(null);
    }
  };

  const money = (t: Trip) =>
    (t.payments ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return (
    <ShellLayout>
      <PageHeader title="Trips" subtitle="Monitor, nudge and recover in-flight trips" />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetch()}
          placeholder="Search pickup / drop…"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-orange-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "" ? "All statuses" : s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={6} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <Th>Route</Th>
                <Th>Material</Th>
                <Th>Fare</Th>
                <Th>Paid</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {trips.length === 0 && <EmptyRow colSpan={7}>No trips found.</EmptyRow>}
              {trips.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <Td className="max-w-xs">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{t.load.pickupAddr}</p>
                    <p className="text-xs text-slate-400">→ {t.load.dropAddr}</p>
                  </Td>
                  <Td>{t.load.material?.name ?? "—"}</Td>
                  <Td className="tabular-nums">₹{(t.load.fareEstimate ?? 0).toLocaleString()}</Td>
                  <Td className="tabular-nums">₹{money(t).toLocaleString()}</Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-slate-500">
                    {new Date(t.updatedAt).toLocaleString()}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openTracking(t)}
                        disabled={busy === t.id}
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
                      >
                        Track
                      </button>
                      {t.status !== "delivered" && t.status !== "completed" && t.status !== "cancelled" && (
                        <>
                          <button
                            onClick={() => nudge(t)}
                            disabled={busy === t.id}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                          >
                            Nudge
                          </button>
                          <button
                            onClick={() => forceComplete(t)}
                            disabled={busy === t.id}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            Complete
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

      {tracking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setTracking(null)}>
          <Card className="w-full max-w-lg p-6" >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Trip tracking</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {tracking.trip.load.pickupAddr} → {tracking.trip.load.dropAddr}
                </p>
              </div>
              <button onClick={() => setTracking(null)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>
            {tracking.latest ? (
              <p className="mb-3 text-sm">
                Latest:{" "}
                <span className="font-mono">
                  {tracking.latest.lat?.toFixed(5)}, {tracking.latest.lng?.toFixed(5)}
                </span>{" "}
                <span className="text-xs text-slate-400">
                  ({new Date(tracking.latest.recordedAt ?? "").toLocaleTimeString()})
                </span>
              </p>
            ) : (
              <p className="mb-3 text-sm text-slate-400">No live position yet.</p>
            )}
            <p className="mb-2 text-xs font-semibold text-slate-500">
              History · {tracking.history.length} points
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
              {tracking.history.length === 0 && <p className="text-xs text-slate-400">No history.</p>}
              {[...tracking.history].reverse().slice(0, 50).map((h, i) => (
                <div key={i} className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-mono">
                    {h.lat.toFixed(5)}, {h.lng.toFixed(5)}
                  </span>
                  <span className="text-slate-400">{new Date(h.recordedAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </ShellLayout>
  );
}