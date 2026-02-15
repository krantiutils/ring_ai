"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Mic,
  Play,
  Pause,
  Square,
  Search,
  Filter,
  Calculator,
  Settings2,
  Volume2,
  Loader2,
  ChevronDown,
  Globe,
  User as UserIcon,
  DollarSign,
  Zap,
  Shield,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { VoiceInfo, ProviderInfo } from "@/types/dashboard";
import { cn } from "@/lib/utils";

type TabId = "voices" | "playback" | "calculator" | "config";

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "voices", label: "Voice Browser", icon: Mic },
  { id: "playback", label: "Sample Playback", icon: Play },
  { id: "calculator", label: "Cost Calculator", icon: Calculator },
  { id: "config", label: "Provider Config", icon: Settings2 },
];

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function TTSProvidersPage() {
  const [activeTab, setActiveTab] = useState<TabId>("voices");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTTSProviderDetails()
      .then(setProviders)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load providers");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF6B6B]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertCircle className="w-8 h-8 text-[#FF6B6B]/60" />
        <p className="text-sm text-[#2D2D2D]/60">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Provider summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {providers.map((p) => (
          <ProviderCard key={p.provider} provider={p} />
        ))}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-white rounded-xl border border-[#FF6B6B]/15 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 justify-center",
                activeTab === tab.id
                  ? "bg-[#FF6B6B] text-white"
                  : "text-[#2D2D2D]/60 hover:bg-[#FF6B6B]/10",
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "voices" && <VoiceBrowserTab providers={providers} />}
      {activeTab === "playback" && <SamplePlaybackTab providers={providers} />}
      {activeTab === "calculator" && <CostCalculatorTab providers={providers} />}
      {activeTab === "config" && <ProviderConfigTab providers={providers} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider summary card
// ---------------------------------------------------------------------------

function ProviderCard({ provider }: { provider: ProviderInfo }) {
  const isFree = provider.pricing.cost_per_million_chars === 0;
  return (
    <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", isFree ? "bg-[#4ECDC4]/10" : "bg-[#FFD93D]/15")}>
            {isFree ? (
              <Zap className="w-5 h-5 text-[#4ECDC4]" />
            ) : (
              <Shield className="w-5 h-5 text-[#FFD93D]" />
            )}
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#2D2D2D]">{provider.display_name}</h3>
            <p className="text-xs text-[#2D2D2D]/50 mt-0.5">{provider.description}</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-[#2D2D2D]/60">
        <span className={cn("font-medium px-2 py-0.5 rounded-full", isFree ? "bg-[#4ECDC4]/15 text-[#4ECDC4]" : "bg-[#FFD93D]/15 text-[#b89a00]")}>
          {isFree ? "Free" : `$${provider.pricing.cost_per_million_chars}/1M chars`}
        </span>
        <span>Formats: {provider.supported_formats.join(", ").toUpperCase()}</span>
        {provider.requires_api_key && (
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" /> API key required
          </span>
        )}
        {provider.pricing.free_tier_chars && (
          <span>Free tier: {(provider.pricing.free_tier_chars / 1000).toFixed(0)}K chars/mo</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Voice Browser
// ---------------------------------------------------------------------------

function VoiceBrowserTab({ providers }: { providers: ProviderInfo[] }) {
  const [selectedProvider, setSelectedProvider] = useState(providers[0]?.provider || "");
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<string>("all");
  const [localeFilter, setLocaleFilter] = useState<string>("all");

  const loadVoices = useCallback(
    (provider: string) => {
      setLoading(true);
      setVoices([]);
      api
        .getTTSVoices(provider)
        .then(setVoices)
        .catch(() => setVoices([]))
        .finally(() => setLoading(false));
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedProvider) loadVoices(selectedProvider);
  }, [selectedProvider, loadVoices]);

  const locales = [...new Set(voices.map((v) => v.locale))].sort();
  const genders = [...new Set(voices.map((v) => v.gender))].sort();

  const filtered = voices.filter((v) => {
    if (genderFilter !== "all" && v.gender !== genderFilter) return false;
    if (localeFilter !== "all" && v.locale !== localeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        v.name.toLowerCase().includes(q) ||
        v.voice_id.toLowerCase().includes(q) ||
        v.locale.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5 space-y-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <ProviderSelect
          providers={providers}
          value={selectedProvider}
          onChange={setSelectedProvider}
        />

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/30" />
          <input
            type="text"
            placeholder="Search voices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
          />
        </div>

        <SelectDropdown
          icon={<UserIcon className="w-4 h-4" />}
          value={genderFilter}
          onChange={setGenderFilter}
          options={[{ value: "all", label: "All Genders" }, ...genders.map((g) => ({ value: g, label: g }))]}
        />

        <SelectDropdown
          icon={<Globe className="w-4 h-4" />}
          value={localeFilter}
          onChange={setLocaleFilter}
          options={[{ value: "all", label: "All Locales" }, ...locales.map((l) => ({ value: l, label: l }))]}
        />
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#FF6B6B] animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="w-14 h-14 rounded-full bg-[#FFF8F0] flex items-center justify-center">
            <Mic className="w-7 h-7 text-[#FF6B6B]/40" />
          </div>
          <p className="text-sm font-medium text-[#2D2D2D]/60">No voices found</p>
          <p className="text-xs text-[#2D2D2D]/40">Try adjusting your filters</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-[#2D2D2D]/50">
            Showing {filtered.length} of {voices.length} voices
          </p>
          <div className="max-h-[500px] overflow-y-auto rounded-lg border border-[#FF6B6B]/10">
            <table className="w-full text-sm">
              <thead className="bg-[#FFF8F0] sticky top-0">
                <tr className="text-left text-xs font-medium text-[#2D2D2D]/50">
                  <th className="px-4 py-2.5">Voice</th>
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">Gender</th>
                  <th className="px-4 py-2.5">Locale</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.voice_id} className="border-t border-[#FF6B6B]/5 hover:bg-[#FFF8F0]/60">
                    <td className="px-4 py-2.5 font-medium text-[#2D2D2D]">{v.name}</td>
                    <td className="px-4 py-2.5 font-mono text-[#2D2D2D]/60 text-xs">{v.voice_id}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          v.gender === "Female"
                            ? "bg-[#F0E6FF] text-[#7c3aed]"
                            : "bg-[#4ECDC4]/15 text-[#4ECDC4]",
                        )}
                      >
                        {v.gender}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#2D2D2D]/60">{v.locale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Sample Playback / Quality Comparison
// ---------------------------------------------------------------------------

interface SynthResult {
  provider: string;
  audioUrl: string | null;
  durationMs: number;
  loading: boolean;
  error: string | null;
}

function SamplePlaybackTab({ providers }: { providers: ProviderInfo[] }) {
  const [text, setText] = useState("नमस्ते, तपाईंलाई कसरी मद्दत गर्न सक्छु?");
  const [voices, setVoices] = useState<Record<string, VoiceInfo[]>>({});
  const [selectedVoices, setSelectedVoices] = useState<Record<string, string>>({});
  const [results, setResults] = useState<SynthResult[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);

  // Load voices for all providers on mount
  useEffect(() => {
    async function loadAll() {
      const entries: [string, VoiceInfo[]][] = [];
      const defaults: Record<string, string> = {};

      for (const p of providers) {
        try {
          const v = await api.getTTSVoices(p.provider, "ne-NP");
          entries.push([p.provider, v]);
          if (v.length > 0) defaults[p.provider] = v[0].voice_id;
        } catch {
          entries.push([p.provider, []]);
        }
      }
      setVoices(Object.fromEntries(entries));
      setSelectedVoices(defaults);
      setLoadingVoices(false);
    }
    loadAll();
  }, [providers]);

  const synthesizeAll = async () => {
    if (!text.trim()) return;

    const initial: SynthResult[] = providers.map((p) => ({
      provider: p.provider,
      audioUrl: null,
      durationMs: 0,
      loading: true,
      error: null,
    }));
    setResults(initial);

    const promises = providers.map(async (p, idx) => {
      const voice = selectedVoices[p.provider];
      if (!voice) {
        return { ...initial[idx], loading: false, error: "No voice selected" };
      }
      try {
        const result = await api.synthesizeTTS({
          text,
          provider: p.provider,
          voice,
        });
        const url = URL.createObjectURL(result.audioBlob);
        return { provider: p.provider, audioUrl: url, durationMs: result.durationMs, loading: false, error: null };
      } catch (err) {
        return {
          provider: p.provider,
          audioUrl: null,
          durationMs: 0,
          loading: false,
          error: err instanceof ApiError ? err.message : "Synthesis failed",
        };
      }
    });

    const settled = await Promise.allSettled(promises);
    setResults(
      settled.map((s, i) => (s.status === "fulfilled" ? s.value : { ...initial[i], loading: false, error: "Unexpected error" })),
    );
  };

  return (
    <div className="space-y-4">
      {/* Text input */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">
            Text to synthesize
          </label>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter Nepali text to synthesize..."
            className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 resize-none"
          />
          <p className="text-xs text-[#2D2D2D]/40 mt-1">{text.length} / 5000 characters</p>
        </div>

        {/* Voice selection per provider */}
        {loadingVoices ? (
          <div className="flex items-center gap-2 text-sm text-[#2D2D2D]/50">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading voices...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {providers.map((p) => {
              const providerVoices = voices[p.provider] || [];
              return (
                <div key={p.provider}>
                  <label className="block text-xs font-medium text-[#2D2D2D]/50 mb-1">
                    {p.display_name} voice
                  </label>
                  <select
                    value={selectedVoices[p.provider] || ""}
                    onChange={(e) =>
                      setSelectedVoices((prev) => ({ ...prev, [p.provider]: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
                  >
                    {providerVoices.length === 0 && <option value="">No voices available</option>}
                    {providerVoices.map((v) => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name} ({v.gender})
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        <button
          onClick={synthesizeAll}
          disabled={!text.trim() || loadingVoices}
          className="inline-flex items-center gap-2 bg-[#FF6B6B] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#ff5252] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Volume2 className="w-4 h-4" />
          Synthesize with all providers
        </button>
      </div>

      {/* Results — side by side comparison */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {results.map((r) => {
            const pInfo = providers.find((p) => p.provider === r.provider);
            return (
              <div key={r.provider} className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
                <h4 className="text-sm font-semibold text-[#2D2D2D] mb-3">
                  {pInfo?.display_name || r.provider}
                </h4>
                {r.loading ? (
                  <div className="flex items-center gap-2 text-sm text-[#2D2D2D]/50 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" /> Synthesizing...
                  </div>
                ) : r.error ? (
                  <div className="flex items-center gap-2 text-sm text-[#FF6B6B] py-4">
                    <AlertCircle className="w-4 h-4" /> {r.error}
                  </div>
                ) : r.audioUrl ? (
                  <AudioPlayer src={r.audioUrl} durationMs={r.durationMs} />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Cost Calculator
// ---------------------------------------------------------------------------

function CostCalculatorTab({ providers }: { providers: ProviderInfo[] }) {
  const [monthlyChars, setMonthlyChars] = useState(100000);
  const [avgMessageLength, setAvgMessageLength] = useState(200);

  const monthlyMessages = avgMessageLength > 0 ? Math.floor(monthlyChars / avgMessageLength) : 0;

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-[#2D2D2D]">Estimate your monthly TTS costs</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#2D2D2D]/50 mb-1">
              Monthly characters
            </label>
            <input
              type="number"
              min={0}
              value={monthlyChars}
              onChange={(e) => setMonthlyChars(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#2D2D2D]/50 mb-1">
              Avg characters per message
            </label>
            <input
              type="number"
              min={1}
              value={avgMessageLength}
              onChange={(e) => setAvgMessageLength(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-[#2D2D2D]/50">
          <span>{monthlyChars.toLocaleString()} chars/month</span>
          <span>~{monthlyMessages.toLocaleString()} messages/month</span>
        </div>

        {/* Slider for quick adjustment */}
        <div>
          <input
            type="range"
            min={10000}
            max={10000000}
            step={10000}
            value={monthlyChars}
            onChange={(e) => setMonthlyChars(parseInt(e.target.value))}
            className="w-full accent-[#FF6B6B]"
          />
          <div className="flex justify-between text-xs text-[#2D2D2D]/30">
            <span>10K</span>
            <span>10M</span>
          </div>
        </div>
      </div>

      {/* Cost comparison table */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5">
        <h3 className="text-sm font-semibold text-[#2D2D2D] mb-4">Cost comparison</h3>
        <div className="space-y-3">
          {providers.map((p) => {
            const freeTier = p.pricing.free_tier_chars || 0;
            const billableChars = Math.max(0, monthlyChars - freeTier);
            const cost = (billableChars / 1_000_000) * p.pricing.cost_per_million_chars;
            const isFree = p.pricing.cost_per_million_chars === 0;

            return (
              <div
                key={p.provider}
                className="flex items-center justify-between p-4 rounded-lg bg-[#FFF8F0] border border-[#FF6B6B]/5"
              >
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-lg", isFree ? "bg-[#4ECDC4]/10" : "bg-[#FFD93D]/15")}>
                    <DollarSign className={cn("w-4 h-4", isFree ? "text-[#4ECDC4]" : "text-[#FFD93D]")} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#2D2D2D]">{p.display_name}</p>
                    <p className="text-xs text-[#2D2D2D]/40">
                      {isFree
                        ? "Free — no per-character cost"
                        : `$${p.pricing.cost_per_million_chars}/1M chars`}
                      {freeTier > 0 && ` (first ${(freeTier / 1000).toFixed(0)}K free)`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-[#2D2D2D]">
                    {isFree ? "Free" : `$${cost.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-[#2D2D2D]/40">/month</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Savings callout */}
        {providers.length >= 2 && (
          <div className="mt-4 p-3 rounded-lg bg-[#4ECDC4]/10 border border-[#4ECDC4]/20">
            <p className="text-xs text-[#2D2D2D]/70">
              <strong>Tip:</strong> Edge TTS is free but may not be suitable for production at scale.
              Azure provides SLA-backed quality with 500K free characters per month. Consider using Edge
              TTS for development and Azure for production workloads.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Provider Configuration
// ---------------------------------------------------------------------------

function ProviderConfigTab({ providers }: { providers: ProviderInfo[] }) {
  const [defaultProvider, setDefaultProvider] = useState(providers[0]?.provider || "");
  const [azureKey, setAzureKey] = useState("");
  const [azureRegion, setAzureRegion] = useState("eastus");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // In a real implementation this would POST to a config endpoint
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Default provider */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-[#FF6B6B]/10">
            <Settings2 className="w-5 h-5 text-[#FF6B6B]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#2D2D2D]">Default Provider</h3>
            <p className="text-sm text-[#2D2D2D]/50">Select which TTS provider to use by default</p>
          </div>
        </div>

        <div className="space-y-3">
          {providers.map((p) => (
            <label
              key={p.provider}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                defaultProvider === p.provider
                  ? "border-[#FF6B6B] bg-[#FF6B6B]/5"
                  : "border-[#FF6B6B]/10 hover:bg-[#FFF8F0]",
              )}
            >
              <input
                type="radio"
                name="defaultProvider"
                value={p.provider}
                checked={defaultProvider === p.provider}
                onChange={(e) => setDefaultProvider(e.target.value)}
                className="accent-[#FF6B6B]"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-[#2D2D2D]">{p.display_name}</p>
                <p className="text-xs text-[#2D2D2D]/40">{p.description}</p>
              </div>
              {p.pricing.cost_per_million_chars === 0 ? (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#4ECDC4]/15 text-[#4ECDC4]">
                  Free
                </span>
              ) : (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#FFD93D]/15 text-[#b89a00]">
                  Paid
                </span>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Azure credentials */}
      <div className="bg-white rounded-xl border border-[#FF6B6B]/15 p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-[#FFD93D]/15">
            <Shield className="w-5 h-5 text-[#FFD93D]" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#2D2D2D]">Azure Credentials</h3>
            <p className="text-sm text-[#2D2D2D]/50">Configure Azure Cognitive Services subscription key and region</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">
              Subscription Key
            </label>
            <input
              type="password"
              placeholder="Enter your Azure TTS key"
              value={azureKey}
              onChange={(e) => setAzureKey(e.target.value)}
              className="w-full px-4 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D]/70 mb-1">
              Region
            </label>
            <select
              value={azureRegion}
              onChange={(e) => setAzureRegion(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40"
            >
              {["eastus", "westus", "westus2", "eastasia", "southeastasia", "westeurope", "northeurope"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleSave}
          className={cn(
            "inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors",
            saved
              ? "bg-[#4ECDC4] text-white"
              : "bg-[#FF6B6B] text-white hover:bg-[#ff5252]",
          )}
        >
          {saved ? "Saved!" : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Audio Player
// ---------------------------------------------------------------------------

function AudioPlayer({ src, durationMs }: { src: string; durationMs: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  };

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-2">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="p-2 rounded-lg bg-[#FF6B6B] text-white hover:bg-[#ff5252] transition-colors"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={stop}
          className="p-2 rounded-lg bg-[#2D2D2D]/10 text-[#2D2D2D]/50 hover:bg-[#2D2D2D]/20 transition-colors"
        >
          <Square className="w-4 h-4" />
        </button>

        {/* Progress bar */}
        <div className="flex-1 h-2 bg-[#FF6B6B]/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#FF6B6B] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <span className="text-xs font-mono text-[#2D2D2D]/50 w-[80px] text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Provider select dropdown
// ---------------------------------------------------------------------------

function ProviderSelect({
  providers,
  value,
  onChange,
}: {
  providers: ProviderInfo[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/30" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-8 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 appearance-none"
      >
        {providers.map((p) => (
          <option key={p.provider} value={p.provider}>
            {p.display_name}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/30 pointer-events-none" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared: Generic select dropdown
// ---------------------------------------------------------------------------

function SelectDropdown({
  icon,
  value,
  onChange,
  options,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2D2D2D]/30">{icon}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9 pr-8 py-2 text-sm border border-[#FF6B6B]/15 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B6B]/40 appearance-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[#2D2D2D]/30 pointer-events-none" />
    </div>
  );
}
