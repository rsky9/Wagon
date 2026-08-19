"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, Th, Td, EmptyRow } from "../../components/ui";

interface CountryPack {
  id: string;
  code: string;
  name: string;
  currency: string;
  baseCurrency: string;
  exchangeRateToBase?: number | null;
  customsRegime: string;
  language: string;
  unitSystem: string;
  documentRequirements?: string[] | null;
  incotermsSupported?: string[] | null;
  enabled: boolean;
}

export default function Countries() {
  const [countries, setCountries] = useState<CountryPack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const fetchCountries = useCallback(() => {
    api
      .get<{ countries: CountryPack[] }>("/countries/admin/list")
      .then((res) => setCountries(res.countries))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load countries"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchCountries();
  }, [fetchCountries]);

  const upsert = async () => {
    if (!form.code?.trim()) {
      setError("Country code is required (e.g. AE, SG)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/countries/admin/upsert", {
        code: form.code.trim().toUpperCase(),
        name: form.name?.trim() || undefined,
        currency: form.currency?.trim() || undefined,
        baseCurrency: form.baseCurrency?.trim() || undefined,
        language: form.language?.trim() || undefined,
        customsRegime: form.customsRegime?.trim() || undefined,
        unitSystem: form.unitSystem?.trim() || undefined,
        exchangeRateToBase: form.exchangeRate ? Number(form.exchangeRate) : undefined,
      });
      setShowForm(false);
      setForm({});
      fetchCountries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save country");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ShellLayout>
      <PageHeader title="Countries" subtitle="Country packs: currency, customs regime and cross-border document requirements" actions={
        <button onClick={() => { setForm({}); setShowForm(true); }} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">New Country</button>
      } />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {loading ? (
        <div className="card-shadow rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <SkeletonRows rows={6} cols={5} />
        </div>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <Th>Country</Th>
                <Th>Currency</Th>
                <Th>FX → Base</Th>
                <Th>Customs Regime</Th>
                <Th>Units</Th>
                <Th>Required Documents</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {countries.length === 0 && <EmptyRow colSpan={6}>No country packs.</EmptyRow>}
              {countries.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">{c.name}</div>
                    <div className="text-[11px] font-mono text-slate-400">{c.code}</div>
                  </Td>
                  <Td className="text-xs font-semibold">{c.currency}</Td>
                  <Td className="text-xs tabular-nums text-slate-500">
                    {c.exchangeRateToBase != null ? `${c.currency} 1 = ${c.baseCurrency} ${c.exchangeRateToBase}` : "—"}
                  </Td>
                  <Td>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.customsRegime}</span>
                  </Td>
                  <Td className="text-xs">{c.unitSystem}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(c.documentRequirements ?? []).map((d) => (
                        <Badge key={d} tone="blue">{d.replace(/_/g, " ")}</Badge>
                      ))}
                    </div>
                  </Td>
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
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Country pack</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="space-y-3">
              {[
                { k: "code", label: "Code *", ph: "e.g. AE, SG" },
                { k: "name", label: "Name", ph: "United Arab Emirates" },
                { k: "currency", label: "Currency", ph: "AED" },
                { k: "baseCurrency", label: "Base currency", ph: "INR" },
                { k: "exchangeRate", label: "Exchange rate to base", ph: "0.021" },
                { k: "language", label: "Language", ph: "en" },
                { k: "customsRegime", label: "Customs regime", ph: "general" },
                { k: "unitSystem", label: "Unit system", ph: "metric" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">{f.label}</label>
                  <input
                    value={form[f.k] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.k]: e.target.value }))}
                    placeholder={f.ph}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              ))}
            </div>
            <div className="mt-5 flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">Cancel</button>
              <button onClick={upsert} disabled={busy} className="flex-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </ShellLayout>
  );
}