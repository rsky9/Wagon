"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow, StatCard } from "../../components/ui";

interface InvoiceRow {
  id: string;
  invoiceNo: string;
  type: string;
  status: string;
  baseAmount?: number | null;
  gstAmount?: number | null;
  tdsAmount?: number | null;
  netAmount?: number | null;
  currency: string;
  issueDate?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  billFromOrg?: { name: string } | null;
  billToOrg?: { name: string } | null;
  settlements?: Array<{ status: string; amount?: number | null }>;
  trip?: { load: { pickupAddr: string; dropAddr: string } } | null;
}

const fmt = (n?: number | null) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

export default function Invoicing() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchInvoices = useCallback(() => {
    const q = statusFilter ? `?status=${statusFilter}` : "";
    api
      .get<{ invoices: InvoiceRow[] }>(`/invoices${q}`)
      .then((res) => setInvoices(res.invoices))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load invoices"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const transition = async (id: string, status: string) => {
    setBusy(`${id}:${status}`);
    try {
      await api.patch(`/invoices/${id}/status`, { status });
      fetchInvoices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update invoice");
    } finally {
      setBusy(null);
    }
  };

  const totalNet = invoices.reduce((s, i) => s + (i.netAmount ?? 0), 0);
  const issued = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + (i.netAmount ?? 0), 0);

  return (
    <ShellLayout>
      <PageHeader title="Invoicing & Reconciliation" subtitle="First-class invoice lifecycle against executed trips and settlements" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Invoices" value={String(invoices.length)} icon="🧾" tone="orange" />
        <StatCard label="Gross (net)" value={fmt(totalNet)} icon="₹" tone="emerald" />
        <StatCard label="Outstanding" value={fmt(issued)} icon="⏳" tone="amber" />
        <div className="flex items-end justify-end">
          <select
            className="input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            {["draft", "issued", "disputed", "approved", "paid"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={6} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Invoice</Th>
                <Th>Route / Shipment</Th>
                <Th>From → To</Th>
                <Th>Base</Th>
                <Th>GST</Th>
                <Th>TDS</Th>
                <Th>Net</Th>
                <Th>Status</Th>
                <Th>Settled</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {invoices.length === 0 && <EmptyRow colSpan={10}>No invoices yet.</EmptyRow>}
              {invoices.map((i) => {
                const cleared = i.settlements?.filter((s) => s.status === "cleared").length ?? 0;
                return (
                  <tr key={i.id}>
                    <Td>
                      <div className="font-mono text-xs font-semibold">{i.invoiceNo}</div>
                      <div className="text-[11px] text-slate-400">{i.type}</div>
                    </Td>
                    <Td className="text-xs">{i.trip ? `${i.trip.load.pickupAddr} → ${i.trip.load.dropAddr}` : i.type}</Td>
                    <Td className="text-xs">
                      {i.billFromOrg?.name ?? "—"} → {i.billToOrg?.name ?? "—"}
                    </Td>
                    <Td className="tabular-nums">{fmt(i.baseAmount)}</Td>
                    <Td className="tabular-nums text-emerald-600">{fmt(i.gstAmount)}</Td>
                    <Td className="tabular-nums text-red-500">{fmt(i.tdsAmount)}</Td>
                    <Td className="font-semibold tabular-nums">{fmt(i.netAmount)}</Td>
                    <Td>
                      <Badge tone={i.status === "paid" ? "emerald" : i.status === "disputed" ? "red" : i.status === "approved" ? "sky" : i.status === "issued" ? "amber" : "slate"}>{i.status}</Badge>
                    </Td>
                    <Td className="text-xs tabular-nums text-slate-500">{cleared}/{i.settlements?.length ?? 0}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {i.status === "draft" && (
                          <button onClick={() => transition(i.id, "issued")} disabled={busy === `${i.id}:issued`} className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">Issue</button>
                        )}
                        {i.status === "issued" && (
                          <>
                            <button onClick={() => transition(i.id, "approved")} disabled={busy === `${i.id}:approved`} className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">Approve</button>
                            <button onClick={() => transition(i.id, "disputed")} disabled={busy === `${i.id}:disputed`} className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">Dispute</button>
                          </>
                        )}
                        {(i.status === "approved" || i.status === "issued" || i.status === "disputed") && (
                          <button onClick={() => transition(i.id, "paid")} disabled={busy === `${i.id}:paid`} className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Pay</button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </ShellLayout>
  );
}