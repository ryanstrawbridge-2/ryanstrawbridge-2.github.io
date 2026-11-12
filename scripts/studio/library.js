// Studio overlay: library panel.
import {
  root,
  state,
  hooks,
  API,
  HEADINGS,
  slug,
  MODE,
  bar,
  displacedNote,
  size,
  toast,
  post,
  doUndo,
  parkAltPrompt,
  label,
} from './core.js';

// -- library panel ----------------------------------------------------
// Browse portfolio-photos/ without leaving the page. Picking copies the
// file through the same pipeline as a drag-and-drop; the library itself is
// never written to.
const libPanel = root.querySelector('.studio-library');
const libFolders = root.querySelector('.studio-lib-folders');
const libGrid = root.querySelector('.studio-lib-grid');
const libSection = root.querySelector('.studio-lib-section');
const libWidth = root.querySelector('.studio-lib-width');

if (MODE === 'home') {
  // Fixed slots: there's no section to choose or width to set.
  for (const el of root.querySelectorAll('.studio-library header label')) el.hidden = true;
} else {
  libSection.appendChild(new Option('Bottom of page', ''));
  for (const id of HEADINGS) libSection.appendChild(new Option(label(id), id));
}

let libraryData = null;
let activeKey = null;
const keyOf = (group) => `${group.source}::${group.folder}`;

const SOURCE_LABEL = {
  inbox: 'Photo inbox',
  library: 'On this Mac',
  site: 'Already on the site',
  videos: 'Already on the site',
};

const renderGrid = () => {
  const group = libraryData?.groups.find((g) => keyOf(g) === activeKey);
  libGrid.replaceChildren();
  if (!group) return;

  for (const file of group.files) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'studio-lib-tile';

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    // Inbox groups are sorted by prefix, not folder, so each file carries
    // its own folder; everything else shares the group's.
    const folder = file.folder ?? group.folder;
    img.src =
      `${API}/library/thumb?source=${encodeURIComponent(group.source)}` +
      `&folder=${encodeURIComponent(folder)}` +
      `&file=${encodeURIComponent(file.name)}`;
    // Videos and anything sharp can't read still get a tile, just no preview.
    img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
    tile.appendChild(img);

    if (file.kind === 'video') {
      const kind = document.createElement('span');
      kind.className = 'badge kind';
      kind.textContent = 'Video';
      tile.appendChild(kind);
    }
    if (file.used) {
      const used = document.createElement('span');
      used.className = 'badge';
      used.textContent = group.source === 'library' || group.source === 'inbox' ? 'Added' : 'On this page';
      tile.appendChild(used);
    }

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.innerHTML = '<b></b>';
    meta.querySelector('b').textContent = file.name;
    meta.append(size(file.size));
    tile.appendChild(meta);

    tile.addEventListener('click', async () => {
      if (MODE === 'home' && !state.homeTarget) {
        toast('Hover the photo you want to change and choose Replace', true);
        return;
      }
      tile.disabled = true;
      const sectionId = libSection.value;
      try {
        const result = await post('/media', {
          source: group.source,
          folder,
          file: file.name,
          target: MODE === 'home'
            ? { kind: 'home', path: state.homeTarget }
            : state.heroTarget
              ? { kind: 'hero' }
              : state.figureTarget
                ? { kind: 'figure', figure: state.figureTarget.figure, slot: state.figureTarget.slot }
                : { kind: 'gallery', section: sectionId ? label(sectionId) : null, width: libWidth.value || null },
        });
        if (state.figureTarget) {
          libPanel.hidden = true;
          toast(`Fig. ${state.figureTarget.figure + 1} → ${file.name}${displacedNote(result.displaced)}`);
          state.figureTarget = null;
          return;
        }
        toast(
          result.hero
            ? `main photo → ${file.name}${displacedNote(result.displaced)}`
            : result.home
            ? `${state.homeTarget} → ${file.name}${displacedNote(result.displaced)}`
            : result.reused
              ? `added ${file.name} (already in the repo — not copied)`
              : result.kind === 'image'
                ? `${file.name}  ${size(result.before)} → ${size(result.after)}`
                : `${file.name} → ${result.file}`,
        );
        if (MODE === 'home') {
          libPanel.hidden = true;
          if (result.altPath) parkAltPrompt({ path: state.homeTarget, staleAlt: result.staleAlt });
        }
        if (result.hero) {
          libPanel.hidden = true;
          parkAltPrompt({ hero: true, staleAlt: result.staleAlt });
        }
      } catch (error) {
        toast(error.message, true);
        tile.disabled = false;
      }
    });

    libGrid.appendChild(tile);
  }
};

