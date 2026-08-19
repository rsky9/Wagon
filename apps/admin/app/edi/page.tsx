"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow } from "../../components/ui";

interface EdiMessageRow {
  id: string;
  direction: string;
  format: string;
  documentType: string;
  status: string;
  raw: string;
  interchangeId?: string | null;
  controlNumber?: string | null;
  payload?: Record<string, unknown>;
  org?: { name: string } | null;
  partnerOrg?: { name: string } | null;
  createdAt: string;
}

export default function EdiGateway() {
  const [messages, setMessages] = useState<EdiMessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(() => {
    api
      .get<{ messages: EdiMessageRow[] }>("/integrations/edi")
      .then((res) => setMessages(res.messages))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load EDI messages"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const tone = (s: string) =>
    s === "sent" || s === "mapped" ? "emerald" : s === "failed" ? "red" : s === "acked" ? "blue" : "amber";

  return (
    <ShellLayout>
      <PageHeader title="EDI Gateway" subtitle="X12 / EDIFACT message capture, parsing and generation with per-partner mapping" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={6} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Direction</Th>
                <Th>Type</Th>
                <Th>Format</Th>
                <Th>Parties</Th>
                <Th>Control</Th>
                <Th>Status</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {messages.length === 0 && <EmptyRow colSpan={7}>No EDI messages yet.</EmptyRow>}
              {messages.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <Badge tone={m.direction === "inbound" ? "blue" : "purple"}>{m.direction}</Badge>
                  </Td>
                  <Td>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{m.documentType}</span>
                  </Td>
                  <Td className="text-xs">{m.format}</Td>
                  <Td>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{m.org?.name ?? "—"} {m.partnerOrg ? `↔ ${m.partnerOrg.name}` : ""}</div>
                    <div className="text-[11px] font-mono text-slate-400">{m.raw.slice(0, 60)}…</div>
                  </Td>
                  <Td className="text-xs font-mono text-slate-500">{m.controlNumber ?? m.interchangeId ?? "—"}</Td>
                  <Td><Badge tone={tone(m.status)}>{m.status}</Badge></Td>
                  <Td className="text-xs tabular-nums text-slate-500">{new Date(m.createdAt).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </ShellLayout>
  );
}