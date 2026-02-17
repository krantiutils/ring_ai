"use client";

import { useEffect, useRef } from "react";

type Point = { x: number; y: number };
type Edge = { from: Point; c1: Point; c2: Point; to: Point };
type Particle = { edgeIndex: number; t: number; speed: number; radius: number };
type NodeBox = { x: number; y: number; w: number; h: number; label: string };

const topNode: NodeBox = { x: 0.33, y: 0.06, w: 0.34, h: 0.1, label: "Enterprise" };
const channelNodes: NodeBox[] = [
  { x: 0.02, y: 0.26, w: 0.24, h: 0.1, label: "Voice Agent" },
  { x: 0.28, y: 0.26, w: 0.24, h: 0.1, label: "SMS Agent" },
  { x: 0.54, y: 0.26, w: 0.24, h: 0.1, label: "WhatsApp Agent" },
  { x: 0.76, y: 0.26, w: 0.22, h: 0.1, label: "Call Agent" },
];
const centerNodes: NodeBox[] = [
  { x: 0.37, y: 0.48, w: 0.32, h: 0.1, label: "Agent Builder" },
  { x: 0.37, y: 0.64, w: 0.32, h: 0.1, label: "Campaign Builder" },
  { x: 0.37, y: 0.8, w: 0.32, h: 0.1, label: "AgentShakti" },
];

function centerOf(node: NodeBox): Point {
  return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
}

function buildEdges(): Edge[] {
  const edges: Edge[] = [];
  const top = centerOf(topNode);
  const builder = centerOf(centerNodes[0]);
  const campaign = centerOf(centerNodes[1]);
  const ring = centerOf(centerNodes[2]);

  for (const node of channelNodes) {
    const p = centerOf(node);
    edges.push({
      from: { x: top.x, y: top.y + 0.04 },
      c1: { x: top.x, y: top.y + 0.2 },
      c2: { x: p.x, y: p.y - 0.14 },
      to: { x: p.x, y: p.y - 0.02 },
    });
    edges.push({
      from: { x: p.x, y: p.y + 0.06 },
      c1: { x: p.x, y: p.y + 0.12 },
      c2: { x: builder.x, y: builder.y - 0.1 },
      to: { x: builder.x, y: builder.y - 0.03 },
    });
  }

  edges.push({
    from: { x: builder.x, y: builder.y + 0.04 },
    c1: { x: builder.x, y: builder.y + 0.1 },
    c2: { x: campaign.x, y: campaign.y - 0.08 },
    to: { x: campaign.x, y: campaign.y - 0.03 },
  });

  edges.push({
    from: { x: campaign.x, y: campaign.y + 0.04 },
    c1: { x: campaign.x, y: campaign.y + 0.1 },
    c2: { x: ring.x, y: ring.y - 0.08 },
    to: { x: ring.x, y: ring.y - 0.03 },
  });

  const spokes = 26;
  for (let i = 0; i < spokes; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const step = Math.floor(i / 2);
    const x = 0.5 + side * (0.08 + step * 0.03);
    const y = 0.95 - step * 0.01;
    edges.push({
      from: { x: ring.x, y: ring.y + 0.06 },
      c1: { x: ring.x, y: ring.y + 0.12 },
      c2: { x, y: y - 0.03 },
      to: { x, y },
    });
  }

  return edges;
}

