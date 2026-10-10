/**
 * Saved-progressions sheet.
 */
import { h, mount } from './dom.js';
import { progressionToLine } from '../export/text.js';
import { GENRES } from '../generator/styles.js';

export function renderFavorites(el, favorites, { onLoad, onDelete, onRename, onClose, currentId }) {
  const items = favorites.map((f) => {
    const s = f.progression.settings;
    const name = h('input', { class: 'fav-name', value: f.name, 'aria-label': 'Name', maxlength: 60, enterkeyhint: 'done' });
    name.addEventListener('change', () => onRename(f.id, name.value.trim() || 'Untitled progression'));
    name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
    return h(
      'li',
      { class: `fav${f.id === currentId ? ' current' : ''}` },
      h(
        'div',
        { class: 'fav-main' },
        name,
        h('p', { class: 'fav-meta' }, `${s.tonic} ${s.mode} · ${s.timeSignature} · ${s.tempo} BPM · ${GENRES[s.genre]?.label ?? s.genre}`),
        h('p', { class: 'fav-line' }, progressionToLine(f.progression)),
      ),
      h(
        'div',
        { class: 'fav-actions' },
        h('button', { type: 'button', class: 'action primary small', onclick: () => onLoad(f) }, 'Open'),
        h('button', { type: 'button', class: 'action small danger', 'aria-label': `Delete ${f.name}`, onclick: () => onDelete(f) }, 'Delete'),
      ),
    );
  });

  mount(
    el,
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head simple' }, h('h3', { id: 'favorites-title' }, 'Saved progressions'), h('button', { type: 'button', class: 'action small', onclick: onClose }, 'Close')),
    items.length
      ? h('ul', { class: 'fav-list' }, items)
      : h('p', { class: 'empty' }, 'Nothing saved yet. Tap “Save” on a progression you like and it will appear here – stored on this device only.'),
  );
}
