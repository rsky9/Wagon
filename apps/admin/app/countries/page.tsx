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

  return (
    <ShellLayout>
      <PageHeader title="Countries" subtitle="Country packs: currency, customs regime and cross-border document requirements" />

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
    </ShellLayout>
  );
}