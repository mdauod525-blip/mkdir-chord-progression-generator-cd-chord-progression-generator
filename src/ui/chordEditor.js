/**
 * Chord editor sheet: audition, regenerate, lock, invert or recolour one chord.
 */
import { h, mount } from './dom.js';
import { describeChord, maxInversion, QUALITIES, chordSymbol } from '../theory/chords.js';
import { makeKey } from '../theory/scales.js';
import { qualityOptions } from '../generator/progression.js';

const INVERSION_NAMES = ['Root', '1st inv', '2nd inv', '3rd inv'];
const FUNC_TEXT = {
  diatonic: 'Diatonic – built from the key’s own scale.',
  harmonic: 'Harmonic minor – raised 7th gives a stronger pull to the tonic.',
  borrowed: 'Borrowed – taken from the parallel major/minor for extra colour.',
  secondary: 'Secondary dominant – a temporary V that points at the next chord.',
  tritone: 'Tritone substitute – a dominant a tritone away, resolving down by half step.',
};

/**
 * @param el      the sheet element
 * @param state   { progression, index }
 * @param actions { play, regenerate, toggleLock, setInversion, setQuality, select, close }
 */
export function renderChordEditor(el, { progression, index }, actions) {
  const slot = progression.slots[index];
  const chord = slot.chord;
  const key = makeKey(progression.settings.tonic, progression.settings.mode);
  const d = describeChord(chord, key);
  const n = progression.slots.length;

  const inversions = Array.from({ length: maxInversion(chord.quality) + 1 }, (_, i) => i).slice(0, 4);

  mount(
    el,
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'sheet-head' },
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Previous chord', disabled: index === 0, onclick: () => actions.select(index - 1) }, '‹'),
      h(
        'div',
        { class: 'sheet-title-wrap' },
        h('h3', { id: 'chord-sheet-title', class: 'sheet-chord' }, d.symbol),
        h('p', { class: 'sheet-meta' }, `${d.roman} · Bar ${slot.measure + 1} · ${d.qualityLabel}`),
      ),
      h('button', { type: 'button', class: 'icon-btn small', 'aria-label': 'Next chord', disabled: index === n - 1, onclick: () => actions.select(index + 1) }, '›'),
    ),
    h('p', { class: 'notes-line' }, d.notes.map((note, i) => h('span', { class: `note-pill${i === 0 ? ' root' : ''}` }, note))),
    h('p', { class: `func-text func-${chord.func}` }, FUNC_TEXT[chord.func] || ''),
    h(
      'div',
      { class: 'sheet-actions' },
      h('button', { type: 'button', class: 'action primary', onclick: actions.play, 'data-autofocus': true }, '▶︎ Play'),
      h('button', { type: 'button', class: 'action', onclick: actions.regenerate, disabled: chord.locked }, '↻ New chord'),
      h('button', { type: 'button', class: `action${chord.locked ? ' on' : ''}`, 'aria-pressed': String(chord.locked), onclick: actions.toggleLock }, chord.locked ? '🔒 Locked' : '🔓 Lock'),
    ),
    h('h4', { class: 'sheet-section' }, 'Inversion'),
    h(
      'div',
      { class: 'chip-row' },
      inversions.map((inv) => {
        const preview = chordSymbol({ ...chord, inversion: inv }, key);
        return h(
          'button',
          { type: 'button', class: `chip${chord.inversion === inv ? ' on' : ''}`, 'aria-pressed': String(chord.inversion === inv), onclick: () => actions.setInversion(inv) },
          h('span', {}, INVERSION_NAMES[inv]),
          h('small', {}, preview),
        );
      }),
    ),
    h('h4', { class: 'sheet-section' }, 'Chord type'),
    h(
      'div',
      { class: 'chip-row' },
      qualityOptions(chord).map((q) =>
        h(
          'button',
          { type: 'button', class: `chip${chord.quality === q ? ' on' : ''}`, 'aria-pressed': String(chord.quality === q), onclick: () => actions.setQuality(q) },
          h('span', {}, chordSymbol({ ...chord, quality: q, inversion: 0 }, key)),
          h('small', {}, QUALITIES[q].label),
        ),
      ),
    ),
    h('button', { type: 'button', class: 'action wide', onclick: actions.close }, 'Done'),
  );
}
