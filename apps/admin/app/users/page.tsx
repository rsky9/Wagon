"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, StatusBadge, EmptyRow, Th, Td } from "../../components/ui";

interface UserRow {
  id: string;
  mobile: string;
  role: string;
  name: string | null;
  tier: string;
  kycStatus: string;
  verified: boolean;
  isActive?: boolean;
  createdAt: string;
}

interface KycDoc {
  id: string;
  kind: string;
  status: string;
  mimeType: string;
  url: string | null;
}

type Filter = "all" | "approved" | "pending" | "rejected" | "not_started";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "not_started", label: "Not started" },
];

const BADGE: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  not_started: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

export default function Users() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [docUser, setDocUser] = useState<{ id: string; name: string } | null>(null);
  const [docs, setDocs] = useState<KycDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const openDocs = async (u: UserRow) => {
    setDocUser({ id: u.id, name: u.name ?? u.mobile });
    setDocsLoading(true);
    try {
      const res = await api.get<{ docs: KycDoc[] }>(`/admin/users/${u.id}/kyc`);
      setDocs(res.docs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load docs");
    } finally {
      setDocsLoading(false);
    }
  };

  const fetchUsers = useCallback((q?: string) => {
    api
      .get<{ users: UserRow[] }>(`/admin/users?${q ? `q=${encodeURIComponent(q)}&` : ""}pageSize=100`)
      .then((res) => setUsers(res.users))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users"));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchUsers(query), 300);
    return () => clearTimeout(t);
  }, [query, fetchUsers]);

  const verify = async (id: string) => {
    setBusy(id);
    try {
      await api.post(`/admin/verify/${id}`);
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id: string) => {
    if (!window.confirm("Reject this user's KYC?")) return;
    setBusy(id);
    try {
      await api.patch(`/admin/users/${id}/reject`);
      fetchUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setBusy(null);
    }
  };

  const suspend = async (id: string) => {
    if (!window.confirm("Suspend this user? They will be unable to log in.")) return;
    setBusy(id);
    try {
      await api.post(`/admin/users/${id}/suspend`);
      fetchUsers(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to suspend");
    } finally {
      setBusy(null);
    }
  };

  const activate = async (id: string) => {
    setBusy(id);
    try {
      await api.post(`/admin/users/${id}/activate`);
      fetchUsers(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate");
    } finally {
      setBusy(null);
    }
  };

  const removeUser = async (id: string, name: string) => {
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    setBusy(id);
    try {
      await api.request("DELETE", `/admin/users/${id}`);
      fetchUsers(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(null);
    }
  };

  const changeRole = async (id: string, current: string) => {
    const role = window.prompt("Set role (supplier / transporter / driver):", current);
    if (!role) return;
    setBusy(id);
    try {
      await api.patch(`/admin/users/${id}/role`, { role });
      fetchUsers(query);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role");
    } finally {
      setBusy(null);
    }
  };

  const filtered = filter === "all" ? users : users.filter((u) => u.kycStatus === filter);
  const count = (k: Filter) => (k === "all" ? users.length : users.filter((u) => u.kycStatus === k).length);

  return (
    <ShellLayout>
      <PageHeader title="Users" subtitle="KYC verification queue & account management"
        actions={
          <input
            className="input w-64"
            placeholder="Search by mobile or name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        }
      />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-orange-500 text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {f.label}
            <span className={`ml-1.5 text-xs ${filter === f.key ? "text-white/80" : "text-slate-400"}`}>
              {count(f.key)}
            </span>
          </button>
        ))}
      </div>

      <div className="table-card">
        <table className="w-full text-left text-sm">
          <thead className="table-head">
            <tr>
              <Th>Name</Th>
              <Th>Mobile</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Tier</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="px-5 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                  {u.name ?? "—"}
                </td>
                <td className="px-5 py-3.5 tabular-nums text-slate-600 dark:text-slate-400">{u.mobile}</td>
                <td className="px-5 py-3.5 capitalize text-slate-600 dark:text-slate-400">{u.role}</td>
                <Td>
                  <StatusBadge status={u.kycStatus} />
                </Td>
                <td className="px-5 py-3.5 capitalize text-slate-600 dark:text-slate-400">
                  {u.tier.replace("_", " ")}
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => openDocs(u)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
                    >
                      Docs
                    </button>
                    {u.kycStatus !== "approved" && (
                      <button
                        onClick={() => verify(u.id)}
                        disabled={busy === u.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {busy === u.id ? "…" : "Approve"}
                      </button>
                    )}
                    {u.kycStatus !== "rejected" && (
                      <button
                        onClick={() => reject(u.id)}
                        disabled={busy === u.id}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-700"
                      >
                        Reject
                      </button>
                    )}
                    {u.isActive === false ? (
                      <button
                        onClick={() => activate(u.id)}
                        disabled={busy === u.id}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        Activate
                      </button>
                    ) : (
                      <button
                        onClick={() => suspend(u.id)}
                        disabled={busy === u.id}
                        className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-50"
                      >
                        Suspend
                      </button>
                    )}
                    <button
                      onClick={() => changeRole(u.id, u.role)}
                      disabled={busy === u.id}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
                    >
                      Role
                    </button>
                    <button
                      onClick={() => removeUser(u.id, u.name ?? u.mobile)}
                      disabled={busy === u.id}
                      className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <EmptyRow colSpan={6}>No users match this filter.</EmptyRow>}
          </tbody>
        </table>
      </div>

      {docUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setDocUser(null)}>
          <div className="card-shadow max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">KYC documents</h3>
                <p className="text-sm text-slate-500">{docUser.name}</p>
              </div>
              <button onClick={() => setDocUser(null)} className="rounded-lg px-3 py-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                ✕
              </button>
            </div>

            {docsLoading ? (
              <p className="py-8 text-center text-slate-400">Loading documents…</p>
            ) : docs.length === 0 ? (
              <p className="py-8 text-center text-slate-400">No documents uploaded yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {docs.map((d) => (
                  <div key={d.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold capitalize text-slate-700 dark:text-slate-200">{d.kind}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[d.status] ?? BADGE.not_started}`}>
                        {d.status}
                      </span>
                    </div>
                    <p className="mb-2 text-xs text-slate-400">{d.mimeType}</p>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700"
                      >
                        Open document ↗
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Unavailable</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </ShellLayout>
  );
}
