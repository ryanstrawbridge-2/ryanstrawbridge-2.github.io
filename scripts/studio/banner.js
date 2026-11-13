// Studio overlay: experience banners. Trim a full-length video into a short
// loop, previewed in the banner on the page itself.
//
// The banner plays the full source (served from video-sources/ by the writer)
// and loops between the in and out marks while you adjust them. Nothing is
// encoded until Cut: then the writer runs avconvert, writes the clip to
// public/videos, and the page reloads showing the real file.
import { MODE, API, post, toast, toolButton } from './core.js';

const banners = MODE === 'home' ? [...document.querySelectorAll('[data-banner]')] : [];
const fmt = (t) => {
  if (!Number.isFinite(t)) return '–';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

let sources = [];
let maxSeconds = 30;
let panel = null;

const loadSources = async () => {
  try {
    const r = await (await fetch(`${API}/video-sources`)).json();
    sources = r.sources ?? [];
    maxSeconds = r.max ?? 30;
  } catch { sources = []; }
};

const sourceUrl = (file) => `${API}/video-source?file=${encodeURIComponent(file)}`;

const closePanel = () => {
  if (!panel) return;
  panel.cleanup();
  panel.el.remove();
  panel = null;
};

const openTrim = async (el) => {
  closePanel();
  if (!sources.length) await loadSources();
  const index = Number(el.dataset.banner);
  const org = el.dataset.org || 'this banner';
  const video = el.querySelector('video');
  if (!sources.length) { toast('No full-length videos in video-sources/. Drop one on the banner first.', true); return; }

  let file = el.dataset.source && sources.some((s) => s.file === el.dataset.source) ? el.dataset.source : sources[0].file;
  let duration = NaN;
  let inT = Number.parseFloat(el.dataset.start);
  let outT = Number.parseFloat(el.dataset.end);
  const hadMarks = Number.isFinite(inT) && Number.isFinite(outT);
  const original = { src: video.getAttribute('src'), loop: video.loop };

  video.dataset.studioTrim = '1';
  video.loop = false;
  video.muted = true;
  el.classList.add('studio-trimming');
  // Banner near the top, so the docked panel doesn't cover it.
  window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 72, behavior: 'smooth' });

  const box = document.createElement('div');
  box.className = 'studio-trim';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', `Trim the ${org} banner`);
  box.innerHTML = `
    <div class="studio-trim-head">
      <strong>Trim the ${org.replace(/[<>&]/g, '')} banner</strong>
      <label>Source <select class="studio-trim-source"></select></label>
      <span class="studio-trim-meta"></span>
    </div>
    <div class="studio-trim-track" tabindex="0" aria-label="Timeline">
      <div class="studio-trim-range"></div>
      <div class="studio-trim-head-line"></div>
      <button type="button" class="studio-trim-handle is-in" aria-label="In point"></button>
      <button type="button" class="studio-trim-handle is-out" aria-label="Out point"></button>
    </div>
    <div class="studio-trim-row">
      <span class="studio-trim-times"></span>
      <span class="studio-trim-actions">
        <button type="button" data-act="play">Pause</button>
        <button type="button" data-act="in" title="Set the in point at the playhead (I)">Set in</button>
        <button type="button" data-act="out" title="Set the out point at the playhead (O)">Set out</button>
        <button type="button" data-act="cancel">Cancel</button>
        <button type="button" data-act="cut" class="is-primary">Cut and use</button>
      </span>
    </div>
    <p class="studio-trim-hint">Drag the handles or click the bar to scrub. I / O set the marks at the playhead, Space plays. Drag the banner to reframe it, ⌥-scroll to zoom. The banner above previews the loop.</p>`;
  document.body.appendChild(box);

  const q = (s) => box.querySelector(s);
  const select = q('.studio-trim-source');
  for (const s of sources) select.append(new Option(`${s.file} (${mb(s.size)})`, s.file));
  select.value = file;
  const track = q('.studio-trim-track');
  const range = q('.studio-trim-range');
  const headLine = q('.studio-trim-head-line');
  const hIn = q('.is-in');
  const hOut = q('.is-out');
  const times = q('.studio-trim-times');
  const meta = q('.studio-trim-meta');
  const playBtn = q('[data-act="play"]');
  const cutBtn = q('[data-act="cut"]');

  const pct = (t) => `${(Math.min(Math.max(t / duration, 0), 1) * 100).toFixed(3)}%`;
  const bytesPerSecond = () => (sources.find((s) => s.file === file)?.size ?? 0) / duration;
  const render = () => {
    if (!Number.isFinite(duration)) return;
    hIn.style.left = pct(inT);
    hOut.style.left = pct(outT);
    range.style.left = pct(inT);
    range.style.width = `calc(${pct(outT)} - ${pct(inT)})`;
    headLine.style.left = pct(video.currentTime);
    const len = outT - inT;
    const tooLong = len > maxSeconds;
    times.innerHTML = `in <b>${fmt(inT)}</b> · out <b>${fmt(outT)}</b> · loop <b class="${tooLong ? 'is-bad' : ''}">${len.toFixed(1)} s</b> · ≈ ${mb(len * bytesPerSecond())}`;
    cutBtn.disabled = len < 1 || tooLong;
    cutBtn.title = tooLong ? `Keep the loop under ${maxSeconds} s` : '';
  };

  const loadFile = (name, keepMarks) => {
    file = name;
    duration = NaN;
    video.removeAttribute('src');
    video.src = sourceUrl(name);
    video.addEventListener('loadedmetadata', () => {
      duration = video.duration;
      if (!keepMarks) { inT = 0; outT = Math.min(duration, 10); }
      inT = Math.min(Math.max(0, inT), duration - 1);
      outT = Math.min(Math.max(inT + 1, outT), duration);
      meta.textContent = `${fmt(duration)} long, ${video.videoWidth}×${video.videoHeight}${video.videoWidth < 1000 ? ' (low resolution, will look soft at full width)' : ''}`;
      video.currentTime = inT;
      video.play().catch(() => {});
      render();
    }, { once: true });
  };

  // Loop the preview between the marks.
  const onTime = () => {
    if (Number.isFinite(outT) && video.currentTime >= outT && !video.paused) video.currentTime = inT;
    render();
  };
  video.addEventListener('timeupdate', onTime);
  const onPlayState = () => { playBtn.textContent = video.paused ? 'Play' : 'Pause'; };
  video.addEventListener('play', onPlayState);
  video.addEventListener('pause', onPlayState);

  const timeAt = (clientX) => {
    const r = track.getBoundingClientRect();
    return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * duration;
  };
  const dragHandle = (which) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    video.pause();
    const move = (e) => {
      const t = timeAt(e.clientX);
      if (which === 'in') inT = Math.min(t, outT - 1);
      else outT = Math.max(t, inT + 1);
      video.currentTime = which === 'in' ? inT : outT;
      render();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      video.currentTime = inT;
      video.play().catch(() => {});
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  hIn.addEventListener('pointerdown', dragHandle('in'));
  hOut.addEventListener('pointerdown', dragHandle('out'));
  track.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.studio-trim-handle')) return;
    video.currentTime = timeAt(event.clientX);
    render();
  });

  const setMark = (which) => {
    const t = video.currentTime;
    if (which === 'in') { inT = Math.min(t, duration - 1); if (outT < inT + 1) outT = Math.min(duration, inT + 10); }
    else { outT = Math.max(t, 1); if (inT > outT - 1) inT = Math.max(0, outT - 10); }
    render();
  };
  const togglePlay = () => (video.paused ? video.play().catch(() => {}) : video.pause());

  const cut = async () => {
    cutBtn.disabled = true;
    cutBtn.textContent = 'Cutting…';
    toast(`cutting ${org}, ${(outT - inT).toFixed(1)} s…`);
    try {
      const r = await post('/home/video/cut', { index, source: file, start: inT, end: outT });
      toast(`${org} banner → ${r.file} (${mb(r.after)})${r.after > 4 * 1048576 ? ', large; consider a shorter loop' : ''}`);
      cleanup(false);
      box.remove();
      panel = null;
    } catch (error) {
      toast(error.message, true);
      cutBtn.textContent = 'Cut and use';
      render();
    }
  };

  box.addEventListener('click', (event) => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (act === 'play') togglePlay();
    if (act === 'in' || act === 'out') setMark(act);
    if (act === 'cancel') closePanel();
    if (act === 'cut') cut();
  });
  select.addEventListener('change', () => loadFile(select.value, false));

  const onKey = (event) => {
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const k = event.key.toLowerCase();
    if (k === 'i') setMark('in');
    else if (k === 'o') setMark('out');
    else if (k === ' ') togglePlay();
    else if (k === 'escape') closePanel();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  window.addEventListener('keydown', onKey, true);

  const cleanup = (restore = true) => {
    video.removeEventListener('timeupdate', onTime);
    video.removeEventListener('play', onPlayState);
    video.removeEventListener('pause', onPlayState);
    window.removeEventListener('keydown', onKey, true);
    el.classList.remove('studio-trimming');
    if (!restore) return;
    delete video.dataset.studioTrim;
    video.loop = original.loop;
    video.pause();
    if (original.src) { video.src = original.src; video.play().catch(() => {}); }
    else { video.removeAttribute('src'); video.load(); }
  };
  panel = { el: box, cleanup };
  loadFile(file, hadMarks);
};

