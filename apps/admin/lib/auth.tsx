"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { api, setAccessToken } from "./api";

interface Session {
  accessToken: string;
  refreshToken: string;
  profile: { id: string; mobile: string; role: string };
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  requestOtp: (mobile: string) => Promise<{ devCode?: string } | undefined>;
  verifyOtp: (mobile: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    if (typeof window === "undefined") return null;
    const token = localStorage.getItem("wagon_admin_token");
    return token
      ? { accessToken: token, refreshToken: "", profile: { id: "", mobile: "", role: "admin" } }
      : null;
  });
  const [loading] = useState(false);

  const requestOtp = async (mobile: string) => {
    const res = await api.post<{ devCode?: string }>("/auth/otp", { mobile });
    return res;
  };

  const verifyOtp = async (mobile: string, code: string) => {
    const res = await api.post<Session>("/auth/verify", { mobile, code });
    if (res.profile.role !== "admin") {
      throw new Error("Not an admin account");
    }
    setAccessToken(res.accessToken);
    setSession(res);
  };

  const logout = () => {
    setAccessToken(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, loading, requestOtp, verifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
