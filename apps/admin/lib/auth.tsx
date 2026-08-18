"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, setAccessToken, setRefreshToken } from "./api";

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
    const refreshToken = localStorage.getItem("wagon_admin_refresh");
    return token
      ? { accessToken: token, refreshToken: refreshToken ?? "", profile: { id: "", mobile: "", role: "admin" } }
      : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return Boolean(localStorage.getItem("wagon_admin_token"));
  });

  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("wagon_admin_token");
    if (!token) return;
    (async () => {
      try {
        const res = await api.get<{ profile: { id: string; mobile: string; role: string } }>("/auth/me");
        if (cancelled) return;
        const accessToken = localStorage.getItem("wagon_admin_token");
        const refreshToken = localStorage.getItem("wagon_admin_refresh") ?? "";
        setSession({ accessToken: accessToken ?? "", refreshToken, profile: res.profile });
      } catch {
        if (cancelled) return;
        setAccessToken(null);
        setRefreshToken(null);
        setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    setRefreshToken(res.refreshToken);
    setSession(res);
  };

  const logout = () => {
    setAccessToken(null);
    setRefreshToken(null);
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
