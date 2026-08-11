"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { ShellLayout } from "../../../components/ShellLayout";
import { PageHeader, Card, Badge, StatusBadge, SkeletonRows } from "../../../components/ui";

interface PaymentDetail {
  payment: {
    id: string;
    type: string;
    amount: number;
    gstAmount?: number | null;
    tdsAmount?: number | null;
    method: string;
    providerRef?: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    trip?: {
      id: string;
      status: string;
      stage: string;
      createdAt: string;
      load?: {
        id: string;
        pickupAddr: string;
        dropAddr: string;
        truckType: string;
        weight: number;
        distanceKm: number;
        fareEstimate: number;
        status: string;
        material?: { id: string; name: string } | null;
        supplier?: {
          companyName: string | null;
          user: { id: string; name: string | null; mobile: string };
        } | null;
      } | null;
    } | null;
  };
}

const TYPE_BADGE: Record<string, "sky" | "emerald" | "amber" | "red" | "slate" | "orange" | "violet"> = {
  escrow: "sky",
  payout: "emerald",
  refund: "amber",
};

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    api
      .get<PaymentDetail>(`/admin/payments/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load payment"));
  }, [id]);

  const p = data?.payment;

  return (
    <ShellLayout>
      <PageHeader
        title={p ? `${p.type} payment` : "Payment"}
        subtitle="Payment detail · trip & load info"
        actions={
          <Link href="/payments" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
            ← Payments
          </Link>
        }
      />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!data && !error && (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      )}

      {data && p && (
        <div className="space-y-6">
          {/* Payment overview */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone={TYPE_BADGE[p.type] ?? "slate"}>{p.type}</Badge>
                  <StatusBadge status={p.status} />
                </div>
                <p className="mt-2 font-mono text-xs text-slate-400">{p.id}</p>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-500">Amount</div>
                <div className="text-2xl font-extrabold tabular-nums text-slate-800 dark:text-slate-100">
                  ₹{p.amount.toLocaleString("en-IN")}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm lg:grid-cols-4 dark:border-slate-800">
              <Detail label="Method" value={p.method} />
              <Detail label="GST" value={p.gstAmount != null ? `₹${p.gstAmount.toLocaleString("en-IN")}` : "—"} />
              <Detail label="TDS" value={p.tdsAmount != null ? `₹${p.tdsAmount.toLocaleString("en-IN")}` : "—"} />
              <Detail label="Provider ref" value={p.providerRef ?? "—"} />
            </div>
            <div className="mt-2 flex gap-8 text-xs text-slate-400">
              <span>Created {new Date(p.createdAt).toLocaleString()}</span>
              <span>Updated {new Date(p.updatedAt).toLocaleString()}</span>
            </div>
          </Card>

          {/* Trip info */}
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Trip</h3>
            {p.trip ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{p.trip.id}</span>
                  <StatusBadge status={p.trip.status} />
                  <Badge tone="slate">{p.trip.stage.replace(/_/g, " ")}</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm lg:grid-cols-4 dark:border-slate-800">
                  <Detail label="Started" value={new Date(p.trip.createdAt).toLocaleString()} />
                  <Detail label="Supplier" value={p.trip.load?.supplier?.companyName ?? p.trip.load?.supplier?.user.name ?? "—"} />
                  <Detail label="Material" value={p.trip.load?.material?.name ?? "—"} />
                  <Detail label="Fare" value={p.trip.load ? `₹${p.trip.load.fareEstimate.toLocaleString("en-IN")}` : "—"} />
                </dl>
              </>
            ) : (
              <p className="text-sm text-slate-400">No trip linked.</p>
            )}
          </Card>

          {/* Load info */}
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Load</h3>
            {p.trip?.load ? (
              <>
                <Link
                  href={`/loads/${p.trip.load.id}`}
                  className="font-semibold text-orange-600 hover:underline dark:text-orange-400"
                >
                  {p.trip.load.pickupAddr} → {p.trip.load.dropAddr}
                </Link>
                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm lg:grid-cols-4 dark:border-slate-800">
                  <Detail label="Truck type" value={p.trip.load.truckType} />
                  <Detail label="Weight" value={`${p.trip.load.weight}t`} />
                  <Detail label="Distance" value={`${p.trip.load.distanceKm} km`} />
                  <Detail label="Status" value={p.trip.load.status.replace(/_/g, " ")} />
                </dl>
              </>
            ) : (
              <p className="text-sm text-slate-400">No load linked.</p>
            )}
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
