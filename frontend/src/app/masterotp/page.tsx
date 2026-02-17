"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import ThemeToggle from "@/components/ui/ThemeToggle";

export default function MasterOtpPage() {
  const [message, setMessage] = useState(
    "यो AgentShakti को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म छोटकरीमा देखाउँछौं।",
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [masterOtp, setMasterOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && phone.trim().length > 0 && message.trim().length > 0 && masterOtp.trim().length > 0,
    [name, phone, message, masterOtp],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.initiateMasterOtpDemoCall({
        name: name.trim(),
        phone: phone.trim(),
        message: message.trim(),
        master_otp: masterOtp.trim(),
        tts_config: { provider: "edge_tts", voice: "ne-NP-HemkalaNeural" },
      });
      setSuccess(`Call queued (${result.call_id}).`);
      setMasterOtp("");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Call failed (${err.status}).`);
      } else {
        setError("Call failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-14">
      <div className="mx-auto max-w-2xl">
        <div className="surface-card rounded-2xl p-7 md:p-9">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono-label text-xs uppercase tracking-[0.14em] text-[var(--accent)]">Direct Call</p>
              <h1 className="font-display mt-2 text-4xl text-[var(--foreground)]">Master OTP Call</h1>
            </div>
            <ThemeToggle />
          </div>
          <p className="mb-6 text-sm text-[var(--muted-foreground)]">
            Use master OTP to place demo call directly, without sending OTP SMS or writing a message.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="input-modern h-12 w-full px-4 text-sm"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+97798XXXXXXXX"
              className="input-modern h-12 w-full px-4 text-sm"
            />
            <input
              value={masterOtp}
              onChange={(e) => setMasterOtp(e.target.value)}
              placeholder="Master OTP"
              className="input-modern h-12 w-full px-4 text-sm"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Message"
              className="input-modern w-full px-4 py-3 text-sm"
            />
            <div className="pt-1 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="btn-primary-modern inline-flex h-11 items-center border border-transparent px-5 text-sm font-semibold disabled:opacity-55"
              >
                {loading ? "Calling..." : "Call Now"}
              </button>
              <Link href="/" className="btn-outline-modern inline-flex h-11 items-center border px-5 text-sm font-semibold">
                Back Home
              </Link>
            </div>
          </form>

          {error ? <p className="mt-4 text-sm text-[#DC2626]">{error}</p> : null}
          {success ? <p className="mt-4 text-sm text-[#16A34A]">{success}</p> : null}
        </div>
      </div>
    </main>
  );
}
