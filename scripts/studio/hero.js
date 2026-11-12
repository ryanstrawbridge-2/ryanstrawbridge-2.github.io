// Studio overlay: project main photo (hero).
import {
  hooks,
  MODE,
  dropEl,
  isFileDrag,
  readAsBase64,
  displacedNote,
  size,
  toolButton,
  toolSep,
  toast,
  post,
  queueSave,
  toPct,
  parkAltPrompt,
  takeAltPrompt,
  editAlt,
  label,
} from './core.js';

// -- project main photo (hero) ----------------------------------------
//
// Same gestures as a gallery photo — drag to crop, pinch or ⌥scroll to
// zoom — plus replace (library or a file dropped straight on it), frame
// shape and description. Writes top-level frontmatter: hero, heroAlt,
// heroFocalPoint, heroZoom, heroAspect.
const heroWrap = MODE === 'project' ? document.querySelector('[data-studio-hero]') : null;
const heroFrame = heroWrap?.querySelector('.hero-frame');
const heroImg = heroFrame?.querySelector('img');

const HERO_SHAPES = [
  ['wide', 'Wide 21:9', '21 / 9'],
  ['standard', 'Standard 3:2', '3 / 2'],
  ['tall', 'Tall 4:5', '4 / 5'],
  ['square', 'Square', '1 / 1'],
];

const editHeroAlt = (seed) =>
  editAlt(heroFrame, seed ?? heroWrap.dataset.studioAlt ?? '', async (value) => {
    // heroAlt is required by the schema; blank would break the build.
    if (!value) throw new Error('the main photo needs a description');
    await post('/project/patch', { patch: { heroAlt: value } });
    heroWrap.dataset.studioAlt = value;
  });

if (heroWrap && heroFrame && heroImg) {
  heroFrame.classList.add('studio-slot', 'studio-hero');

  const tools = document.createElement('div');
  tools.className = 'studio-tools';
  tools.appendChild(Object.assign(document.createElement('span'), {
    className: 'studio-tool-label', textContent: 'Main photo',
  }));

  const replace = toolButton({ icon: 'replace', text: 'Replace', title: 'Pick a new main photo from the library — or drop a file on it' });
  replace.addEventListener('click', () => hooks.openLibrary({ hero: true }));
  tools.appendChild(replace);

  const shape = document.createElement('select');
  shape.title = 'Shape of the main photo';
  for (const [value, text] of HERO_SHAPES) shape.appendChild(new Option(text, value));
  shape.value = heroWrap.dataset.studioAspect || 'wide';
  shape.addEventListener('change', async () => {
    const ratio = HERO_SHAPES.find(([v]) => v === shape.value)?.[2];
    if (ratio) heroWrap.style.setProperty('--hero-aspect', ratio);
    heroWrap.dataset.studioAspect = shape.value;
    placeDot();
    try {
      await post('/project/patch', { patch: { heroAspect: shape.value } });
      toast(`main photo → ${shape.selectedOptions[0].text}`);
    } catch (error) { toast(error.message, true); }
  });
  tools.appendChild(shape);

  tools.appendChild(toolSep());
  const altBtn = toolButton({ icon: 'alt', text: 'Alt', title: 'Edit the description screen readers announce' });
  altBtn.addEventListener('click', () => editHeroAlt());
  tools.appendChild(altBtn);
  heroFrame.appendChild(tools);

  // Drop a file on the main photo to replace it. Stops propagation so the
  // page-wide handler doesn't also add it to the gallery.
  heroFrame.addEventListener('dragover', (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    heroFrame.classList.add('studio-slot-over');
  });
  heroFrame.addEventListener('dragleave', () => heroFrame.classList.remove('studio-slot-over'));
  heroFrame.addEventListener('drop', async (event) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    heroFrame.classList.remove('studio-slot-over');
    dropEl.hidden = true;
    const file = event.dataTransfer.files[0];
    if (!file) return;
    toast(`replacing the main photo with ${file.name}…`);
    try {
      const data = await readAsBase64(file);
      const result = await post('/media', { target: { kind: 'hero' }, filename: file.name, data });
      toast(`main photo → ${file.name}  ${size(result.before)} → ${size(result.after)}${displacedNote(result.displaced)}`);
      parkAltPrompt({ hero: true, staleAlt: result.staleAlt });
    } catch (error) { toast(error.message, true); }
  });

  // Crop and zoom.
  const dot = document.createElement('span');
  dot.className = 'studio-crosshair';
  heroFrame.appendChild(dot);

  let [px, py] = toPct(heroWrap.dataset.studioFocal);
  let zoom = Number(heroWrap.dataset.studioZoom || 1) || 1;

  const badge = document.createElement('span');
  badge.className = 'studio-zoom-badge';
  badge.title = 'Click to reset zoom';
  heroFrame.appendChild(badge);

  function placeDot() {
    const box = heroImg.getBoundingClientRect();
    const frame = heroFrame.getBoundingClientRect();
    dot.style.left = `${box.left - frame.left + (box.width * px) / 100}px`;
    dot.style.top = `${box.top - frame.top + (box.height * py) / 100}px`;
  }
  const showHero = () => {
    heroWrap.style.setProperty('--hero-focal', `${px}% ${py}%`);
    heroWrap.style.setProperty('--hero-zoom', String(zoom));
    badge.textContent = `${zoom.toFixed(2)}×`;
    badge.hidden = zoom <= 1.001;
    placeDot();
  };
  showHero();
  window.addEventListener('resize', placeDot);
  heroImg.addEventListener('load', placeDot);

  let dragging = false;
  let moved = false;
  heroImg.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    moved = false;
    heroFrame.classList.add('is-dragging');
    try { heroImg.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  });
  heroImg.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    moved = true;
    const box = heroImg.getBoundingClientRect();
    px = Math.round(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)));
    py = Math.round(Math.min(100, Math.max(0, ((event.clientY - box.top) / box.height) * 100)));
    showHero();
  });
  const finish = async (event) => {
    if (!dragging) return;
    dragging = false;
    heroFrame.classList.remove('is-dragging');
    try { heroImg.releasePointerCapture?.(event.pointerId); } catch {}
    if (!moved) return;
    const focal = `${px}% ${py}%`;
    heroWrap.dataset.studioFocal = focal;
    try {
      await post('/project/patch', { patch: { heroFocalPoint: focal } });
      toast(`main photo crop → ${focal}`);
    } catch (error) { toast(error.message, true); }
  };
  heroImg.addEventListener('pointerup', finish);
  heroImg.addEventListener('pointercancel', finish);

  const saveZoom = () => {
    const value = Number(zoom.toFixed(2));
    heroWrap.dataset.studioZoom = String(value);
    queueSave('zoom:hero', '/project/patch', { patch: { heroZoom: value } });
  };
  heroImg.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.altKey) return; // let the page scroll
    event.preventDefault();
    zoom = Math.min(4, Math.max(1, zoom * Math.exp(-event.deltaY / 400)));
    showHero();
    saveZoom();
  }, { passive: false });
  badge.addEventListener('click', () => {
    zoom = 1;
    showHero();
    saveZoom();
    toast('zoom reset');
  });

  // A replace on the previous load asked for a new description.
  const pendingAlt = takeAltPrompt();
  if (pendingAlt?.hero) {
    heroFrame.scrollIntoView({ block: 'center', behavior: 'smooth' });
    toast('Main photo replaced — update the description');
    editHeroAlt(pendingAlt.staleAlt);
  }
}