for (const el of banners) {
  const tools = el.querySelector('.studio-tools');
  const trim = toolButton({ icon: 'scissors', text: 'Trim', title: 'Trim the full-length video into the banner loop' });
  trim.addEventListener('click', () => openTrim(el));
  if (tools) tools.insertBefore(trim, tools.firstChild);
  else el.appendChild(trim);
  // An untrimmed banner has no clip yet: show a still of the source so the
  // slot isn't a black box.
  const video = el.querySelector('video');
  if (el.dataset.cut !== 'true' && el.dataset.source) {
    video.preload = 'metadata';
    video.src = `${sourceUrl(el.dataset.source)}#t=${Number.parseFloat(el.dataset.start) || 1}`;
  } else if (video.dataset.src && !video.getAttribute('src')) {
    // In dev, play the cut clip straight away rather than waiting on the
    // page's lazy loader, so a fresh cut shows the moment the page reloads.
    video.src = video.dataset.src;
    video.dataset.loaded = '1';
    video.play().catch(() => {});
  }
}

// Prompt for any banner that still needs cutting.
const waiting = banners.filter((el) => el.dataset.cut !== 'true' && el.dataset.source);
if (waiting.length) {
  await loadSources();
  const card = document.createElement('div');
  card.className = 'studio-trim-prompt';
  const names = waiting.map((el) => el.dataset.org);
  card.innerHTML = `<strong>${waiting.length} banner video${waiting.length > 1 ? 's' : ''} to trim</strong><p>Full-length videos don't ship. Cut a short loop for each and preview it in place.</p>`;
  const list = document.createElement('div');
  list.className = 'studio-trim-prompt-list';
  waiting.forEach((el, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `Trim ${names[i]}`;
    b.addEventListener('click', () => { card.remove(); openTrim(el); });
    list.append(b);
  });
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'is-quiet';
  later.textContent = 'Later';
  later.addEventListener('click', () => card.remove());
  list.append(later);
  card.append(list);
  document.body.appendChild(card);
}
