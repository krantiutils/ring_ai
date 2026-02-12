"use client";

import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface SentOtp {
  id: string;
  phone: string;
  sentAt: string;
  status: "sent" | "delivered" | "failed";
}

export default function OtpPage() {
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sentList, setSentList] = useState<SentOtp[]>([]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSending(true);

    try {
      // TODO: Wire to backend OTP endpoint when available.
      // For now, simulate a sent OTP.
      await new Promise((r) => setTimeout(r, 800));

      const entry: SentOtp = {
        id: crypto.randomUUID(),
        phone,
        sentAt: new Date().toISOString(),
        status: "sent",
      };
      setSentList((prev) => [entry, ...prev]);
      setSuccess(`OTP sent to ${phone}`);
      setPhone("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">OTP</h1>

      {/* Send OTP form */}
      <div className="clay-surface p-6 max-w-md mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Send OTP</h2>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 rounded-xl bg-green-50 text-green-700 text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+977-9XXXXXXXXX"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--clay-teal)] text-sm"
          />
          <button
            type="submit"
            disabled={sending || !phone}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--clay-coral)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Send className="w-4 h-4" />
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>

      {/* Sent OTPs list */}
      <h2 className="text-lg font-semibold mb-4">Sent OTPs</h2>
      <div className="clay-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Phone
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Sent At
              </th>
              <th className="text-left px-6 py-3 font-medium text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {sentList.map((otp) => (
              <tr
                key={otp.id}
                className="border-b border-gray-50 last:border-0"
              >
                <td className="px-6 py-3 font-mono text-xs">{otp.phone}</td>
                <td className="px-6 py-3 text-gray-500">
                  {new Date(otp.sentAt).toLocaleString()}
                </td>
                <td className="px-6 py-3">
                  <span
                    className={cn(
                      "inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize",
                      otp.status === "sent" && "bg-blue-100 text-blue-700",
                      otp.status === "delivered" &&
                        "bg-green-100 text-green-700",
                      otp.status === "failed" && "bg-red-100 text-red-700",
                    )}
                  >
                    {otp.status}
                  </span>
                </td>
              </tr>
            ))}
            {sentList.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-6 py-12 text-center text-gray-400"
                >
                  No OTPs sent yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
