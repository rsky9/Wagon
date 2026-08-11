"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, SkeletonRows } from "../../components/ui";

interface RateCard {
  modelId: string;
  type: string;
  model: string;
  pricePerKm: number;
}

export default function RateCards() {
  const [cards, setCards] = useState<RateCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCards = () => {
    setLoading(true);
    api
      .get<{ rateCards: RateCard[] }>("/reference/rate-cards")
      .then((res) => setCards(res.rateCards))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load rate cards"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCards(); }, []);

  const update = async (c: RateCard) => {
    const input = window.prompt(`Price per km for ${c.type} · ${c.model} (₹):`, String(c.pricePerKm || ""));
    if (input === null) return;
    const price = Number(input);
    if (!price || price <= 0) {
      setError("Enter a valid price");
      return;
    }
    setBusy(c.modelId);
    try {
      await api.post(`/admin/rate-cards/${c.modelId}`, { pricePerKm: price });
      setCards((prev) => prev.map((x) => (x.modelId === c.modelId ? { ...x, pricePerKm: price } : x)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ShellLayout>
      <PageHeader title="Rate cards" subtitle="Reference pricing per truck model · transparent for load creation & bidding" />

      {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={4} cols={4} />
        </div>
      ) : (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400 dark:border-slate-800">
            <tr>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Model</th>
              <th className="px-5 py-3">Price / km</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.modelId} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-5 py-3 capitalize text-slate-600 dark:text-slate-300">{c.type}</td>
                <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{c.model}</td>
                <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">₹{c.pricePerKm || "—"}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => update(c)}
                    disabled={busy === c.modelId}
                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
                  >
                    {busy === c.modelId ? "…" : "Edit"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cards.length === 0 && !error && !loading && <p className="px-5 py-10 text-center text-slate-400">No rate cards.</p>}
      </div>
      )}
    </ShellLayout>
  );
}
