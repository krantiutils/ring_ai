"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api, ApiError } from "@/lib/api";
import { LiveAudioSession } from "@/lib/audioWebSocket";
import type { LandingLanguage } from "@/app/page";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type LiveAgentState =
  | "idle"
  | "otp_sent"
  | "verified"
  | "connecting"
  | "active"
  | "ended";

type TranscriptMessage = {
  id: number;
  text: string;
  speaker: "agent" | "user";
};

type ScenarioId = "cart_recovery" | "appointment_booking" | "payment_reminder";

/* ------------------------------------------------------------------ */
/*  Scenario illustrations                                              */
/* ------------------------------------------------------------------ */

function CartRecoveryIllustration() {
  return (
    <svg viewBox="0 0 240 112" fill="none" className="h-full w-full">
      {/* Decorative circles */}
      <circle cx="18" cy="18" r="14" fill="rgba(6,182,212,0.06)" />
      <circle cx="222" cy="92" r="18" fill="rgba(6,182,212,0.05)" />
      <circle cx="38" cy="96" r="8" fill="rgba(6,182,212,0.04)" />
      {/* Phone device */}
      <rect x="56" y="6" width="52" height="100" rx="10" fill="rgba(6,182,212,0.1)" stroke="rgba(6,182,212,0.3)" strokeWidth="1.5" />
      <rect x="61" y="14" width="42" height="78" rx="6" fill="rgba(6,182,212,0.05)" />
      <rect x="74" y="8" width="16" height="3" rx="1.5" fill="rgba(6,182,212,0.2)" />
      {/* Cart icon on screen */}
      <path d="M72 42h3l4 18h18l3-13H77" stroke="rgba(6,182,212,0.55)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="81" cy="63" r="2" fill="rgba(6,182,212,0.55)" />
      <circle cx="91" cy="63" r="2" fill="rgba(6,182,212,0.55)" />
      {/* Item box on screen */}
      <rect x="82" y="46" width="9" height="9" rx="1.5" fill="rgba(6,182,212,0.15)" stroke="rgba(6,182,212,0.3)" strokeWidth="0.8" />
      {/* Notification badge */}
      <circle cx="104" cy="14" r="9" fill="rgba(239,68,68,0.8)" />
      <path d="M101.5 14.5 L104 11 L106.5 14.5 H105 V17 H103 V14.5Z" fill="white" />
      {/* Shopping bag */}
      <rect x="136" y="28" width="44" height="52" rx="6" fill="rgba(6,182,212,0.08)" stroke="rgba(6,182,212,0.25)" strokeWidth="1.2" />
      <path d="M150 28v-9a8 8 0 0116 0v9" stroke="rgba(6,182,212,0.3)" strokeWidth="1.2" fill="none" />
      {/* Items in bag */}
      <rect x="144" y="40" width="14" height="18" rx="2.5" fill="rgba(6,182,212,0.12)" stroke="rgba(6,182,212,0.22)" strokeWidth="0.8" />
      <rect x="161" y="38" width="11" height="20" rx="2.5" fill="rgba(6,182,212,0.1)" stroke="rgba(6,182,212,0.18)" strokeWidth="0.8" />
      {/* Discount tag */}
      <rect x="134" y="72" width="48" height="20" rx="10" fill="rgba(6,182,212,0.18)" stroke="rgba(6,182,212,0.4)" strokeWidth="1" />
      <circle cx="146" cy="82" r="4" fill="none" stroke="rgba(6,182,212,0.5)" strokeWidth="1" />
      <line x1="144" y1="80" x2="148" y2="84" stroke="rgba(6,182,212,0.5)" strokeWidth="0.8" />
      <line x1="162" y1="82" x2="174" y2="82" stroke="rgba(6,182,212,0.35)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="162" y1="78" x2="170" y2="78" stroke="rgba(6,182,212,0.25)" strokeWidth="1" strokeLinecap="round" />
      {/* Delivery truck */}
      <rect x="196" y="50" width="24" height="16" rx="3" fill="rgba(6,182,212,0.08)" stroke="rgba(6,182,212,0.2)" strokeWidth="1" />
      <rect x="188" y="56" width="10" height="10" rx="2" fill="rgba(6,182,212,0.06)" stroke="rgba(6,182,212,0.15)" strokeWidth="0.8" />
      <circle cx="198" cy="68" r="3" fill="rgba(6,182,212,0.15)" stroke="rgba(6,182,212,0.3)" strokeWidth="0.8" />
      <circle cx="214" cy="68" r="3" fill="rgba(6,182,212,0.15)" stroke="rgba(6,182,212,0.3)" strokeWidth="0.8" />
    </svg>
  );
}

