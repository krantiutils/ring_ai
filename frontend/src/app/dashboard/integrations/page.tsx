"use client";

import { useCallback, useEffect, useState } from "react";
import { Key, Copy, RefreshCw, Globe, Link2 } from "lucide-react";
import type { ApiKeyInfo, ApiKeyGenerated } from "@/lib/api";
import * as api from "@/lib/api";

export default function IntegrationsPage() {
  const [apiKeyInfo, setApiKeyInfo] = useState<ApiKeyInfo | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSaved, setWebhookSaved] = useState(false);

  const loadApiKey = useCallback(async () => {
    try {
      setApiKeyInfo(await api.getApiKeyInfo());
    } catch {
      // No key yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApiKey();
  }, [loadApiKey]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const resp = await api.generateApiKey();
      setNewKey(resp.api_key);
      await loadApiKey();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate API key");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveWebhook = () => {
    setWebhookSaved(true);
    setTimeout(() => setWebhookSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* API Key Section */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4ECDC4]/10 text-[#4ECDC4]">
            <Key size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">API Key</h2>
            <p className="text-sm text-gray-500">Use this key to authenticate API requests</p>
          </div>
        </div>

        {loading ? (
          <div className="py-4 text-sm text-gray-400">Loading...</div>
        ) : (
          <div className="space-y-4">
            {apiKeyInfo && (
              <div className="flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
                <span className="font-mono text-sm text-gray-700">
                  {apiKeyInfo.key_prefix}••••••••••••••••
                </span>
                <span className="text-xs text-gray-400">
                  Created {new Date(apiKeyInfo.created_at).toLocaleDateString()}
                </span>
              </div>
            )}

            {newKey && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="mb-2 text-xs font-medium text-green-700">
                  New API key generated. Copy it now — it won&apos;t be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-sm">
                    {newKey}
                  </code>
                  <button
                    onClick={() => handleCopy(newKey)}
                    className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    <Copy size={14} />
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-lg bg-[#4ECDC4] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#44a8a0] disabled:opacity-50"
            >
              <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
              {generating ? "Generating..." : "Generate Token"}
            </button>
          </div>
        )}
      </div>

      {/* Webhook Configuration */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#A78BFA]/10 text-[#A78BFA]">
            <Globe size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Webhook Configuration</h2>
            <p className="text-sm text-gray-500">Receive real-time event notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="url"
            placeholder="https://your-domain.com/webhook"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-[#4ECDC4]"
          />
          <button
            onClick={handleSaveWebhook}
            className="rounded-lg bg-[#A78BFA] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#9071e8]"
          >
            {webhookSaved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      {/* Third-party Service Connections */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f59e0b]/10 text-[#f59e0b]">
            <Link2 size={20} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Third-party Connections</h2>
            <p className="text-sm text-gray-500">Connect external services to Ring AI</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            { name: "Twilio", desc: "Voice & SMS provider", connected: true },
            { name: "Azure TTS", desc: "Neural text-to-speech", connected: false },
            { name: "Slack", desc: "Team notifications", connected: false },
            { name: "Zapier", desc: "Workflow automation", connected: false },
          ].map((svc) => (
            <div
              key={svc.name}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-4"
            >
              <div>
                <p className="font-medium text-gray-900">{svc.name}</p>
                <p className="text-xs text-gray-500">{svc.desc}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  svc.connected
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {svc.connected ? "Connected" : "Not connected"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
