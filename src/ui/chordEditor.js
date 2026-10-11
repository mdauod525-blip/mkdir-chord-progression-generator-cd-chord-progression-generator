/**
 * Chord editor sheet: audition, regenerate, lock, invert or recolour one chord.
 */
import { h, mount } from './dom.js';
import { describeChord, maxInversion, QUALITIES, chordSymbol, chordSpeller } from '../theory/chords.js';
import { guitarShapes, shapeToString } from '../theory/guitar.js';
import { guitarDiagram, pianoDiagram } from './diagrams.js';
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
export function renderChordEditor(el, { progression, index, voicing, shapeIndex = 0 }, actions) {
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
    shapesSection(chord, key, voicing, shapeIndex, d.symbol, actions),
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

function shapesSection(chord, key, voicing, shapeIndex, symbol, actions) {
  const names = chordSpeller(chord, key);
  const shapes = guitarShapes(chord, key, { limit: 3 });
  const i = shapes.length ? shapeIndex % shapes.length : 0;
  const shape = shapes[i];
  return h(
    'div',
    { class: 'shapes' },
    h(
      'div',
      { class: 'shape-card' },
      h('div', { class: 'shape-head' }, h('h4', { class: 'sheet-section' }, 'Piano'), h('small', {}, 'as played')),
      h('div', { class: 'shape-figure', html: voicing ? pianoDiagram(voicing.upper, { bass: voicing.bass, names, label: symbol }) : '' }),
    ),
    h(
      'div',
      { class: 'shape-card' },
      h(
        'div',
        { class: 'shape-head' },
        h('h4', { class: 'sheet-section' }, 'Guitar'),
        shape ? h('small', { class: 'shape-code' }, shapeToString(shape)) : null,
      ),
      h('div', { class: 'shape-figure guitar', html: guitarDiagram(shape, { names, label: symbol }) }),
      shapes.length > 1
        ? h(
            'div',
            { class: 'shape-nav' },
            h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Previous guitar shape', onclick: () => actions.setShape(i - 1 + shapes.length) }, '‹'),
            h('span', {}, `Shape ${i + 1} of ${shapes.length}`),
            h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Next guitar shape', onclick: () => actions.setShape(i + 1) }, '›'),
          )
        : null,
    ),
  );
}
