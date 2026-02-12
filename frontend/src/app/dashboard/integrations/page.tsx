"use client";

import { useEffect, useState } from "react";
import { Key, Copy, Phone, Globe, RefreshCw, Check, Plug } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { APIKeyInfo, PhoneNumber } from "@/types/dashboard";

export default function IntegrationsPage() {
  const [apiKey, setApiKey] = useState<APIKeyInfo | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [keyData, phonesData] = await Promise.allSettled([
          api.getApiKeys(),
          api.getActivePhoneNumbers(),
        ]);
        if (keyData.status === "fulfilled") setApiKey(keyData.value);
        if (phonesData.status === "fulfilled") setPhoneNumbers(phonesData.value);
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
    <div className="space-y-4">
      {/* API Key Section */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#FFD93D]/15">
            <Key className="w-5 h-5 text-[#FFD93D]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#2D2D2D]">API Key</h3>
            <p className="text-sm text-[#2D2D2D]/50">Manage your API key for programmatic access</p>
          </div>
        </div>

        {apiKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-[#FFF8F0] rounded-lg p-3">
              <code className="text-sm font-mono text-[#2D2D2D]/70 flex-1">
                {apiKey.key_prefix}••••••••••••••••
              </code>
              <button
                onClick={() => copyToClipboard(`${apiKey.key_prefix}...`)}
                className="p-2 rounded-lg hover:bg-[#FF6B6B]/10 text-[#2D2D2D]/50 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-[#4ECDC4]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#2D2D2D]/50">
              <span>Created: {formatDate(apiKey.created_at)}</span>
              {apiKey.last_used && <span>Last used: {formatDate(apiKey.last_used)}</span>}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center mx-auto mb-3">
              <Key className="w-6 h-6 text-[#FF6B6B]/40" />
            </div>
            <p className="text-sm text-[#2D2D2D]/50 mb-3">No API key generated yet</p>
            <button className="inline-flex items-center gap-2 bg-[#FF6B6B] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors">
              <RefreshCw className="w-4 h-4" />
              Generate API Key
            </button>
          </div>
        )}
      </div>

      {/* Webhook Configuration */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#4ECDC4]/10">
            <Globe className="w-5 h-5 text-[#4ECDC4]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#2D2D2D]">Webhook Configuration</h3>
            <p className="text-sm text-[#2D2D2D]/50">Configure webhook endpoints for real-time event notifications</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">Webhook URL</label>
            <input
              type="url"
              placeholder="https://your-domain.com/webhook"
              className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {["campaign.started", "campaign.completed", "call.completed", "credit.low"].map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm text-[#2D2D2D]/60">
                  <input type="checkbox" className="rounded border-[#FF6B6B]/30 text-[#FF6B6B] focus:ring-[#FF6B6B]/40" />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <button className="bg-[#4ECDC4] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#45b8b0] transition-colors">
            Save Webhook
          </button>
        </div>
      </div>

      {/* Phone Numbers */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#FF6B6B]/10">
            <Phone className="w-5 h-5 text-[#FF6B6B]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#2D2D2D]">Connected Phone Numbers</h3>
            <p className="text-sm text-[#2D2D2D]/50">Active phone numbers for outbound calls</p>
          </div>
        </div>

        {phoneNumbers.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#FFF8F0] flex items-center justify-center mx-auto mb-3">
              <Plug className="w-6 h-6 text-[#FF6B6B]/40" />
            </div>
            <p className="text-sm font-medium text-[#2D2D2D]/60">No phone numbers configured</p>
            <p className="text-xs text-[#2D2D2D]/40 mt-1">Connect a phone number to start making calls</p>
          </div>
        ) : (
          <div className="space-y-2">
            {phoneNumbers.map((phone) => (
              <div key={phone.id} className="flex items-center justify-between bg-[#FFF8F0] rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-[#2D2D2D]/40" />
                  <span className="text-sm font-mono text-[#2D2D2D]/70">{phone.phone_number}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${phone.is_active ? "bg-[#4ECDC4]/15 text-[#4ECDC4]" : "bg-[#2D2D2D]/10 text-[#2D2D2D]/50"}`}>
                  {phone.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
