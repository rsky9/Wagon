"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { ShellLayout } from "../../../components/ShellLayout";
import { PageHeader, Card, Badge, StatusBadge, Th, Td, EmptyRow, SkeletonRows } from "../../../components/ui";

interface LoadDetail {
  load: {
    id: string;
    pickupAddr: string;
    dropAddr: string;
    truckType: string;
    weight: number;
    distanceKm: number;
    fareEstimate: number;
    status: string;
    date: string;
    createdAt: string;
    ewbNumber?: string | null;
    cancelReason?: string | null;
    noOfTrucks?: number;
    advanceAmount?: number | null;
    material?: { id: string; name: string } | null;
    supplier?: {
      companyName: string | null;
      user: { id: string; name: string | null; mobile: string };
    } | null;
    bids: Array<{
      id: string;
      amount: number;
      advanceAmount?: number | null;
      balanceAmount?: number | null;
      status: string;
      etaHours?: number | null;
      createdAt: string;
      transporter?: {
        user: { id: string; name: string | null; mobile: string };
      } | null;
    }>;
  };
}

export default function LoadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<LoadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    api
      .get<LoadDetail>(`/admin/loads/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load load"));
  }, [id]);

  const l = data?.load;

  return (
    <ShellLayout>
      <PageHeader
        title={l ? `${l.pickupAddr} → ${l.dropAddr}` : "Load"}
        subtitle="Load detail · quotes & bids"
        actions={
          <Link href="/loads" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
            ← Loads
          </Link>
        }
      />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!data && !error && (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      )}

      {data && l && (
        <div className="space-y-6">
          {/* Load overview */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{l.material?.name ?? "Load"}</h2>
                  <Badge tone="sky">{l.truckType}</Badge>
                  <StatusBadge status={l.status} />
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  {l.pickupAddr} → {l.dropAddr}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {l.weight}t · {l.distanceKm} km · Created {new Date(l.createdAt).toLocaleDateString("en-IN")}
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Fare estimate</div>
                <div className="text-2xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">
                  ₹{l.fareEstimate.toLocaleString("en-IN")}
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm lg:grid-cols-4 dark:border-slate-800">
              <Detail label="Supplier" value={l.supplier?.companyName ?? l.supplier?.user.name ?? "—"} />
              <Detail label="Contact" value={l.supplier ? `+91 ${l.supplier.user.mobile}` : "—"} />
              <Detail label="Trucks" value={String(l.noOfTrucks ?? 1)} />
              <Detail label="Advance" value={l.advanceAmount != null ? `₹${l.advanceAmount.toLocaleString("en-IN")}` : "—"} />
            </dl>
            {l.cancelReason && <p className="mt-3 text-xs text-red-600">Cancelled: {l.cancelReason}</p>}
          </Card>

          {/* Bids */}
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Bids ({l.bids.length})</h3>
            <div className="table-card">
              <table className="w-full text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <Th>Transporter</Th>
                    <Th className="text-right">Amount</Th>
                    <Th className="text-right">Advance</Th>
                    <Th className="text-right">Balance</Th>
                    <Th>ETA</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                  </tr>
                </thead>
                <tbody>
                  {l.bids.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-5 py-3">
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {b.transporter?.user.name ?? "Transporter"}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">+91 {b.transporter?.user.mobile ?? "—"}</span>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                        ₹{b.amount.toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {b.advanceAmount != null ? `₹${b.advanceAmount.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                        {b.balanceAmount != null ? `₹${b.balanceAmount.toLocaleString("en-IN")}` : "—"}
                      </td>
                      <Td>{b.etaHours != null ? `${b.etaHours}h` : "—"}</Td>
                      <Td>
                        <StatusBadge status={b.status} />
                      </Td>
                      <td className="px-5 py-3 text-xs text-slate-400">{new Date(b.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {l.bids.length === 0 && <EmptyRow colSpan={7}>No bids.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </ShellLayout>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}
