import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_TUNING, newId } from '../model/types';
import type { BallObj, BoxObj, PendulumObj, RampObj, SceneObject } from '../model/types';
import { hitTest } from '../physics/sim';
import type { BodyFrame } from '../physics/sim';
import type { SketchLab } from '../state/useSketchLab';

export const WORLD_W = 1000;
export const WORLD_H = 600;

type Ghost =
  | { kind: 'draw'; tool: 'ball' | 'box' | 'ramp' | 'pendulum'; ax: number; ay: number; bx: number; by: number }
  | {
      kind: 'move';
      id: string;
      part: 'whole' | 'anchor' | 'bob' | 'a' | 'b';
      dx: number;
      dy: number;
    };

interface DragState {
  startX: number;
  startY: number;
  ghost: Ghost;
}

const PALETTE = ['#5ac8fa', '#7ee081', '#ff9f6e', '#e39bff', '#ffd166', '#6ee7d8'];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function CanvasView({ lab }: { lab: SketchLab }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 620 });
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const scale = Math.min(size.w / WORLD_W, size.h / WORLD_H);
      const ox = (size.w - WORLD_W * scale) / 2;
      const oy = (size.h - WORLD_H * scale) / 2;
      return {
        x: (e.clientX - rect.left - ox) / scale,
        y: (e.clientY - rect.top - oy) / scale,
      };
    },
    [size],
  );

  // ---------- drawing ----------

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    const scale = Math.min(size.w / WORLD_W, size.h / WORLD_H);
    const ox = (size.w - WORLD_W * scale) / 2;
    const oy = (size.h - WORLD_H * scale) / 2;
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    drawBackground(ctx);

    const scene = lab.active.history.present.scene;
    const frame = lab.getFrame();
    const frameById = new Map<string, BodyFrame>();
    if (frame) for (const b of frame.bodies) frameById.set(b.id, b);

    for (const obj of scene.objects) {
      drawObject(ctx, obj, frameById.get(obj.id) ?? null, lab.selectedId === obj.id, ghost);
    }
    if (ghost?.kind === 'draw') drawGhost(ctx, ghost);
    if (frame) drawTimeBadge(ctx, frame.t, lab.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, lab, ghost]);

  // ---------- pointer interaction ----------

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (lab.mode !== 'edit') return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = toWorld(e);
    const scene = lab.active.history.present.scene;

    if (lab.tool === 'select') {
      const hit = hitTest(scene, p);
      lab.setSelected(hit);
      if (hit) {
        const obj = scene.objects.find((o) => o.id === hit)!;
        let part: 'whole' | 'anchor' | 'bob' | 'a' | 'b' = 'whole';
        if (obj.kind === 'pendulum') {
          if (Math.hypot(p.x - obj.anchorX, p.y - obj.anchorY) <= 12) part = 'anchor';
          else if (Math.hypot(p.x - obj.bobX, p.y - obj.bobY) <= obj.radius + 6) part = 'bob';
        } else if (obj.kind === 'ramp') {
          if (Math.hypot(p.x - obj.ax, p.y - obj.ay) <= 12) part = 'a';
          else if (Math.hypot(p.x - obj.bx, p.y - obj.by) <= 12) part = 'b';
        }
        const g: Ghost = { kind: 'move', id: hit, part, dx: 0, dy: 0 };
        dragRef.current = { startX: p.x, startY: p.y, ghost: g };
        setGhost(g);
      }
      return;
    }

    if (lab.tool === 'erase') {
      const hit = hitTest(scene, p);
      if (hit) lab.deleteObject(hit);
      return;
    }

    if (lab.tool === 'pin') {
      const hit = hitTest(scene, p);
      if (!hit) return;
      const obj = scene.objects.find((o) => o.id === hit)!;
      const pinnable =
        obj.kind === 'ball' ||
        obj.kind === 'pendulum' ||
        (obj.kind === 'box' && !obj.isStatic);
      if (!pinnable) return;
      lab.addObject({ id: newId('pin'), kind: 'pin', bodyId: hit, x: p.x, y: p.y });
      return;
    }

    const g: Ghost = { kind: 'draw', tool: lab.tool, ax: p.x, ay: p.y, bx: p.x, by: p.y };
    dragRef.current = { startX: p.x, startY: p.y, ghost: g };
    setGhost(g);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toWorld(e);
    const g = drag.ghost;
    let next: Ghost;
    if (g.kind === 'draw') {
      next = { ...g, bx: p.x, by: p.y };
    } else {
      next = { ...g, dx: p.x - drag.startX, dy: p.y - drag.startY };
    }
    drag.ghost = next;
    setGhost(next);
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGhost(null);
    if (!drag) return;
    const g = drag.ghost;

    if (g.kind === 'move') {
      if (Math.abs(g.dx) < 1 && Math.abs(g.dy) < 1) return;
      if (g.part === 'whole') {
        lab.moveObjectBy(g.id, g.dx, g.dy);
      } else {
        const obj = lab.active.history.present.scene.objects.find((o) => o.id === g.id);
        if (!obj) return;
        if (obj.kind === 'pendulum' && g.part === 'anchor') {
          lab.updateObject(g.id, { anchorX: obj.anchorX + g.dx, anchorY: obj.anchorY + g.dy });
        } else if (obj.kind === 'pendulum' && g.part === 'bob') {
          lab.updateObject(g.id, { bobX: obj.bobX + g.dx, bobY: obj.bobY + g.dy });
        } else if (obj.kind === 'ramp' && g.part === 'a') {
          lab.updateObject(g.id, { ax: obj.ax + g.dx, ay: obj.ay + g.dy });
        } else if (obj.kind === 'ramp' && g.part === 'b') {
          lab.updateObject(g.id, { bx: obj.bx + g.dx, by: obj.by + g.dy });
        }
      }
      return;
    }

    // commit a drawn shape
    const { tool, ax, ay, bx, by } = g;
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);
    if (tool === 'ball') {
      if (dist < 8) return;
      const ball: BallObj = {
        id: newId('ball'),
        kind: 'ball',
        x: ax,
        y: ay,
        radius: Math.min(120, dist),
        tuning: { ...DEFAULT_TUNING },
      };
      lab.addObject(ball);
      lab.setSelected(ball.id);
    } else if (tool === 'box') {
      const w = Math.abs(dx);
      const h = Math.abs(dy);
      if (w < 12 || h < 12) return;
      const box: BoxObj = {
        id: newId('box'),
        kind: 'box',
        x: (ax + bx) / 2,
        y: (ay + by) / 2,
        width: w,
        height: h,
        angle: 0,
        isStatic: false,
        tuning: { ...DEFAULT_TUNING },
      };
      lab.addObject(box);
      lab.setSelected(box.id);
    } else if (tool === 'ramp') {
      if (dist < 24) return;
      const ramp: RampObj = {
        id: newId('ramp'),
        kind: 'ramp',
        ax,
        ay,
        bx,
        by,
        thickness: 12,
        tuning: { ...DEFAULT_TUNING, friction: 0.05 },
      };
      lab.addObject(ramp);
      lab.setSelected(ramp.id);
    } else if (tool === 'pendulum') {
      if (dist < 30) return;
      const pendulum: PendulumObj = {
        id: newId('pendulum'),
        kind: 'pendulum',
        anchorX: ax,
        anchorY: ay,
        bobX: bx,
        bobY: by,
        radius: 22,
        tuning: { ...DEFAULT_TUNING },
      };
      lab.addObject(pendulum);
      lab.setSelected(pendulum.id);
    }
  };

  const cursor =
    lab.mode !== 'edit' ? 'default' : lab.tool === 'select' ? 'default' : 'crosshair';

  return (
    <div ref={containerRef} className="canvas-wrap" data-testid="canvas-wrap">
      <canvas
        ref={canvasRef}
        className="world-canvas"
        data-testid="world-canvas"
        style={{ width: size.w, height: size.h, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}

// ---------- canvas painting ----------

function drawBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#0d1420';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.strokeStyle = 'rgba(120, 150, 200, 0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_H);
    ctx.stroke();
  }
  for (let y = 0; y <= WORLD_H; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_W, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(120, 150, 200, 0.35)';
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
}

function applyGhostOffset(obj: SceneObject, ghost: Ghost | null): SceneObject {
  if (!ghost || ghost.kind !== 'move' || ghost.id !== obj.id) return obj;
  const { dx, dy, part } = ghost;
  switch (obj.kind) {
    case 'ball':
      return { ...obj, x: obj.x + dx, y: obj.y + dy };
    case 'box':
      return { ...obj, x: obj.x + dx, y: obj.y + dy };
    case 'ramp':
      return {
        ...obj,
        ax: obj.ax + (part === 'whole' || part === 'a' ? dx : 0),
        ay: obj.ay + (part === 'whole' || part === 'a' ? dy : 0),
        bx: obj.bx + (part === 'whole' || part === 'b' ? dx : 0),
        by: obj.by + (part === 'whole' || part === 'b' ? dy : 0),
      };
    case 'pendulum':
      return {
        ...obj,
        anchorX: obj.anchorX + (part === 'whole' || part === 'anchor' ? dx : 0),
        anchorY: obj.anchorY + (part === 'whole' || part === 'anchor' ? dy : 0),
        bobX: obj.bobX + (part === 'whole' || part === 'bob' ? dx : 0),
        bobY: obj.bobY + (part === 'whole' || part === 'bob' ? dy : 0),
      };
    case 'pin':
      return { ...obj, x: obj.x + dx, y: obj.y + dy };
    default:
      return obj;
  }
}

function drawObject(
  ctx: CanvasRenderingContext2D,
  raw: SceneObject,
  bf: BodyFrame | null,
  selected: boolean,
  ghost: Ghost | null,
): void {
  const obj = applyGhostOffset(raw, ghost);
  const color = colorFor(obj.id);
  ctx.save();

  if (obj.kind === 'ball') {
    const x = bf?.x ?? obj.x;
    const y = bf?.y ?? obj.y;
    const angle = bf?.angle ?? 0;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, obj.radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#0d1420';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(obj.radius, 0);
    ctx.stroke();
  } else if (obj.kind === 'box') {
    const x = bf?.x ?? obj.x;
    const y = bf?.y ?? obj.y;
    const angle = bf?.angle ?? obj.angle;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = obj.isStatic ? '#39435c' : color;
    ctx.globalAlpha = obj.isStatic ? 1 : 0.9;
    ctx.fillRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);
    ctx.globalAlpha = 1;
    if (obj.isStatic) {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      for (let hx = -obj.width / 2 + 8; hx < obj.width / 2; hx += 16) {
        ctx.beginPath();
        ctx.moveTo(hx, obj.height / 2);
        ctx.lineTo(hx + 8, -obj.height / 2);
        ctx.stroke();
      }
    }
  } else if (obj.kind === 'ramp') {
    ctx.strokeStyle = '#9aa7c0';
    ctx.lineWidth = obj.thickness;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(obj.ax, obj.ay);
    ctx.lineTo(obj.bx, obj.by);
    ctx.stroke();
  } else if (obj.kind === 'pendulum') {
    const bx = bf?.x ?? obj.bobX;
    const by = bf?.y ?? obj.bobY;
    const angle = bf?.angle ?? 0;
    // rod
    ctx.strokeStyle = '#c8d0e0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(obj.anchorX, obj.anchorY);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // anchor
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.moveTo(obj.anchorX, obj.anchorY - 2);
    ctx.lineTo(obj.anchorX - 8, obj.anchorY - 14);
    ctx.lineTo(obj.anchorX + 8, obj.anchorY - 14);
    ctx.closePath();
    ctx.fill();
    // bob
    ctx.translate(bx, by);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, obj.radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (obj.kind === 'pin') {
    ctx.strokeStyle = '#6ee7d8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(obj.x - 7, obj.y);
    ctx.lineTo(obj.x + 7, obj.y);
    ctx.moveTo(obj.x, obj.y - 7);
    ctx.lineTo(obj.x, obj.y + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  if (selected) {
    ctx.save();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const b = boundsOf(obj);
    // follow the live body during playback, not the edit-time pose
    const refX = obj.kind === 'pendulum' ? obj.bobX : 'x' in obj ? obj.x : null;
    const refY = obj.kind === 'pendulum' ? obj.bobY : 'y' in obj ? obj.y : null;
    const dx = bf && refX !== null ? bf.x - refX : 0;
    const dy = bf && refY !== null ? bf.y - refY : 0;
    ctx.strokeRect(b.x + dx - 6, b.y + dy - 6, b.w + 12, b.h + 12);
    ctx.restore();
  }
}

function boundsOf(obj: SceneObject): { x: number; y: number; w: number; h: number } {
  switch (obj.kind) {
    case 'ball':
      return { x: obj.x - obj.radius, y: obj.y - obj.radius, w: obj.radius * 2, h: obj.radius * 2 };
    case 'box':
      return { x: obj.x - obj.width / 2, y: obj.y - obj.height / 2, w: obj.width, h: obj.height };
    case 'ramp':
      return {
        x: Math.min(obj.ax, obj.bx),
        y: Math.min(obj.ay, obj.by),
        w: Math.abs(obj.bx - obj.ax),
        h: Math.abs(obj.by - obj.ay),
      };
    case 'pendulum':
      return {
        x: Math.min(obj.anchorX, obj.bobX) - obj.radius,
        y: Math.min(obj.anchorY, obj.bobY) - obj.radius,
        w: Math.abs(obj.bobX - obj.anchorX) + obj.radius * 2,
        h: Math.abs(obj.bobY - obj.anchorY) + obj.radius * 2,
      };
    case 'pin':
      return { x: obj.x - 8, y: obj.y - 8, w: 16, h: 16 };
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, ghost: Extract<Ghost, { kind: 'draw' }>): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
  ctx.fillStyle = 'rgba(255, 209, 102, 0.25)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  const { ax, ay, bx, by, tool } = ghost;
  if (tool === 'ball') {
    ctx.beginPath();
    ctx.arc(ax, ay, Math.hypot(bx - ax, by - ay), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (tool === 'box') {
    const x = Math.min(ax, bx);
    const y = Math.min(ay, by);
    ctx.fillRect(x, y, Math.abs(bx - ax), Math.abs(by - ay));
    ctx.strokeRect(x, y, Math.abs(bx - ax), Math.abs(by - ay));
  } else if (tool === 'ramp') {
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  } else if (tool === 'pendulum') {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx, by, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawTimeBadge(ctx: CanvasRenderingContext2D, t: number, mode: string): void {
  if (mode === 'edit') return;
  ctx.save();
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(230, 237, 247, 0.85)';
  ctx.fillText(`t = ${t.toFixed(2)} s`, 14, 26);
  ctx.restore();
}