function pointOnBezier(edge: Edge, t: number): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  return {
    x: mt2 * mt * edge.from.x + 3 * mt2 * t * edge.c1.x + 3 * mt * t2 * edge.c2.x + t2 * t * edge.to.x,
    y: mt2 * mt * edge.from.y + 3 * mt2 * t * edge.c1.y + 3 * mt * t2 * edge.c2.y + t2 * t * edge.to.y,
  };
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export default function HeroFlowCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl = canvas;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;
    const context: CanvasRenderingContext2D = ctx;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const edges = buildEdges();
    const particles: Particle[] = Array.from({ length: 60 }).map((_, i) => ({
      edgeIndex: i % edges.length,
      t: (i * 0.17) % 1,
      speed: 0.055 + (i % 7) * 0.008,
      radius: 1.8 + (i % 3) * 0.35,
    }));
    let rafId = 0;
    let last = performance.now();

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      canvasEl.width = Math.floor(rect.width * dpr);
      canvasEl.height = Math.floor(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now: number) {
      const rect = canvasEl.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (!w || !h) return;

      const dt = Math.min((now - last) / 1000, 0.04);
      last = now;

      const css = getComputedStyle(document.documentElement);
      const accent = (css.getPropertyValue("--accent") || "#0052ff").trim();
      const accentSecondary = (css.getPropertyValue("--accent-secondary") || "#4d7cff").trim();
      const card = (css.getPropertyValue("--card") || "#ffffff").trim();
      const border = (css.getPropertyValue("--border") || "#e2e8f0").trim();
      const fg = (css.getPropertyValue("--foreground") || "#0f172a").trim();
      const muted = (css.getPropertyValue("--muted-foreground") || "#64748b").trim();

      context.clearRect(0, 0, w, h);

      const grd = context.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, `${accent}12`);
      grd.addColorStop(1, `${accentSecondary}08`);
      context.fillStyle = grd;
      context.fillRect(0, 0, w, h);

      context.fillStyle = `${accent}10`;
      for (let y = 18; y < h; y += 22) {
        for (let x = 18; x < w; x += 22) {
          context.fillRect(x, y, 1.2, 1.2);
        }
      }

      context.lineWidth = 1.6;
      context.strokeStyle = `${accent}5c`;
      context.shadowBlur = 12;
      context.shadowColor = `${accent}70`;
      for (const edge of edges) {
        context.beginPath();
        context.moveTo(edge.from.x * w, edge.from.y * h);
        context.bezierCurveTo(edge.c1.x * w, edge.c1.y * h, edge.c2.x * w, edge.c2.y * h, edge.to.x * w, edge.to.y * h);
        context.stroke();
      }
      context.shadowBlur = 0;

      if (!media.matches) {
        for (const particle of particles) {
          particle.t += dt * particle.speed;
          if (particle.t > 1) particle.t -= 1;
          const p = pointOnBezier(edges[particle.edgeIndex], particle.t);
          const x = p.x * w;
          const y = p.y * h;
          context.beginPath();
          context.fillStyle = `${accent}dd`;
          context.shadowBlur = 14;
          context.shadowColor = accent;
          context.arc(x, y, particle.radius, 0, Math.PI * 2);
          context.fill();
        }
        context.shadowBlur = 0;
      }

      const allNodes = [topNode, ...channelNodes, ...centerNodes];
      for (const node of allNodes) {
        const x = node.x * w;
        const y = node.y * h;
        const nw = node.w * w;
        const nh = node.h * h;

        drawRoundedRect(context, x, y, nw, nh, 12);
        context.fillStyle = card;
        context.strokeStyle = border;
        context.lineWidth = 1.2;
        context.fill();
        context.stroke();

        context.font = `600 ${Math.max(12, Math.min(20, w * 0.023))}px Inter, system-ui, sans-serif`;
        context.fillStyle = fg;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(node.label, x + nw / 2, y + nh / 2);
      }

      const ring = centerOf(centerNodes[2]);
      for (let i = 0; i < 28; i += 1) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const x = w * (0.5 + side * (0.1 + row * 0.03));
        const y = h * (0.95 - row * 0.01);
        const r = 9 + (i % 3);
        context.beginPath();
        context.fillStyle = `${card}f2`;
        context.arc(x, y, r, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = `${border}cc`;
        context.lineWidth = 1;
        context.stroke();
      }

      context.beginPath();
      context.fillStyle = `${accent}8a`;
      context.arc(ring.x * w, ring.y * h + 8, 7, 0, Math.PI * 2);
      context.fill();

      context.font = `500 ${Math.max(10, Math.min(14, w * 0.016))}px JetBrains Mono, monospace`;
      context.textAlign = "left";
      context.fillStyle = muted;
      context.fillText("Unified outreach graph", 18, h - 16);

      rafId = requestAnimationFrame(draw);
    }

    resize();
    rafId = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="h-full w-full rounded-[2rem]" aria-hidden="true" />;
}