function AppointmentIllustration() {
  return (
    <svg viewBox="0 0 240 112" fill="none" className="h-full w-full">
      {/* Decorative circles */}
      <circle cx="20" cy="90" r="14" fill="rgba(59,130,246,0.05)" />
      <circle cx="218" cy="16" r="10" fill="rgba(59,130,246,0.06)" />
      {/* Calendar card */}
      <rect x="40" y="8" width="88" height="96" rx="10" fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.25)" strokeWidth="1.5" />
      {/* Calendar header bar */}
      <rect x="40" y="8" width="88" height="22" rx="10" fill="rgba(59,130,246,0.15)" />
      <rect x="40" y="20" width="88" height="10" fill="rgba(59,130,246,0.15)" />
      {/* Calendar ring holes */}
      <circle cx="60" cy="10" r="3" fill="rgba(59,130,246,0.06)" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />
      <circle cx="84" cy="10" r="3" fill="rgba(59,130,246,0.06)" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />
      <circle cx="108" cy="10" r="3" fill="rgba(59,130,246,0.06)" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />
      {/* Day grid - 7 cols x 4 rows */}
      {[0, 1, 2, 3, 4, 5, 6].map((col) =>
        [0, 1, 2, 3].map((row) => {
          const x = 50 + col * 10;
          const y = 40 + row * 14;
          const isHighlighted = col === 3 && row === 1;
          return (
            <rect
              key={`${col}-${row}`}
              x={x}
              y={y}
              width="6"
              height="6"
              rx="1.5"
              fill={isHighlighted ? "rgba(59,130,246,0.6)" : "rgba(59,130,246,0.1)"}
              stroke={isHighlighted ? "rgba(59,130,246,0.8)" : "none"}
              strokeWidth={isHighlighted ? "1" : "0"}
            />
          );
        }),
      )}
      {/* Highlight ring around selected date */}
      <circle cx="83" cy="57" r="8" fill="none" stroke="rgba(59,130,246,0.5)" strokeWidth="1.5" strokeDasharray="3 2" />
      {/* Clock */}
      <circle cx="170" cy="40" r="28" fill="rgba(59,130,246,0.07)" stroke="rgba(59,130,246,0.25)" strokeWidth="1.5" />
      <circle cx="170" cy="40" r="24" fill="rgba(59,130,246,0.04)" />
      {/* Hour marks */}
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
        const angle = (i * 30 - 90) * (Math.PI / 180);
        const x1 = 170 + Math.cos(angle) * 20;
        const y1 = 40 + Math.sin(angle) * 20;
        const x2 = 170 + Math.cos(angle) * 23;
        const y2 = 40 + Math.sin(angle) * 23;
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(59,130,246,0.3)" strokeWidth={i % 3 === 0 ? "1.5" : "0.8"} strokeLinecap="round" />
        );
      })}
      {/* Clock hands - showing 10:00 */}
      <line x1="170" y1="40" x2="170" y2="24" stroke="rgba(59,130,246,0.5)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="170" y1="40" x2="158" y2="34" stroke="rgba(59,130,246,0.45)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="170" cy="40" r="2.5" fill="rgba(59,130,246,0.5)" />
      {/* Time slot cards */}
      <rect x="144" y="76" width="54" height="14" rx="7" fill="rgba(59,130,246,0.12)" stroke="rgba(59,130,246,0.3)" strokeWidth="1" />
      <circle cx="153" cy="83" r="3" fill="rgba(59,130,246,0.3)" />
      <line x1="160" y1="83" x2="190" y2="83" stroke="rgba(59,130,246,0.25)" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="144" y="92" width="54" height="14" rx="7" fill="rgba(59,130,246,0.08)" stroke="rgba(59,130,246,0.2)" strokeWidth="1" />
      <circle cx="153" cy="99" r="3" fill="rgba(59,130,246,0.2)" />
      <line x1="160" y1="99" x2="186" y2="99" stroke="rgba(59,130,246,0.18)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Checkmark badge */}
      <circle cx="212" cy="38" r="12" fill="rgba(34,197,94,0.15)" stroke="rgba(34,197,94,0.4)" strokeWidth="1.2" />
      <path d="M207 38l3 3 5-6" stroke="rgba(34,197,94,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PaymentIllustration() {
  return (
    <svg viewBox="0 0 240 112" fill="none" className="h-full w-full">
      {/* Decorative circles */}
      <circle cx="222" cy="20" r="12" fill="rgba(16,185,129,0.05)" />
      <circle cx="16" cy="80" r="10" fill="rgba(16,185,129,0.06)" />
      {/* Receipt / bill */}
      <path d="M44 6h72a6 6 0 016 6v82l-6 5-6-5-6 5-6-5-6 5-6-5-6 5-6-5-6 5-6-5-6 5-6-5V12a6 6 0 016-6z" fill="rgba(16,185,129,0.07)" stroke="rgba(16,185,129,0.25)" strokeWidth="1.5" />
      {/* Receipt header line */}
      <line x1="56" y1="20" x2="108" y2="20" stroke="rgba(16,185,129,0.3)" strokeWidth="2" strokeLinecap="round" />
      {/* Receipt text lines */}
      <line x1="56" y1="32" x2="100" y2="32" stroke="rgba(16,185,129,0.15)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="56" y1="40" x2="92" y2="40" stroke="rgba(16,185,129,0.12)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="56" y1="48" x2="96" y2="48" stroke="rgba(16,185,129,0.12)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Separator line */}
      <line x1="52" y1="58" x2="112" y2="58" stroke="rgba(16,185,129,0.2)" strokeWidth="0.8" strokeDasharray="3 2" />
      {/* Highlighted amount row */}
      <rect x="50" y="64" width="64" height="16" rx="4" fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.35)" strokeWidth="1" />
      <line x1="56" y1="72" x2="72" y2="72" stroke="rgba(16,185,129,0.35)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="90" y1="72" x2="108" y2="72" stroke="rgba(16,185,129,0.5)" strokeWidth="2" strokeLinecap="round" />
      {/* Warning/overdue badge */}
      <circle cx="118" cy="14" r="8" fill="rgba(245,158,11,0.2)" stroke="rgba(245,158,11,0.5)" strokeWidth="1" />
      <line x1="118" y1="10" x2="118" y2="15" stroke="rgba(245,158,11,0.6)" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="118" cy="18" r="1" fill="rgba(245,158,11,0.6)" />
      {/* Digital wallet / phone payment */}
      <rect x="148" y="20" width="48" height="72" rx="8" fill="rgba(16,185,129,0.07)" stroke="rgba(16,185,129,0.22)" strokeWidth="1.5" />
      <rect x="153" y="28" width="38" height="52" rx="4" fill="rgba(16,185,129,0.04)" />
      {/* Wallet screen - rupee symbol */}
      <circle cx="172" cy="48" r="12" fill="rgba(16,185,129,0.12)" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
      <path d="M167 43h10 M167 47h10 M170 43l4 10" stroke="rgba(16,185,129,0.5)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Payment success checkmark */}
      <circle cx="172" cy="68" r="5" fill="rgba(16,185,129,0.2)" />
      <path d="M169.5 68l2 2 3-4" stroke="rgba(16,185,129,0.6)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Payment flow arrow */}
      <path d="M126 52 Q137 52 137 42 Q137 32 148 32" stroke="rgba(16,185,129,0.2)" strokeWidth="1.2" fill="none" strokeDasharray="4 3" />
      <path d="M145 29l4 3-4 3" stroke="rgba(16,185,129,0.25)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Payment method cards floating */}
      <rect x="204" y="36" width="26" height="16" rx="3" fill="rgba(16,185,129,0.08)" stroke="rgba(16,185,129,0.18)" strokeWidth="0.8" />
      <line x1="208" y1="42" x2="218" y2="42" stroke="rgba(16,185,129,0.2)" strokeWidth="1" strokeLinecap="round" />
      <line x1="208" y1="46" x2="214" y2="46" stroke="rgba(16,185,129,0.15)" strokeWidth="0.8" strokeLinecap="round" />
      <rect x="208" y="58" width="26" height="16" rx="3" fill="rgba(16,185,129,0.06)" stroke="rgba(16,185,129,0.14)" strokeWidth="0.8" />
      <line x1="212" y1="64" x2="222" y2="64" stroke="rgba(16,185,129,0.15)" strokeWidth="1" strokeLinecap="round" />
      <line x1="212" y1="68" x2="218" y2="68" stroke="rgba(16,185,129,0.12)" strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

