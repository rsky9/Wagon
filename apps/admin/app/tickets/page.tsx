"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, StatusBadge, Badge, SkeletonRows, type BadgeTone } from "../../components/ui";

interface TicketUser {
  id: string;
  mobile: string;
  name?: string | null;
}

interface Ticket {
  id: string;
  subject: string;
  category: string;
  message: string;
  status: string;
  priority: string;
  assignedToId?: string | null;
  assignedTo?: TicketUser | null;
  resolution?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: TicketUser;
  _count?: { messages: number };
}

interface TicketMessage {
  id: string;
  authorType: string;
  authorId?: string | null;
  body: string;
  createdAt: string;
}

const PRIORITIES = ["low", "normal", "high", "urgent"];
const PRIORITY_TONE: Record<string, BadgeTone> = {
  low: "slate",
  normal: "sky",
  high: "orange",
  urgent: "red",
};

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ tickets: Ticket[] }>("/support/admin/tickets")
      .then((res) => setTickets(res.tickets))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tickets"))
      .finally(() => setLoading(false));
    api
      .get<{ profile: { id: string } }>("/auth/me")
      .then((res) => setMyId(res.profile?.id ?? null))
      .catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    api
      .get<{ tickets: Ticket[] }>("/support/admin/tickets")
      .then((res) => setTickets(res.tickets))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load tickets"));
  }, []);

  const open = tickets.filter((t) => t.status !== "closed");
  const closed = tickets.filter((t) => t.status === "closed");
  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <ShellLayout>
      <PageHeader title="Support tickets" subtitle="Review, assign and resolve user support requests" />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-8">
            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-500">Open · {open.length}</h2>
              <div className="space-y-3">
                {open.map((t) => (
                  <TicketCard key={t.id} t={t} active={selectedId === t.id} onClick={() => setSelectedId(t.id)} />
                ))}
                {open.length === 0 && <p className="text-sm text-slate-400">No open tickets.</p>}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold text-slate-500">Closed · {closed.length}</h2>
              <div className="space-y-3">
                {closed.map((t) => (
                  <TicketCard key={t.id} t={t} active={selectedId === t.id} onClick={() => setSelectedId(t.id)} />
                ))}
                {closed.length === 0 && <p className="text-sm text-slate-400">No closed tickets.</p>}
              </div>
            </section>
          </div>

          <div>
            {selected ? (
              <TicketDetail
                key={selected.id}
                ticket={selected}
                myId={myId}
                onChanged={refresh}
              />
            ) : (
              <Card className="flex h-full min-h-64 items-center justify-center p-8">
                <p className="text-sm text-slate-400">Select a ticket to view its conversation thread.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </ShellLayout>
  );
}

function TicketCard({ t, active, onClick }: { t: Ticket; active: boolean; onClick: () => void }) {
  const messageCount = t._count?.messages ?? 0;
  return (
    <Card className={`p-5 ${active ? "border-orange-400 ring-2 ring-orange-400/30" : ""}`} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.subject}</span>
            <StatusBadge status={t.status} />
            <Badge tone={PRIORITY_TONE[t.priority] ?? "slate"}>{t.priority}</Badge>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {t.user?.name ?? "User"} · {t.user?.mobile} · {t.category} ·{" "}
            {new Date(t.createdAt).toLocaleString()}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          💬 {messageCount}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{t.message}</p>
      {t.resolution && (
        <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          ✓ {t.resolution}
        </p>
      )}
    </Card>
  );
}

function TicketDetail({
  ticket,
  myId,
  onChanged,
}: {
  ticket: Ticket;
  myId: string | null;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ ticket: Ticket; messages: TicketMessage[] }>(`/support/tickets/${ticket.id}`)
      .then((res) => setMessages(res.messages))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load thread"));
  }, [ticket.id]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const sendReply = () => {
    if (!reply.trim()) return;
    run(async () => {
      await api.post(`/support/tickets/${ticket.id}/messages`, { body: reply.trim() });
      setReply("");
      load();
    });
  };

  const resolve = () => {
    const resolution = window.prompt("Resolution note:", "Resolved by support");
    if (resolution === null) return;
    run(() => api.post(`/support/tickets/${ticket.id}/resolve`, { resolution }));
  };

  const assignToMe = () => {
    if (!myId) return;
    run(() => api.patch(`/support/tickets/${ticket.id}/assign`, { assignedToId: myId }));
  };

  const setPriority = (priority: string) => {
    run(() => api.patch(`/support/tickets/${ticket.id}/priority`, { priority }));
  };

  const isClosed = ticket.status === "closed";

  return (
    <Card className="flex h-full flex-col p-6">
      <div className="mb-4 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">{ticket.subject}</h3>
          <StatusBadge status={ticket.status} />
          <Badge tone={PRIORITY_TONE[ticket.priority] ?? "slate"}>{ticket.priority}</Badge>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {ticket.user?.name ?? "User"} · {ticket.user?.mobile} · {ticket.category} ·{" "}
          {new Date(ticket.createdAt).toLocaleString()}
          {ticket.assignedTo
            ? ` · assigned to ${ticket.assignedTo.name ?? ticket.assignedTo.mobile}`
            : " · unassigned"}
        </p>
        {ticket.resolution && (
          <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            ✓ {ticket.resolution}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
      )}

      <div className="mb-4 max-h-96 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.authorType === "user" ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                m.authorType === "user"
                  ? "rounded-bl-sm bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                  : "rounded-br-sm bg-orange-50 text-orange-900 dark:bg-orange-500/15 dark:text-orange-100"
              }`}
            >
              <p>{m.body}</p>
              <p className="mt-1 text-[10px] opacity-60">
                {m.authorType} · {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="mb-3 flex flex-wrap gap-2">
          {!isClosed && (
            <>
              <button
                onClick={assignToMe}
                disabled={busy || ticket.assignedToId === myId}
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                {ticket.assignedToId === myId ? "Assigned to you" : "Assign to me"}
              </button>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  disabled={busy || ticket.priority === p}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    ticket.priority === p
                      ? "bg-orange-500 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={resolve}
                disabled={busy}
                className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "…" : "Resolve"}
              </button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendReply();
              }
            }}
            placeholder="Reply as support…"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            onClick={sendReply}
            disabled={busy || !reply.trim()}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </Card>
  );
}