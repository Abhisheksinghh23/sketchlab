import type { ReactNode } from 'react';
import type { SceneObject } from '../model/types';
import type { SketchLab } from '../state/useSketchLab';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="insp-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Inspector({ lab }: { lab: SketchLab }) {
  const obj = lab.active.history.present.scene.objects.find((o) => o.id === lab.selectedId);

  if (!obj) {
    return (
      <div className="inspector" data-testid="inspector">
        <h3>Inspector</h3>
        <p className="muted">
          Select an object with the Select tool to tune its friction, bounciness and shape.
        </p>
        <p className="muted">
          Rename this experiment:
        </p>
        <input
          className="name-input"
          value={lab.active.name}
          onChange={(e) => lab.renameActive(e.target.value)}
        />
        {lab.experiments.length > 1 && (
          <button
            className="danger"
            onClick={() => lab.deleteExperiment(lab.activeId)}
            title="Delete this experiment"
          >
            Delete experiment
          </button>
        )}
      </div>
    );
  }

  const patch = (p: Partial<SceneObject>) => lab.updateObject(obj.id, p);
  const tuning = 'tuning' in obj ? obj.tuning : null;

  return (
    <div className="inspector" data-testid="inspector">
      <h3>
        {obj.kind} <span className="muted">#{obj.id.slice(-4)}</span>
      </h3>

      {obj.kind === 'ball' && (
        <Row label={`Radius ${obj.radius.toFixed(0)} px`}>
          <input
            type="range"
            min={8}
            max={120}
            value={obj.radius}
            onChange={(e) => patch({ radius: Number(e.target.value) })}
          />
        </Row>
      )}

      {obj.kind === 'box' && (
        <>
          <Row label={`Width ${obj.width.toFixed(0)}`}>
            <input
              type="range"
              min={12}
              max={500}
              value={obj.width}
              onChange={(e) => patch({ width: Number(e.target.value) })}
            />
          </Row>
          <Row label={`Height ${obj.height.toFixed(0)}`}>
            <input
              type="range"
              min={12}
              max={300}
              value={obj.height}
              onChange={(e) => patch({ height: Number(e.target.value) })}
            />
          </Row>
          <Row label={`Angle ${((obj.angle * 180) / Math.PI).toFixed(0)} deg`}>
            <input
              type="range"
              min={-180}
              max={180}
              value={(obj.angle * 180) / Math.PI}
              onChange={(e) => patch({ angle: (Number(e.target.value) * Math.PI) / 180 })}
            />
          </Row>
          <Row label="Fixed in place">
            <input
              type="checkbox"
              checked={obj.isStatic}
              onChange={(e) => patch({ isStatic: e.target.checked })}
            />
          </Row>
        </>
      )}

      {obj.kind === 'ramp' && (
        <Row label={`Thickness ${obj.thickness.toFixed(0)}`}>
          <input
            type="range"
            min={6}
            max={40}
            value={obj.thickness}
            onChange={(e) => patch({ thickness: Number(e.target.value) })}
          />
        </Row>
      )}

      {obj.kind === 'pendulum' && (
        <>
          <Row label="Anchor X">
            <input
              type="number"
              value={Math.round(obj.anchorX)}
              onChange={(e) => patch({ anchorX: Number(e.target.value) })}
            />
          </Row>
          <Row label="Anchor Y">
            <input
              type="number"
              value={Math.round(obj.anchorY)}
              onChange={(e) => patch({ anchorY: Number(e.target.value) })}
            />
          </Row>
          <Row label={`Bob radius ${obj.radius.toFixed(0)}`}>
            <input
              type="range"
              min={10}
              max={60}
              value={obj.radius}
              onChange={(e) => patch({ radius: Number(e.target.value) })}
            />
          </Row>
        </>
      )}

      {obj.kind === 'pin' && (
        <>
          <Row label="Pin X">
            <input
              type="number"
              value={Math.round(obj.x)}
              onChange={(e) => patch({ x: Number(e.target.value) })}
            />
          </Row>
          <Row label="Pin Y">
            <input
              type="number"
              value={Math.round(obj.y)}
              onChange={(e) => patch({ y: Number(e.target.value) })}
            />
          </Row>
        </>
      )}

      {tuning && obj.kind !== 'ramp' && (
        <>
          <Row label={`Friction ${tuning.friction.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={tuning.friction}
              onChange={(e) =>
                patch({ tuning: { ...tuning, friction: Number(e.target.value) } })
              }
            />
          </Row>
          <Row label={`Bounciness ${tuning.restitution.toFixed(2)}`}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={tuning.restitution}
              onChange={(e) =>
                patch({ tuning: { ...tuning, restitution: Number(e.target.value) } })
              }
            />
          </Row>
        </>
      )}

      {tuning && obj.kind === 'ramp' && (
        <Row label={`Friction ${tuning.friction.toFixed(2)}`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tuning.friction}
            onChange={(e) => patch({ tuning: { ...tuning, friction: Number(e.target.value) } })}
          />
        </Row>
      )}

      <button className="danger" onClick={() => lab.deleteObject(obj.id)}>
        Delete object
      </button>
    </div>
  );
}
