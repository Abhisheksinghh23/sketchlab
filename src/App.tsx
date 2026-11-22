import { useEffect } from 'react';
import { useSketchLab } from './state/useSketchLab';
import { CanvasView } from './ui/CanvasView';
import { Charts } from './ui/Charts';
import { Inspector } from './ui/Inspector';
import { Toolbar } from './ui/Toolbar';
import { TopBar } from './ui/TopBar';

export default function App() {
  const lab = useSketchLab();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        lab.undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        lab.redo();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (lab.mode === 'playing') lab.pause();
        else lab.play();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && lab.selectedId) {
        lab.deleteObject(lab.selectedId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lab]);

  return (
    <div className="app-shell">
      <TopBar lab={lab} />
      <div className="app-body">
        <Toolbar lab={lab} />
        <div className="center-col">
          <CanvasView lab={lab} />
          <Charts lab={lab} />
          <div className="statusbar">
            {lab.recordingCapped && (
              <span className="warn">Recording stopped at 60 s. Reset to run again.</span>
            )}
            {lab.persistenceIssue === 'saving-failed' && (
              <span className="warn" data-testid="save-failed-warn">
                Browser storage is unavailable or full: edits in this session are NOT being saved.
              </span>
            )}
            {lab.persistenceIssue === 'corrupt' && (
              <span className="warn" data-testid="corrupt-warn">
                Saved data from a previous visit could not be read, so the app started fresh. The
                old data was left untouched and new changes are not being saved.{' '}
                <button className="warn-action" onClick={lab.discardCorruptSave}>
                  Discard old save and resume saving
                </button>
              </span>
            )}
            <span>
              Space: play/pause. Ctrl+Z / Ctrl+Y: undo/redo. Draw in Edit mode, press Play, scrub
              the timeline, Fork to compare two versions.
            </span>
          </div>
        </div>
        <Inspector lab={lab} />
      </div>
    </div>
  );
}
