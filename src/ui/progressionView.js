/**
 * Renders the progression as measures with proportional chord blocks and a
 * beat-division ruler that reflects the time signature's grouping.
 */
import { h, mount } from './dom.js';
import { describeChord } from '../theory/chords.js';
import { makeKey } from '../theory/scales.js';
import { beatGrid } from '../theory/timeSignature.js';
import { slotsByMeasure } from '../export/text.js';

const FUNC_LABELS = {
  borrowed: 'Borrowed',
  secondary: 'Secondary dominant',
  tritone: 'Tritone substitute',
  harmonic: 'Harmonic minor',
};

/**
 * @param container  element to render into
 * @param progression
 * @param opts { selected: slot index, onSelect: (index) => void }
 */
export function renderProgression(container, progression, { selected = null, onSelect } = {}) {
  const s = progression.settings;
  const key = makeKey(s.tonic, s.mode);
  const grid = beatGrid(s.timeSignature);
  const measures = slotsByMeasure(progression);
  const wide = grid.length >= 9;

  const cards = measures.map((slots, m) =>
    h(
      'div',
      { class: `measure${wide ? ' wide' : ''}`, dataset: { measure: m } },
      h('div', { class: 'measure-num' }, String(m + 1)),
      h(
        'div',
        { class: 'measure-chords', style: { gridTemplateColumns: grid.map(() => '1fr').join(' ') } },
        slots.map((slot) => {
          const d = describeChord(slot.chord, key);
          const funcLabel = FUNC_LABELS[slot.chord.func];
          const classes = ['chord', `func-${slot.chord.func}`];
          if (slot.chord.locked) classes.push('locked');
          if (selected === slot.index) classes.push('selected');
          return h(
            'button',
            {
              type: 'button',
              class: classes.join(' '),
              dataset: { slot: slot.index },
              style: { gridColumn: `${slot.start + 1} / span ${slot.duration}` },
              'aria-label': `Bar ${m + 1}: ${d.symbol}, ${d.roman}${funcLabel ? `, ${funcLabel}` : ''}${slot.chord.locked ? ', locked' : ''}`,
              onclick: () => onSelect?.(slot.index),
            },
            h('span', { class: `chord-symbol${d.symbol.length > (slots.length > 1 ? 4 : 7) ? ' long' : ''}` }, d.symbol),
            h('span', { class: 'chord-roman' }, d.roman),
            slot.chord.locked ? h('span', { class: 'lock-mark', 'aria-hidden': 'true' }, '🔒') : null,
          );
        }),
      ),
      h(
        'div',
        { class: 'beat-ruler', style: { gridTemplateColumns: grid.map(() => '1fr').join(' ') }, 'aria-hidden': 'true' },
        grid.map((g) =>
          h(
            'span',
            {
              class: `tick${g.isBeat ? ' beat' : ''}${g.accent === 2 ? ' down' : g.accent === 1 ? ' strong' : ''}${g.isBeat && g.group > 0 ? ' group-start' : ''}`,
              dataset: { eighth: g.eighth },
            },
            h('b', {}, g.isBeat ? g.label : ''),
            h('i', {}),
          ),
        ),
      ),
    ),
  );
  mount(container, cards);
}

/** Highlight the current chord and eighth note during playback (null clears). */
export function setPlayhead(container, pos) {
  container.querySelectorAll('.chord.playing').forEach((el) => el.classList.remove('playing'));
  container.querySelectorAll('.tick.active').forEach((el) => el.classList.remove('active'));
  container.querySelectorAll('.measure.current').forEach((el) => el.classList.remove('current'));
  if (!pos || pos.countIn) return;
  const chordEl = container.querySelector(`.chord[data-slot="${pos.slotIndex}"]`);
  chordEl?.classList.add('playing');
  const measureEl = container.querySelector(`.measure[data-measure="${pos.measure}"]`);
  if (measureEl) {
    measureEl.classList.add('current');
    measureEl.querySelector(`.tick[data-eighth="${pos.eighthInMeasure}"]`)?.classList.add('active');
  }
}

export function progressionTitle(progression) {
  const s = progression.settings;
  return `${s.tonic} ${s.mode}`;
}
