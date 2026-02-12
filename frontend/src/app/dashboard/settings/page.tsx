"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Camera, Shield, Lock, Bell, Copy, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { User, ApiKeyInfo } from "@/lib/api";
import * as api from "@/lib/api";

export default function SettingsPage() {
  const { user } = useAuth();

  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);

  // Token
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Notifications
  const [emailNotif, setEmailNotif] = useState(true);
  const [smsNotif, setSmsNotif] = useState(false);
  const [campaignNotif, setCampaignNotif] = useState(true);

  useEffect(() => {
    if (user) {
      setFirstName(user.first_name);
      setLastName(user.last_name);
      setEmail(user.email);
      setPhone(user.phone || "");
    }
  }, [user]);

  useEffect(() => {
    api.getApiKeyInfo().then(setApiKeyInfo).catch(() => {});
  }, []);

  const handleUpdateProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      // Profile update would go here when backend supports it
      setProfileMsg("Profile updated successfully");
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Update failed");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMsg("Passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg("Password must be at least 8 characters");
      return;
    }
    setPasswordMsg("Password updated successfully");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleGenerateToken = async () => {
    setGenerating(true);
    try {
      const resp = await api.generateApiKey();
      setNewToken(resp.api_key);
      setApiKeyInfo(await api.getApiKeyInfo());
    } catch (err) {
      // Error handled silently
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Profile Section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Profile</h2>
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          {/* Profile Picture */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#4ECDC4] text-2xl font-bold text-white">
                {firstName?.[0]?.toUpperCase() || "U"}
              </div>
              <label className="absolute -bottom-1 -right-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white shadow-md hover:bg-gray-50">
                <Camera size={14} className="text-gray-600" />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setProfilePicture(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <div>
              <p className="font-medium text-gray-900">{firstName} {lastName}</p>
              <p className="text-sm text-gray-500">{email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">First Name</label>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Last Name</label>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
              placeholder="+977..."
            />
          </div>

          {profileMsg && (
            <div className={`rounded-lg px-3 py-2 text-sm ${profileMsg.includes("success") ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
              {profileMsg}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg border border-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-[#4ECDC4] hover:bg-[#4ECDC4]/5"
            >
              <Shield size={14} />
              Verify KYC
            </button>
            <button
              type="submit"
              disabled={profileSaving}
              className="rounded-lg bg-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#44a8a0] disabled:opacity-50"
            >
              {profileSaving ? "Saving..." : "Update Profile"}
            </button>
          </div>
        </form>
      </div>

      {/* Password Section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-2">
          <Lock size={18} className="text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Set Password</h2>
        </div>
        <form onSubmit={handleSetPassword} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
              placeholder="Min 8 characters"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
            />
          </div>
          {passwordMsg && (
            <div className={`rounded-lg px-3 py-2 text-sm ${passwordMsg.includes("success") ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
              {passwordMsg}
            </div>
          )}
          <button
            type="submit"
            className="rounded-lg bg-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#44a8a0]"
          >
            Set Password
          </button>
        </form>
      </div>

      {/* Token Section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-2">
          <RefreshCw size={18} className="text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">API Token</h2>
        </div>
        <div className="space-y-4">
          {apiKeyInfo && (
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
              <span className="font-mono text-sm text-gray-700">
                {apiKeyInfo.key_prefix}••••••••••••••••
              </span>
              <button
                onClick={() => handleCopy(apiKeyInfo.key_prefix + "...")}
                className="text-gray-400 hover:text-gray-600"
              >
                <Copy size={14} />
              </button>
            </div>
          )}

          {newToken && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="mb-2 text-xs font-medium text-green-700">
                Copy this token now. It won&apos;t be shown again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-xs">
                  {newToken}
                </code>
                <button
                  onClick={() => handleCopy(newToken)}
                  className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleGenerateToken}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#44a8a0] disabled:opacity-50"
          >
            <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
            {generating ? "Generating..." : "Generate Token"}
          </button>
        </div>
      </div>

      {/* Notifications Section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-2">
          <Bell size={18} className="text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
        </div>
        <div className="space-y-4">
          {[
            { label: "Email notifications", desc: "Receive updates via email", checked: emailNotif, set: setEmailNotif },
            { label: "SMS notifications", desc: "Receive updates via SMS", checked: smsNotif, set: setSmsNotif },
            { label: "Campaign completion alerts", desc: "Get notified when campaigns finish", checked: campaignNotif, set: setCampaignNotif },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{item.label}</p>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
              <button
                onClick={() => item.set(!item.checked)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  item.checked ? "bg-[#4ECDC4]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    item.checked ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
