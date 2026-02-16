"use client";

export default function EditorialOrbitalGraphic() {
  return (
    <svg
      viewBox="0 0 860 540"
      role="img"
      aria-labelledby="orbitalTitle orbitalDesc"
      className="w-full h-full"
    >
      <title id="orbitalTitle">Ring AI Editorial Illustration</title>
      <desc id="orbitalDesc">
        Abstract orbital newsroom-inspired diagram showing communication flows across voice, text, and handoff lanes.
      </desc>

      <rect x="0" y="0" width="860" height="540" fill="#F9F9F7" stroke="#111111" strokeWidth="2" />

      <g opacity="0.7">
        {Array.from({ length: 11 }).map((_, i) => (
          <line
            key={`v-${i}`}
            x1={40 + i * 78}
            y1="0"
            x2={40 + i * 78}
            y2="540"
            stroke="#111111"
            strokeWidth="1"
            strokeOpacity="0.12"
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1="0"
            y1={40 + i * 64}
            x2="860"
            y2={40 + i * 64}
            stroke="#111111"
            strokeWidth="1"
            strokeOpacity="0.12"
          />
        ))}
      </g>

      <circle cx="430" cy="270" r="180" fill="none" stroke="#111111" strokeWidth="2" />
      <circle cx="430" cy="270" r="124" fill="none" stroke="#111111" strokeWidth="2" strokeDasharray="6 8" />
      <circle cx="430" cy="270" r="74" fill="none" stroke="#111111" strokeWidth="2" />

      <g>
        <rect x="380" y="220" width="100" height="100" fill="#111111" />
        <path d="M430 220 L480 270 L430 320 L380 270 Z" fill="#F9F9F7" />
        <circle cx="430" cy="270" r="20" fill="#CC0000" />
      </g>

      <g>
        <circle cx="430" cy="90" r="22" fill="#F9F9F7" stroke="#111111" strokeWidth="3" />
        <circle cx="610" cy="270" r="22" fill="#F9F9F7" stroke="#111111" strokeWidth="3" />
        <circle cx="430" cy="450" r="22" fill="#F9F9F7" stroke="#111111" strokeWidth="3" />
        <circle cx="250" cy="270" r="22" fill="#F9F9F7" stroke="#111111" strokeWidth="3" />
      </g>

      <g stroke="#111111" strokeWidth="3" fill="none">
        <path d="M430 112 L430 196" />
        <path d="M588 270 L514 270" />
        <path d="M430 428 L430 344" />
        <path d="M272 270 L346 270" />
      </g>

      <g fill="#111111" className="font-data" fontSize="12" letterSpacing="2">
        <text x="398" y="75">VOICE</text>
        <text x="585" y="255">TEXT</text>
        <text x="387" y="486">ROUTE</text>
        <text x="198" y="255">HANDOFF</text>
      </g>

      <g>
        <rect x="48" y="454" width="230" height="46" fill="#111111" />
        <text x="60" y="483" fill="#F9F9F7" className="font-data" fontSize="13" letterSpacing="2">
          FIG. 01 | NETWORK MAP
        </text>
      </g>

      <g>
        <rect x="582" y="42" width="230" height="46" fill="#F9F9F7" stroke="#111111" strokeWidth="2" />
        <text x="594" y="71" fill="#111111" className="font-data" fontSize="13" letterSpacing="2">
          EDITION: RING-AI-2026
        </text>
      </g>

      <g>
        <path d="M102 170 C168 122, 248 122, 312 172" stroke="#111111" strokeWidth="2" fill="none" />
        <path d="M548 370 C612 422, 692 422, 758 372" stroke="#111111" strokeWidth="2" fill="none" />
      </g>

      <g fill="#CC0000">
        <rect x="302" y="166" width="12" height="12" />
        <rect x="546" y="364" width="12" height="12" />
        <rect x="424" y="84" width="12" height="12" />
      </g>
    </svg>
  );
}
