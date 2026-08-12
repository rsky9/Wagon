"use client";

import { ApiError, createApiClient } from "@wagon/api-client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4020/api/v1";

const REFRESH_KEY = "wagon_admin_refresh";

let accessToken: string | null =
  typeof window !== "undefined" ? localStorage.getItem("wagon_admin_token") : null;

let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("wagon_admin_token", token);
    else localStorage.removeItem("wagon_admin_token");
  }
}

export function setRefreshToken(token: string | null) {
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem(REFRESH_KEY, token);
    else localStorage.removeItem(REFRESH_KEY);
  }
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) return null;
        const data: { accessToken: string; refreshToken: string } = await res.json();
        setAccessToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        return data.accessToken;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

function clearSessionAndReload() {
  setAccessToken(null);
  setRefreshToken(null);
  // Full reload clears all client state on session expiry.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/";
}

const base = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => accessToken,
});

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  try {
    return await base.request<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && typeof window !== "undefined") {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return base.request<T>(method, path, body);
      }
      clearSessionAndReload();
    }
    throw e;
  }
}

export const api = {
  request,
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};
