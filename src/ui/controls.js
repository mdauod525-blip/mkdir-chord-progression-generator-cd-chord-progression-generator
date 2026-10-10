/**
 * Settings panel: key, mode, meter, tempo, style and sound options.
 */
import { h, mount, segmented, select, field } from './dom.js';
import { KEY_OPTIONS } from '../theory/notes.js';
import { TIME_SIGNATURE_IDS, tempoUnitLabel, groupingLabel } from '../theory/timeSignature.js';
import { GENRES, MOODS } from '../generator/styles.js';
import { LENGTH_OPTIONS, HARMONIC_RHYTHMS } from '../generator/progression.js';
import { VOICING_STYLES } from '../theory/voicing.js';
import { INSTRUMENTS } from '../audio/synth.js';
import { PLAY_STYLES } from '../audio/transport.js';

const COMPLEXITY_LABELS = ['Simple', 'Easy', 'Colorful', 'Rich', 'Jazzy'];
export const TEMPO_RANGE = [40, 240];

/**
 * Render the controls.
 * @param container  element to render into
 * @param state      { settings, playback }
 * @param onChange   (key, value) => void
 */
export function renderControls(container, state, onChange) {
  const s = state.settings;
  const p = state.playback;
  const keyOptions = KEY_OPTIONS[s.mode].map((k) => [k, k]);

  const tempoInput = h('input', {
    type: 'range',
    id: 'tempo',
    min: TEMPO_RANGE[0],
    max: TEMPO_RANGE[1],
    step: 1,
    value: s.tempo,
    'aria-label': 'Tempo',
  });
  const tempoValue = h('output', { class: 'tempo-value', for: 'tempo', id: 'tempo-value' }, String(s.tempo));
  tempoInput.addEventListener('input', () => {
    tempoValue.textContent = tempoInput.value;
    onChange('tempo', Number(tempoInput.value));
  });

  const taps = [];
  const tapBtn = h('button', { type: 'button', class: 'mini-btn tap-btn' }, 'Tap');
  tapBtn.addEventListener('click', () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      const bpm = Math.round(Math.min(TEMPO_RANGE[1], Math.max(TEMPO_RANGE[0], 60000 / avg)));
      tempoInput.value = bpm;
      tempoValue.textContent = bpm;
      onChange('tempo', bpm);
    }
  });

  const tsOptions = TIME_SIGNATURE_IDS.map((id) => [id, id]);

  const sound = h(
    'details',
    { class: 'sound-options', open: state.soundOpen || false },
    h('summary', {}, 'Sound & voicing'),
    h(
      'div',
      { class: 'grid-2' },
      field('Voicing', select('voicing', Object.entries(VOICING_STYLES), s.voicing, (v) => onChange('voicing', v), { label: 'Voicing' })),
      field('Instrument', select('instrument', Object.entries(INSTRUMENTS), p.instrument, (v) => onChange('instrument', v), { label: 'Instrument' })),
      field('Rhythm', select('style', Object.entries(PLAY_STYLES), p.style, (v) => onChange('style', v), { label: 'Playback rhythm' })),
      field(
        'Metronome',
        h(
          'div',
          { class: 'check-row' },
          checkbox('subdivisions', 'Subdivisions', p.subdivisions, (v) => onChange('subdivisions', v)),
          checkbox('countIn', 'Count-in', p.countIn, (v) => onChange('countIn', v)),
        ),
      ),
    ),
  );
  sound.addEventListener('toggle', () => onChange('soundOpen', sound.open));

  mount(
    container,
    h(
      'div',
      { class: 'grid-2' },
      field('Key', select('tonic', keyOptions, s.tonic, (v) => onChange('tonic', v), { label: 'Key' })),
      field('Scale', segmented('mode', [['major', 'Major'], ['minor', 'Minor']], s.mode, (v) => onChange('mode', v), { label: 'Scale' })),
    ),
    field('Time signature', segmented('timeSignature', tsOptions, s.timeSignature, (v) => onChange('timeSignature', v), { label: 'Time signature', className: 'ts-grid' }), {
      hint: groupingLabel(s.timeSignature),
    }),
    field(
      'Tempo',
      h('div', { class: 'tempo-row' }, tempoInput, h('div', { class: 'tempo-display' }, h('span', { class: 'tempo-unit' }, `${tempoUnitLabel(s.timeSignature)} =`), tempoValue), tapBtn),
      { forId: 'tempo' },
    ),
    h(
      'div',
      { class: 'grid-2' },
      field('Genre', select('genre', Object.entries(GENRES).map(([k, g]) => [k, g.label]), s.genre, (v) => onChange('genre', v), { label: 'Genre' })),
      field('Mood', select('mood', Object.entries(MOODS).map(([k, m]) => [k, m.label]), s.mood, (v) => onChange('mood', v), { label: 'Mood' })),
    ),
    field(
      'Complexity',
      segmented('complexity', [1, 2, 3, 4, 5].map((n) => [n, String(n)]), s.complexity, (v) => onChange('complexity', Number(v)), { label: 'Complexity' }),
      { hint: COMPLEXITY_LABELS[s.complexity - 1] },
    ),
    h(
      'div',
      { class: 'grid-2' },
      field('Length', segmented('measures', LENGTH_OPTIONS.map((n) => [n, String(n)]), s.measures, (v) => onChange('measures', Number(v)), { label: 'Length in bars' }), { hint: 'bars' }),
      field('Chords / bar', segmented('harmonicRhythm', Object.entries(HARMONIC_RHYTHMS).map(([k, v]) => [k, k === 'auto' ? 'Auto' : k]), s.harmonicRhythm, (v) => onChange('harmonicRhythm', v), { label: 'Chords per bar' })),
    ),
    sound,
  );
}

function checkbox(name, text, checked, onChange) {
  const input = h('input', { type: 'checkbox', id: `chk-${name}`, checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'check', for: `chk-${name}` }, input, h('span', {}, text));
}

/** Update the tempo widgets without a full re-render (e.g. from transport ± buttons). */
export function syncTempo(container, tempo) {
  const input = container.querySelector('#tempo');
  const out = container.querySelector('#tempo-value');
  if (input) input.value = tempo;
  if (out) out.textContent = tempo;
}
