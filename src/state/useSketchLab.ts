import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from '../model/history';
import type { History } from '../model/history';
import { clearState, loadState, saveState } from '../model/persistence';
import { emptyScene, sampleScene } from '../model/samples';
import { DEFAULT_WORLD, cloneScene, newId } from '../model/types';
import type { Scene, SceneObject, WorldParams } from '../model/types';
import { Sim } from '../physics/sim';
import type { Frame } from '../physics/sim';
import { TICKS_PER_SECOND } from '../physics/units';

export type Tool = 'select' | 'ball' | 'box' | 'ramp' | 'pendulum' | 'pin' | 'erase';
export type Mode = 'edit' | 'playing' | 'paused';
/** 'corrupt': saved data exists but is unreadable; 'saving-failed': writes are being lost. */
export type PersistenceIssue = 'corrupt' | 'saving-failed' | null;

export interface SceneWorld {
  scene: Scene;
  world: WorldParams;
}

export interface Experiment {
  id: string;
  name: string;
  history: History<SceneWorld>;
}

const MAX_RECORDING_FRAMES = 60 * TICKS_PER_SECOND; // one minute of run time

let experimentCounter = 2;

function freshExperiment(name: string, sceneWorld: SceneWorld): Experiment {
  return { id: newId('exp'), name, history: createHistory(sceneWorld) };
}

function initialExperiments(): {
  experiments: Experiment[];
  activeId: string;
  issue: PersistenceIssue;
} {
  const saved = loadState();
  if (saved.kind === 'ok') {
    const experiments = saved.state.experiments.map((e) => ({
      id: e.id,
      name: e.name,
      history: createHistory<SceneWorld>({ scene: e.scene, world: e.world }),
    }));
    const activeId = experiments.some((e) => e.id === saved.state.activeId)
      ? saved.state.activeId
      : experiments[0].id;
    experimentCounter = experiments.length + 1;
    return { experiments, activeId, issue: null };
  }
  const first = freshExperiment('Ramp + pendulum', {
    scene: sampleScene(),
    world: { ...DEFAULT_WORLD },
  });
  return {
    experiments: [first],
    activeId: first.id,
    issue: saved.kind === 'corrupt' ? 'corrupt' : null,
  };
}

export interface SketchLab {
  experiments: Experiment[];
  active: Experiment;
  activeId: string;
  compareId: string | null;
  mode: Mode;
  tool: Tool;
  selectedId: string | null;
  /** Index into the active recording that the canvas/charts show. -1 = live/edit pose. */
  frameTick: number;
  recordingLength: number;
  sceneVersion: number;
  canUndo: boolean;
  canRedo: boolean;
  recordingCapped: boolean;
  /** Non-null while a persistence problem needs the user's attention. */
  persistenceIssue: PersistenceIssue;
  /** Discard an unreadable old save (user-confirmed) and resume saving. */
  discardCorruptSave: () => void;

  getFrame: () => Frame | null;
  getRecording: (expId: string) => Frame[] | null;

  setTool: (t: Tool) => void;
  setSelected: (id: string | null) => void;
  switchExperiment: (id: string) => void;
  setCompare: (id: string | null) => void;

  addObject: (obj: SceneObject) => void;
  updateObject: (id: string, patch: Partial<SceneObject>) => void;
  deleteObject: (id: string) => void;
  moveObjectBy: (id: string, dx: number, dy: number) => void;
  setGravity: (gravityScale: number) => void;
  undo: () => void;
  redo: () => void;

  play: () => void;
  pause: () => void;
  reset: () => void;
  scrub: (frameIndex: number) => void;

  forkExperiment: () => void;
  newExperiment: () => void;
  deleteExperiment: (id: string) => void;
  renameActive: (name: string) => void;
}