function ScenarioArt({ id, compact = false }: { id: ScenarioId; compact?: boolean }) {
  const borderClass =
    id === "cart_recovery"
      ? "border-cyan-400/35"
      : id === "appointment_booking"
        ? "border-blue-400/35"
        : "border-emerald-400/35";

  const gradClass =
    id === "cart_recovery"
      ? "from-cyan-500/18 via-blue-500/12 to-transparent"
      : id === "appointment_booking"
        ? "from-blue-500/18 via-indigo-500/12 to-transparent"
        : "from-emerald-500/18 via-teal-500/12 to-transparent";

  if (compact) {
    return (
      <div className={`relative h-full w-full overflow-hidden rounded-lg border ${borderClass} bg-[var(--muted)]`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${gradClass}`} />
        <div className="relative flex h-full items-center justify-center p-1">
          {id === "cart_recovery" && <CartRecoveryIllustration />}
          {id === "appointment_booking" && <AppointmentIllustration />}
          {id === "payment_reminder" && <PaymentIllustration />}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-xl border ${borderClass} bg-[#0b1220]`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradClass}`} />
      <div className="relative z-10 h-full w-full">
        {id === "cart_recovery" && <CartRecoveryIllustration />}
        {id === "appointment_booking" && <AppointmentIllustration />}
        {id === "payment_reminder" && <PaymentIllustration />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SCENARIOS: {
  id: ScenarioId;
  agentName: string;
  toneClass: string;
  storyTag: string;
  en: { label: string; desc: string };
  ne: { label: string; desc: string };
}[] = [
  {
    id: "cart_recovery",
    agentName: "Sita",
    toneClass: "text-cyan-300",
    storyTag: "iPhone 15 Cart",
    en: { label: "Online Store Recovery", desc: "Customer left an iPhone 15 in cart. Recover with discount + free delivery." },
    ne: {
      label: "\u0905\u0928\u0932\u093E\u0907\u0928 \u0938\u094D\u091F\u094B\u0930 \u0930\u093F\u0915\u092D\u0930\u0940",
      desc: "\u0915\u093E\u0930\u094D\u091F\u092E\u093E iPhone 15 \u091B\u094B\u0921\u093F\u090F\u0915\u094B \u091B, \u0921\u093F\u0938\u094D\u0915\u093E\u0909\u0928\u094D\u091F \u0930 \u092B\u094D\u0930\u093F \u0921\u0947\u0932\u093F\u092D\u0930\u0940\u0938\u0901\u0917 \u0930\u093F\u0915\u092D\u0930 \u0917\u0930\u094D\u0928\u0947\u0964",
    },
  },
  {
    id: "appointment_booking",
    agentName: "Rina",
    toneClass: "text-blue-300",
    storyTag: "Clinic Booking",
    en: { label: "Clinic Appointment", desc: "Book or confirm visit with two slots: 10:00 AM or 3:00 PM." },
    ne: {
      label: "\u0915\u094D\u0932\u093F\u0928\u093F\u0915 \u0905\u092A\u094B\u0907\u0928\u094D\u091F\u092E\u0947\u0928\u094D\u091F",
      desc: "\u0926\u0941\u0908 \u0938\u094D\u0932\u091F: \u092C\u093F\u0939\u093E\u0928 10 \u092C\u091C\u0947 \u0935\u093E \u0926\u093F\u0909\u0901\u0938\u094B 3 \u092C\u091C\u0947\u092E\u093E \u092C\u0941\u0915/\u0915\u0928\u094D\u092B\u0930\u094D\u092E \u0917\u0930\u094D\u0928\u0947\u0964",
    },
  },
  {
    id: "payment_reminder",
    agentName: "Ram",
    toneClass: "text-emerald-300",
    storyTag: "Utility Reminder",
    en: { label: "Utility Bill Reminder", desc: "Overdue Rs 2,500 bill; guide payment through eSewa, Khalti, or bank." },
    ne: {
      label: "\u092F\u0941\u091F\u093F\u0932\u093F\u091F\u0940 \u092D\u0941\u0915\u094D\u0924\u093E\u0928\u0940 \u0938\u092E\u094D\u091D\u093E\u0909\u0928\u0947",
      desc: "Rs 2,500 \u092C\u0915\u094D\u092F\u094C\u0924\u093E \u092C\u093F\u0932 \u092D\u0941\u0915\u094D\u0924\u093E\u0928\u0940\u0915\u093E \u0932\u093E\u0917\u093F eSewa, Khalti \u0935\u093E bank transfer \u092E\u093E \u0938\u0939\u092F\u094B\u0917 \u0917\u0930\u094D\u0928\u0947\u0964",
    },
  },
];

const STORAGE_KEY = "live_agent_verified";
const OTP_VALIDITY_MS = 60 * 60 * 1000; // 1 hour
const NUM_WAVEFORM_BARS = 7;

const copy = {
  en: {
    scenarioTitle: "Choose a Scenario",
    scenarioDesc: "Pick a demo scenario to talk with our AI agent.",
    demoPanelTitle: "AgentShakti Live Demo",
    nameLabel: "Your Name",
    phoneLabel: "Phone (+977...)",
    sendOtp: "Send OTP",
    otpLabel: "Enter OTP",
    verify: "Verify",
    verifyAndCall: "Verify & Real Call",
    webCall: "Verify & Web Call",
    connecting: "Connecting...",
    startingRealCall: "Starting real call...",
    realCallStarted: "Real call started. Check your phone now.",
    endCall: "End Call",
    callEnded: "Call ended",
    callEndedAfter: "Call ended after",
    seconds: "seconds",
    tryAnother: "Try Another Scenario",
    startNew: "Start New Call",
    micError: "Microphone access denied. Please allow mic access and try again.",
    otpSendFail: "Failed to send OTP.",
    otpVerifyFail: "OTP verification failed.",
    working: "Working...",
    agent: "Agent",
  },
  ne: {
    scenarioTitle: "\u0938\u093F\u0928\u093E\u0930\u093F\u092F\u094B \u091B\u093E\u0928\u094D\u0928\u0941\u0939\u094B\u0938\u094D",
    scenarioDesc: "\u0939\u093E\u092E\u094D\u0930\u094B AI \u090F\u091C\u0947\u0928\u094D\u091F\u0938\u0901\u0917 \u0915\u0941\u0930\u093E \u0917\u0930\u094D\u0928 \u0921\u0947\u092E\u094B \u0938\u093F\u0928\u093E\u0930\u093F\u092F\u094B \u091B\u093E\u0928\u094D\u0928\u0941\u0939\u094B\u0938\u094D\u0964",
    demoPanelTitle: "AgentShakti \u0932\u093E\u0907\u092D \u0921\u0947\u092E\u094B",
    nameLabel: "\u0924\u092A\u093E\u0908\u0902\u0915\u094B \u0928\u093E\u092E",
    phoneLabel: "\u092B\u094B\u0928 (+977...)",
    sendOtp: "OTP \u092A\u0920\u093E\u0909\u0928\u0941\u0939\u094B\u0938\u094D",
    otpLabel: "OTP \u0939\u093E\u0932\u094D\u0928\u0941\u0939\u094B\u0938\u094D",
    verify: "\u092D\u0947\u0930\u093F\u092B\u093E\u0907",
    verifyAndCall: "\u092D\u0947\u0930\u093F\u092B\u093E\u0907 \u0930 \u0930\u093F\u092F\u0932 \u0915\u0932",
    webCall: "\u092D\u0947\u0930\u093F\u092B\u093E\u0907 \u0930 \u0935\u0947\u092C \u0915\u0932",
    connecting: "\u091C\u094B\u0921\u094D\u0928\u0947...",
    startingRealCall: "\u0930\u093F\u092F\u0932 \u0915\u0932 \u0938\u0941\u0930\u0941 \u0939\u0941\u0926\u0948...",
    realCallStarted: "\u0930\u093F\u092F\u0932 \u0915\u0932 \u0938\u0941\u0930\u0941 \u092D\u092F\u094B\u0964 \u0905\u092C \u0924\u092A\u093E\u0908\u0902\u0915\u094B \u092B\u094B\u0928 \u0939\u0947\u0930\u094D\u0928\u0941\u0939\u094B\u0938\u094D\u0964",
    endCall: "\u0915\u0932 \u0938\u092E\u093E\u092A\u094D\u0924",
    callEnded: "\u0915\u0932 \u0938\u092E\u093E\u092A\u094D\u0924 \u092D\u092F\u094B",
    callEndedAfter: "\u0915\u0932 \u0938\u092E\u093E\u092A\u094D\u0924 \u092D\u092F\u094B",
    seconds: "\u0938\u0947\u0915\u0947\u0928\u094D\u0921",
    tryAnother: "\u0905\u0930\u094D\u0915\u094B \u0938\u093F\u0928\u093E\u0930\u093F\u092F\u094B",
    startNew: "\u0928\u092F\u093E\u0901 \u0915\u0932",
    micError: "\u092E\u093E\u0907\u0915\u094D\u0930\u094B\u092B\u094B\u0928 \u0905\u0928\u0941\u092E\u0924\u093F \u0905\u0938\u094D\u0935\u0940\u0915\u093E\u0930\u0964 \u0915\u0943\u092A\u092F\u093E \u092E\u093E\u0907\u0915 \u0905\u0928\u0941\u092E\u0924\u093F \u0926\u093F\u0928\u0941\u0939\u094B\u0938\u094D\u0964",
    otpSendFail: "OTP \u092A\u0920\u093E\u0909\u0928 \u0905\u0938\u092B\u0932\u0964",
    otpVerifyFail: "OTP \u092D\u0947\u0930\u093F\u092B\u093F\u0915\u0947\u0936\u0928 \u0905\u0938\u092B\u0932\u0964",
    working: "\u0915\u093E\u092E \u092D\u0907\u0930\u0939\u0947\u0915\u094B...",
    agent: "\u090F\u091C\u0947\u0928\u094D\u091F",
  },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getStoredVerification(): { phone: string; verifiedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { phone: string; verifiedAt: number };
    if (Date.now() - parsed.verifiedAt > OTP_VALIDITY_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storeVerification(phone: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ phone, verifiedAt: Date.now() }),
  );
}

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function WaveformBars({ level }: { level: number }) {
  // Deterministic per-bar offsets for visual variety
  const offsets = useMemo(
    () =>
      Array.from({ length: NUM_WAVEFORM_BARS }, (_, i) => {
        const base = Math.sin(i * 1.8 + 0.5) * 0.3;
        return base;
      }),
    [],
  );

  return (
    <div className="flex items-center justify-center gap-1">
      {offsets.map((offset, i) => {
        const barLevel = Math.max(0.1, Math.min(1, level + offset));
        return (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-[var(--accent)]"
            animate={{ scaleY: barLevel, height: 32 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ originY: 0.5 }}
          />
        );
      })}
    </div>
  );
}

function PulsingRings() {
  return (
    <div className="relative flex h-32 w-32 items-center justify-center">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border-2 border-[var(--accent)]"
          initial={{ scale: 0.6, opacity: 0.6 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            delay: i * 0.6,
            ease: "easeOut",
          }}
        />
      ))}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-2xl text-white">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
          />
        </svg>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

type LiveAgentProps = {
  language: LandingLanguage;
};

export default function LiveAgent({ language }: LiveAgentProps) {
  const t = copy[language];

  // State machine
  const [phase, setPhase] = useState<LiveAgentState>("idle");

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);

  // Scenario
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId | null>(
    null,
  );

  // Session
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRef = useRef<LiveAudioSession | null>(null);

  // Call state
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [localInterim, setLocalInterim] = useState("");
  const [callSeconds, setCallSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const msgIdRef = useRef(0);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ---- On mount: check localStorage for verified phone ----
  useEffect(() => {
    const stored = getStoredVerification();
    if (stored) {
      setPhone(stored.phone);
      setPhase("verified");
    }
  }, []);

  // ---- Auto-scroll transcript ----
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop =
        transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  // ---- Call timer ----
  useEffect(() => {
    if (phase === "active") {
      setCallSeconds(0);
      timerRef.current = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase]);

  // ---- Cleanup session on unmount ----
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.disconnect();
        sessionRef.current = null;
      }
    };
  }, []);

  // Derived
  const canSendOtp = useMemo(
    () => name.trim().length > 0 && phone.trim().length > 0,
    [name, phone],
  );
  const canVerify = useMemo(
    () => otpCode.trim().length >= 4 && requestId !== null && selectedScenario !== null,
    [otpCode, requestId, selectedScenario],
  );

  const activeScenario = useMemo(
    () => SCENARIOS.find((s) => s.id === selectedScenario) ?? null,
    [selectedScenario],
  );

  // ---- Handlers ----

  const handleSendOtp = useCallback(async () => {
    if (!canSendOtp) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.sendDemoCallOtp({
        name: name.trim(),
        phone: phone.trim(),
        message: "Live agent demo",
        otp_channel: "sms",
        tts_config: {
          provider: "edge_tts",
          voice: "ne-NP-HemkalaNeural",
        },
      });
      setRequestId(result.request_id);
      setPhase("otp_sent");
    } catch (err) {
      if (err instanceof ApiError)
        setError(`${t.otpSendFail} (${err.status})`);
      else setError(t.otpSendFail);
    } finally {
      setLoading(false);
    }
  }, [canSendOtp, name, phone, t]);

  const handleVerify = useCallback(async () => {
    if (!canVerify || !requestId || !selectedScenario) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.verifyLiveAgentOtp({
        request_id: requestId,
        otp: otpCode.trim(),
        scenario: selectedScenario,
      });
      sessionRef.current?.disconnect();
      sessionRef.current = null;
      setSessionId(result.session_id);
      storeVerification(phone.trim());
      setPhase("connecting");

      // Build audio session inline (no mountedRef guard — React Strict Mode breaks it)
      const session = new LiveAudioSession(result.session_id, {
        onTranscript: (text, speaker) => {
          if (speaker === "user") {
            setLocalInterim("");
          }
          msgIdRef.current += 1;
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            // Gemini often streams transcript deltas; coalesce by speaker.
            if (last && last.speaker === speaker) {
              const mergedText = text.startsWith(last.text) ? text : `${last.text} ${text}`.trim();
              return [...prev.slice(0, -1), { ...last, text: mergedText }];
            }
            return [...prev, { id: msgIdRef.current, text, speaker }];
          });
        },
        onLocalTranscript: (text, isFinal) => {
          if (!text.trim()) return;
          if (!isFinal) {
            setLocalInterim(text);
            return;
          }
          setLocalInterim("");
          msgIdRef.current += 1;
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.speaker === "user") {
              const mergedText = text.startsWith(last.text) ? text : `${last.text} ${text}`.trim();
              return [...prev.slice(0, -1), { ...last, text: mergedText }];
            }
            return [...prev, { id: msgIdRef.current, text, speaker: "user" }];
          });
        },
        onTimeout: () => {
          sessionRef.current?.disconnect();
          sessionRef.current = null;
          setPhase("ended");
        },
        onStateChange: (state) => {
          if (state === "active") setPhase("active");
          if (state === "ended") {
            sessionRef.current?.disconnect();
            sessionRef.current = null;
            setPhase("ended");
          }
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
        },
      });
      sessionRef.current = session;

      try {
        await session.connect();
      } catch (audioErr) {
        const msg = audioErr instanceof Error ? audioErr.message : t.micError;
        setError(msg);
        setPhase("verified");
      }
    } catch (err) {
      if (err instanceof ApiError) {
        // Extract detail from JSON body if possible
        let detail = t.otpVerifyFail;
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.detail) detail = parsed.detail;
        } catch {
          detail = err.message || t.otpVerifyFail;
        }
        setError(detail);
      } else {
        setError(t.otpVerifyFail);
      }
      // Go back to otp_sent so user can retry or see the error
      setPhase("otp_sent");
    } finally {
      setLoading(false);
    }
  }, [canVerify, requestId, selectedScenario, otpCode, phone, t]);

  const handleVerifyAndRealCall = useCallback(async () => {
    if (!canVerify || !requestId || !selectedScenario) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    let createdSessionId: string | null = null;
    try {
      const result = await api.verifyLiveAgentOtp({
        request_id: requestId,
        otp: otpCode.trim(),
        scenario: selectedScenario,
      });
      createdSessionId = result.session_id;
      setSessionId(result.session_id);
      storeVerification(phone.trim());
      setPhase("connecting");
      setNotice(t.startingRealCall);

      const callResult = await api.startLiveAgentPhoneCall(result.session_id);
      msgIdRef.current += 1;
      setTranscript([
        {
          id: msgIdRef.current,
          speaker: "agent",
          text: `${t.realCallStarted} (${callResult.call_id})`,
        },
      ]);
      setNotice(null);
      setPhase("ended");
    } catch (err) {
      if (err instanceof ApiError) {
        let detail = t.otpVerifyFail;
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.detail) detail = parsed.detail;
        } catch {
          detail = err.message || t.otpVerifyFail;
        }
        setError(detail);
      } else {
        setError(t.otpVerifyFail);
      }
      if (createdSessionId) {
        try {
          await api.endLiveAgentSession(createdSessionId);
        } catch {
          // best effort
        }
      }
      setPhase("otp_sent");
    } finally {
      setLoading(false);
    }
  }, [canVerify, otpCode, phone, requestId, selectedScenario, t]);

  const handleEndCall = useCallback(async () => {
    if (sessionRef.current) {
      sessionRef.current.disconnect();
      sessionRef.current = null;
    }
    if (sessionId) {
      try {
        await api.endLiveAgentSession(sessionId);
      } catch {
        // best effort
      }
    }
    setPhase("ended");
  }, [sessionId]);

  const handleTryAnother = useCallback(() => {
    setSelectedScenario(null);
    setTranscript([]);
    setLocalInterim("");
    setCallSeconds(0);
    setAudioLevel(0);
    setSessionId(null);
    setError(null);
    setNotice(null);
    setOtpCode("");
    setRequestId(null);
    // If phone is still verified, go to verified state (scenario pick)
    const stored = getStoredVerification();
    if (stored) {
      setPhase("verified");
    } else {
      setPhase("idle");
    }
  }, []);

  const handleStartNewFromVerified = useCallback(async () => {
    if (!selectedScenario) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    setTranscript([]);
    setLocalInterim("");
    setCallSeconds(0);
    setAudioLevel(0);
    try {
      // Re-send OTP for verified flow — user already has phone stored
      const result = await api.sendDemoCallOtp({
        name: name.trim() || "User",
        phone: phone.trim(),
        message: "Live agent demo",
        otp_channel: "sms",
        tts_config: {
          provider: "edge_tts",
          voice: "ne-NP-HemkalaNeural",
        },
      });
      setRequestId(result.request_id);
      setPhase("otp_sent");
    } catch (err) {
      if (err instanceof ApiError)
        setError(`${t.otpSendFail} (${err.status})`);
      else setError(t.otpSendFail);
    } finally {
      setLoading(false);
    }
  }, [selectedScenario, name, phone, t]);

  // ---- Render helpers ----

  const renderScenarioCards = () => (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--foreground)]">{t.demoPanelTitle}</p>
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-[var(--muted-foreground)]">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          LIVE
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SCENARIOS.map((s) => {
          const sLabel = s[language];
          const isSelected = selectedScenario === s.id;
          const toneClass =
            s.id === "cart_recovery"
              ? "from-cyan-500/20 to-indigo-500/10"
              : s.id === "appointment_booking"
                ? "from-orange-500/20 to-amber-500/10"
                : "from-emerald-500/20 to-teal-500/10";

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedScenario(s.id)}
              className={`surface-card group flex flex-col items-start gap-3 rounded-2xl p-4 text-left ${
                isSelected ? "border-[var(--accent)] shadow-[0_10px_24px_rgba(0,82,255,0.18)]" : ""
              }`}
            >
              <div className={`h-28 w-full rounded-xl border border-[var(--border)] bg-gradient-to-br ${toneClass} p-2`}>
                <ScenarioArt id={s.id} />
              </div>
              <div className="flex w-full items-center justify-between gap-2">
                <p className="text-base font-semibold text-[var(--foreground)]">
                  {sLabel.label}
                </p>
                <span className={`rounded bg-[var(--muted)] px-2 py-0.5 text-[10px] font-semibold ${s.toneClass}`}>
                  {s.storyTag}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">{sLabel.desc}</p>
              <span className="btn-outline-modern inline-flex h-8 items-center px-3 text-xs font-semibold">
                Start Speaking
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderCallerIdCard = () => {
    if (!activeScenario) return null;
    const sLabel = activeScenario[language];
    return (
      <div className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="h-16 w-24">
          <ScenarioArt id={activeScenario.id} compact />
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">
            {sLabel.label}
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {t.agent}: {activeScenario.agentName}
          </p>
        </div>
      </div>
    );
  };

  // ---- Phase renders ----

  // idle + otp_sent: Scenario pick, name/phone, OTP
  if (phase === "idle" || phase === "otp_sent") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">
            {t.scenarioTitle}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {t.scenarioDesc}
          </p>
        </div>

        {renderScenarioCards()}

        <AnimatePresence>
          {selectedScenario && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.nameLabel}
                  className="input-modern h-11 px-4 text-sm"
                  disabled={phase === "otp_sent"}
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t.phoneLabel}
                  className="input-modern h-11 px-4 text-sm"
                  disabled={phase === "otp_sent"}
                />
              </div>

              {phase === "otp_sent" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder={t.otpLabel}
                    className="input-modern h-11 w-full px-4 text-sm"
                    maxLength={6}
                  />
                </motion.div>
              )}

              <div className="flex gap-3">
                {phase === "idle" && (
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={!canSendOtp || loading}
                    className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? t.working : t.sendOtp}
                  </button>
                )}
                {phase === "otp_sent" && (
                  <>
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={!canVerify || loading}
                      className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                    >
                      {loading ? t.working : t.webCall}
                    </button>
                    <button
                      type="button"
                      onClick={handleVerifyAndRealCall}
                      disabled={!canVerify || loading}
                      className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
                    >
                      {loading ? t.working : t.verifyAndCall}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {notice && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--terminal-error,#DC2626)]">
            {error}
          </p>
        )}
      </motion.div>
    );
  }

  // verified: Scenario picker + "Start call" button (phone already verified)
  if (phase === "verified") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">
            {t.scenarioTitle}
          </h3>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {t.scenarioDesc}
          </p>
        </div>

        {renderScenarioCards()}

        {selectedScenario && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <button
              type="button"
              onClick={handleStartNewFromVerified}
              disabled={loading}
              className="btn-primary-modern inline-flex h-11 items-center px-5 text-sm font-medium disabled:opacity-50"
            >
              {loading ? t.working : t.startNew}
            </button>
          </motion.div>
        )}

        {notice && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--terminal-error,#DC2626)]">
            {error}
          </p>
        )}
      </motion.div>
    );
  }

  // connecting: Pulsing rings + caller ID
  if (phase === "connecting") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-6 py-8"
      >
        {renderCallerIdCard()}
        <PulsingRings />
        <p className="text-sm font-medium text-[var(--muted-foreground)]">
          {t.connecting}
        </p>
        {notice && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {notice}
          </p>
        )}
        {error && (
          <p className="text-sm text-[var(--terminal-error,#DC2626)]">
            {error}
          </p>
        )}
      </motion.div>
    );
  }

  // active: Caller ID, timer, waveform, transcript, end button
  if (phase === "active") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {renderCallerIdCard()}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <WaveformBars level={audioLevel} />
            <span className="font-mono text-lg font-semibold text-[var(--foreground)]">
              {formatTime(callSeconds)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleEndCall}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-medium text-white transition hover:bg-red-700"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.516l2.257-1.13a1 1 0 00.502-1.21L8.228 3.684A1 1 0 007.28 3H5z"
              />
            </svg>
            {t.endCall}
          </button>
        </div>

        {/* Transcript panel */}
        <div
          ref={transcriptContainerRef}
          className="h-56 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
        >
          <AnimatePresence initial={false}>
            {transcript.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${
                  msg.speaker === "agent" ? "justify-start" : "justify-end"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    msg.speaker === "agent"
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      : "bg-[var(--muted)] text-[var(--foreground)]"
                  }`}
                >
                  {msg.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {transcript.length === 0 && (
            <p className="py-8 text-center text-xs text-[var(--muted-foreground)]">
              ...
            </p>
          )}
          {localInterim && (
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-xl border border-dashed border-[var(--border)] bg-[var(--muted)]/60 px-3 py-2 text-sm italic text-[var(--muted-foreground)]">
                {localInterim}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    );
  }

  // ended: Summary + try another
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-6 py-8"
    >
      {renderCallerIdCard()}

      <div className="text-center">
        <p className="text-lg font-semibold text-[var(--foreground)]">
          {t.callEnded}
        </p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {t.callEndedAfter} {callSeconds} {t.seconds}
        </p>
      </div>

      {/* Transcript summary (read-only) */}
      {transcript.length > 0 && (
        <div className="max-h-40 w-full space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          {transcript.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.speaker === "agent" ? "justify-start" : "justify-end"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  msg.speaker === "agent"
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "bg-[var(--muted)] text-[var(--foreground)]"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleTryAnother}
        className="btn-outline-modern inline-flex h-11 items-center px-5 text-sm font-medium"
      >
        {t.tryAnother}
      </button>
    </motion.div>
  );
}
