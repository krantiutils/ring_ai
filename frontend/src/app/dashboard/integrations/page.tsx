"use client";

import { useEffect, useState } from "react";
import { Key, Copy, Phone, Globe, RefreshCw, Check } from "lucide-react";
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Key Section */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-indigo-50">
            <Key className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">API Key</h3>
            <p className="text-sm text-gray-500">Manage your API key for programmatic access</p>
          </div>
        </div>

        {apiKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <code className="text-sm font-mono text-gray-700 flex-1">
                {apiKey.key_prefix}••••••••••••••••
              </code>
              <button
                onClick={() => copyToClipboard(`${apiKey.key_prefix}...`)}
                className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>Created: {formatDate(apiKey.created_at)}</span>
              {apiKey.last_used && <span>Last used: {formatDate(apiKey.last_used)}</span>}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-gray-500 mb-3">No API key generated yet</p>
            <button className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              <RefreshCw className="w-4 h-4" />
              Generate API Key
            </button>
          </div>
        )}
      </div>

      {/* Webhook Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-emerald-50">
            <Globe className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Webhook Configuration</h3>
            <p className="text-sm text-gray-500">Configure webhook endpoints for real-time event notifications</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL</label>
            <input
              type="url"
              placeholder="https://your-domain.com/webhook"
              className="w-full px-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {["campaign.started", "campaign.completed", "call.completed", "credit.low"].map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <button className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors">
            Save Webhook
          </button>
        </div>
      </div>

      {/* Phone Numbers / Third-Party Services */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-50">
            <Phone className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Connected Phone Numbers</h3>
            <p className="text-sm text-gray-500">Active phone numbers for outbound calls</p>
          </div>
        </div>

        {phoneNumbers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No phone numbers configured</p>
        ) : (
          <div className="space-y-2">
            {phoneNumbers.map((phone) => (
              <div key={phone.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-sm font-mono text-gray-700">{phone.phone_number}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${phone.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
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
