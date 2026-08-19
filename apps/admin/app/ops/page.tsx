"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, StatusBadge, StatCard, Th, Td, SkeletonRows, EmptyRow } from "../../components/ui";

interface OpsCounts {
  openExceptions: number;
  atRiskTrips: number;
  dwellOps: number;
  deadOutbox: number;
  deadWebhooks: number;
  staleTrips: number;
}

interface TripExceptionRow {
  id: string;
  kind: string;
  title: string;
  status: string;
  createdAt: string;
  trip?: { load: { pickupAddr: string; dropAddr: string } } | null;
}

interface AtRiskTrip {
  tripId: string;
  score: number;
  band: string;
  etaMinutes: number | null;
  progress: number;
  flags: Array<{ kind: string; severity: string; message: string }>;
  createdAt: string;
}

interface DwellOp {
  id: string;
  ref: string;
  status: string;
  dwellHours: number;
  facility?: { name: string; city: string | null } | null;
  shipmentRef: string | null;
}

interface DeadOutboxRow {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

interface DeadWebhookRow {
  id: string;
  eventCode: string;
  attempts: number;
  responseStatus: number | null;
  lastAttemptAt: string | null;
  subscription?: { name: string; org?: { name: string } | null } | null;
}

interface StaleTrip {
  tripId: string;
  pickup: string;
  drop: string;
  lastPingAt: string | null;
}

interface OpsTriage {
  counts: OpsCounts;
  openExceptions: TripExceptionRow[];
  atRiskTrips: AtRiskTrip[];
  dwellOps: DwellOp[];
  deadOutbox: DeadOutboxRow[];
  deadWebhooks: DeadWebhookRow[];
  staleTrips: StaleTrip[];
}

function ActionBtn({ label, tone = "orange", disabled, onClick }: { label: string; tone?: "orange" | "green" | "red" | "slate"; disabled?: boolean; onClick: () => void }) {
  const tones: Record<string, string> = {
    orange: "bg-orange-500 hover:bg-orange-600 text-white",
    green: "bg-emerald-500 hover:bg-emerald-600 text-white",
    red: "bg-red-500 hover:bg-red-600 text-white",
    slate: "bg-slate-500 hover:bg-slate-600 text-white",
  };
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-semibold transition ${tones[tone]} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {label}
    </button>
  );
}

