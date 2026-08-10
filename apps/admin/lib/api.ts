"use client";

import { createApiClient } from "@wagon/api-client";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4020/api/v1";

let accessToken: string | null =
  typeof window !== "undefined" ? localStorage.getItem("wagon_admin_token") : null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("wagon_admin_token", token);
    else localStorage.removeItem("wagon_admin_token");
  }
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => accessToken,
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      setAccessToken(null);
      // Full reload clears all client state on session expiry.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/";
    }
  },
});
