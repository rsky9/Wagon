"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, StatusBadge, SkeletonRows } from "../../components/ui";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  message: string;
  status: string;
  resolution?: string | null;
  createdAt: string;
  user: { mobile: string; name?: string | null };
}

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<{ tickets: Ticket[] }>("/admin/tickets")
      .then((res) => setTickets(res.tickets))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tickets"))
      .finally(() => setLoading(false));
  }, []);

  const resolve = async (t: Ticket) => {
    const resolution = window.prompt("Resolution note:", "Resolved by support");
    if (resolution === null) return;
    setBusy(t.id);
    try {
      await api.post(`/admin/tickets/${t.id}/resolve`, { resolution });
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: "closed", resolution } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resolve");
    } finally {
      setBusy(null);
    }
  };

  const open = tickets.filter((t) => t.status !== "closed");
  const closed = tickets.filter((t) => t.status === "closed");

  return (
    <ShellLayout>
      <PageHeader title="Support tickets" subtitle="Review and resolve user support requests" />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
      <>
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Open · {open.length}</h2>
        <div className="space-y-3">
          {open.map((t) => (
            <TicketCard key={t.id} t={t} busy={busy === t.id} onResolve={() => resolve(t)} />
          ))}
          {open.length === 0 && !loading && <p className="text-sm text-slate-400">No open tickets.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-500">Closed · {closed.length}</h2>
        <div className="space-y-3">
          {closed.map((t) => (
            <TicketCard key={t.id} t={t} busy={false} />
          ))}
          {closed.length === 0 && !loading && <p className="text-sm text-slate-400">No closed tickets.</p>}
        </div>
      </section>
      </>
      )}
    </ShellLayout>
  );
}

function TicketCard({ t, busy, onResolve }: { t: Ticket; busy: boolean; onResolve?: () => void }) {
  const isClosed = t.status === "closed";
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.subject}</span>
            <StatusBadge status={t.status} />
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {t.user.name ?? "User"} · {t.user.mobile} · {t.category} · {new Date(t.createdAt).toLocaleString()}
          </div>
        </div>
        {!isClosed && onResolve && (
          <button
            onClick={onResolve}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "…" : "Resolve"}
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t.message}</p>
      {t.resolution && <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">✓ {t.resolution}</p>}
    </Card>
  );
}
