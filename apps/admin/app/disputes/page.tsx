"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, StatusBadge, SkeletonRows } from "../../components/ui";

interface DisputeRow {
  id: string;
  tripId: string;
  raisedBy: string;
  subject: string;
  status: string;
  resolution?: string | null;
  createdAt: string;
}

export default function Disputes() {
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDisputes = useCallback(() => {
    api
      .get<{ disputes: DisputeRow[] }>("/disputes/open")
      .then((res) => setDisputes(res.disputes))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load disputes"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const resolve = async (id: string) => {
    const note = resolution[id];
    if (!note || note.trim().length === 0) {
      setError("Add a resolution note first");
      return;
    }
    setBusy(id);
    try {
      await api.patch(`/disputes/${id}/resolve`, { resolution: note });
      setResolution((r) => ({ ...r, [id]: "" }));
      fetchDisputes();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ShellLayout>
      <PageHeader title="Disputes" subtitle="Open disputes from suppliers & transporters" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
      <div className="space-y-3">
        {disputes.map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">{d.subject}</h3>
                  <StatusBadge status="open" />
                </div>
                <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  Trip {d.tripId.slice(-6)} · by {d.raisedBy.slice(-8)} · {new Date(d.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                className="input flex-1"
                placeholder="Resolution note"
                value={resolution[d.id] ?? ""}
                onChange={(e) => setResolution((r) => ({ ...r, [d.id]: e.target.value }))}
              />
              <button
                onClick={() => resolve(d.id)}
                disabled={busy === d.id}
                className="btn btn-success"
              >
                {busy === d.id ? "…" : "Resolve"}
              </button>
            </div>
          </Card>
        ))}
        {disputes.length === 0 && !loading && (
          <div className="card-shadow rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 text-3xl">🎉</div>
            No open disputes.
          </div>
        )}
      </div>
      )}
    </ShellLayout>
  );
}
