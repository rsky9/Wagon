"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, StatusBadge, SkeletonRows } from "../../components/ui";

const CSV_HEADER = ["reporter", "reported", "reason", "status", "createdAt"];

interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  details?: string | null;
  status: string;
  createdAt: string;
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ reports: Report[] }>("/admin/reports")
      .then((res) => setReports(res.reports))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
  }, []);

  const exportCsv = () => {
    const escape = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      CSV_HEADER,
      ...reports.map((r) => [r.reporterId, r.reportedId, r.reason, r.status, r.createdAt]),
    ];
    const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const act = async (r: Report, action: "dismiss" | "block") => {
    if (action === "block" && !window.confirm("Block the reported user? This prevents further contact.")) return;
    setBusy(r.id);
    try {
      await api.post(`/admin/reports/${r.id}/action`, { action });
      setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: action === "dismiss" ? "dismissed" : "resolved" } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to action");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ShellLayout>
      <PageHeader
        title="Reports"
        subtitle="Trust & safety · user reports"
        actions={
          <button
            onClick={exportCsv}
            disabled={reports.length === 0}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
          >
            Export CSV
          </button>
        }
      />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
      <div className="space-y-3">
        {reports.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.reason}</span>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Reported: {r.reporterId.slice(0, 8)} → {r.reportedId.slice(0, 8)} · {new Date(r.createdAt).toLocaleString()}
            </div>
            {r.details && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{r.details}</p>}
            {r.status === "open" && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => act(r, "dismiss")}
                  disabled={busy === r.id}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                >
                  {busy === r.id ? "…" : "Dismiss"}
                </button>
                <button
                  onClick={() => act(r, "block")}
                  disabled={busy === r.id}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy === r.id ? "…" : "Block user"}
                </button>
              </div>
            )}
          </Card>
        ))}
        {reports.length === 0 && !error && !loading && <p className="text-sm text-slate-400">No reports.</p>}
      </div>
      )}
    </ShellLayout>
  );
}
