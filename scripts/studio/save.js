// Studio overlay: save, publish.
import {
  root,
  state,
  API,
  bar,
  toast,
  setUndo,
  post,
} from './core.js';

// -- save -------------------------------------------------------------
// A local checkpoint (git commit on the working branch). Never pushes.
const savePanel = root.querySelector('.studio-save-panel');
const saveBtn = root.querySelector('.studio-save');
const saveCount = root.querySelector('.studio-save-count');
const saveGo = root.querySelector('.studio-save-go');
const saveMsg = root.querySelector('.studio-save-msg');
const saveState = root.querySelector('.studio-save-state');
const publishBtn = root.querySelector('.studio-publish');
let saveInfo = null;

const li = (cells) => {
  const row = document.createElement('li');
  for (const [cls, text] of cells) {
    const span = document.createElement('span');
    span.className = cls;
    span.textContent = text;
    row.append(span);
  }
  return row;
};

const renderSave = (info) => {
  saveInfo = info;
  const n = info.changes.length;
  saveCount.hidden = n === 0;
  saveCount.textContent = n > 99 ? '99+' : String(n);
  saveBtn.title = n
    ? `${n} unsaved change${n === 1 ? '' : 's'}. Save a checkpoint on this Mac.`
    : 'Everything is saved on this Mac';

  root.querySelector('.studio-save-branch').textContent = info.branch;
  const list = root.querySelector('.studio-save-changes');
  list.replaceChildren();
  if (!n) {
    list.append(li([['empty', 'Everything is saved.']]));
  } else {
    for (const c of info.changes.slice(0, 30)) list.append(li([['area', c.area], ['name', c.name], ['what', c.status]]));
    if (n > 30) list.append(li([['empty', `and ${n - 30} more`]]));
  }
  const saves = root.querySelector('.studio-save-list');
  saves.replaceChildren(...info.saves.map((sv) => li([['subj', sv.subject], ['when', sv.when]])));
  root.querySelector('.studio-save-notlive').textContent = info.notLive
    ? `${info.notLive} not on the live site`
    : '';

  const filing = info.inbox?.length ?? 0;
  const inboxNote = filing
    ? ` Also files ${filing} inbox photo${filing === 1 ? '' : 's'} into portfolio-photos/.`
    : '';
  if (info.onMain) {
    saveGo.disabled = true;
    saveState.textContent = "On main, a save would go live within the hour. Switch to a working branch.";
  } else {
    saveGo.disabled = n === 0 && filing === 0;
    saveState.textContent = `A checkpoint on this Mac. Nothing goes to the live site.${inboxNote}`;
  }
};

const refreshSave = async () => {
  try {
    renderSave(await (await fetch(`${API}/save/status`)).json());
  } catch { /* writer not up yet */ }
};

saveBtn?.addEventListener('click', () => {
  savePanel.hidden = !savePanel.hidden;
  if (!savePanel.hidden) { pubPanel.hidden = true; refreshSave(); saveMsg.focus(); }
});
root.querySelector('.studio-save-close')?.addEventListener('click', () => { savePanel.hidden = true; });
saveMsg?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !saveGo.disabled) saveGo.click(); });

saveGo?.addEventListener('click', async () => {
  saveGo.disabled = true;
  saveState.textContent = 'saving…';
  try {
    const data = await post('/save', { message: saveMsg.value });
    saveMsg.value = '';
    const filed = data.filed?.length ?? 0;
    const filedNote = filed ? `${data.saved ? ', ' : ''}filed ${filed} inbox photo${filed === 1 ? '' : 's'}` : '';
    toast(data.saved
      ? `saved ${data.count} change${data.count === 1 ? '' : 's'} on this Mac${filedNote}`
      : filedNote.replace(/^, /, ''));
  } catch (error) {
    toast(error.message, true);
  }
  refreshSave();
});