const libTarget = root.querySelector('.studio-lib-target');
const openLibrary = async ({ hero = false, figure = null, figureSlot = 'image' } = {}) => {
  state.heroTarget = MODE === 'project' && hero;
  state.figureTarget = MODE === 'project' && figure !== null ? { figure, slot: figureSlot } : null;
  libPanel.classList.toggle('is-hero', state.heroTarget);
  for (const el of root.querySelectorAll('.studio-lib-opt')) el.hidden = MODE === 'home' || state.heroTarget || !!state.figureTarget;
  libTarget.textContent = state.figureTarget
    ? `Choosing the ${state.figureTarget.slot === 'compare' ? 'after ' : state.figureTarget.slot === 'image' && document.querySelector(`figure[data-studio-figure="${figure}"] .pfig-compare`) ? 'before ' : ''}photo for Fig. ${figure + 1}`
    : state.heroTarget
    ? 'Choosing a new main photo for this project'
    : MODE === 'home'
      ? (state.homeTarget ? `Replacing ${state.homeTarget}` : 'Hover a photo on the page and choose Replace')
      : 'Pick a file to add it to this page';
  libPanel.hidden = false;
  libGrid.replaceChildren(
    Object.assign(document.createElement('p'), {
      className: 'studio-lib-empty',
      textContent: 'Reading portfolio-photos/…',
    }),
  );
  try {
    const response = await fetch(`${API}/library?slug=${encodeURIComponent(slug)}`);
    libraryData = await response.json();
  } catch {
    libGrid.replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'studio-lib-empty',
        textContent: 'Could not read the library — is npm run studio still running?',
      }),
    );
    return;
  }

  libFolders.replaceChildren();
  if (!libraryData.groups?.length) {
    libGrid.replaceChildren(
      Object.assign(document.createElement('p'), {
        className: 'studio-lib-empty',
        textContent: 'No media found.',
      }),
    );
    return;
  }

  // Group the sidebar by source so "on this Mac" and "already on the site"
  // read as two different things rather than one long folder list.
  let lastHeading = null;
  for (const group of libraryData.groups) {
    const heading = SOURCE_LABEL[group.source];
    if (heading !== lastHeading) {
      const h = document.createElement('p');
      h.className = 'studio-lib-heading';
      h.textContent = heading;
      libFolders.appendChild(h);
      lastHeading = heading;
    }

    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('span');
    name.textContent = group.label;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = String(group.files.length);
    button.append(name, count);
    if (group.current) button.dataset.current = '';
    if (group.source === 'library') button.dataset.library = '';
    button.addEventListener('click', () => {
      activeKey = keyOf(group);
      for (const sibling of libFolders.querySelectorAll('button')) {
        sibling.setAttribute('aria-current', String(sibling === button));
      }
      renderGrid();
    });
    libFolders.appendChild(button);
  }
  // How to get new photos in. Shown every time because the scheme is the
  // kind of thing you forget between editing sessions.
  const note = document.createElement('p');
  note.className = 'studio-lib-note';
  note.innerHTML =
    'New photos: drop them in <code>photo-inbox/</code> named <code>PREFIX_title</code> — ' +
    'e.g. <code>ABV_valve-test.jpg</code>. Prefixes live in <code>photo-prefixes.json</code>. ' +
    'Reopen this panel to see them.';
  libFolders.appendChild(note);

  // Open on this project's inbox if it has anything, else the first
  // archive folder — the old default.
  (libFolders.querySelector('button[data-current]')
    || libFolders.querySelector('button[data-library]')
    || libFolders.querySelector('button'))?.click();
};
hooks.openLibrary = openLibrary;

root.querySelector('.studio-library-open').addEventListener('click', () => {
  // From the bar there's no slot chosen; a stale one from an earlier
  // Replace would silently overwrite the wrong photo.
  state.homeTarget = null;
  openLibrary();
});
root.querySelector('.studio-lib-close').addEventListener('click', () => { libPanel.hidden = true; });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !libPanel.hidden) libPanel.hidden = true;

  // ⌘Z is the browser's own undo inside a text field; only claim it when
  // the caret isn't in one, or editing a caption would become impossible.
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '')
    || document.activeElement?.isContentEditable;
  if (!typing && (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    doUndo();
  }
});

