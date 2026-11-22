import type { SketchLab, Tool } from '../state/useSketchLab';

const TOOLS: { id: Tool; label: string; icon: string; hint: string }[] = [
  { id: 'select', label: 'Select', icon: '\u2196', hint: 'Click an object to select it; drag to move it.' },
  { id: 'ball', label: 'Ball', icon: '\u25CF', hint: 'Drag from the centre outward to size a ball.' },
  { id: 'box', label: 'Box', icon: '\u25A0', hint: 'Drag corner to corner to draw a box.' },
  { id: 'ramp', label: 'Ramp', icon: '\u2571', hint: 'Drag between the two ends of a static bar.' },
  { id: 'pendulum', label: 'Pendulum', icon: '\u25C9', hint: 'Drag from the anchor point down to the bob.' },
  { id: 'pin', label: 'Pin', icon: '\u271A', hint: 'Click a moving object to pin that point in place.' },
  { id: 'erase', label: 'Erase', icon: '\u2716', hint: 'Click an object to remove it.' },
];

export function Toolbar({ lab }: { lab: SketchLab }) {
  const active = TOOLS.find((t) => t.id === lab.tool)!;
  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`tool-btn${lab.tool === t.id ? ' active' : ''}`}
          title={`${t.label} - ${t.hint}`}
          data-testid={`tool-${t.id}`}
          onClick={() => lab.setTool(t.id)}
        >
          <span className="tool-icon">{t.icon}</span>
          <span className="tool-label">{t.label}</span>
        </button>
      ))}
      <div className="tool-hint">{lab.mode === 'edit' ? active.hint : 'Pause and press Reset to edit.'}</div>
    </div>
  );
}