function fmt(v: string | null | undefined) {
  return v ?? "—";
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Ops() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OpsTriage | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    api
      .get<OpsTriage>("/admin/ops/triage")
      .then((r) => setData(r))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(null); }
  };

  const nudge = (tripId: string) => {
    const message = window.prompt("Nudge message sent to transporter & supplier:", "Please share a live update — cargo is awaiting ETA confirmation.");
    if (message == null) return;
    run(`nudge:${tripId}`, () => api.post(`/admin/trips/${tripId}/nudge`, { message }));
  };

  const position = async (tripId: string) => {
    setBusy(`pos:${tripId}`);
    setError(null);
    try {
      const res = await api.get<{ latest: { lat: number; lng: number; speedKmh: number | null; recordedAt: string } | null; history: unknown[]; trip: { status: string } }>(`/admin/trips/${tripId}/tracking`);
      if (!res.latest) {
        setError(`Trip ${tripId.slice(-8)} has no location evidence yet.`);
      } else {
        window.alert(
          `Trip ${tripId.slice(-8)} · ${res.trip.status}\n\n` +
          `Position: ${res.latest.lat.toFixed(5)}, ${res.latest.lng.toFixed(5)}\n` +
          `Speed: ${res.latest.speedKmh ?? "—"} km/h\n` +
          `Last ping: ${new Date(res.latest.recordedAt).toLocaleString("en-IN")}\n` +
          `History points: ${res.history.length}`
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load position");
    } finally {
      setBusy(null);
    }
  };

  const resolveException = (id: string, route: string) => {
    const note = window.prompt(`Resolve exception (route: ${route}) — add a resolution note:`, "Reviewed by Ops — marked resolved.");
    if (note == null) return;
    run(`exc:${id}`, () => api.post(`/admin/exceptions/${id}/resolve`, { note }));
  };

  const counts = data?.counts;

  return (
    <ShellLayout>
      <PageHeader
        title="Operations Control Tower"
        subtitle="Live exception queue · trip health · yard dwell · dead-letter recovery"
        actions={
          <div className="flex gap-2">
            <ActionBtn label="Retry all dead outbox" tone="green" disabled={busy === "retry-all" || !counts?.deadOutbox} onClick={() => run("retry-all", () => api.post("/admin/outbox/retry-all"))} />
            <ActionBtn label="Refresh" tone="slate" disabled={busy === "refresh"} onClick={() => run("refresh", () => load())} />
          </div>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 p-3 text-sm">{error}</div>}

      {loading ? (
        <SkeletonRows rows={8} cols={6} />
      ) : !data ? null : (
        <div className="space-y-8">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <StatCard label="Open exceptions" value={String(counts!.openExceptions)} icon="⚠️" tone={counts!.openExceptions > 0 ? "red" : "green"} />
            <StatCard label="At-risk trips" value={String(counts!.atRiskTrips)} icon="🚨" tone={counts!.atRiskTrips > 0 ? "red" : "green"} />
            <StatCard label="Yard dwell ops" value={String(counts!.dwellOps)} icon="🏭" tone={counts!.dwellOps > 0 ? "orange" : "green"} />
            <StatCard label="Stale trips" value={String(counts!.staleTrips)} icon="📡" tone={counts!.staleTrips > 0 ? "orange" : "green"} />
            <StatCard label="Dead outbox" value={String(counts!.deadOutbox)} icon="📦" tone={counts!.deadOutbox > 0 ? "red" : "green"} />
            <StatCard label="Dead webhooks" value={String(counts!.deadWebhooks)} icon="🕸️" tone={counts!.deadWebhooks > 0 ? "orange" : "green"} />
          </div>

          {/* Trip health (at-risk) */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Trip health flags ({data.atRiskTrips.length})</h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><Th>Trip</Th><Th>Band</Th><Th>Score</Th><Th>ETA</Th><Th>Progress</Th><Th>Flags</Th><Th>Since</Th><Th>Actions</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.atRiskTrips.length === 0 && <EmptyRow colSpan={8}>No at-risk trips — fleet is healthy.</EmptyRow>}
                  {data.atRiskTrips.map((t) => (
                    <tr key={t.tripId}>
                      <Td className="font-mono">{t.tripId.slice(-8)}</Td>
                      <Td><StatusBadge status={t.band} /></Td>
                      <Td>{t.score.toFixed(2)}</Td>
                      <Td>{t.etaMinutes != null ? `${t.etaMinutes} min` : "—"}</Td>
                      <Td>{Math.round(t.progress * 100)}%</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {t.flags.map((f, i) => (
                            <span key={i} title={f.message} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${f.severity === "high" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"}`}>
                              {f.kind}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td>{fmtDate(t.createdAt)}</Td>
                      <Td>
                        <div className="flex gap-1">
                          <ActionBtn label="Nudge" tone="orange" disabled={busy === `nudge:${t.tripId}`} onClick={() => nudge(t.tripId)} />
                          <ActionBtn label="Position" tone="slate" disabled={busy === `pos:${t.tripId}`} onClick={() => position(t.tripId)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Open exceptions */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Open exceptions ({data.openExceptions.length})</h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><Th>Kind</Th><Th>Title</Th><Th>Route</Th><Th>Status</Th><Th>Reported</Th><Th>Actions</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.openExceptions.length === 0 && <EmptyRow colSpan={6}>No open exceptions.</EmptyRow>}
                  {data.openExceptions.map((x) => (
                    <tr key={x.id}>
                      <Td><StatusBadge status={x.kind} /></Td>
                      <Td>{x.title}</Td>
                      <Td>{fmt(x.trip?.load.pickupAddr)} → {fmt(x.trip?.load.dropAddr)}</Td>
                      <Td><StatusBadge status={x.status} /></Td>
                      <Td>{fmtDate(x.createdAt)}</Td>
                      <Td>
                        <ActionBtn label="Resolve" tone="green" disabled={busy === `exc:${x.id}`} onClick={() => resolveException(x.id, x.trip?.load.pickupAddr ?? "")} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Yard dwell */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Yard / warehouse dwell ({data.dwellOps.length})</h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><Th>Ref</Th><Th>Facility</Th><Th>Stage</Th><Th>Dwell (h)</Th><Th>Shipment</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.dwellOps.length === 0 && <EmptyRow colSpan={5}>No cargo currently inside the gate cycle.</EmptyRow>}
                  {data.dwellOps.map((op) => (
                    <tr key={op.id}>
                      <Td className="font-mono">{op.ref}</Td>
                      <Td>{op.facility?.name ?? "—"} {op.facility?.city ? `(${op.facility.city})` : ""}</Td>
                      <Td><StatusBadge status={op.status} /></Td>
                      <Td><span className={op.dwellHours >= 24 ? "font-bold text-red-600 dark:text-red-400" : ""}>{op.dwellHours}h</span></Td>
                      <Td className="font-mono">{op.shipmentRef ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stale trips */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Stale trips — no ping 30m+ ({data.staleTrips.length})</h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><Th>Trip</Th><Th>Route</Th><Th>Last ping</Th><Th>Actions</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.staleTrips.length === 0 && <EmptyRow colSpan={4}>No stale trips.</EmptyRow>}
                  {data.staleTrips.map((t) => (
                    <tr key={t.tripId}>
                      <Td className="font-mono">{t.tripId.slice(-8)}</Td>
                      <Td>{fmt(t.pickup)} → {fmt(t.drop)}</Td>
                      <Td>{fmtDate(t.lastPingAt)}</Td>
                      <Td>
                        <div className="flex gap-1">
                          <ActionBtn label="Nudge" tone="orange" disabled={busy === `nudge:${t.tripId}`} onClick={() => nudge(t.tripId)} />
                          <ActionBtn label="Position" tone="slate" disabled={busy === `pos:${t.tripId}`} onClick={() => position(t.tripId)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dead outbox */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Dead-letter outbox ({data.deadOutbox.length})</h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><Th>Event</Th><Th>Entity</Th><Th>Attempts</Th><Th>Error</Th><Th>Created</Th><Th>Actions</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.deadOutbox.length === 0 && <EmptyRow colSpan={6}>No dead outbox messages.</EmptyRow>}
                  {data.deadOutbox.map((m) => (
                    <tr key={m.id}>
                      <Td className="font-mono">{m.eventType}</Td>
                      <Td className="font-mono">{m.aggregateType}:{m.aggregateId.slice(-8)}</Td>
                      <Td>{m.attempts}</Td>
                      <Td className="max-w-xs truncate text-slate-500">{m.lastError ?? "—"}</Td>
                      <Td>{fmtDate(m.createdAt)}</Td>
                      <Td>
                        <ActionBtn label="Retry" tone="orange" disabled={busy === `outbox:${m.id}`} onClick={() => run(`outbox:${m.id}`, () => api.post(`/admin/outbox/${m.id}/retry`))} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dead webhooks */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">Dead-letter webhook deliveries ({data.deadWebhooks.length})</h3>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60">
                  <tr><Th>Event</Th><Th>Webhook</Th><Th>Org</Th><Th>Attempts</Th><Th>HTTP</Th><Th>Last attempt</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.deadWebhooks.length === 0 && <EmptyRow colSpan={6}>No dead webhook deliveries.</EmptyRow>}
                  {data.deadWebhooks.map((d) => (
                    <tr key={d.id}>
                      <Td className="font-mono">{d.eventCode}</Td>
                      <Td>{d.subscription?.name ?? "—"}</Td>
                      <Td>{d.subscription?.org?.name ?? "—"}</Td>
                      <Td>{d.attempts}</Td>
                      <Td>{d.responseStatus ?? "—"}</Td>
                      <Td>{fmtDate(d.lastAttemptAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ShellLayout>
  );
}