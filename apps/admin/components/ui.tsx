"use client";

/** Shared admin UI primitives — cards, badges, stat tiles, page headers, skeletons. */

export function Card({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`card-shadow rounded-2xl border border-slate-200 bg-white transition-all dark:border-slate-800 dark:bg-slate-900 ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  red: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
};

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: BadgeTone }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_TONES[tone] ?? BADGE_TONES.slate}`}>{children}</span>;
}

/** Map a status string to a badge tone. */
export function statusTone(status: string): keyof typeof BADGE_TONES {
  const s = status.toLowerCase().replace(/_/g, " ");
  if (/approv|success|delivered|active|closed|resolved|paid|succeeded|done/.test(s)) return "emerald";
  if (/pend|open|process|in.transit|await/.test(s)) return "amber";
  if (/fail|reject|cancel|suspend|block|error|danger/.test(s)) return "red";
  if (/escrow|draft|interest/.test(s)) return "sky";
  if (/broadcast|admin/.test(s)) return "violet";
  return "slate";
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status.replace(/_/g, " ")}</Badge>;
}

export function StatCard({ label, value, icon, tone = "orange", sub }: { label: string; value: string; icon: string; tone?: string; sub?: string }) {
  const tones: Record<string, string> = {
    orange: "from-orange-500 to-amber-500",
    emerald: "from-emerald-500 to-teal-500",
    sky: "from-sky-500 to-blue-500",
    violet: "from-violet-500 to-purple-500",
    amber: "from-amber-500 to-yellow-500",
    red: "from-rose-500 to-red-500",
  };
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${tones[tone] ?? tones.orange} opacity-10 blur-2xl`} />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent dark:from-white dark:to-slate-400">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800 ${className}`} />;
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center">
        <div className="text-3xl">🗂️</div>
        <p className="mt-2 text-sm text-slate-400">{children}</p>
      </td>
    </tr>
  );
}

export function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-3.5 ${className}`}>{children}</td>;
}
