"use client";

import ExperienceCenter from "@/components/sections/ExperienceCenter";
import TerminalSignalIllustration from "@/components/illustrations/TerminalSignalIllustration";

const tickerItems = [
  "[OK] VOICE ROUTING",
  "[OK] SMS AUTOMATION",
  "[OK] HUMAN HANDOFF",
  "[OK] LIVE TRANSCRIPTS",
  "[OK] EDGE TTS",
  "[WARN] OTP-GATED CALL DEMO",
];

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-[#1f521f] bg-[#0a0a0a]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 text-xs">
          <a href="#index-hero" className="terminal-caps hover:text-[#ffb000] transition-colors">
            root@ring-ai:~$ ./index
          </a>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#experience-center" className="terminal-caps hover:text-[#ffb000] transition-colors">demo --interactive</a>
            <a href="#modules" className="terminal-caps hover:text-[#ffb000] transition-colors">modules --list</a>
            <a href="#status" className="terminal-caps hover:text-[#ffb000] transition-colors">status --live</a>
            <a href="/login" className="terminal-btn sharp-corners inline-flex min-h-[44px] items-center px-3 py-2 text-[11px]">
              [ login ]
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <a href="/login" className="terminal-btn sharp-corners inline-flex min-h-[40px] items-center px-3 py-2 text-[10px] md:hidden">
              [ login ]
            </a>
            <div className="terminal-caps text-[10px] text-[#ffb000]">session: nepal-prod | tty0</div>
          </div>
        </div>
      </header>

      <main>
        <section id="index-hero" className="border-b border-[var(--terminal-primary)] py-4 lg:py-6">
          <div className="mx-auto grid max-w-screen-xl grid-cols-12 px-4">
            <div className="terminal-pane col-span-12 border-b border-[#1f521f] p-5 md:p-7 lg:col-span-8 lg:border-r">
              <p className="terminal-caps mb-4 text-[11px] text-[#ffb000]">ring-ai runtime v1.0.0</p>
              <h1 className="terminal-display terminal-caps text-5xl leading-[0.88] sm:text-6xl lg:text-8xl">
                ONE PLATFORM.
                <br />
                EVERY MESSAGE.
              </h1>
              <p className="typing-demo mt-5 w-[36ch] max-w-full overflow-hidden text-sm text-[#7bd96a] md:text-base">
                $ ringai handoff --from voice --to human --preserve-context
              </p>
              <p className="mt-6 max-w-3xl text-sm leading-relaxed text-[#7bd96a] md:text-base">
                Run the index demo before signup. Type text, hear TTS in Nepali voice, request OTP, verify, then queue a controlled live call.
              </p>
              <div className="mt-8 grid grid-cols-2 border border-[#1f521f] md:grid-cols-4">
                {[
                  ["98.4%", "UPTIME"],
                  ["24/7", "VOICE NODE"],
                  ["310ms", "P50 LATENCY"],
                  ["1", "CONTEXT THREAD"],
                ].map(([value, label]) => (
                  <div key={label} className="border-r border-[#1f521f] p-4 last:border-r-0">
                    <p className="terminal-display text-2xl md:text-3xl">{value}</p>
                    <p className="terminal-caps mt-1 text-[10px] text-[#ffb000]">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="terminal-pane col-span-12 p-5 md:p-7 lg:col-span-4">
              <div className="terminal-titlebar sharp-corners px-3 py-2 text-[11px] terminal-caps">
                +-- SYSTEM STATUS --+
              </div>
              <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#7bd96a]">
                <p><span className="text-[#ffb000]">[OK]</span> DEMO API ONLINE</p>
                <p><span className="text-[#ffb000]">[OK]</span> EDGE TTS ENABLED</p>
                <p><span className="text-[#ffb000]">[OK]</span> OTP CONFIRM FLOW ACTIVE</p>
              </div>
              <div className="mt-5">
                <TerminalSignalIllustration />
              </div>
              <div className="terminal-line mt-6 border-t pt-4 text-xs text-[#7bd96a]">
                <p className="terminal-caps text-[#ffb000]">quick actions</p>
                <div className="mt-3 flex flex-col gap-2">
                  <a href="#experience-center" className="hover:text-[#ffb000]">$ ./run-demo --index</a>
                  <a href="/login" className="hover:text-[#ffb000]">$ ./open-console --auth</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden border-y border-[#1f521f]">
          <div className="terminal-ticker-track whitespace-nowrap border-b border-[#1f521f] py-3 text-xs">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={`${item}-${i}`} className="mx-6 text-[#33ff00]">
                <span className="text-[#ffb000]">{">"}</span> {item}
              </span>
            ))}
          </div>
        </section>

        <section className="border-b border-[#1f521f] py-8 lg:py-10">
          <div className="mx-auto max-w-screen-xl px-4">
            <ExperienceCenter embedded />
          </div>
        </section>

        <section id="modules" className="border-b border-[#1f521f] py-10">
          <div className="mx-auto grid max-w-screen-xl grid-cols-12 px-4">
            <article className="terminal-pane col-span-12 border-b border-[#1f521f] p-5 md:p-6 lg:col-span-4 lg:border-r lg:border-b-0">
              <p className="terminal-caps text-[11px] text-[#ffb000]">module_a</p>
              <h3 className="terminal-display mt-2 text-3xl uppercase">voice campaign</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#7bd96a]">
                Queue outbound calls with scripted context and real-time operator takeover when intent flips.
              </p>
            </article>
            <article className="terminal-pane col-span-12 border-b border-[#1f521f] p-5 md:p-6 lg:col-span-4 lg:border-r lg:border-b-0">
              <p className="terminal-caps text-[11px] text-[#ffb000]">module_b</p>
              <h3 className="terminal-display mt-2 text-3xl uppercase">sms continuity</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#7bd96a]">
                Route missed call and follow-up messages in one thread so no lead drops out of reachable state.
              </p>
            </article>
            <article className="terminal-pane col-span-12 p-5 md:p-6 lg:col-span-4">
              <p className="terminal-caps text-[11px] text-[#ffb000]">module_c</p>
              <h3 className="terminal-display mt-2 text-3xl uppercase">audit handoff</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#7bd96a]">
                Preserve transcripts, status, and ownership transitions from bot to human without losing intent history.
              </p>
            </article>
          </div>
        </section>

        <section id="status" className="border-b border-[#1f521f] bg-[#081108] py-12">
          <div className="mx-auto grid max-w-screen-xl grid-cols-12 gap-4 px-4">
            <div className="col-span-12 lg:col-span-8">
              <p className="terminal-caps text-[11px] text-[#ffb000]">root@ring-ai:~$ cat /etc/motd</p>
              <h2 className="terminal-display mt-3 text-4xl uppercase leading-tight lg:text-5xl">
                CLEAN SIGNAL.
                <br />
                ZERO UI NOISE.
              </h2>
            </div>
            <div className="terminal-pane col-span-12 p-5 lg:col-span-4">
              <p className="terminal-caps text-[11px] text-[#ffb000]">next_step</p>
              <p className="mt-3 text-sm text-[#7bd96a]">
                Start with the index demo above. After OTP verify, a demo call is queued using the same conversation context.
              </p>
              <a
                href="/login"
                className="terminal-btn sharp-corners mt-5 inline-flex min-h-[44px] items-center px-4 text-xs"
              >
                [ open dashboard ]
              </a>
            </div>
          </div>
        </section>

        <section className="border-b border-[#1f521f] py-10">
          <div className="mx-auto max-w-screen-xl px-4">
            <div className="terminal-pane p-5 md:p-6">
              <p className="terminal-caps text-[11px] text-[#ffb000]">connected_routes</p>
              <div className="mt-4 grid gap-2 text-sm text-[#7bd96a] md:grid-cols-2">
                <a href="/login" className="hover:text-[#ffb000]">$ /login</a>
                <a href="/dashboard" className="hover:text-[#ffb000]">$ /dashboard</a>
                <a href="/dashboard/analytics" className="hover:text-[#ffb000]">$ /dashboard/analytics</a>
                <a href="/dashboard/campaigns" className="hover:text-[#ffb000]">$ /dashboard/campaigns</a>
                <a href="/dashboard/templates" className="hover:text-[#ffb000]">$ /dashboard/templates</a>
                <a href="/dashboard/integrations" className="hover:text-[#ffb000]">$ /dashboard/integrations</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-6">
        <div className="mx-auto flex max-w-screen-xl flex-col gap-3 px-4 text-[11px] md:flex-row md:items-center md:justify-between">
          <p className="terminal-caps text-[#7bd96a]">ring ai cli interface | node: kathmandu</p>
          <p className="terminal-caps text-[#ffb000]">build: v1.0 | shell: production</p>
        </div>
      </footer>
    </>
  );
}
