"use client";

import ExperienceCenter from "@/components/sections/ExperienceCenter";
import EditorialOrbitalGraphic from "@/components/illustrations/EditorialOrbitalGraphic";

const tickerItems = [
  "VOICE CALLS",
  "SMS AUTOMATION",
  "UNIFIED HANDOFF",
  "LIVE TRANSCRIPTS",
  "CAMPAIGN ANALYTICS",
  "NEPALI-FIRST AI",
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#111111] bg-[#F9F9F7]">
        <div className="mx-auto max-w-screen-xl px-4 h-14 flex items-center justify-between font-ui">
          <a href="#index-hero" className="uppercase tracking-[0.2em] text-xs font-semibold hover:text-[#CC0000] transition-colors">
            Ring AI Gazette
          </a>
          <nav className="hidden md:flex items-center gap-6 uppercase tracking-[0.2em] text-xs font-medium">
            <a href="#experience-center" className="hover:text-[#CC0000] transition-colors">Demo</a>
            <a href="#columns" className="hover:text-[#CC0000] transition-colors">Products</a>
            <a href="#edition" className="hover:text-[#CC0000] transition-colors">Edition</a>
            <a href="/login" className="border border-[#111111] px-3 py-2 min-h-[44px] inline-flex items-center">Login</a>
          </nav>
          <div className="font-data text-[11px] uppercase tracking-[0.2em]">Vol. 1 | Kathmandu Edition</div>
        </div>
      </header>

      <main>
        <section id="index-hero" className="border-b border-[#111111] newsprint-texture">
          <div className="mx-auto max-w-screen-xl px-4 py-10 lg:py-14 grid grid-cols-12 border-l border-t border-[#111111]">
            <div className="col-span-12 lg:col-span-8 border-r border-b border-[#111111] p-6 md:p-8 lg:p-10">
              <p className="font-data uppercase tracking-[0.3em] text-xs text-[#525252] mb-4">All Conversations, One Ledger</p>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-8xl leading-[0.9] tracking-tighter text-[#111111]">
                Ring AI
                <br />
                Morning Edition
              </h1>
              <p className="mt-6 text-base sm:text-lg leading-relaxed text-justify max-w-3xl">
                Run outbound calls, inbound handoffs, and text campaigns from one editorially structured control room.
                Ring AI keeps every conversation thread reachable, reportable, and actionable.
              </p>
              <div className="mt-8 grid grid-cols-2 md:grid-cols-4 border border-[#111111]">
                {[
                  ["98.4%", "Delivery"],
                  ["24/7", "Coverage"],
                  ["3x", "Faster Ops"],
                  ["1", "Unified Thread"],
                ].map(([value, label]) => (
                  <div key={label} className="border-r last:border-r-0 border-[#111111] p-4">
                    <p className="font-data text-xl md:text-2xl">{value}</p>
                    <p className="font-ui text-xs uppercase tracking-[0.2em] text-[#525252] mt-1">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 border-b border-[#111111] p-4 md:p-6 lg:p-8 flex flex-col gap-4">
              <div className="border border-[#111111] p-3 font-data text-[11px] uppercase tracking-[0.2em]">
                Breaking: Try Voice + OTP Demo in Hero
              </div>
              <div className="border border-[#111111] p-2 bg-[#F5F5F5]">
                <EditorialOrbitalGraphic />
              </div>
              <p className="font-ui text-xs uppercase tracking-[0.2em] text-[#525252]">
                Fig. 1.1 Editorial network model inspired by modern vector-led product storytelling.
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-[#111111] overflow-hidden">
          <div className="ticker-track whitespace-nowrap py-3 font-data text-xs uppercase tracking-[0.2em] border-b border-[#111111]">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={`${item}-${i}`} className="mx-6">
                <span className="text-[#CC0000]">●</span> {item}
              </span>
            ))}
          </div>
        </section>

        <section className="border-b border-[#111111] py-10 lg:py-14">
          <div className="mx-auto max-w-screen-xl px-4">
            <ExperienceCenter embedded />
          </div>
        </section>

        <section id="columns" className="border-b border-[#111111]">
          <div className="mx-auto max-w-screen-xl px-4 py-10 lg:py-14 grid grid-cols-12 border-l border-t border-[#111111]">
            <article className="col-span-12 md:col-span-6 lg:col-span-4 border-r border-b border-[#111111] p-6 hard-shadow-hover">
              <p className="font-data text-xs uppercase tracking-[0.2em] text-[#525252]">Column A</p>
              <h3 className="font-display text-3xl mt-3">Voice Campaign Desk</h3>
              <p className="mt-3 text-sm leading-relaxed text-justify">
                Configure scripts, queue calls, and observe completion trends from one crisp panel with no dead-end flow.
              </p>
            </article>
            <article className="col-span-12 md:col-span-6 lg:col-span-4 border-r border-b border-[#111111] p-6 hard-shadow-hover">
              <p className="font-data text-xs uppercase tracking-[0.2em] text-[#525252]">Column B</p>
              <h3 className="font-display text-3xl mt-3">Text Continuity Desk</h3>
              <p className="mt-3 text-sm leading-relaxed text-justify">
                Keep missed-call follow-ups and contextual SMS responses inside the same conversation lane.
              </p>
            </article>
            <article className="col-span-12 lg:col-span-4 border-b border-[#111111] p-6 hard-shadow-hover">
              <p className="font-data text-xs uppercase tracking-[0.2em] text-[#525252]">Column C</p>
              <h3 className="font-display text-3xl mt-3">Handoff & Audit Desk</h3>
              <p className="mt-3 text-sm leading-relaxed text-justify">
                Hand off to humans with timeline integrity, preserving transcript evidence and outcome status.
              </p>
            </article>
          </div>
        </section>

        <section id="edition" className="bg-[#111111] text-[#F9F9F7] border-b border-[#111111]">
          <div className="mx-auto max-w-screen-xl px-4 py-12 lg:py-16 grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-8">
              <p className="font-data text-xs uppercase tracking-[0.2em] text-[#A3A3A3]">Editorial Note</p>
              <h2 className="font-display text-4xl lg:text-5xl mt-3 leading-tight">
                Built for information clarity,
                <br />
                not interface noise.
              </h2>
            </div>
            <div className="col-span-12 lg:col-span-4 border border-[#F9F9F7] p-5">
              <p className="font-data text-xs uppercase tracking-[0.2em]">Next Action</p>
              <p className="mt-3 text-sm text-[#E5E5E0]">
                Open the demo at the top, enter any number, and use the approved OTP path for controlled test calls.
              </p>
              <a
                href="/login"
                className="mt-5 inline-flex min-h-[44px] items-center border border-[#F9F9F7] px-4 font-ui uppercase tracking-[0.2em] text-xs hover:bg-[#F9F9F7] hover:text-[#111111] transition-all"
              >
                Launch Console
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-6">
        <div className="mx-auto max-w-screen-xl px-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between font-data text-[11px] uppercase tracking-[0.2em] text-[#525252]">
          <p>Ring AI Gazette | Printed for Digital Operators</p>
          <p>Edition: Vol 1.0 | Kathmandu Bureau</p>
        </div>
      </footer>
    </>
  );
}
