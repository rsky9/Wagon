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
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState("PO");
  const [orgId, setOrgId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [ref, setRef] = useState("");
  const [sendMode, setSendMode] = useState(false);

  const DOC_TYPES = ["PO", "PO_ACK", "ASN", "ACK", "LOAD_TENDER", "STATUS", "INVOICE", "CUSTOMS"];

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

  const submitEdi = async (mode: "generate" | "send") => {
    if (!orgId.trim()) {
      setError("Sender org ID is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = {
        orgId: orgId.trim(),
        partnerOrgId: partnerId.trim() || undefined,
        documentType: docType,
        payload: { reference: ref.trim() || `REF-${Date.now()}` },
      };
      if (mode === "send") {
        await api.post("/integrations/edi/send", body);
      } else {
        await api.post("/integrations/edi/generate", body);
      }
      setShowForm(false);
      setRef("");
      fetchMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${mode} EDI`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ShellLayout>
      <PageHeader title="EDI Gateway" subtitle="X12 / EDIFACT message capture, parsing and generation with per-partner mapping" actions={
        <button onClick={() => { setShowForm(true); setSendMode(false); }} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">Generate EDI</button>
      } />

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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <Card className="w-full max-w-md p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">
                {sendMode ? "Send EDI" : "Generate EDI"}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="mb-3 flex gap-2">
              {["Generate", "Send"].map((m) => (
                <button
                  key={m}
                  onClick={() => setSendMode(m === "Send")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${(m === "Send") === sendMode ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Document type</label>
                <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {DOC_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Sender org ID</label>
                <input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="org id" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Partner org ID (optional)</label>
                <input value={partnerId} onChange={(e) => setPartnerId(e.target.value)} placeholder="partner org id" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Reference / PO number</label>
                <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="PO reference" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">Cancel</button>
              <button onClick={() => submitEdi(sendMode ? "send" : "generate")} disabled={busy} className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {busy ? "Working…" : sendMode ? "Send" : "Generate"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </ShellLayout>
  );
}