"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { requestOtp, verifyOtp } = useAuth();

  const handleRequest = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(mobile);
      setDevCode(res?.devCode);
      setOtpRequested(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to request OTP");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(mobile, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-orange-500" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="animate-fade-up relative w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-xl font-black text-white shadow-lg shadow-orange-500/30">
              W
            </div>
            <div>
              <div className="text-xl font-extrabold tracking-tight text-white">
                Wagon<span className="text-orange-400">.</span>
              </div>
              <div className="text-xs font-medium uppercase tracking-widest text-slate-400">Admin Console</div>
            </div>
          </div>

          {!otpRequested ? (
            <>
              <label className="mb-1 block text-sm font-semibold text-slate-300">Admin mobile</label>
              <input
                className="input mb-4"
                placeholder="10-digit mobile"
                inputMode="numeric"
                maxLength={10}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
              <button
                className="btn btn-primary w-full"
                disabled={!mobile || busy}
                onClick={handleRequest}
              >
                {busy ? "Sending…" : "Get OTP"}
              </button>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-400">Code sent to <span className="font-semibold text-white">{mobile}</span></p>
              {devCode && (
                <div className="mb-3 rounded-lg border border-orange-500/20 bg-orange-500/10 p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-orange-300">DEV (mock provider)</div>
                  <div className="text-2xl font-extrabold tracking-widest text-orange-300">{devCode}</div>
                </div>
              )}
              <input
                className="input mb-4 text-center text-lg tracking-[0.5em]"
                placeholder="••••"
                inputMode="numeric"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                className="btn btn-primary w-full"
                disabled={code.length !== 4 || busy}
                onClick={handleVerify}
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
            </>
          )}

          {error && <p className="mt-3 text-center text-sm text-red-400">{error}</p>}
        </div>
      </div>
    );
  }

  return children;
}
