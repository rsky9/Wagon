"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, StatusBadge, Th, Td, EmptyRow, SkeletonRows } from "../../components/ui";

interface Payment {
  id: string;
  type: string;
  amount: number;
  status: string;
  method: string;
  gstAmount?: number | null;
  tdsAmount?: number | null;
  createdAt: string;
  trip?: { id: string; load?: { pickupAddr: string; dropAddr: string } | null } | null;
}

const TYPE_BADGE: Record<string, string> = {
  escrow: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  payout: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  refund: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
};

export default function Payments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPayments = (s?: string) => {
    if (!s || s === "all") {
      api
        .get<{ payments: Payment[] }>("/admin/payments")
        .then((res) => setPayments(res.payments))
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load payments"))
        .finally(() => setLoading(false));
      return;
    }
    // escrow/payout/refund are payment *types*; failed is a payment *status*.
    const param = s === "failed" ? "status=failed" : `type=${s}`;
    api
      .get<{ payments: Payment[] }>(`/admin/payments?${param}`)
      .then((res) => setPayments(res.payments))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load payments"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPayments(status);
  }, [status]);

  const refund = async (p: Payment) => {
    if (!window.confirm(`Refund ₹${p.amount}? This creates a refund transaction.`)) return;
    setBusy(p.id);
    try {
      await api.post(`/admin/payments/${p.id}/refund`);
      fetchPayments(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refund");
    } finally {
      setBusy(null);
    }
  };

  const escrows = payments.filter((p) => p.type === "escrow" && p.status === "succeeded").reduce((s, p) => s + p.amount, 0);
  const payouts = payments.filter((p) => p.type === "payout" && p.status === "succeeded").reduce((s, p) => s + p.amount, 0);
  const failed = payments.filter((p) => p.status === "failed").length;

  return (
    <ShellLayout>
      <PageHeader title="Payments" subtitle="Escrow, payouts & refunds" />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="text-sm text-slate-500">Escrow held</div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-sky-600">₹{escrows.toLocaleString("en-IN")}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-slate-500">Payouts released</div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-emerald-600">₹{payouts.toLocaleString("en-IN")}</div>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-slate-500">Failed</div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-red-600">{failed}</div>
        </Card>
      </div>

      <div className="mb-4 flex gap-2">
        {["all", "escrow", "payout", "refund", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              status === s ? "bg-orange-500 text-white" : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="table-card">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
      <div className="table-card">
        <table className="w-full text-left text-sm">
          <thead className="table-head">
            <tr>
              <Th>Type</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Route</Th>
              <Th>Date</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3.5">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_BADGE[p.type]}`}>{p.type}</span>
                </td>
                <td className="px-5 py-3.5 font-bold tabular-nums text-slate-800 dark:text-slate-200">₹{p.amount.toLocaleString("en-IN")}</td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                <td className="px-5 py-3.5 text-slate-500">
                  {p.trip?.load ? (
                    <Link
                      href={`/payments/${p.id}`}
                      className="text-orange-600 hover:underline dark:text-orange-400"
                    >
                      {p.trip.load.pickupAddr} → {p.trip.load.dropAddr}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-5 py-3.5 text-xs text-slate-400">{new Date(p.createdAt).toLocaleString()}</td>
                <td className="px-5 py-3.5 text-right">
                  {p.type !== "refund" && p.status === "succeeded" && (
                    <button
                      onClick={() => refund(p)}
                      disabled={busy === p.id}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-700 dark:text-amber-400"
                    >
                      {busy === p.id ? "…" : "Refund"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && !loading && <EmptyRow colSpan={6}>No payments.</EmptyRow>}
          </tbody>
        </table>
      </div>
      )}
    </ShellLayout>
  );
}
