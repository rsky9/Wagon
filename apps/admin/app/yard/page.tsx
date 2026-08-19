"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow } from "../../components/ui";

interface AppointmentRow {
  id: string;
  ref: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  vehicleNo?: string | null;
  cargoPieces?: number | null;
  facility: { id: string; name: string; city?: string | null };
  dock?: { id: string; name: string } | null;
  org?: { id: string; name: string } | null;
  container?: { id: string; number: string } | null;
}

const NEXT: Record<string, string> = {
  requested: "confirmed",
  confirmed: "in_progress",
  in_progress: "completed",
};

export default function Yard() {
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchAppointments = useCallback(() => {
    api
      .get<{ appointments: AppointmentRow[] }>("/yard/appointments")
      .then((res) => setAppointments(res.appointments))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load appointments"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const transition = async (id: string, status: string) => {
    setBusy(`${id}:${status}`);
    try {
      await api.patch(`/yard/appointments/${id}/status`, { status });
      fetchAppointments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update appointment");
    } finally {
      setBusy(null);
    }
  };

  const tone = (s: string) =>
    s === "confirmed" ? "amber" : s === "in_progress" ? "blue" : s === "completed" ? "emerald" : s === "cancelled" || s === "no_show" ? "red" : "slate";

  return (
    <ShellLayout>
      <PageHeader title="Yard & Docks" subtitle="Appointment scheduling, dock slot allocation and gate-in/gate-out execution" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={6} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Ref</Th>
                <Th>Facility</Th>
                <Th>Window</Th>
                <Th>Dock</Th>
                <Th>Vehicle / Container</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {appointments.length === 0 && <EmptyRow colSpan={7}>No appointments yet.</EmptyRow>}
              {appointments.map((a) => (
                <tr key={a.id}>
                  <Td className="font-mono text-xs">{a.ref}</Td>
                  <Td>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{a.facility.name}</div>
                    <div className="text-[11px] text-slate-400">{a.facility.city ?? "—"}</div>
                  </Td>
                  <Td className="text-xs tabular-nums text-slate-500">
                    {new Date(a.windowStart).toLocaleString()}
                    <div className="text-[11px]">{new Date(a.windowEnd).toLocaleTimeString()}</div>
                  </Td>
                  <Td>{a.dock?.name ?? "—"}</Td>
                  <Td className="text-xs">{a.vehicleNo ?? a.container?.number ?? "—"}</Td>
                  <Td><Badge tone={tone(a.status)}>{a.status}</Badge></Td>
                  <Td>
                    {NEXT[a.status] && (
                      <button
                        onClick={() => transition(a.id, NEXT[a.status]!)}
                        disabled={busy === `${a.id}:${NEXT[a.status]}`}
                        className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {NEXT[a.status] === "in_progress" ? "Gate-in" : NEXT[a.status] === "completed" ? "Gate-out" : "Confirm"}
                      </button>
                    )}
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