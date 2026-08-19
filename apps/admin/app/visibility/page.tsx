"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge } from "../../components/ui";

interface TimelineEntry {
  id: string;
  eventCode?: string;
  label: string;
  dcsa?: string;
  classifier?: string;
  source?: string;
  actor?: string | null;
  location?: string | null;
  occurredAt: string;
  evidence?: string | null;
  payload?: Record<string, unknown>;
  kind?: string;
  leg?: { mode: string; sequence: number } | null;
}

type EntityType = "shipment" | "container" | "trip";

const ENTITY_ENDPOINTS: Record<EntityType, string> = {
  shipment: "/visibility/shipments/",
  container: "/visibility/containers/",
  trip: "/visibility/trips/",
};

export default function Visibility() {
  const [type, setType] = useState<EntityType>("shipment");
  const [id, setId] = useState("");
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ timeline: TimelineEntry[] }>(`${ENTITY_ENDPOINTS[type]}${id.trim()}`);
      setTimeline(res.timeline);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timeline");
      setTimeline(null);
    } finally {
      setLoading(false);
    }
  };

  const tone = (c?: string) =>
    c === "ACT" ? "emerald" : c === "PLN" ? "amber" : c === "EST" ? "blue" : "slate";

  return (
    <ShellLayout>
      <PageHeader title="Visibility" subtitle="DCSA-aligned event timeline for shipments, containers and trips" />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Entity</label>
            <select
              value={type}
              onChange={(e) => { setType(e.target.value as EntityType); setTimeline(null); }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value="shipment">Shipment</option>
              <option value="container">Container</option>
              <option value="trip">Trip</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Entity ID</label>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Paste the entity id"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <button
            onClick={load}
            disabled={loading || !id.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {loading ? "Loading…" : "View timeline"}
          </button>
        </div>
      </Card>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {timeline && (
        <Card className="p-0">
          <div className="px-4 pt-4">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Event timeline <span className="font-normal text-slate-400">({timeline.length} entries)</span>
            </h3>
          </div>
          <ol className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {timeline.length === 0 && <li className="px-4 py-6 text-sm text-slate-400">No events recorded.</li>}
            {timeline.map((e) => (
              <li key={`${e.id}-${e.occurredAt}`} className="flex gap-4 px-4 py-3">
                <div className="w-40 shrink-0 text-xs tabular-nums text-slate-500">{new Date(e.occurredAt).toLocaleString()}</div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{e.label}</span>
                    {e.dcsa && <Badge tone="blue">{e.dcsa}</Badge>}
                    <Badge tone={tone(e.classifier)}>{e.classifier ?? "—"}</Badge>
                    {e.kind === "location" && <Badge tone="slate">GPS</Badge>}
                    {e.leg && <span className="text-[11px] text-slate-400">leg {e.leg.sequence} · {e.leg.mode}</span>}
                  </div>
                  {(e.location || e.actor) && (
                    <div className="text-xs text-slate-400">
                      {e.location ? `@ ${e.location}` : ""}
                      {e.actor ? ` · by ${e.actor}` : ""}
                    </div>
                  )}
                  {e.payload && Object.keys(e.payload).length > 0 && (
                    <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-50 p-2 text-[10px] text-slate-500 dark:bg-slate-800">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </ShellLayout>
  );
}