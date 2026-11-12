// Studio overlay: keyboard shortcuts. One place for all of them.
//
//   T          Text mode on/off            P          visitor preview
//   ⌘Z / ⌘⇧Z   undo / redo                 Esc        close panel, deselect
//   ⌫ Delete   delete the selected figure  ⌘S         save (save.js)
//
// None fire while you're typing in a field, so ⌘Z stays the browser's own
// undo inside a caption.
import { root, doUndo, doRedo } from './core.js';
import { selected, deselect, deleteSelected } from './inspector.js';
import { setPreview } from './preview.js';

const typing = () => {
  const a = document.activeElement;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(a?.tagName ?? '') || a?.isContentEditable;
};

window.addEventListener('keydown', (event) => {
  if (typing() || root.hidden) return;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (mod && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) doRedo(); else doUndo();
    return;
  }
  if (mod || event.altKey) return;

  if (key === 't') { root.querySelector('.studio-text')?.click(); return; }
  if (key === 'p') { setPreview(!document.body.classList.contains('studio-preview')); return; }
  if (key === 'escape') {
    if (document.body.classList.contains('studio-preview')) { setPreview(false); return; }
    const open = [...root.querySelectorAll('.studio-panel, .studio-library')].filter((p) => !p.hidden && !p.classList.contains('studio-inspector'));
    if (open.length) { for (const p of open) p.hidden = true; return; }
    if (selected()) deselect();
    return;
  }
  if ((key === 'backspace' || key === 'delete') && selected()) {
    event.preventDefault();
    deleteSelected();
  }
});
