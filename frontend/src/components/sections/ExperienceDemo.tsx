"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { api, ApiError } from "@/lib/api";
import type { LandingLanguage } from "@/app/page";
import VoiceCompare from "@/components/sections/VoiceCompare";
import LiveAgent from "@/components/sections/LiveAgent";
import NodeCard from "@/components/flows/NodeCard";
import type { FlowEdge, FlowNode } from "@/features/flows/builderTypes";

type ExperienceDemoProps = {
  language: LandingLanguage;
};

type DemoTab = "agent" | "voices" | "flow";
type AgentSubTab = "interactive" | "oneway";

const copy = {
  en: {
    label: "Interactive Demo",
    title: "Try AgentShakti Before Signup",
    desc: "Explore real web/phone calls, one-way outreach, voice quality testing, and campaign flow automation.",
    tabs: {
      agent: "Demo Call (Web / Phone)",
      voices: "Voice Quality Compare",
      flow: "Flow Builder Demo",
    },
    tabDescriptions: {
      agent: "Run a two-way live demo in browser and handoff to a real phone call from the same screen.",
      call: "Simple one-way call flow: generate the voice, then place a real outbound demo call.",
      voices: "Listen to different voice options side by side before choosing one.",
      flow: "See how one campaign chains validation, SMS, voice, and conversational AI actions.",
    },
    tabFeatures: {
      agent: ["Real-time browser conversation", "Scenario-based behavior", "Phone handoff"],
      voices: ["A/B compare voice personalities", "Evaluate clarity and pacing", "Pick best-fit voice"],
      flow: ["Visual no-code flow", "SMS + voice + AI nodes", "Response capture columns"],
    },
    agentSubTabs: {
      interactive: "Interactive Call",
      oneway: "One-way Agent Call",
    },
  },
  ne: {
    label: "इण्टरएक्टिभ डेमो",
    title: "साइनअप अघि AgentShakti चलाएर हेर्नुहोस्",
    desc: "web/phone live call, one-way demo call, आवाज compare, र flow automation एउटै ठाउँमा हेर्नुहोस्।",
    tabs: {
      agent: "डेमो कल (वेब / फोन)",
      voices: "आवाज गुणस्तर तुलना",
      flow: "Flow Builder डेमो",
    },
    tabDescriptions: {
      agent: "एउटै स्क्रिनबाट web call र real phone call demo दुवै चलाउनुहोस्।",
      call: "सिधा one-way call demo: आवाज generate गर्नुहोस् अनि real outbound call राख्नुहोस्।",
      voices: "विभिन्न आवाजहरू सँगसँगै सुनेर सही विकल्प छान्नुहोस्।",
      flow: "एकै campaign मा validation, SMS, voice, र conversational AI कसरी जोडिन्छ हेर्नुहोस्।",
    },
    tabFeatures: {
      agent: ["ब्राउजरमै real-time कुराकानी", "scenario अनुसार AI व्यवहार", "फोन call handoff"],
      voices: ["आवाजहरू A/B compare", "clarity र pace मूल्यांकन", "best-fit आवाज छनोट"],
      flow: ["Visual no-code flow", "SMS + voice + AI nodes", "response capture columns"],
    },
    agentSubTabs: {
      interactive: "Interactive Call",
      oneway: "One-way Agent Call",
    },
  },
};

const FLOW_NODE_TYPES = { flowNode: NodeCard };

const FLOW_DEMO_NODES: FlowNode[] = [
  { id: "n1", type: "flowNode", position: { x: 20, y: 160 }, data: { kind: "trigger_manual", label: "Manual Trigger", config: {} } },
  {
    id: "n2",
    type: "flowNode",
    position: { x: 260, y: 160 },
    data: {
      kind: "source_manual_table",
      label: "Table Source",
      config: {
        table_columns: "name,phone",
        sample_csv: "name,phone\nRam,+9779800000000\nSita,+9779811111111",
      },
    },
  },
  {
    id: "n3",
    type: "flowNode",
    position: { x: 500, y: 160 },
    data: {
      kind: "agent_sms",
      label: "SMS Agent",
      config: { message: "Hi {{name}}, your demo message from AgentShakti." },
    },
  },
  { id: "n4", type: "flowNode", position: { x: 740, y: 160 }, data: { kind: "end_success", label: "Done", config: {} } },
];

