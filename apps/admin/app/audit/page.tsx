"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, SkeletonRows } from "../../components/ui";

interface AuditRow {
  id: string;
  actorId: string;
  action: string;
  resource: string;
  createdAt: string;
  after?: { status?: string; kycStatus?: string; resolution?: string } | null;
}

export default function Audit() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [action, setAction] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ items: AuditRow[] }>("/admin/audit")
      .then((res) => setItems(res.items))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load audit log"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ShellLayout>
      <PageHeader title="Audit Log" subtitle="Record of admin actions" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 flex flex-wrap gap-2">
        {["all", ...Array.from(new Set(items.map((i) => i.action)))].map((a) => (
          <button
            key={a}
            onClick={() => setAction(a)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              action === a ? "bg-orange-500 text-white" : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card-shadow overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
      <div className="card-shadow overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            <tr>
              <th className="px-5 py-3.5 font-semibold">Action</th>
              <th className="px-5 py-3.5 font-semibold">Resource</th>
              <th className="px-5 py-3.5 font-semibold">Actor</th>
              <th className="px-5 py-3.5 font-semibold">After</th>
              <th className="px-5 py-3.5 text-right font-semibold">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.filter((a) => action === "all" || a.action === action).map((a) => (
              <tr key={a.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3.5 font-mono text-xs text-slate-800 dark:text-slate-200">{a.action}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-slate-500 dark:text-slate-400">{a.resource}</td>
                <td className="px-5 py-3.5 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {a.actorId.slice(-8)}
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400">
                  {a.after?.status ?? a.after?.kycStatus ?? a.after?.resolution ?? "—"}
                </td>
                <td className="px-5 py-3.5 text-right text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {new Date(a.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {items.filter((a) => action === "all" || a.action === action).length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-slate-400">No audit entries.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </ShellLayout>
  );
}
