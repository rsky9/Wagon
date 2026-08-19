"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge } from "../../components/ui";

const ROLES = [
  { value: "all", label: "Everyone" },
  { value: "supplier", label: "Suppliers" },
  { value: "transporter", label: "Transporters" },
  { value: "driver", label: "Drivers" },
  { value: "forwarder", label: "Forwarders" },
  { value: "warehouse", label: "Warehouses" },
  { value: "carrier", label: "Carriers" },
];

interface Broadcast {
  id: string;
  role: string | null;
  title: string;
  body: string;
  sentTo: number;
  createdAt: string;
}

const ROLE_TONE: Record<string, "emerald" | "amber" | "red" | "sky" | "slate" | "orange" | "violet"> = {
  supplier: "sky",
  transporter: "emerald",
  driver: "amber",
  forwarder: "orange",
  warehouse: "slate",
  carrier: "red",
  all: "violet",
};

export default function Broadcast() {
  const [role, setRole] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);

  const loadHistory = () => {
    api
      .get<{ broadcasts: Broadcast[] }>("/admin/broadcasts")
      .then((res) => setBroadcasts(res.broadcasts))
      .catch(() => {});
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required");
      return;
    }
    if (!window.confirm(`Send this broadcast to all ${role === "all" ? "users" : role + "s"}? This cannot be undone.`)) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ sent: number }>("/admin/broadcast", { role, title, body });
      setResult(`Notification sent to ${res.sent} user(s)`);
      setBody("");
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to broadcast");
    } finally {
      setSending(false);
    }
  };

  const input =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

  return (
    <ShellLayout>
      <PageHeader title="Broadcast" subtitle="Send an in-app notification to a role" />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {result && <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{result}</div>}

      <div className="max-w-xl space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Audience</label>
          <div className="flex flex-wrap gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRole(r.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  role === r.value
                    ? "bg-orange-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Title</label>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">Body</label>
          <textarea className={input} rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message text" />
        </div>

        <button
          onClick={send}
          disabled={sending}
          className="rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send broadcast"}
        </button>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">Broadcast history</h2>
      <div className="max-w-2xl space-y-3">
        {broadcasts.map((b) => (
          <Card key={b.id} className="p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{b.title}</span>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={ROLE_TONE[b.role ?? "all"]}>{b.role ?? "all"}</Badge>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {b.sentTo} sent
                </span>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{b.body}</p>
            <div className="mt-2 text-xs text-slate-400">{new Date(b.createdAt).toLocaleString()}</div>
          </Card>
        ))}
        {broadcasts.length === 0 && !error && <p className="text-sm text-slate-400">No broadcasts sent yet.</p>}
      </div>
    </ShellLayout>
  );
}
