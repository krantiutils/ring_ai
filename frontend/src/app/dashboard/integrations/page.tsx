"use client";

import { useEffect, useState } from "react";
import { Copy, Eye, EyeOff, Key, RefreshCw, Webhook } from "lucide-react";
import { generateApiKey, getApiKey } from "@/lib/api";

export default function IntegrationsPage() {
  const [apiKeyInfo, setApiKeyInfo] = useState<{
    key_prefix: string;
    last_used: string | null;
    created_at: string;
  } | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    getApiKey()
      .then(setApiKeyInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleGenerate() {
    if (
      apiKeyInfo &&
      !confirm("This will invalidate your existing API key. Continue?")
    ) {
      return;
    }
    setGenerating(true);
    try {
      const res = await generateApiKey();
      setNewKey(res.api_key);
      setShowKey(true);
      // Refresh key info
      const info = await getApiKey();
      setApiKeyInfo(info);
    } catch {
      alert("Failed to generate API key");
    } finally {
      setGenerating(false);
    }
  }

  function copyKey() {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
    }
  }

  const displayKey = newKey
    ? showKey
      ? newKey
      : newKey.slice(0, 8) + "..." + "*".repeat(20)
    : apiKeyInfo
      ? apiKeyInfo.key_prefix + "..." + "*".repeat(20)
      : null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* API Key Section */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-600/10 flex items-center justify-center">
            <Key size={20} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">API Key</h2>
            <p className="text-sm text-gray-400">
              Use this key to authenticate API requests
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : (
          <>
            {displayKey ? (
              <div className="flex items-center gap-3 mb-4">
                <code className="flex-1 px-4 py-2.5 bg-[#0f1117] border border-gray-800 rounded-lg text-sm text-gray-300 font-mono truncate">
                  {displayKey}
                </code>
                {newKey && (
                  <>
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      title={showKey ? "Hide" : "Show"}
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      onClick={copyKey}
                      className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      title="Copy"
                    >
                      <Copy size={16} />
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p className="text-gray-500 mb-4">No API key generated yet.</p>
            )}

            {apiKeyInfo && (
              <div className="text-xs text-gray-500 mb-4 space-y-1">
                <p>
                  Created:{" "}
                  {new Date(apiKeyInfo.created_at).toLocaleDateString()}
                </p>
                {apiKeyInfo.last_used && (
                  <p>
                    Last used:{" "}
                    {new Date(apiKeyInfo.last_used).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
              {apiKeyInfo ? "Regenerate API Key" : "Generate API Key"}
            </button>

            {newKey && (
              <p className="mt-3 text-xs text-yellow-400">
                Store this key securely — it cannot be retrieved again.
              </p>
            )}
          </>
        )}
      </div>

      {/* Webhook Configuration Section */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-purple-600/10 flex items-center justify-center">
            <Webhook size={20} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              Webhook Configuration
            </h2>
            <p className="text-sm text-gray-400">
              Receive real-time notifications about campaign events
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Webhook URL
            </label>
            <input
              type="url"
              placeholder="https://your-server.com/webhook"
              className="w-full px-4 py-2.5 bg-[#0f1117] border border-gray-800 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Events
            </label>
            <div className="space-y-2">
              {[
                "campaign.started",
                "campaign.completed",
                "interaction.completed",
                "credits.low",
              ].map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="rounded bg-[#0f1117] border-gray-700"
                  />
                  {event}
                </label>
              ))}
            </div>
          </div>

          <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors">
            Save Webhook
          </button>
        </div>
      </div>

      {/* Third-party Services */}
      <div className="bg-[#1a1d29] rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-semibold text-white mb-2">
          Third-party Connections
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          Connect external services to extend functionality
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              name: "Twilio",
              desc: "Voice and SMS provider",
              connected: true,
            },
            {
              name: "Slack",
              desc: "Team notifications",
              connected: false,
            },
          ].map((svc) => (
            <div
              key={svc.name}
              className="flex items-center justify-between p-4 bg-[#0f1117] rounded-lg border border-gray-800"
            >
              <div>
                <p className="text-sm font-medium text-white">{svc.name}</p>
                <p className="text-xs text-gray-500">{svc.desc}</p>
              </div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  svc.connected
                    ? "bg-green-600/10 text-green-400"
                    : "bg-gray-600/10 text-gray-400"
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