export function useSketchLab(): SketchLab {
  const [init] = useState(initialExperiments);
  const [experiments, setExperiments] = useState<Experiment[]>(init.experiments);
  const [activeId, setActiveId] = useState(init.activeId);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('edit');
  const [tool, setTool] = useState<Tool>('select');
  const [selectedId, setSelected] = useState<string | null>(null);
  const [frameTick, setFrameTick] = useState(-1);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [recordingCapped, setRecordingCapped] = useState(false);

  const simsRef = useRef(new Map<string, { sim: Sim; key: string }>());
  const recordingsRef = useRef(new Map<string, Frame[]>());

  const active = experiments.find((e) => e.id === activeId) ?? experiments[0];

  const getSim = useCallback(
    (exp: Experiment): Sim => {
      const present = exp.history.present;
      const key = JSON.stringify(present);
      const cached = simsRef.current.get(exp.id);
      if (cached && cached.key === key) return cached.sim;
      cached?.sim.dispose();
      const sim = new Sim(present.scene, present.world);
      simsRef.current.set(exp.id, { sim, key });
      return sim;
    },
    [],
  );

  const getRecording = useCallback(
    (expId: string): Frame[] | null => recordingsRef.current.get(expId) ?? null,
    [],
  );

  /** The frame the canvas and charts should display right now. */
  const getFrame = useCallback((): Frame | null => {
    const recording = recordingsRef.current.get(active.id);
    if (recording && frameTick >= 0 && frameTick < recording.length) {
      return recording[frameTick];
    }
    if (mode === 'edit' || !recording || recording.length === 0) {
      return getSim(active).frame();
    }
    return recording[recording.length - 1];
  }, [active, frameTick, mode, getSim]);

  const clearRun = useCallback((expId: string) => {
    recordingsRef.current.delete(expId);
    simsRef.current.delete(expId); // force rebuild from the edited scene
    setRecordingCapped(false);
  }, []);

  const commitEdit = useCallback(
    (mutate: (sw: SceneWorld) => SceneWorld) => {
      setExperiments((prev) =>
        prev.map((e) =>
          e.id === activeId
            ? { ...e, history: pushHistory(e.history, mutate(cloneSceneWorld(e.history.present))) }
            : e,
        ),
      );
      setMode('edit');
      setFrameTick(-1);
      clearRun(activeId);
      setSceneVersion((v) => v + 1);
    },
    [activeId, clearRun],
  );

  const addObject = useCallback(
    (obj: SceneObject) => {
      commitEdit((sw) => ({ ...sw, scene: { objects: [...sw.scene.objects, obj] } }));
    },
    [commitEdit],
  );

  const updateObject = useCallback(
    (id: string, patch: Partial<SceneObject>) => {
      commitEdit((sw) => ({
        ...sw,
        scene: {
          objects: sw.scene.objects.map((o) =>
            o.id === id ? ({ ...o, ...patch } as SceneObject) : o,
          ),
        },
      }));
    },
    [commitEdit],
  );

  const deleteObject = useCallback(
    (id: string) => {
      commitEdit((sw) => ({
        ...sw,
        scene: {
          objects: sw.scene.objects.filter(
            (o) => o.id !== id && !(o.kind === 'pin' && o.bodyId === id),
          ),
        },
      }));
      setSelected((sel) => (sel === id ? null : sel));
    },
    [commitEdit],
  );

  const moveObjectBy = useCallback(
    (id: string, dx: number, dy: number) => {
      commitEdit((sw) => ({
        ...sw,
        scene: {
          objects: sw.scene.objects.map((o) => {
            if (o.id !== id) return o;
            switch (o.kind) {
              case 'ball':
                return { ...o, x: o.x + dx, y: o.y + dy };
              case 'box':
                return { ...o, x: o.x + dx, y: o.y + dy };
              case 'ramp':
                return { ...o, ax: o.ax + dx, ay: o.ay + dy, bx: o.bx + dx, by: o.by + dy };
              case 'pendulum':
                return {
                  ...o,
                  anchorX: o.anchorX + dx,
                  anchorY: o.anchorY + dy,
                  bobX: o.bobX + dx,
                  bobY: o.bobY + dy,
                };
              case 'pin':
                return { ...o, x: o.x + dx, y: o.y + dy };
              default:
                return o;
            }
          }),
        },
      }));
    },
    [commitEdit],
  );

  const setGravity = useCallback(
    (gravityScale: number) => {
      commitEdit((sw) => ({ ...sw, world: { gravityScale } }));
    },
    [commitEdit],
  );

  const undo = useCallback(() => {
    setExperiments((prev) =>
      prev.map((e) => (e.id === activeId ? { ...e, history: undoHistory(e.history) } : e)),
    );
    setMode('edit');
    setFrameTick(-1);
    clearRun(activeId);
    setSceneVersion((v) => v + 1);
  }, [activeId, clearRun]);

  const redo = useCallback(() => {
    setExperiments((prev) =>
      prev.map((e) => (e.id === activeId ? { ...e, history: redoHistory(e.history) } : e)),
    );
    setMode('edit');
    setFrameTick(-1);
    clearRun(activeId);
    setSceneVersion((v) => v + 1);
  }, [activeId, clearRun]);

  const play = useCallback(() => {
    const recording = recordingsRef.current.get(activeId);
    // If scrubbed back, resume the run from that exact recorded state.
    if (recording && frameTick >= 0 && frameTick < recording.length - 1) {
      const frame = recording[frameTick];
      recording.length = frameTick + 1;
      getSim(active).restoreFrame(frame);
    }
    setMode('playing');
  }, [active, activeId, frameTick, getSim]);

  const pause = useCallback(() => setMode('paused'), []);

  const reset = useCallback(() => {
    clearRun(activeId);
    setMode('edit');
    setFrameTick(-1);
    setSceneVersion((v) => v + 1);
  }, [activeId, clearRun]);

  const scrub = useCallback(
    (frameIndex: number) => {
      const recording = recordingsRef.current.get(activeId);
      if (!recording || recording.length === 0) return;
      const clamped = Math.max(0, Math.min(recording.length - 1, frameIndex));
      if (mode === 'playing') setMode('paused');
      setFrameTick(clamped);
    },
    [activeId, mode],
  );

  const switchExperiment = useCallback(
    (id: string) => {
      if (id === activeId) return;
      setActiveId(id);
      setMode('edit');
      setSelected(null);
      const recording = recordingsRef.current.get(id);
      setFrameTick(recording && recording.length > 0 ? recording.length - 1 : -1);
      setSceneVersion((v) => v + 1);
    },
    [activeId],
  );

  const forkExperiment = useCallback(() => {
    const source = experiments.find((e) => e.id === activeId);
    if (!source) return;
    const copy = freshExperiment(`${source.name} (fork)`, {
      scene: cloneScene(source.history.present.scene),
      world: { ...source.history.present.world },
    });
    setExperiments((prev) => [...prev, copy]);
    setActiveId(copy.id);
    setMode('edit');
    // object ids survive cloning, so the selection carries into the fork
    setSelected(selectedId);
    setFrameTick(-1);
    setCompareId(source.id);
    setSceneVersion((v) => v + 1);
  }, [experiments, activeId, selectedId]);

  const newExperiment = useCallback(() => {
    const exp = freshExperiment(`Experiment ${experimentCounter++}`, {
      scene: emptyScene(),
      world: { ...DEFAULT_WORLD },
    });
    setExperiments((prev) => [...prev, exp]);
    setActiveId(exp.id);
    setMode('edit');
    setSelected(null);
    setFrameTick(-1);
    setSceneVersion((v) => v + 1);
  }, []);

  const deleteExperiment = useCallback(
    (id: string) => {
      setExperiments((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((e) => e.id !== id);
        if (id === activeId) {
          setActiveId(next[0].id);
          setMode('edit');
          setSelected(null);
          setFrameTick(-1);
        }
        return next;
      });
      simsRef.current.delete(id);
      recordingsRef.current.delete(id);
      setCompareId((c: string | null) => (c === id ? null : c));
      setSceneVersion((v) => v + 1);
    },
    [activeId],
  );

  const renameActive = useCallback(
    (name: string) => {
      setExperiments((prev) => prev.map((e) => (e.id === activeId ? { ...e, name } : e)));
    },
    [activeId],
  );

  // The playback loop: fixed 60 Hz stepping, real-time.
  useEffect(() => {
    if (mode !== 'playing') return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      acc += now - last;
      last = now;
      let stepped = false;
      let recording = recordingsRef.current.get(activeId);
      if (!recording) {
        recording = [];
        recordingsRef.current.set(activeId, recording);
      }
      const sim = getSim(active);
      while (acc >= 1000 / TICKS_PER_SECOND) {
        if (recording.length >= MAX_RECORDING_FRAMES) {
          setMode('paused');
          setRecordingCapped(true);
          return;
        }
        sim.step();
        recording.push(sim.frame());
        acc -= 1000 / TICKS_PER_SECOND;
        stepped = true;
      }
      if (stepped) setFrameTick(recording.length - 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, activeId, active, getSim]);

  const [persistenceIssue, setPersistenceIssue] = useState<PersistenceIssue>(init.issue);

  const discardCorruptSave = useCallback(() => {
    clearState();
    setPersistenceIssue(null);
  }, []);

  // Persist scenes (not recordings) locally. Saving is paused while a corrupt
  // save is unacknowledged, and a failed write surfaces as a visible warning.
  useEffect(() => {
    if (persistenceIssue === 'corrupt') return;
    const ok = saveState({
      version: 1,
      experiments: experiments.map((e) => ({
        id: e.id,
        name: e.name,
        scene: e.history.present.scene,
        world: e.history.present.world,
      })),
      activeId,
    });
    setPersistenceIssue((prev) => {
      if (!ok) return 'saving-failed';
      return prev === 'saving-failed' ? null : prev;
    });
  }, [experiments, activeId, persistenceIssue]);

  const recordingLength = recordingsRef.current.get(activeId)?.length ?? 0;

  return useMemo(
    () => ({
      experiments,
      active,
      activeId,
      compareId,
      mode,
      tool,
      selectedId,
      frameTick,
      recordingLength,
      sceneVersion,
      canUndo: canUndo(active.history),
      canRedo: canRedo(active.history),
      recordingCapped,
      persistenceIssue,
      discardCorruptSave,
      getFrame,
      getRecording,
      setTool,
      setSelected,
      switchExperiment,
      setCompare: setCompareId,
      addObject,
      updateObject,
      deleteObject,
      moveObjectBy,
      setGravity,
      undo,
      redo,
      play,
      pause,
      reset,
      scrub,
      forkExperiment,
      newExperiment,
      deleteExperiment,
      renameActive,
    }),
    [
      experiments,
      active,
      activeId,
      compareId,
      mode,
      tool,
      selectedId,
      frameTick,
      recordingLength,
      sceneVersion,
      recordingCapped,
      persistenceIssue,
      discardCorruptSave,
      getFrame,
      getRecording,
      addObject,
      updateObject,
      deleteObject,
      moveObjectBy,
      setGravity,
      undo,
      redo,
      play,
      pause,
      reset,
      scrub,
      forkExperiment,
      newExperiment,
      deleteExperiment,
      renameActive,
      switchExperiment,
    ],
  );
}

function cloneSceneWorld(sw: SceneWorld): SceneWorld {
  return { scene: cloneScene(sw.scene), world: { ...sw.world } };
      }
