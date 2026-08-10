"use client";

import { useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader } from "../../components/ui";

const ROLES = [
  { value: "all", label: "Everyone" },
  { value: "supplier", label: "Suppliers" },
  { value: "transporter", label: "Transporters" },
  { value: "driver", label: "Drivers" },
];

export default function Broadcast() {
  const [role, setRole] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      setError("Title and body are required");
      return;
    }
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<{ sent: number }>("/admin/broadcast", { role, title, body });
      setResult(`Notification sent to ${res.sent} user(s)`);
      setBody("");
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
    </ShellLayout>
  );
}
