export default function TerminalSignalIllustration() {
  return (
    <svg
      viewBox="0 0 640 360"
      role="img"
      aria-labelledby="terminal-signal-title terminal-signal-desc"
      className="h-auto w-full sharp-corners border border-[#1f521f] bg-[#050805]"
    >
      <title id="terminal-signal-title">Ring AI terminal signal illustration</title>
      <desc id="terminal-signal-desc">Signal path from input message to AI orchestration and human handoff.</desc>
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

      <rect x="56" y="70" width="154" height="74" fill="#0a0a0a" stroke="#33ff00" />
      <text x="70" y="100" fill="#ffb000" fontSize="12" fontFamily="JetBrains Mono, monospace">
        INPUT STREAM
      </text>
      <text x="70" y="122" fill="#33ff00" fontSize="11" fontFamily="JetBrains Mono, monospace">
        voice + sms events
      </text>

      <rect x="244" y="145" width="154" height="74" fill="#0a0a0a" stroke="#33ff00" />
      <text x="258" y="175" fill="#ffb000" fontSize="12" fontFamily="JetBrains Mono, monospace">
        ORCHESTRATOR
      </text>
      <text x="258" y="197" fill="#33ff00" fontSize="11" fontFamily="JetBrains Mono, monospace">
        intent + context merge
      </text>

      <rect x="432" y="220" width="154" height="74" fill="#0a0a0a" stroke="#33ff00" />
      <text x="446" y="250" fill="#ffb000" fontSize="12" fontFamily="JetBrains Mono, monospace">
        HUMAN HANDOFF
      </text>
      <text x="446" y="272" fill="#33ff00" fontSize="11" fontFamily="JetBrains Mono, monospace">
        queue + transcript
      </text>

      <path d="M210 108 C238 108, 230 182, 244 182" fill="none" stroke="url(#pulse)" strokeWidth="3" />
      <path d="M398 182 C426 182, 420 256, 432 256" fill="none" stroke="url(#pulse)" strokeWidth="3" />

      <circle cx="206" cy="108" r="4" fill="#33ff00">
        <animate attributeName="r" values="3;5;3" dur="1.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="394" cy="182" r="4" fill="#33ff00">
        <animate attributeName="r" values="3;5;3" dur="1.2s" begin="0.35s" repeatCount="indefinite" />
      </circle>
      <circle cx="428" cy="256" r="4" fill="#33ff00">
        <animate attributeName="r" values="3;5;3" dur="1.2s" begin="0.7s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
