"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, EmptyRow } from "../../components/ui";

interface ExceptionRow {
  id: string;
  entityId: string;
  summary: string;
  score?: number | null;
  output?: { findings?: Array<{ severity: string; issue: string; suggestion: string }> };
  status: string;
  createdAt: string;
  shipment?: { id: string; ref?: string; commodity?: string } | null;
}

const tone = (s: string) =>
  s === "proposed" ? "amber" : s === "accepted" ? "emerald" : s === "dismissed" ? "slate" : "blue";

export default function Exceptions() {
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchFeed = useCallback(() => {
    api
      .get<{ exceptions: ExceptionRow[] }>("/ai/exceptions/feed")
      .then((res) => setExceptions(res.exceptions))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load exceptions"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const setStatus = async (id: string, status: string) => {
    setBusy(`${id}:${status}`);
    try {
      await api.patch(`/ai/recommendations/${id}/status`, { status });
      fetchFeed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update exception");
    } finally {
      setBusy(null);
    }
  };

  const sevTone = (s: string) => (s === "high" ? "red" : s === "medium" ? "amber" : "slate");

  return (
    <ShellLayout>
      <PageHeader title="Exceptions" subtitle="AI-detected operational exceptions across shipments with suggested recovery actions" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={3} />
        </div>
      ) : exceptions.length === 0 ? (
        <Card><EmptyRow colSpan={1}>No open exceptions.</EmptyRow></Card>
      ) : (
        <div className="space-y-3">
          {exceptions.map((x) => (
            <Card key={x.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{x.shipment?.ref ?? x.entityId.slice(-8)}</span>
                    {x.shipment?.commodity && <span className="text-[11px] text-slate-400">{x.shipment.commodity}</span>}
                    <Badge tone={tone(x.status)}>{x.status}</Badge>
                    {x.score != null && <span className="text-[11px] text-slate-400">score {(x.score * 100).toFixed(0)}</span>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{x.summary}</p>
                  {x.output?.findings?.length ? (
                    <ul className="mt-2 space-y-1">
                      {x.output.findings.map((f, i) => (
                        <li key={i} className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-800">
                          <div className="flex items-center gap-2">
                            <Badge tone={sevTone(f.severity)}>{f.severity}</Badge>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{f.issue}</span>
                          </div>
                          {f.suggestion && <div className="mt-1 text-slate-500">→ {f.suggestion}</div>}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-1 text-[11px] text-slate-400">{new Date(x.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {x.status === "proposed" && (
                    <>
                      <button
                        onClick={() => setStatus(x.id, "accepted")}
                        disabled={busy === `${x.id}:accepted`}
                        className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={() => setStatus(x.id, "dismissed")}
                        disabled={busy === `${x.id}:dismissed`}
                        className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300"
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </ShellLayout>
  );
}