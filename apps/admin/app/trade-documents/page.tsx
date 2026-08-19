"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow } from "../../components/ui";

interface TradeDocRow {
  id: string;
  ref: string;
  docType: string;
  status: string;
  currency: string;
  totalValue?: number | null;
  incoterms?: string | null;
  originRef?: string | null;
  destinationRef?: string | null;
  signedAt?: string | null;
  releasedAt?: string | null;
  issuerOrg?: { name: string } | null;
  recipientOrg?: { name: string } | null;
  carrierOrg?: { name: string } | null;
  shipment?: { ref: string } | null;
}

const DOC_LABELS: Record<string, string> = {
  bol: "Bill of Lading",
  packing_list: "Packing List",
  commercial_invoice: "Commercial Invoice",
  cmr: "CMR",
  cim: "CIM (Rail)",
  awb: "Air Waybill",
  sea_waybill: "Sea Waybill",
  certificate_of_origin: "Certificate of Origin",
};

const NEXT: Record<string, string> = {
  issued: "signed",
  signed: "released",
};

export default function TradeDocuments() {
  const [documents, setDocuments] = useState<TradeDocRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchDocuments = useCallback(() => {
    api
      .get<{ documents: TradeDocRow[] }>("/trade-documents")
      .then((res) => setDocuments(res.documents))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load documents"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const transition = async (id: string, status: string) => {
    setBusy(`${id}:${status}`);
    try {
      await api.patch(`/trade-documents/${id}/status`, { status });
      fetchDocuments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update document");
    } finally {
      setBusy(null);
    }
  };

  const tone = (s: string) =>
    s === "signed" ? "blue" : s === "released" ? "emerald" : s === "void" ? "red" : s === "draft" ? "slate" : "amber";

  return (
    <ShellLayout>
      <PageHeader title="Trade Documents" subtitle="Canonical trade & transport documents with electronic signature and release trail" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={7} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Ref</Th>
                <Th>Type</Th>
                <Th>Parties</Th>
                <Th>Route</Th>
                <Th>Value</Th>
                <Th>Release</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {documents.length === 0 && <EmptyRow colSpan={8}>No documents yet.</EmptyRow>}
              {documents.map((d) => (
                <tr key={d.id}>
                  <Td className="font-mono text-xs">{d.ref}</Td>
                  <Td>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {DOC_LABELS[d.docType] ?? d.docType}
                    </span>
                  </Td>
                  <Td>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {d.issuerOrg?.name ?? "—"} → {d.recipientOrg?.name ?? "—"}
                    </div>
                    <div className="text-[11px] text-slate-400">{d.shipment?.ref ?? (d.carrierOrg ? `via ${d.carrierOrg.name}` : "")}</div>
                  </Td>
                  <Td className="text-xs text-slate-500">{d.originRef ? `${d.originRef} → ${d.destinationRef ?? "—"}` : "—"}</Td>
                  <Td className="text-xs tabular-nums">{d.totalValue != null ? `${d.currency} ${d.totalValue.toLocaleString()}` : "—"}{d.incoterms ? ` · ${d.incoterms}` : ""}</Td>
                  <Td className="text-xs tabular-nums text-slate-500">
                    {d.signedAt ? `Signed ${new Date(d.signedAt).toLocaleDateString()}` : "—"}
                    {d.releasedAt ? ` · Released ${new Date(d.releasedAt).toLocaleDateString()}` : ""}
                  </Td>
                  <Td><Badge tone={tone(d.status)}>{d.status}</Badge></Td>
                  <Td>
                    {NEXT[d.status] && (
                      <button
                        onClick={() => transition(d.id, NEXT[d.status]!)}
                        disabled={busy === `${d.id}:${NEXT[d.status]}`}
                        className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {NEXT[d.status] === "signed" ? "Mark signed" : "Release"}
                      </button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </ShellLayout>
  );
}