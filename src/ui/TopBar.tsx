import type { SketchLab } from '../state/useSketchLab';

export function TopBar({ lab }: { lab: SketchLab }) {
  const recording = lab.getRecording(lab.activeId);
  const hasRecording = lab.recordingLength > 0;
  const t =
    hasRecording && lab.frameTick >= 0 && recording
      ? recording[Math.min(lab.frameTick, recording.length - 1)].t
      : 0;

  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-name">SketchLab</span>
        <span className="brand-sub">draw it, run the experiment</span>
      </div>

      <div className="tabs" role="tablist">
        {lab.experiments.map((e) => (
          <button
            key={e.id}
            role="tab"
            aria-selected={e.id === lab.activeId}
            className={`tab${e.id === lab.activeId ? ' active' : ''}`}
            data-testid={`tab-${e.id}`}
            onClick={() => lab.switchExperiment(e.id)}
            title={e.name}
          >
            {e.name}
          </button>
        ))}
        <button className="tab ghost" onClick={lab.newExperiment} title="New blank experiment">
          + New
        </button>
        <button
          className="tab ghost"
          data-testid="fork-btn"
          onClick={lab.forkExperiment}
          title="Copy this experiment so you can change one thing and compare"
        >
          Fork
        </button>
      </div>

      <div className="run-controls">
        <button onClick={lab.undo} disabled={!lab.canUndo} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button onClick={lab.redo} disabled={!lab.canRedo} title="Redo (Ctrl+Y)">
          Redo
        </button>
        {lab.mode === 'playing' ? (
          <button className="primary" data-testid="pause-btn" onClick={lab.pause}>
            Pause
          </button>
        ) : (
          <button className="primary" data-testid="play-btn" onClick={lab.play}>
            Play
          </button>
        )}
        <button data-testid="reset-btn" onClick={lab.reset} title="Back to the drawn scene">
          Reset
        </button>
      </div>

      <div className="time-controls">
        <input
          type="range"
          data-testid="time-slider"
          min={0}
          max={Math.max(0, lab.recordingLength - 1)}
          value={lab.frameTick >= 0 ? lab.frameTick : 0}
          disabled={!hasRecording}
          onChange={(e) => lab.scrub(Number(e.target.value))}
        />
        <span className="time-readout">t = {t.toFixed(2)} s</span>
      </div>

      <div className="gravity-controls">
        <label>
          Gravity{' '}
          <strong>{lab.active.history.present.world.gravityScale.toFixed(2)}x</strong>
        </label>
        <input
          type="range"
          data-testid="gravity-slider"
          min={0}
          max={2}
          step={0.05}
          value={lab.active.history.present.world.gravityScale}
          onChange={(e) => lab.setGravity(Number(e.target.value))}
        />
      </div>

      <div className="compare-controls">
        <label htmlFor="compare-select">Compare with</label>
        <select
          id="compare-select"
          data-testid="compare-select"
          value={lab.compareId ?? ''}
          onChange={(e) => lab.setCompare(e.target.value || null)}
        >
          <option value="">nothing</option>
          {lab.experiments
            .filter((e) => e.id !== lab.activeId)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </div>
    </div>
  );
}
