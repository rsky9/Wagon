"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../lib/auth";

const nav = [
  { label: "Dashboard", href: "/", key: "/", icon: "▦" },
  { label: "Users", href: "/users", key: "/users", icon: "👥" },
  { label: "Loads & Trips", href: "/loads", key: "/loads", icon: "🚛" },
  { label: "Trips", href: "/trips", key: "/trips", icon: "🧭" },
  { label: "E-Way Bills", href: "/ewb", key: "/ewb", icon: "🧾" },
  { label: "Exceptions", href: "/exceptions", key: "/exceptions", icon: "⚠️" },
  { label: "Ops Tower", href: "/ops", key: "/ops", icon: "🛰️" },
  { label: "Payments", href: "/payments", key: "/payments", icon: "₹" },
  { label: "Disputes", href: "/disputes", key: "/disputes", icon: "⚖️" },
  { label: "Tickets", href: "/tickets", key: "/tickets", icon: "🎫" },
  { label: "Reports", href: "/reports", key: "/reports", icon: "🚩" },
  { label: "Broadcast", href: "/broadcast", key: "/broadcast", icon: "📢" },
  { label: "Rate Cards", href: "/rate-cards", key: "/rate-cards", icon: "📊" },
  { label: "Market Analytics", href: "/market-analytics", key: "/market-analytics", icon: "📈" },
  { label: "Network Analytics", href: "/analytics", key: "/analytics", icon: "📊" },
  { label: "Countries", href: "/countries", key: "/countries", icon: "🌍" },
  { label: "Contracts", href: "/contracts", key: "/contracts", icon: "📝" },
  { label: "Invoicing", href: "/invoicing", key: "/invoicing", icon: "🧾" },
  { label: "Containers", href: "/containers", key: "/containers", icon: "📦" },
  { label: "Returns", href: "/returns", key: "/returns", icon: "↩️" },
  { label: "Handovers", href: "/handovers", key: "/handovers", icon: "🤝" },
  { label: "Customs", href: "/customs", key: "/customs", icon: "🛃" },
  { label: "Yard & Docks", href: "/yard", key: "/yard", icon: "🚪" },
  { label: "Documents", href: "/trade-documents", key: "/trade-documents", icon: "📄" },
  { label: "Organizations", href: "/organizations", key: "/organizations", icon: "🏢" },
  { label: "EDI Gateway", href: "/edi", key: "/edi", icon: "🔁" },
  { label: "Visibility", href: "/visibility", key: "/visibility", icon: "👁️" },
  { label: "Audit Log", href: "/audit", key: "/audit", icon: "📜" },
  { label: "Enablement", href: "/enablement", key: "/enablement", icon: "🧩" },
];

const SECTION_LABELS: Record<string, string> = {
  "": "Overview",
  "/users": "People",
  "/loads": "Operations",
  "/ewb": "Compliance",
  "/exceptions": "Operations",
  "/ops": "Operations",
  "/payments": "Finance",
  "/disputes": "Trust",
  "/tickets": "Support",
  "/reports": "Safety",
  "/broadcast": "Engage",
  "/rate-cards": "Pricing",
  "/market-analytics": "Marketplace",
  "/analytics": "Network Ops",
  "/countries": "Global",
  "/contracts": "Contracting",
  "/invoicing": "Finance",
  "/containers": "Equipment",
  "/returns": "Reverse Logistics",
  "/handovers": "Custody",
  "/customs": "Trade",
  "/yard": "Yard Execution",
  "/trade-documents": "Trade",
  "/organizations": "Parties",
  "/edi": "Integrations",
  "/visibility": "Visibility",
  "/audit": "Security",
  "/enablement": "Enablement",
};

export function ShellLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout } = useAuth();
  const section = SECTION_LABELS[pathname] ?? "Console";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="relative flex w-64 shrink-0 flex-col border-r border-slate-200/60 bg-[#0b1120]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-orange-500/10 via-transparent to-emerald-500/5" />
        <div className="relative mb-6 px-5 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-lg font-black text-white shadow-lg shadow-orange-500/30">
              W
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight text-white">
                Wagon<span className="text-orange-400">.</span>
              </div>
              <div className="text-[11px] font-medium uppercase tracking-widest text-slate-500">Admin Console</div>
            </div>
          </div>
        </div>

        <div className="relative mb-2 px-5">
          <div className="rounded-lg bg-white/5 px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            {section}
          </div>
        </div>

        <nav className="relative flex-1 space-y-1 overflow-y-auto px-3">
          {nav.map((item) => {
            const isActive = pathname === item.key;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-orange-500/20 to-orange-500/5 font-semibold text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                }`}
              >
                {isActive && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.6)]" />}
                <span className={`w-5 text-center text-base transition-transform group-hover:scale-110 ${isActive ? "opacity-100" : "opacity-70"}`}>
                  {item.icon}
                </span>
                {item.label}
                {isActive && <span className="ml-auto h-1.5 w-1.5 animate-pulse-soft rounded-full bg-orange-400" />}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="relative m-3 mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
        >
          <span className="w-5 text-center">⎋</span>
          Logout
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="animate-fade-up mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
