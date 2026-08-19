"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { ShellLayout } from "../../components/ShellLayout";
import { PageHeader, Card, Badge, SkeletonRows, EmptyRow } from "../../components/ui";

interface OrgNode {
  id: string;
  name: string;
  kind: string;
  parentOrgId?: string | null;
  kybcStatus: string;
  verified: boolean;
  children?: OrgNode[];
}

export default function Organizations() {
  const [tree, setTree] = useState<OrgNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ tree: OrgNode }>("/kyb/tree")
      .then((res) => setTree(res.tree))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load org tree"))
      .finally(() => setLoading(false));
  }, []);

  const tone = (s: string) =>
    s === "verified" ? "emerald" : s === "rejected" ? "red" : s === "pending" ? "amber" : "slate";

  const renderNode = (node: OrgNode, depth: number) => (
    <div key={node.id} style={{ paddingLeft: depth * 20 }}>
      <div className="flex flex-wrap items-center gap-2 py-2">
        <span className="text-slate-400">{depth === 0 ? "🏢" : "└─ 🏢"}</span>
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{node.name}</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{node.kind}</span>
        {node.verified && <Badge tone="emerald">verified</Badge>}
        <Badge tone={tone(node.kybcStatus)}>kyb: {node.kybcStatus}</Badge>
      </div>
      {node.children?.map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <ShellLayout>
      <PageHeader title="Organizations" subtitle="KYB verification state, business registration and org hierarchy" />

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Organization hierarchy</h3>
        {loading ? <SkeletonRows rows={5} cols={3} /> : tree ? renderNode(tree, 0) : <EmptyRow colSpan={1}>No organizations.</EmptyRow>}
      </Card>
    </ShellLayout>
  );
}