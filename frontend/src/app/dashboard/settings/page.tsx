"use client";

import { useEffect, useState } from "react";
import { User, Shield, Key, Bell, Copy, Check, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import type { UserProfile, KYCStatus } from "@/types/dashboard";

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [kyc, setKyc] = useState<KYCStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [profileData, kycData] = await Promise.allSettled([
          api.getProfile(),
          api.getKycStatus(),
        ]);
        if (profileData.status === "fulfilled") setProfile(profileData.value);
        if (kycData.status === "fulfilled") setKyc(kycData.value);
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleGenerateToken = async () => {
    try {
      const data = await api.generateApiKey();
      setToken(data.api_key);
    } catch (err) {
      console.error("Failed to generate token:", err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF6B6B]" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Profile Section */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-[#FF6B6B]/10">
            <User className="w-5 h-5 text-[#FF6B6B]" />
          </div>
          <h3 className="text-base font-semibold text-[#2D2D2D]">Profile</h3>
        </div>

        <div className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[#FF6B6B]/15 flex items-center justify-center">
              <User className="w-8 h-8 text-[#FF6B6B]" />
            </div>
            <button className="text-sm text-[#FF6B6B] hover:text-[#ff5252] font-medium">
              Upload Picture
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">First Name</label>
              <input
                type="text"
                defaultValue={profile?.first_name || ""}
                className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">Last Name</label>
              <input
                type="text"
                defaultValue={profile?.last_name || ""}
                className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">Email</label>
              <input
                type="email"
                defaultValue={profile?.email || ""}
                className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-[#FFF8F0] text-[#2D2D2D]/50"
                readOnly
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">Phone Number</label>
              <input
                type="tel"
                defaultValue={profile?.phone || ""}
                className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button className="bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors">
              Update Profile
            </button>
            <button className="border border-[#FF6B6B]/15 text-[#2D2D2D]/70 px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#FFF8F0] transition-colors">
              Set Password
            </button>
          </div>
        </div>
      </div>

      {/* KYC Verification */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#4ECDC4]/10">
            <Shield className="w-5 h-5 text-[#4ECDC4]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#2D2D2D]">KYC Verification</h3>
            <p className="text-sm text-[#2D2D2D]/50">
              Status:{" "}
              <span
                className={
                  kyc?.status === "approved"
                    ? "text-[#4ECDC4] font-medium"
                    : kyc?.status === "pending"
                      ? "text-[#FFD93D] font-medium"
                      : kyc?.status === "rejected"
                        ? "text-[#FF6B6B] font-medium"
                        : "text-[#2D2D2D]/40"
                }
              >
                {kyc?.status || "Not submitted"}
              </span>
            </p>
          </div>
        </div>

        {(!kyc || kyc.status === "none" || kyc.status === "rejected") && (
          <button className="bg-[#4ECDC4] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#45b8b0] transition-colors">
            Verify KYC
          </button>
        )}

        {kyc?.status === "rejected" && kyc.rejection_reason && (
          <p className="mt-2 text-sm text-[#FF6B6B]">Reason: {kyc.rejection_reason}</p>
        )}
      </div>

      {/* Token Section */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#FFD93D]/15">
            <Key className="w-5 h-5 text-[#FFD93D]" />
          </div>
          <h3 className="text-base font-semibold text-[#2D2D2D]">API Token</h3>
        </div>

        {token ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3 bg-[#FFF8F0] rounded-lg p-3">
              <code className="text-sm font-mono text-[#2D2D2D]/70 flex-1">
                {showToken ? token : token.slice(0, 8) + "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
              </code>
              <button
                onClick={() => setShowToken(!showToken)}
                className="p-2 rounded-lg hover:bg-[#FF6B6B]/10 text-[#2D2D2D]/50 transition-colors"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                onClick={() => copyToClipboard(token)}
                className="p-2 rounded-lg hover:bg-[#FF6B6B]/10 text-[#2D2D2D]/50 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-[#4ECDC4]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-[#FFD93D]">Save this token — it won&apos;t be shown again.</p>
          </div>
        ) : (
          <button
            onClick={handleGenerateToken}
            className="bg-[#FFD93D] text-[#2D2D2D] px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ffd024] transition-colors"
          >
            Generate Token
          </button>
        )}
      </div>

      {/* Notifications Section */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#4ECDC4]/10">
            <Bell className="w-5 h-5 text-[#4ECDC4]" />
          </div>
          <h3 className="text-base font-semibold text-[#2D2D2D]">Notifications</h3>
        </div>

        <div className="space-y-3">
          {[
            { label: "Campaign started", key: "campaign_started" },
            { label: "Campaign completed", key: "campaign_completed" },
            { label: "Low credit warning", key: "low_credit" },
            { label: "KYC status updates", key: "kyc_updates" },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between">
              <span className="text-sm text-[#2D2D2D]/70">{item.label}</span>
              <input
                type="checkbox"
                defaultChecked
                className="rounded border-[#FF6B6B]/30 text-[#FF6B6B] focus:ring-[#FF6B6B]/40"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