// ⌘S saves, like everywhere else. Only while studio is showing.
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && !root.hidden) {
    e.preventDefault();
    if (saveInfo && (saveInfo.changes.length || saveInfo.inbox?.length) && !saveInfo.onMain) saveGo.click();
    else { savePanel.hidden = false; refreshSave(); }
  }
});

// Keep the badge honest without polling hard: on load, on focus, and
// shortly after any write (writes reload the page, which re-runs this).
refreshSave();
window.addEventListener('focus', refreshSave);

// -- publish ----------------------------------------------------------
// Deliberately two steps. The button opens a panel; publishing happens on
// a second, separate click. This pushes to a public site, so it shouldn't
// be one stray click away from the undo button next to it.
const pubPanel = root.querySelector('.studio-publish-panel');
const pubLog = pubPanel.querySelector('.studio-pub-log');
const pubState = pubPanel.querySelector('.studio-pub-state');
const pubGo = pubPanel.querySelector('.studio-pub-go');
const pubMsg = pubPanel.querySelector('.studio-pub-msg input');
let pollTimer;

const renderJob = (data) => {
  if (data.lines?.length) {
    pubLog.hidden = false;
    pubLog.textContent = data.lines.join('\n');
    pubLog.scrollTop = pubLog.scrollHeight;
  }
  if (data.running) {
    pubState.textContent = `publishing… ${data.seconds}s`;
    pubGo.disabled = true;
  } else if (data.code === 0) {
    pubState.textContent = 'Live. GitHub Actions takes about two minutes to finish deploying.';
    pubGo.disabled = false;
    toast('published');
  } else if (data.code !== null) {
    pubState.textContent = `stopped (exit ${data.code}) — nothing was pushed if it failed before the push step`;
    pubGo.disabled = false;
  }
};

const poll = async () => {
  clearTimeout(pollTimer);
  try {
    const data = await (await fetch(`${API}/publish/status`)).json();
    renderJob(data);
    if (data.running) pollTimer = setTimeout(poll, 700);
  } catch { /* server went away; the panel keeps its last state */ }
};

root.querySelector('.studio-publish')?.addEventListener('click', () => {
  pubPanel.hidden = !pubPanel.hidden;
  if (!pubPanel.hidden) {
    savePanel.hidden = true;
    pubGo.textContent = 'Go live';
    pubMsg.focus();
    poll();
  }
});
root.querySelector('.studio-pub-close')?.addEventListener('click', () => { pubPanel.hidden = true; });

pubGo?.addEventListener('click', async () => {
  // The one step that reaches the public site: always ask first.
  let info = saveInfo;
  try { info = await (await fetch(`${API}/save/status`)).json(); renderSave(info); } catch {}
  const saves = info?.notLive ?? 0;
  const unsaved = info?.changes?.length ?? 0;
  const what = [
    saves ? `${saves} save${saves === 1 ? '' : 's'}` : '',
    unsaved ? `${unsaved} unsaved change${unsaved === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' and ') || 'everything on this Mac';
  if (!confirm(`Go live?\n\nThis puts ${what} on the public site (ryanstrawbridge-2.github.io). It's visible to anyone in about 2 minutes.`)) {
    pubState.textContent = 'Cancelled. Nothing was sent.';
    return;
  }
  pubGo.disabled = true;
  pubLog.hidden = false;
  pubLog.textContent = 'starting…';
  try {
    await post('/publish', { message: pubMsg.value });
    poll();
  } catch (error) {
    pubGo.disabled = false;
    pubState.textContent = error.message;
    toast(error.message, true);
  }
});

// Is the writer running? Without it the overlay would look live and do
// nothing, which is worse than not appearing at all.
fetch(`${API}/health`)
  .then((r) => r.json())
  .then((health) => { root.hidden = false; setUndo(health.undo); })
  .catch(() => {
    root.hidden = false;
    bar.classList.add('is-offline');
    bar.querySelector('.studio-hint').textContent =
      'writer not running — restart with: npm run studio';
  });

root.querySelector('.studio-off').addEventListener('click', () => { root.hidden = true; });

