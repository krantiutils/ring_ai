export default function TerminalSignalIllustration() {
  return (
    <svg
      viewBox="0 0 640 360"
      role="img"
      aria-labelledby="terminal-signal-title terminal-signal-desc"
      className="h-auto w-full sharp-corners border border-[#1f521f] bg-[#050805]"
    >
      <title id="terminal-signal-title">Ring AI terminal signal illustration</title>
      <desc id="terminal-signal-desc">A terminal-styled signal path showing message handoff from text to voice.</desc>

      <defs>
        <linearGradient id="pulse" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#33ff00" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#33ff00" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#33ff00" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="640" height="360" fill="#050805" />
      <g stroke="#1f521f" strokeWidth="1">
        <path d="M0 60 H640 M0 120 H640 M0 180 H640 M0 240 H640 M0 300 H640" />
        <path d="M80 0 V360 M160 0 V360 M240 0 V360 M320 0 V360 M400 0 V360 M480 0 V360 M560 0 V360" />
      </g>

      <rect x="54" y="70" width="148" height="72" fill="#0a0a0a" stroke="#33ff00" />
      <text x="68" y="98" fill="#ffb000" fontSize="12" fontFamily="JetBrains Mono, monospace">
        INPUT STREAM
      </text>
      <text x="68" y="120" fill="#33ff00" fontSize="11" fontFamily="JetBrains Mono, monospace">
        text + intent
      </text>

      <rect x="248" y="145" width="144" height="72" fill="#0a0a0a" stroke="#33ff00" />
      <text x="262" y="172" fill="#ffb000" fontSize="12" fontFamily="JetBrains Mono, monospace">
        ORCHESTRATOR
      </text>
      <text x="262" y="194" fill="#33ff00" fontSize="11" fontFamily="JetBrains Mono, monospace">
        context merge
      </text>

      <rect x="438" y="220" width="148" height="72" fill="#0a0a0a" stroke="#33ff00" />
      <text x="452" y="248" fill="#ffb000" fontSize="12" fontFamily="JetBrains Mono, monospace">
        VOICE HANDOFF
      </text>
      <text x="452" y="270" fill="#33ff00" fontSize="11" fontFamily="JetBrains Mono, monospace">
        otp + twilio
      </text>

      <path
        d="M202 106 C236 106, 228 180, 248 180"
        fill="none"
        stroke="url(#pulse)"
        strokeWidth="3"
      />
      <path
        d="M392 180 C418 180, 418 255, 438 255"
        fill="none"
        stroke="url(#pulse)"
        strokeWidth="3"
      />

      <circle cx="198" cy="106" r="4" fill="#33ff00">
        <animate attributeName="r" values="3;5;3" dur="1.3s" repeatCount="indefinite" />
      </circle>
      <circle cx="390" cy="180" r="4" fill="#33ff00">
        <animate attributeName="r" values="3;5;3" dur="1.3s" begin="0.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="434" cy="255" r="4" fill="#33ff00">
        <animate attributeName="r" values="3;5;3" dur="1.3s" begin="0.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
