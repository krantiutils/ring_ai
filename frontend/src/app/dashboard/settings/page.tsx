"use client";

import { useEffect, useState } from "react";
import { Camera, Copy, Eye, EyeOff, Key, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { generateApiKey, getApiKey } from "@/lib/api";

export default function SettingsPage() {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [tokenInfo, setTokenInfo] = useState<{
    key_prefix: string;
    last_used: string | null;
    created_at: string;
  } | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.first_name);
    setLastName(user.last_name);
    setEmail(user.email);
    setPhone(user.phone ?? "");
    getApiKey().then(setTokenInfo).catch(() => {});
  }, [user]);

  async function handleGenerateToken() {
    setGenerating(true);
    try {
      const res = await generateApiKey();
      setNewToken(res.api_key);
      setShowToken(true);
      const info = await getApiKey();
      setTokenInfo(info);
    } catch {
      alert("Failed to generate token");
    } finally {
      setGenerating(false);
    }
  }

  function copyToken() {
    if (newToken) navigator.clipboard.writeText(newToken);
  }

  const displayToken = newToken
    ? showToken
      ? newToken
      : newToken.slice(0, 8) + "..." + "*".repeat(20)
    : tokenInfo
      ? tokenInfo.key_prefix + "..." + "*".repeat(20)
      : null;

  if (!user) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Profile Section */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-6">Profile</h2>

        <div className="flex items-center gap-6 mb-6">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
              {user.first_name?.[0]}
              {user.last_name?.[0]}
            </div>
            <button className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-[#0f1117] border border-gray-700 flex items-center justify-center text-gray-400 hover:text-white transition-colors">
              <Camera size={14} />
            </button>
          </div>
          <div>
            <p className="text-white font-medium">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-sm text-gray-400">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              First Name
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f1117] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Last Name
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f1117] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f1117] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0f1117] border border-gray-800 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium rounded-lg transition-colors">
            <Shield size={14} />
            {user.is_kyc_verified ? "KYC Verified" : "Verify KYC"}
          </button>
          <button className="px-4 py-2 bg-[#0f1117] border border-gray-800 hover:border-gray-600 text-gray-300 text-sm font-medium rounded-lg transition-colors">
            Set Password
          </button>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            Update Profile
          </button>
        </div>
      </div>

      {/* Token Section */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Key size={20} className="text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Token</h2>
        </div>

        {displayToken ? (
          <div className="flex items-center gap-3 mb-4">
            <code className="flex-1 px-4 py-2.5 bg-[#0f1117] border border-gray-800 rounded-lg text-sm text-gray-300 font-mono truncate">
              {displayToken}
            </code>
            {newToken && (
              <>
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  onClick={copyToken}
                  className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <Copy size={16} />
                </button>
              </>
            )}
          </div>
        ) : (
          <p className="text-gray-500 mb-4">No token generated yet.</p>
        )}

        <button
          onClick={handleGenerateToken}
          disabled={generating}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {generating ? "Generating..." : "Generate Token"}
        </button>
      </div>

      {/* Notifications Section */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Notifications</h2>
        <div className="space-y-3">
          {[
            { label: "Campaign completed", desc: "When a campaign finishes execution" },
            { label: "Credits low", desc: "When credit balance drops below threshold" },
            { label: "KYC status update", desc: "When KYC verification status changes" },
          ].map((item) => (
            <label
              key={item.label}
              className="flex items-center justify-between p-3 bg-[#0f1117] rounded-lg border border-gray-800 cursor-pointer"
            >
              <div>
                <p className="text-sm text-white">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
              <input
                type="checkbox"
                defaultChecked
                className="rounded bg-[#0f1117] border-gray-700"
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
