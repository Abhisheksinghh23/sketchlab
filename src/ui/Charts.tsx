import { useEffect, useRef, useState } from 'react';
import type { Frame } from '../physics/sim';
import type { SketchLab } from '../state/useSketchLab';

type Metric = 'speed' | 'height' | 'ke' | 'pe' | 'energy';

const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'speed', label: 'Speed', unit: 'm/s' },
  { id: 'height', label: 'Height', unit: 'm' },
  { id: 'ke', label: 'Kinetic energy', unit: 'J (sim)' },
  { id: 'pe', label: 'Potential energy', unit: 'J (sim)' },
  { id: 'energy', label: 'Total energy', unit: 'J (sim)' },
];

const COLOR_A = '#4cc2ff';
const COLOR_B = '#ffb04c';

function seriesFor(rec: Frame[] | null, metric: Metric, selectedId: string | null): number[] {
  if (!rec) return [];
  if (selectedId) {
    return rec.map((f) => {
      const m = f.metrics.find((mm) => mm.id === selectedId);
      if (!m) return NaN;
      if (metric === 'speed') return m.speed;
      if (metric === 'height') return m.heightM;
      if (metric === 'ke') return m.ke;
      if (metric === 'pe') return m.pe;
      return m.ke + m.pe;
    });
  }
  return rec.map((f) => {
    if (metric === 'ke') return f.totalKe;
    if (metric === 'pe') return f.totalPe;
    if (metric === 'energy') return f.totalKe + f.totalPe;
    return NaN; // speed/height need a selected object
  });
}

const mostlyNaN = (s: number[]): boolean => {
  if (s.length === 0) return true;
  const bad = s.filter((v) => Number.isNaN(v)).length;
  return bad / s.length > 0.8;
};

export function Charts({ lab }: { lab: SketchLab }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [metric, setMetric] = useState<Metric>('speed');
  const [size, setSize] = useState({ w: 600, h: 200 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const recA = lab.getRecording(lab.activeId);
  const compareExp = lab.compareId ? lab.experiments.find((e) => e.id === lab.compareId) : null;
  const recB = compareExp ? lab.getRecording(compareExp.id) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ch = size.h - 40;
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, ch);
    ctx.fillStyle = '#0a0f18';
    ctx.fillRect(0, 0, size.w, ch);

    let a = seriesFor(recA, metric, lab.selectedId);
    let b = seriesFor(recB, metric, lab.selectedId);
    let noteB: string | null = null;
    if (recB && mostlyNaN(b)) {
      // The selected object does not exist in the comparison experiment: show its system total.
      b = seriesFor(recB, metric === 'speed' || metric === 'height' ? 'energy' : metric, null);
      noteB = 'no matching object in comparison: showing its system total';
    }
    if (mostlyNaN(a)) a = [];

    const padL = 44;
    const padR = 10;
    const padT = 10;
    const padB = 22;
    const plotW = size.w - padL - padR;
    const plotH = ch - padT - padB;

    const all = [...a, ...b].filter((v) => Number.isFinite(v));
    if (all.length === 0) {
      ctx.fillStyle = 'rgba(230,237,247,0.45)';
      ctx.font = '13px system-ui, sans-serif';
      const msg = recA
        ? metric === 'speed' || metric === 'height'
          ? 'Select an object to chart its speed or height.'
          : 'No data yet.'
        : 'Press Play to record a run, then charts appear here.';
      ctx.fillText(msg, padL, padT + 18);
      return;
    }
    let max = Math.max(...all);
    let min = Math.min(0, ...all);
    if (max - min < 1e-6) max = min + 1;
    const pad5 = (max - min) * 0.08;
    max += pad5;
    min -= pad5;

    const n = Math.max(a.length, b.length);
    const xAt = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
    const yAt = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH;

    // gridlines + y labels
    ctx.strokeStyle = 'rgba(120,150,200,0.15)';
    ctx.fillStyle = 'rgba(230,237,247,0.5)';
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g += 1) {
      const v = min + ((max - min) * g) / 4;
      const y = yAt(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(size.w - padR, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(v >= 100 ? 0 : 1), 4, y + 4);
    }
    // x labels: seconds
    if (n > 1) {
      const totalT = (n - 1) / 60;
      const stepS = totalT > 20 ? 10 : totalT > 8 ? 2 : 1;
      for (let s = 0; s <= totalT + 1e-6; s += stepS) {
        const x = xAt(s * 60);
        ctx.fillText(`${s}s`, x - 6, ch - 8);
      }
    }

    const drawSeries = (s: number[], color: string, dashed: boolean) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.beginPath();
      let started = false;
      s.forEach((v, i) => {
        if (!Number.isFinite(v)) return;
        const x = xAt(i);
        const y = yAt(v);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (a.length > 0) drawSeries(a, COLOR_A, false);
    if (b.length > 0) drawSeries(b, COLOR_B, true);

    // time cursor
    if (lab.frameTick >= 0 && lab.frameTick < n) {
      const x = xAt(lab.frameTick);
      ctx.strokeStyle = 'rgba(255,209,102,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();
      const vA = a[lab.frameTick];
      if (Number.isFinite(vA)) {
        ctx.fillStyle = COLOR_A;
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(vA.toFixed(2), Math.min(x + 6, size.w - 60), padT + 14);
      }
    }

    // legend
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = COLOR_A;
    ctx.fillText(lab.active.name, padL + 6, padT + plotH + 14);
    if (compareExp) {
      ctx.fillStyle = COLOR_B;
      ctx.fillText(compareExp.name + (noteB ? ' (system total)' : ''), padL + 170, padT + plotH + 14);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, lab.frameTick, lab.selectedId, lab.compareId, lab.activeId, metric, lab.sceneVersion, lab.mode]);

  const meta = METRICS.find((m) => m.id === metric)!;
  const needsSelection = metric === 'speed' || metric === 'height';

  return (
    <div className="charts" ref={wrapRef} data-testid="charts">
      <div className="charts-head">
        <div className="metric-tabs">
          {METRICS.map((m) => (
            <button
              key={m.id}
              className={`metric-tab${metric === m.id ? ' active' : ''}`}
              data-testid={`metric-${m.id}`}
              onClick={() => setMetric(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="muted small">
          {needsSelection && !lab.selectedId
            ? 'select an object for this metric'
            : `${meta.label} (${meta.unit})`}
        </span>
      </div>
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h - 40, display: 'block' }} />
    </div>
  );
}
