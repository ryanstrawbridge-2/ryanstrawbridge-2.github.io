// Studio overlay: drop files anywhere on the page.
import {
  MODE,
  dropEl,
  isFileDrag,
  readAsBase64,
  size,
  toast,
  post,
} from './core.js';

// -- drop files anywhere on the page ----------------------------------
let dragDepth = 0;

window.addEventListener('dragenter', (event) => {
  if (!isFileDrag(event)) return;
  dragDepth += 1;
  dropEl.hidden = false;
});
window.addEventListener('dragover', (event) => { if (isFileDrag(event)) event.preventDefault(); });
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropEl.hidden = true;
});

window.addEventListener('drop', async (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth = 0;
  dropEl.hidden = true;

  const files = [...event.dataTransfer.files];
  if (files.length === 0) return;

  // Home slots are fixed, so a loose drop has no destination. The per-slot
  // handlers stop propagation, so reaching here means it missed a photo.
  if (MODE === 'home') {
    toast('Drop it directly onto the photo you want to replace', true);
    return;
  }

  // Which section was it dropped into? Nearest heading above the cursor.
  let section = null;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const heading = target?.closest('.project-body')
    ? [...document.querySelectorAll('.project-body h2')]
        .filter((h) => h.getBoundingClientRect().top <= event.clientY)
        .pop()
    : null;
  if (heading) section = heading.textContent.trim();

  let done = 0;
  for (const file of files) {
    toast(`uploading ${file.name} (${done + 1}/${files.length})…`);
    try {
      const data = await readAsBase64(file);
      const result = await post('/media', { target: { kind: 'gallery', section }, filename: file.name, data });
      done += 1;
      const where = section ? `, in ${section}` : '';
      toast(
        result.kind === 'image'
          ? `${file.name}  ${size(result.before)} → ${size(result.after)}${where}`
          : `${file.name} → ${result.file}${where}`,
      );
    } catch (error) {
      toast(`${file.name}: ${error.message}`, true);
      return;
    }
  }
  if (done > 1) toast(`added ${done} files`);
});
