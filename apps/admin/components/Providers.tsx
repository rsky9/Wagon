"use client";

import { AuthProvider } from "../lib/auth";
import { AdminShell } from "./AdminShell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
