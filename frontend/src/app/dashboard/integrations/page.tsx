"use client";

import { useEffect, useState } from "react";
import { Key, Copy, Phone, Globe, RefreshCw, Check, Plug, Coins, Sparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { APIKeyInfo, PhoneNumber, VoiceCreditQuote } from "@/types/dashboard";

export default function IntegrationsPage() {
  const [apiKey, setApiKey] = useState<APIKeyInfo | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [quoteProvider, setQuoteProvider] = useState<VoiceCreditQuote["provider"]>("elevenlabs");
  const [quoteChars, setQuoteChars] = useState("350");
  const [quoteDuration, setQuoteDuration] = useState("0");
  const [quoteResult, setQuoteResult] = useState<VoiceCreditQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

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

  const handleGetQuote = async () => {
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const result = await api.estimateVoiceProviderCredits({
        provider: quoteProvider,
        text_chars: Number(quoteChars) || 0,
        duration_seconds: Number(quoteDuration) || 0,
      });
      setQuoteResult(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setQuoteError(`Quote failed (${err.status})`);
      } else {
        setQuoteError("Failed to fetch quote");
      }
      setQuoteResult(null);
    } finally {
      setQuoteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0052FF]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* API Key Section */}
      <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#1D4ED8]/15">
            <Key className="w-5 h-5 text-[#1D4ED8]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">API Key</h3>
            <p className="text-sm text-[#0F172A]/50">Manage your API key for programmatic access</p>
          </div>
        </div>

        {apiKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 bg-[#FAFAFA] rounded-lg p-3">
              <code className="text-sm font-mono text-[#0F172A]/70 flex-1">
                {apiKey.key_prefix}••••••••••••••••
              </code>
              <button
                onClick={() => copyToClipboard(`${apiKey.key_prefix}...`)}
                className="p-2 rounded-lg hover:bg-[#0052FF]/10 text-[#0F172A]/50 transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-[#4D7CFF]" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#0F172A]/50">
              <span>Created: {formatDate(apiKey.created_at)}</span>
              {apiKey.last_used && <span>Last used: {formatDate(apiKey.last_used)}</span>}
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#FAFAFA] flex items-center justify-center mx-auto mb-3">
              <Key className="w-6 h-6 text-[#0052FF]/40" />
            </div>
            <p className="text-sm text-[#0F172A]/50 mb-3">No API key generated yet</p>
            <button className="inline-flex items-center gap-2 bg-[#0052FF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#0048D9] transition-colors">
              <RefreshCw className="w-4 h-4" />
              Generate API Key
            </button>
          </div>
        )}
      </div>

      {/* Webhook Configuration */}
      <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#4D7CFF]/10">
            <Globe className="w-5 h-5 text-[#4D7CFF]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Webhook Configuration</h3>
            <p className="text-sm text-[#0F172A]/50">Configure webhook endpoints for real-time event notifications</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A]/70 mb-1">Webhook URL</label>
            <input
              type="url"
              placeholder="https://your-domain.com/webhook"
              className="w-full px-4 py-2 text-sm border border-[#0052FF]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]/40 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#0F172A]/70 mb-1">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {["campaign.started", "campaign.completed", "call.completed", "credit.low"].map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm text-[#0F172A]/60">
                  <input type="checkbox" className="rounded border-[#0052FF]/30 text-[#0052FF] focus:ring-[#0052FF]/40" />
                  {event}
                </label>
              ))}
            </div>
          </div>
          <button className="bg-[#4D7CFF] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#45b8b0] transition-colors">
            Save Webhook
          </button>
        </div>
      </div>

      {/* Phone Numbers */}
      <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#0052FF]/10">
            <Phone className="w-5 h-5 text-[#0052FF]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Connected Phone Numbers</h3>
            <p className="text-sm text-[#0F172A]/50">Active phone numbers for outbound calls</p>
          </div>
        </div>

        {phoneNumbers.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-[#FAFAFA] flex items-center justify-center mx-auto mb-3">
              <Plug className="w-6 h-6 text-[#0052FF]/40" />
            </div>
            <p className="text-sm font-medium text-[#0F172A]/60">No phone numbers configured</p>
            <p className="text-xs text-[#0F172A]/40 mt-1">Connect a phone number to start making calls</p>
          </div>
        ) : (
          <div className="space-y-2">
            {phoneNumbers.map((phone) => (
              <div key={phone.id} className="flex items-center justify-between bg-[#FAFAFA] rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-[#0F172A]/40" />
                  <span className="text-sm font-mono text-[#0F172A]/70">{phone.phone_number}</span>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${phone.is_active ? "bg-[#4D7CFF]/15 text-[#4D7CFF]" : "bg-[#0F172A]/10 text-[#0F172A]/50"}`}>
                  {phone.is_active ? "Active" : "Inactive"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voice provider credits planner */}
      <div className="bg-white rounded-xl border border-[#0052FF]/15 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[#0052FF]/10">
            <Coins className="w-5 h-5 text-[#0052FF]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0F172A]">Voice Credits Planner</h3>
            <p className="text-sm text-[#0F172A]/50">
              ElevenLabs/CAMB.AI are credit-metered. Pre-recorded upload is not.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={quoteProvider}
            onChange={(e) => setQuoteProvider(e.target.value as VoiceCreditQuote["provider"])}
            className="px-3 h-11 text-sm border border-[#0052FF]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]/40"
          >
            <option value="elevenlabs">ElevenLabs</option>
            <option value="cambai">CAMB.AI</option>
            <option value="pre_recorded_upload">Pre-recorded Upload</option>
            <option value="edge_tts">Edge TTS</option>
            <option value="azure">Azure</option>
          </select>
          <input
            value={quoteChars}
            onChange={(e) => setQuoteChars(e.target.value)}
            placeholder="Text chars"
            className="px-3 h-11 text-sm border border-[#0052FF]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]/40"
          />
          <input
            value={quoteDuration}
            onChange={(e) => setQuoteDuration(e.target.value)}
            placeholder="Duration seconds"
            className="px-3 h-11 text-sm border border-[#0052FF]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0052FF]/40"
          />
          <button
            type="button"
            onClick={handleGetQuote}
            disabled={quoteLoading}
            className="inline-flex h-11 items-center justify-center gap-2 bg-[#0052FF] text-white rounded-lg text-sm font-medium hover:bg-[#0048D9] disabled:opacity-60 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            {quoteLoading ? "Calculating..." : "Get Quote"}
          </button>
        </div>

        {quoteError && <p className="mt-3 text-sm text-red-600">{quoteError}</p>}
        {quoteResult && (
          <div className="mt-4 rounded-lg border border-[#0052FF]/15 bg-[#FAFAFA] p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[#0F172A]/50">Estimated credits</p>
                <p className="font-semibold text-[#0F172A]">{quoteResult.estimated_required_credits}</p>
              </div>
              <div>
                <p className="text-[#0F172A]/50">Current balance</p>
                <p className="font-semibold text-[#0F172A]">{quoteResult.current_balance}</p>
              </div>
              <div>
                <p className="text-[#0F172A]/50">Billing basis</p>
                <p className="font-semibold text-[#0F172A]">{quoteResult.billing_basis}</p>
              </div>
            </div>
            <p className={`mt-3 text-sm font-medium ${quoteResult.sufficient_credits ? "text-[#4D7CFF]" : "text-amber-600"}`}>
              {quoteResult.sufficient_credits ? "Sufficient credits" : "Insufficient credits"}
            </p>
            <p className="mt-1 text-xs text-[#0F172A]/55">{quoteResult.note}</p>
          </div>
        )}
      </div>
    </div>
  );
}
