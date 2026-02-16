"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { PhoneCall, MessageSquareText, Bot, Sparkles, Play, type LucideIcon } from "lucide-react";
import ClayButton from "@/components/ui/ClayButton";

type Channel = "voice" | "sms" | "whatsapp";

type DemoTurn = {
  speaker: "system" | "customer" | "agent";
  text: string;
};

const channelMeta: Record<Channel, { label: string; icon: LucideIcon }> = {
  voice: { label: "Voice", icon: PhoneCall },
  sms: { label: "SMS", icon: MessageSquareText },
  whatsapp: { label: "WhatsApp", icon: Bot },
};

const scripts: Record<Channel, DemoTurn[]> = {
  voice: [
    { speaker: "system", text: "Incoming lead call connected to Ring AI voice bot." },
    { speaker: "agent", text: "Namaste! I can help you book a demo and answer pricing questions." },
    { speaker: "customer", text: "Can you call me tomorrow after 3 PM?" },
    { speaker: "agent", text: "Booked. I also sent a confirmation SMS with your slot details." },
  ],
  sms: [
    { speaker: "system", text: "Campaign: festival-offer-nepal segmented to returning customers." },
    { speaker: "agent", text: "Hi Sita, your loyalty offer expires tonight. Reply YES for instant callback." },
    { speaker: "customer", text: "YES" },
    { speaker: "agent", text: "Done. A sales rep will reach you in 15 minutes." },
  ],
  whatsapp: [
    { speaker: "system", text: "WhatsApp inquiry from website CTA." },
    { speaker: "customer", text: "Do you support Nepali + English mixed conversations?" },
    { speaker: "agent", text: "Yes. Ring AI adapts language dynamically from customer context." },
    { speaker: "agent", text: "Want a 2-minute guided demo now?" },
  ],
};

const speakerStyle: Record<DemoTurn["speaker"], string> = {
  system: "bg-white/10 text-white/75 border border-white/15",
  customer: "bg-[#7B6BFF]/20 text-white border border-[#7B6BFF]/40",
  agent: "bg-[#17E8C6]/20 text-white border border-[#17E8C6]/40",
};

export default function ExperienceCenter() {
  const [channel, setChannel] = useState<Channel>("voice");
  const [step, setStep] = useState(0);
  const turns = useMemo(() => scripts[channel], [channel]);

  const visible = turns.slice(0, Math.max(1, step));

  function runDemo() {
    if (step >= turns.length) {
      setStep(1);
      return;
    }
    setStep((s) => Math.min(turns.length, s + 1));
  }

  function switchChannel(next: Channel) {
    setChannel(next);
    setStep(1);
  }

  return (
    <section
      id="experience-center"
      className="relative py-24 bg-[radial-gradient(circle_at_20%_10%,#28184a_0%,#130920_40%,#06040d_100%)] overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.45 }}
          >
            <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#b8a8ff] mb-4">
              <Sparkles className="w-4 h-4" />
              Experience Center
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Try Ring AI on the Index Page
            </h2>
            <p className="mt-4 text-white/70 max-w-xl">
              Run a quick interaction flow before signup. Switch channels, step through messages, and
              see how a unified conversation handoff works.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              {(Object.keys(channelMeta) as Channel[]).map((key) => {
                const Icon = channelMeta[key].icon;
                const active = key === channel;
                return (
                  <button
                    key={key}
                    onClick={() => switchChannel(key)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm border transition-colors ${
                      active
                        ? "bg-white text-[#130920] border-white"
                        : "bg-transparent text-white/80 border-white/25 hover:border-white/50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {channelMeta[key].label}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <ClayButton variant="primary" size="md" href="/login">
                Signup For Free
              </ClayButton>
              <button
                onClick={runDemo}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold text-white border border-white/25 hover:border-white/60 transition-colors"
              >
                <Play className="w-4 h-4" />
                {step >= turns.length ? "Replay Demo" : "Next Demo Step"}
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.45, delay: 0.08 }}
            className="rounded-3xl border border-white/15 bg-white/5 backdrop-blur-md p-5 sm:p-6"
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-4 mb-4">
              <div>
                <p className="text-xs text-white/55 uppercase tracking-wider">Live Demo Flow</p>
                <p className="text-sm text-white/90 mt-1">{channelMeta[channel].label} conversation</p>
              </div>
              <p className="text-xs text-white/55">
                Step {Math.min(step, turns.length)} / {turns.length}
              </p>
            </div>

            <div className="space-y-3 min-h-[260px]">
              {visible.map((turn, idx) => (
                <div key={`${turn.speaker}-${idx}`} className={`rounded-xl p-3 text-sm ${speakerStyle[turn.speaker]}`}>
                  <p className="text-[11px] uppercase tracking-wider opacity-75 mb-1">{turn.speaker}</p>
                  <p>{turn.text}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
