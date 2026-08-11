"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { ShellLayout } from "../../../components/ShellLayout";
import { PageHeader, Card, Badge, StatusBadge, Th, Td, EmptyRow, SkeletonRows } from "../../../components/ui";

interface UserDetail {
  user: {
    id: string;
    mobile: string;
    name: string | null;
    role: string;
    capabilities?: string[];
    tier: string;
    kycStatus: string;
    verified: boolean;
    supplierVerified?: boolean;
    transporterVerified?: boolean;
    isActive: boolean;
    createdAt: string;
    supplier?: { companyName: string | null; gst: string | null; pan: string | null; onboarded: boolean } | null;
    transporter?: { companyName: string | null; fleetSize: number | null; onboarded: boolean; vehicles: Array<{ rcNumber: string; rcVerified: boolean }> } | null;
    kycDocuments: Array<{ kind: string; status: string; mimeType: string }>;
    notifications: Array<{ id: string; type: string; title: string; isRead: boolean; createdAt: string }>;
    tickets: Array<{ id: string; subject: string; status: string; createdAt: string }>;
  };
  trips: Array<{ id: string; status: string; load: { pickupAddr: string; dropAddr: string } }>;
  loads: Array<{ id: string; pickupAddr: string; dropAddr: string; status: string; fareEstimate: number; createdAt: string }>;
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    api
      .get<UserDetail>(`/admin/users/${id}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load user"));
  }, [id]);

  const u = data?.user;

  return (
    <ShellLayout>
      <PageHeader
        title={u ? (u.name ?? u.mobile) : "User"}
        subtitle="360° view — profile, KYC, loads, trips, tickets & notifications"
        actions={
          <Link href="/users" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
            ← Users
          </Link>
        }
      />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!data && !error && (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      )}

      {data && u && (
        <div className="space-y-6">
          {/* Identity */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{u.name ?? "Unnamed"}</h2>
                  <Badge tone="violet">{u.role}</Badge>
                  {u.isActive ? <Badge tone="emerald">Active</Badge> : <Badge tone="red">Suspended</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-500">+91 {u.mobile}</p>
                <p className="mt-1 text-xs text-slate-400">Joined {new Date(u.createdAt).toLocaleDateString("en-IN")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {u.capabilities?.map((c) => <Badge key={c} tone="sky">{c}</Badge>)}
                <StatusBadge status={u.kycStatus} />
                {u.verified && <Badge tone="emerald">KYC verified</Badge>}
                {u.supplierVerified && <Badge tone="emerald">Supplier ✓</Badge>}
                {u.transporterVerified && <Badge tone="emerald">Transporter ✓</Badge>}
              </div>
            </div>
          </Card>

          {/* Profiles */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Supplier profile</h3>
              {u.supplier ? (
                <dl className="space-y-2 text-sm">
                  <Detail label="Company" value={u.supplier.companyName ?? "—"} />
                  <Detail label="GST" value={u.supplier.gst ?? "—"} />
                  <Detail label="PAN" value={u.supplier.pan ?? "—"} />
                  <Detail label="Onboarded" value={u.supplier.onboarded ? "Yes" : "No"} />
                </dl>
              ) : (
                <p className="text-sm text-slate-400">No supplier profile.</p>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Transporter profile</h3>
              {u.transporter ? (
                <dl className="space-y-2 text-sm">
                  <Detail label="Company" value={u.transporter.companyName ?? "—"} />
                  <Detail label="Fleet size" value={u.transporter.fleetSize != null ? String(u.transporter.fleetSize) : "—"} />
                  <Detail label="Onboarded" value={u.transporter.onboarded ? "Yes" : "No"} />
                  <div>
                    <span className="text-slate-500">Vehicles</span>
                    <div className="mt-1 space-y-1">
                      {u.transporter.vehicles.length === 0 && <span className="text-slate-400">—</span>}
                      {u.transporter.vehicles.map((v, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{v.rcNumber}</span>
                          {v.rcVerified ? <Badge tone="emerald">RC ✓</Badge> : <Badge tone="amber">RC pending</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-slate-400">No transporter profile.</p>
              )}
            </Card>
          </div>

          {/* KYC docs */}
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">KYC documents</h3>
            {u.kycDocuments.length === 0 ? (
              <p className="text-sm text-slate-400">No documents uploaded.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {u.kycDocuments.map((d, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                    <span className="font-semibold capitalize text-slate-700 dark:text-slate-200">{d.kind}</span>
                    <StatusBadge status={d.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Loads */}
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Loads ({data.loads.length})</h3>
            <div className="table-card">
              <table className="w-full text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <Th>Route</Th>
                    <Th>Fare</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.loads.map((l) => (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{l.pickupAddr} → {l.dropAddr}</td>
                      <td className="px-5 py-3 font-semibold tabular-nums text-slate-800 dark:text-slate-100">₹{l.fareEstimate.toLocaleString("en-IN")}</td>
                      <Td><StatusBadge status={l.status} /></Td>
                      <td className="px-5 py-3 text-xs text-slate-400">{new Date(l.createdAt).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                  {data.loads.length === 0 && <EmptyRow colSpan={4}>No loads.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Trips */}
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Trips ({data.trips.length})</h3>
            <div className="table-card">
              <table className="w-full text-left text-sm">
                <thead className="table-head">
                  <tr>
                    <Th>Route</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.trips.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-5 py-3 text-slate-700 dark:text-slate-200">{t.load.pickupAddr} → {t.load.dropAddr}</td>
                      <Td><StatusBadge status={t.status} /></Td>
                    </tr>
                  ))}
                  {data.trips.length === 0 && <EmptyRow colSpan={2}>No trips.</EmptyRow>}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Tickets */}
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Support tickets ({u.tickets.length})</h3>
            {u.tickets.length === 0 ? (
              <p className="text-sm text-slate-400">No tickets.</p>
            ) : (
              <div className="space-y-2">
                {u.tickets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 dark:bg-slate-800">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{t.subject}</span>
                    <StatusBadge status={t.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </ShellLayout>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800 dark:text-slate-100">{value}</dd>
    </div>
  );
}