const FLOW_DEMO_EDGES: FlowEdge[] = [
  { id: "e1", source: "n1", target: "n2", animated: true },
  { id: "e2", source: "n2", target: "n3", animated: true },
  { id: "e3", source: "n3", target: "n4", animated: true },
];

function FlowBuilderPreview() {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(FLOW_DEMO_NODES);
  const [edges, , onEdgesChange] = useEdgesState<FlowEdge>(FLOW_DEMO_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("n3");
  const [guideStep, setGuideStep] = useState(0);
  const [guideOpen, setGuideOpen] = useState(false);
  const [simResult, setSimResult] = useState<string[]>([]);
  const [simRunning, setSimRunning] = useState(false);
  const [spotlight, setSpotlight] = useState<{ left: number; top: number; width: number; height: number } | null>(null);


  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const setupRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<HTMLDivElement>(null);
  const testRunRef = useRef<HTMLButtonElement>(null);
  const autoScrolledStepRef = useRef<number>(-1);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const tableNode = nodes.find((n) => n.id === "n2") ?? null;
  const smsNode = nodes.find((n) => n.id === "n3") ?? null;

  const guideSteps = [
    "Drag any node on the canvas to reposition your flow.",
    "Click the SMS Agent node to edit the outgoing message.",
    "Click Table Source to edit rows used in simulation.",
    "Click Test Run to simulate sending without real delivery.",
  ];

  function updateNodeConfig(nodeId: string, key: string, value: string) {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, config: { ...n.data.config, [key]: value } } } : n,
      ),
    );
  }

  function parseCsvRows(sampleCsv: string): Array<{ name: string; phone: string }> {
    const lines = sampleCsv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const nameIdx = headers.indexOf("name");
    const phoneIdx = headers.indexOf("phone");
    if (nameIdx === -1 || phoneIdx === -1) return [];
    return lines.slice(1).map((line) => {
      const parts = line.split(",").map((p) => p.trim());
      return {
        name: parts[nameIdx] || "Unknown",
        phone: parts[phoneIdx] || "",
      };
    });
  }

  function renderTemplate(template: string, row: { name: string; phone: string }): string {
    return template
      .replace(/\{\{\s*name\s*\}\}/gi, row.name)
      .replace(/\{\{\s*phone\s*\}\}/gi, row.phone);
  }

  async function runSimulation() {
    if (!tableNode || !smsNode) return;
    setSimRunning(true);
    setSimResult([]);
    const csv = String(tableNode.data.config.sample_csv ?? "");
    const rows = parseCsvRows(csv);
    const msg = String(smsNode.data.config.message ?? "");
    await new Promise((r) => setTimeout(r, 500));
    const output =
      rows.length === 0
        ? ["No valid rows found. Add CSV rows under Table Source."]
        : rows.slice(0, 8).map((row, i) => `#${i + 1} Queued to ${row.phone || "(missing)"} -> ${renderTemplate(msg, row)}`);
    setSimResult(output);
    setSimRunning(false);
  }

  const [isDarkTheme] = useState(
    () => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark",
  );

  useEffect(() => {
    if (!guideOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizing spotlight with guide toggle
      setSpotlight(null);
      autoScrolledStepRef.current = -1;
      return;
    }

    const getTarget = () => {
      if (guideStep === 0) return canvasRef.current;
      if (guideStep === 1 || guideStep === 2) return setupRef.current;
      return simResult.length > 0 ? simRef.current : testRunRef.current;
    };

    const update = () => {
      const root = rootRef.current?.getBoundingClientRect();
      const targetEl = getTarget();
      const target = targetEl?.getBoundingClientRect();
      if (!root || !target || !targetEl) {
        setSpotlight(null);
        return;
      }
      const pad = 8;
      setSpotlight({
        left: Math.max(0, target.left - root.left - pad),
        top: Math.max(0, target.top - root.top - pad),
        width: Math.min(root.width, target.width + pad * 2),
        height: Math.min(root.height, target.height + pad * 2),
      });

      // On small screens, auto-scroll to the current highlighted area.
      if (autoScrolledStepRef.current !== guideStep) {
        const outOfView = target.bottom > window.innerHeight - 20 || target.top < 20;
        if (window.innerWidth < 900 && outOfView) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        }
        autoScrolledStepRef.current = guideStep;
      }
    };

    update();
    const timer = window.setTimeout(update, 60);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [guideOpen, guideStep, simResult.length]);

  return (
    <div ref={rootRef} className="relative space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted-foreground)]">
          Tip: Drag and drop nodes to rearrange the flow. Click a node to edit quick settings.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setGuideOpen((v) => !v);
              setGuideStep(0);
            }}
            className="btn-outline-modern inline-flex h-9 items-center px-3 text-xs font-semibold"
          >
            {guideOpen ? "Hide Guide" : "Guide me"}
          </button>
          <button
            ref={testRunRef}
            type="button"
            onClick={runSimulation}
            disabled={simRunning}
            className="btn-primary-modern inline-flex h-9 items-center px-3 text-xs font-semibold disabled:opacity-60"
          >
            {simRunning ? "Simulating..." : "Test Run"}
          </button>
        </div>
      </div>

      {guideOpen && (
        <div
          className="relative z-40 rounded-xl p-3 ring-2 ring-[var(--accent)]/45"
          style={{
            border: isDarkTheme ? "1px solid rgba(96,165,250,0.45)" : "1px solid rgba(0,82,255,0.45)",
            background: isDarkTheme ? "rgba(10,16,28,0.92)" : "rgba(255,255,255,0.97)",
            boxShadow: isDarkTheme
              ? "0 0 0 2px rgba(0,82,255,0.2), 0 14px 34px rgba(2,6,23,0.45)"
              : "0 0 0 2px rgba(0,82,255,0.14), 0 12px 28px rgba(15,23,42,0.22)",
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">Guided Tour</p>
          </div>
          <p className="text-xs font-semibold text-[var(--foreground)]">{guideSteps[guideStep]}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setGuideStep((s) => Math.max(0, s - 1))}
              className="btn-outline-modern inline-flex h-8 items-center px-3 text-xs ring-1 ring-[var(--accent)]/40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (guideStep >= guideSteps.length - 1) {
                  setGuideOpen(false);
                  setGuideStep(0);
                  return;
                }
                setGuideStep((s) => s + 1);
              }}
              className="btn-primary-modern inline-flex h-8 items-center px-3 text-xs ring-2 ring-[var(--accent)]/45"
            >
              {guideStep >= guideSteps.length - 1 ? "Done" : "Next"}
            </button>
            <button
              type="button"
              onClick={() => {
                setGuideOpen(false);
                setGuideStep(0);
              }}
              className="btn-outline-modern inline-flex h-8 items-center px-3 text-xs"
            >
              Close guide
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <div ref={canvasRef} className={`h-[430px] overflow-hidden rounded-2xl border bg-[var(--card)] ${guideOpen && guideStep === 0 ? "ring-2 ring-[var(--accent)]" : "border-[var(--border)]"}`}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            nodeTypes={FLOW_NODE_TYPES}
            fitView
            minZoom={0.4}
            maxZoom={1.3}
            nodesDraggable
            elementsSelectable
            panOnScroll
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
              style: { strokeWidth: 2 },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1.2} color="rgba(100,116,139,0.22)" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div ref={setupRef} className={`rounded-2xl border bg-[var(--card)] p-3 ${guideOpen && (guideStep === 1 || guideStep === 2) ? "ring-2 ring-[var(--accent)]" : "border-[var(--border)]"}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Quick Setup</p>
          {selectedNode ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-semibold text-[var(--foreground)]">{selectedNode.data.label}</p>
              {selectedNode.data.kind === "agent_sms" && (
                <>
                  <label className="block space-y-1">
                    <span className="text-xs text-[var(--muted-foreground)]">SMS message</span>
                    <textarea
                      value={String(selectedNode.data.config.message ?? "")}
                      onChange={(e) => updateNodeConfig(selectedNode.id, "message", e.target.value)}
                      rows={4}
                      className="input-modern w-full px-3 py-2 text-sm"
                    />
                  </label>
                  <p className="text-[11px] text-[var(--muted-foreground)]">Supports placeholders: {`{{name}}`}, {`{{phone}}`}</p>
                </>
              )}
              {selectedNode.data.kind === "source_manual_table" && (
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--muted-foreground)]">Table rows (CSV)</span>
                  <textarea
                    value={String(selectedNode.data.config.sample_csv ?? "")}
                    onChange={(e) => updateNodeConfig(selectedNode.id, "sample_csv", e.target.value)}
                    rows={7}
                    className="input-modern w-full px-3 py-2 font-mono text-xs"
                  />
                </label>
              )}
              {selectedNode.data.kind !== "agent_sms" && selectedNode.data.kind !== "source_manual_table" && (
                <p className="text-xs text-[var(--muted-foreground)]">Click `SMS Agent` or `Table Source` for editable demo settings.</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">Select a node to edit quick settings.</p>
          )}
        </div>
      </div>

      {simResult.length > 0 && (
        <div ref={simRef} className={`rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-3 ${guideOpen && guideStep === 3 ? "ring-2 ring-[var(--accent)]" : ""}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Simulation Output</p>
          <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] p-2">
            {simResult.map((line, idx) => (
              <p key={`${line}-${idx}`} className="text-xs text-[var(--foreground)]">{line}</p>
            ))}
          </div>
        </div>
      )}

      {guideOpen && spotlight && (
        <div className="pointer-events-none absolute inset-0 z-30 rounded-2xl">
          <div
            className="absolute rounded-xl border-2 border-[var(--accent)]"
            style={{
              left: spotlight.left,
              top: spotlight.top,
              width: spotlight.width,
              height: spotlight.height,
              boxShadow: `0 0 0 9999px ${isDarkTheme ? "rgba(255,255,255,0.20)" : "rgba(2,6,23,0.58)"}`,
              transition: "all 180ms ease-out",
            }}
          />
        </div>
      )}

      {guideOpen && (
        <button
          type="button"
          onClick={() => {
            setGuideOpen(false);
            setGuideStep(0);
          }}
          className="fixed right-4 top-4 z-[80] inline-flex h-9 w-9 items-center justify-center rounded-full border text-[var(--muted-foreground)] shadow-sm hover:text-[var(--foreground)]"
          style={{
            borderColor: isDarkTheme ? "rgba(148,163,184,0.45)" : "rgba(100,116,139,0.35)",
            background: isDarkTheme ? "rgba(15,23,42,0.92)" : "rgba(255,255,255,0.96)",
            boxShadow: isDarkTheme ? "0 6px 16px rgba(2,6,23,0.55)" : "0 8px 20px rgba(15,23,42,0.2)",
          }}
          title="Exit guide"
          aria-label="Exit guide"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function ExperienceDemo({ language }: ExperienceDemoProps) {
  const t = copy[language];
  const [activeTab, setActiveTab] = useState<DemoTab>("agent");
  const [agentSubTab, setAgentSubTab] = useState<AgentSubTab>("interactive");

  const [voiceText, setVoiceText] = useState("नमस्ते! यो AgentShakti को one-way demo call preview हो।");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [showCallFields, setShowCallFields] = useState(false);

  const [callName, setCallName] = useState("");
  const [callPhone, setCallPhone] = useState("");
  const [callScript, setCallScript] = useState("यो AgentShakti को डेमो कल हो। हामी तपाईंलाई हाम्रो प्लेटफर्म छोटकरीमा देखाउँछौं।");
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [callLoading, setCallLoading] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  const MAX_TEXT = 299;
  const callFieldsRef = useRef<HTMLDivElement>(null);

  const canGenerateVoice = useMemo(() => voiceText.trim().length > 0, [voiceText]);
  const canSendOtp = useMemo(() => callName.trim().length > 0 && callPhone.trim().length > 0 && callScript.trim().length > 0, [callName, callPhone, callScript]);
  const canVerifyOtp = useMemo(() => (otpRequestId ? otpCode.trim().length >= 4 : false), [otpRequestId, otpCode]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function handleGenerateVoice() {
    if (!canGenerateVoice) return;
    setTtsLoading(true);
    setTtsError(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    try {
      const result = await api.synthesizeTTS({ text: voiceText.trim(), provider: "edge_tts", voice: "ne-NP-HemkalaNeural" });
      setAudioUrl(URL.createObjectURL(result.audioBlob));
    } catch {
      setTtsError("TTS failed. फेरि प्रयास गर्नुहोस्।");
    } finally {
      setTtsLoading(false);
    }
  }

  async function handleSendOtp() {
    if (!canSendOtp) return;
    setCallLoading(true);
    setCallError(null);
    try {
      const result = await api.sendDemoCallOtp({
        name: callName.trim(),
        phone: callPhone.trim(),
        message: callScript.trim(),
        otp_channel: "sms",
        tts_config: { provider: "edge_tts", voice: "ne-NP-HemkalaNeural" },
      });
      setOtpRequestId(result.request_id);
    } catch (err) {
      if (err instanceof ApiError) setCallError(`OTP request failed (${err.status}).`);
      else setCallError("OTP request failed.");
    } finally {
      setCallLoading(false);
    }
  }

  async function handleVerifyOtpAndCall() {
    if (!otpRequestId || !canVerifyOtp) return;
    setCallLoading(true);
    setCallError(null);
    try {
      await api.verifyDemoCallOtp({ request_id: otpRequestId, otp: otpCode.trim() });
      setOtpRequestId(null);
      setOtpCode("");
    } catch (err) {
      if (err instanceof ApiError) setCallError(`OTP verification failed (${err.status}).`);
      else setCallError("OTP verification failed.");
    } finally {
      setCallLoading(false);
    }
  }

  const tabButtonClass = (tab: DemoTab) =>
    `relative inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${
      activeTab === tab
        ? "bg-[var(--card)] text-[var(--foreground)] shadow-[0_8px_20px_rgba(15,23,42,0.10)]"
        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
    }`;

  return (
    <section id="demo" className="py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="label-badge">
          <span className="pulse-dot" />
          {t.label}
        </div>
        <h2 className="font-display mt-5 text-4xl leading-tight text-[var(--foreground)] md:text-5xl">{t.title}</h2>
        <p className="mt-3 max-w-3xl text-[var(--muted-foreground)]">{t.desc}</p>

        <div className="mt-8 inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-1">
          <button type="button" className={tabButtonClass("agent")} onClick={() => setActiveTab("agent")}>{t.tabs.agent}</button>
          <button type="button" className={tabButtonClass("voices")} onClick={() => setActiveTab("voices")}>{t.tabs.voices}</button>
          <button type="button" className={tabButtonClass("flow")} onClick={() => setActiveTab("flow")}>{t.tabs.flow}</button>
        </div>
        <p className="mt-3 text-sm text-[var(--muted-foreground)]">{t.tabDescriptions[activeTab]}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {t.tabFeatures[activeTab].map((item) => (
            <span key={item} className="rounded-full border border-[var(--border)] bg-[var(--muted)] px-3 py-1 text-xs font-medium text-[var(--foreground)]">{item}</span>
          ))}
        </div>

        {activeTab === "agent" && (
          <motion.article className="surface-card rounded-b-2xl rounded-tr-2xl p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-5 inline-flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-1">
              <button
                type="button"
                onClick={() => setAgentSubTab("interactive")}
                className={`h-9 rounded-md px-3 text-xs font-semibold transition ${agentSubTab === "interactive" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]"}`}
              >
                {t.agentSubTabs.interactive}
              </button>
              <button
                type="button"
                onClick={() => setAgentSubTab("oneway")}
                className={`h-9 rounded-md px-3 text-xs font-semibold transition ${agentSubTab === "oneway" ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)]"}`}
              >
                {t.agentSubTabs.oneway}
              </button>
            </div>

            {agentSubTab === "interactive" ? (
              <LiveAgent language={language} />
            ) : (
              <div>
                <p className="font-mono-label text-xs uppercase tracking-[0.15em] text-[var(--accent)]">One-way Call Preview</p>
                <textarea value={voiceText} maxLength={MAX_TEXT} onChange={(e) => setVoiceText(e.target.value.slice(0, MAX_TEXT))} rows={4} className="input-modern mt-3 w-full px-4 py-3 text-sm" />
                <div className="mt-3 flex flex-wrap gap-3">
                  <button onClick={handleGenerateVoice} disabled={!canGenerateVoice || ttsLoading} className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50">
                    {ttsLoading ? "Working..." : "Generate & Hear Voice"}
                  </button>
                  <button onClick={() => {
                    setShowCallFields(true);
                    setTimeout(() => callFieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                  }} className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium">
                    Setup Real Call
                  </button>
                </div>
                {ttsError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{ttsError}</p>}
                {audioUrl && (
                  <div className="mt-4 rounded-xl border border-[var(--border)] p-3">
                    <audio controls autoPlay className="w-full">
                      <source src={audioUrl} type="audio/mpeg" />
                    </audio>
                  </div>
                )}

                {showCallFields && (
                  <div ref={callFieldsRef} className="mt-6 border-t border-[var(--border)] pt-6">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <input value={callName} onChange={(e) => setCallName(e.target.value)} placeholder="नाम" className="input-modern h-11 px-4 text-sm" />
                      <input value={callPhone} onChange={(e) => setCallPhone(e.target.value)} placeholder="फोन नम्बर (+977...)" className="input-modern h-11 px-4 text-sm" />
                    </div>
                    <textarea value={callScript} maxLength={MAX_TEXT} onChange={(e) => setCallScript(e.target.value.slice(0, MAX_TEXT))} rows={4} className="input-modern mt-3 w-full px-4 py-3 text-sm" />
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">OTP delivery: SMS</p>

                    {otpRequestId && <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="OTP" className="input-modern mt-3 h-11 w-full px-4 text-sm" />}

                    {!otpRequestId ? (
                      <button onClick={handleSendOtp} disabled={!canSendOtp || callLoading} className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50">
                        {callLoading ? "Working..." : "Send OTP"}
                      </button>
                    ) : (
                      <button onClick={handleVerifyOtpAndCall} disabled={!canVerifyOtp || callLoading} className="btn-primary-modern mt-4 inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50">
                        {callLoading ? "Working..." : "Verify OTP & Call"}
                      </button>
                    )}

                    {callError && <p className="mt-3 text-sm text-[var(--terminal-error,#DC2626)]">{callError}</p>}
                  </div>
                )}
              </div>
            )}
          </motion.article>
        )}

        {activeTab === "voices" && (
          <motion.article className="surface-card rounded-b-2xl rounded-tr-2xl p-6" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <VoiceCompare language={language} />
          </motion.article>
        )}

        {activeTab === "flow" && (
          <motion.article className="surface-card rounded-b-2xl rounded-tr-2xl p-6 md:p-7" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono-label text-xs uppercase tracking-[0.14em] text-[var(--accent)]">Campaign Flow Preview</p>
              <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--accent)]">Public Builder Demo</span>
            </div>
            <p className="mb-5 text-sm text-[var(--muted-foreground)]">Same node language as your logged-in builder. Drag nodes, zoom, and inspect a realistic outreach flow.</p>

            <FlowBuilderPreview />
          </motion.article>
        )}
      </div>
    </section>
  );
}
