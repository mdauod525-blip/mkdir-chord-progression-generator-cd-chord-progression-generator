/**
 * ChordLab app controller: wires settings, generator, audio and views together.
 */
import './styles.css';
import { $ } from './ui/dom.js';
import { renderControls, syncTempo, TEMPO_RANGE } from './ui/controls.js';
import { renderProgression, setPlayhead } from './ui/progressionView.js';
import { renderChordEditor } from './ui/chordEditor.js';
import { renderFavorites } from './ui/favoritesView.js';
import { renderExport, shareOrDownload, copyText } from './ui/exportView.js';
import { openSheet, closeSheet, isSheetOpen, initSheets } from './ui/sheet.js';
import { toast } from './ui/toast.js';
import {
  generateProgression,
  regenerateChord,
  updateChord,
  normalizeSettings,
  transposeProgression,
  refitToTimeSignature,
} from './generator/progression.js';
import { GENRES, MOODS } from './generator/styles.js';
import { voiceProgression } from './theory/voicing.js';
import { describeChord } from './theory/chords.js';
import { makeKey } from './theory/scales.js';
import { normalizeTonic, toAscii } from './theory/notes.js';
import { beatsPerMeasure, beatGrid } from './theory/timeSignature.js';
import { Transport, PLAY_STYLES } from './audio/transport.js';
import { INSTRUMENTS, DEFAULT_INSTRUMENT, prepareNotes } from './audio/synth.js';
import { ARP_PATTERNS, ARP_SPEEDS } from './audio/patterns.js';
import { isAudioSupported } from './audio/engine.js';
import { progressionToText } from './export/text.js';
import { progressionToMidi } from './export/midi.js';
import { createFavoritesStore } from './storage/favorites.js';

const GENERATION_KEYS = ['genre', 'mood', 'complexity', 'measures', 'harmonicRhythm'];
const DEFAULT_PLAYBACK = { instrument: DEFAULT_INSTRUMENT, style: 'sustain', arpPattern: 'up', arpSpeed: '8', metronome: false, loop: true, subdivisions: false, countIn: false };

const store = createFavoritesStore();

/** Merge saved playback prefs with defaults, dropping values from older versions. */
function sanitizePlayback(saved = {}) {
  const p = { ...DEFAULT_PLAYBACK, ...saved };
  if (p.instrument === 'pluck') p.instrument = 'guitar';
  if (!INSTRUMENTS[p.instrument]) p.instrument = DEFAULT_INSTRUMENT;
  if (!PLAY_STYLES[p.style]) p.style = DEFAULT_PLAYBACK.style;
  if (!ARP_PATTERNS[p.arpPattern]) p.arpPattern = DEFAULT_PLAYBACK.arpPattern;
  if (!ARP_SPEEDS[p.arpSpeed]) p.arpSpeed = DEFAULT_PLAYBACK.arpSpeed;
  return p;
}
const prefs = store.loadPrefs() || {};

const state = {
  settings: normalizeSettings(prefs.settings),
  playback: sanitizePlayback(prefs.playback),
  progression: null,
  voicings: [],
  selected: null,
  soundOpen: Boolean(prefs.soundOpen),
  dirty: false,
  playing: false,
};

const els = {
  controls: $('#controls'),
  measures: $('#measures'),
  title: $('#prog-title'),
  sub: $('#prog-sub'),
  generate: $('#generate-btn'),
  play: $('#play-btn'),
  position: $('#position'),
  tempoReadout: $('#tempo-readout'),
  metronome: $('#metronome-btn'),
  loop: $('#loop-btn'),
  favCount: $('#favorites-count'),
  chordSheet: $('#chord-sheet'),
  favSheet: $('#favorites-sheet'),
  exportSheet: $('#export-sheet'),
};

const transport = new Transport({
  onPosition: (pos) => {
    setPlayhead(els.measures, pos);
    if (!pos) els.position.textContent = 'Ready';
    else if (pos.countIn) els.position.textContent = `Count-in · ${pos.beat}`;
    else {
      const ts = state.progression.settings.timeSignature;
      const beat = currentBeat(pos.eighthInMeasure, ts);
      els.position.textContent = `Bar ${pos.measure + 1}/${state.progression.settings.measures} · Beat ${beat}/${beatsPerMeasure(ts)}`;
    }
  },
  onStateChange: (playing) => {
    state.playing = playing;
    els.play.classList.toggle('is-playing', playing);
    els.play.setAttribute('aria-label', playing ? 'Stop' : 'Play');
    if (!playing) els.position.textContent = 'Ready';
  },
});

function currentBeat(eighth, ts) {
  return (beatGrid(ts)[eighth]?.group ?? 0) + 1;
}

/* ------------------------------------------------------------- persistence */

let persistTimer = null;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    store.savePrefs({ settings: state.settings, playback: state.playback, soundOpen: state.soundOpen, last: state.progression });
  }, 250);
}

function isValidProgression(p) {
  try {
    const s = normalizeSettings(p.settings);
    const key = makeKey(s.tonic, s.mode);
    return Array.isArray(p.slots) && p.slots.length > 0 && p.slots.every((slot) => describeChord(slot.chord, key).symbol);
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------- rendering */

function revoice() {
  const p = state.progression;
  const key = makeKey(p.settings.tonic, p.settings.mode);
  state.voicings = voiceProgression(p.slots.map((s) => s.chord), key, p.settings.voicing);
  if (state.playing) transport.setProgression(p, state.voicings);
  warmInstrument();
}

/** Pre-render the current instrument's notes in the background so playback starts instantly. */
function warmInstrument() {
  const notes = state.voicings.flatMap((v) => [v.bass, ...v.upper]);
  return prepareNotes(state.playback.instrument, notes);
}

function renderSettings() {
  const focusedId = document.activeElement?.id;
  renderControls(els.controls, { settings: state.settings, playback: state.playback, soundOpen: state.soundOpen }, onSettingChange);
  if (focusedId && els.controls.contains(document.getElementById(focusedId))) document.getElementById(focusedId).focus({ preventScroll: true });
  els.tempoReadout.textContent = state.settings.tempo;
}

function renderProgressionArea() {
  const p = state.progression;
  const s = p.settings;
  els.title.textContent = `${s.tonic} ${s.mode}`;
  els.sub.textContent = `${s.timeSignature} · ${s.tempo} BPM · ${GENRES[s.genre].label} · ${MOODS[s.mood].label} · ${s.measures} bars`;
  renderProgression(els.measures, p, { selected: isSheetOpen(els.chordSheet) ? state.selected : null, onSelect: openChordEditor });
}

function renderGenerateButton() {
  els.generate.classList.toggle('dirty', state.dirty);
  els.generate.querySelector('span').textContent = state.dirty ? 'Generate with new settings' : 'Generate progression';
}

function renderFavCount() {
  const n = store.list().length;
  els.favCount.hidden = n === 0;
  els.favCount.textContent = String(n);
}

function renderTransportToggles() {
  els.metronome.setAttribute('aria-pressed', String(state.playback.metronome));
  els.loop.setAttribute('aria-pressed', String(state.playback.loop));
}

function setProgression(p) {
  state.progression = p;
  revoice();
  renderProgressionArea();
  if (isSheetOpen(els.chordSheet) && state.selected !== null) renderEditor();
  persist();
}

/* --------------------------------------------------------------- actions */

function generate() {
  const previous = state.progression;
  const p = generateProgression(state.settings, { previous });
  state.dirty = false;
  renderGenerateButton();
  setProgression(p);
  const locked = p.slots.filter((s) => s.chord.locked).length;
  toast(locked ? `New progression · kept ${locked} locked chord${locked > 1 ? 's' : ''}` : 'New progression generated');
}

function setTempo(bpm) {
  const tempo = Math.round(Math.min(TEMPO_RANGE[1], Math.max(TEMPO_RANGE[0], bpm)));
  state.settings.tempo = tempo;
  state.progression = { ...state.progression, settings: { ...state.progression.settings, tempo } };
  transport.setOptions({ tempo });
  els.tempoReadout.textContent = tempo;
  syncTempo(els.controls, tempo);
  els.sub.textContent = els.sub.textContent.replace(/\d+ BPM/, `${tempo} BPM`);
  persist();
}

function onSettingChange(key, value) {
  const s = state.settings;
  switch (key) {
    case 'tempo':
      setTempo(value);
      return;
    case 'tonic':
      s.tonic = value;
      setProgression(transposeProgression(state.progression, value));
      break;
    case 'mode':
      s.mode = value;
      s.tonic = normalizeTonic(s.tonic, value);
      renderSettings();
      generate();
      return;
    case 'timeSignature':
      s.timeSignature = value;
      setProgression(refitToTimeSignature(state.progression, value));
      renderSettings();
      break;
    case 'voicing':
      s.voicing = value;
      setProgression({ ...state.progression, settings: { ...state.progression.settings, voicing: value } });
      break;
    case 'instrument':
      state.playback.instrument = value;
      transport.setOptions({ instrument: value });
      warmInstrument().then(() => {
        if (!state.playing && state.voicings[0]) transport.preview(state.voicings[0], { duration: 1.2 });
      });
      break;
    case 'style':
      state.playback.style = value;
      transport.setOptions({ style: value });
      renderSettings();
      break;
    case 'arpPattern':
    case 'arpSpeed':
    case 'subdivisions':
    case 'countIn':
      state.playback[key] = value;
      transport.setOptions({ [key]: value });
      break;
    case 'soundOpen':
      state.soundOpen = value;
      break;
    default:
      if (GENERATION_KEYS.includes(key)) {
        s[key] = value;
        const ps = state.progression.settings;
        state.dirty = GENERATION_KEYS.some((k) => String(ps[k]) !== String(s[k])) || ps.mode !== s.mode;
        renderGenerateButton();
        renderSettings();
      }
  }
  persist();
}

async function togglePlay() {
  if (!isAudioSupported()) {
    toast('Audio playback is not supported in this browser');
    return;
  }
  if (state.playing) {
    transport.stop();
    return;
  }
  await warmInstrument();
  await transport.play(state.progression, state.voicings, { ...state.playback, tempo: state.settings.tempo });
}

/* ------------------------------------------------------------ chord editor */

function renderEditor() {
  renderChordEditor(
    els.chordSheet,
    { progression: state.progression, index: state.selected },
    {
      play: () => transport.preview(state.voicings[state.selected]),
      regenerate: () => {
        setProgression(regenerateChord(state.progression, state.selected));
        transport.preview(state.voicings[state.selected]);
      },
      toggleLock: () => {
        const c = state.progression.slots[state.selected].chord;
        setProgression(updateChord(state.progression, state.selected, { locked: !c.locked }));
        toast(c.locked ? 'Chord unlocked' : 'Chord locked – it will survive “Generate”');
      },
      setInversion: (inversion) => {
        setProgression(updateChord(state.progression, state.selected, { inversion }));
        transport.preview(state.voicings[state.selected]);
      },
      setQuality: (quality) => {
        setProgression(updateChord(state.progression, state.selected, { quality }));
        transport.preview(state.voicings[state.selected]);
      },
      select: (i) => openChordEditor(i),
      close: closeSheet,
    },
  );
}

function openChordEditor(index) {
  state.selected = index;
  renderEditor();
  openSheet(els.chordSheet, {
    onClose: () => {
      state.selected = null;
      renderProgressionArea();
    },
  });
  renderProgressionArea();
  if (!state.playing) transport.preview(state.voicings[index]);
}

/* ------------------------------------------------------- favorites/export */

function defaultName(p) {
  const s = p.settings;
  return `${GENRES[s.genre].label} in ${s.tonic} ${s.mode}`;
}

function saveFavorite() {
  const existing = store.list().find((f) => f.id === state.progression.id);
  store.save(state.progression, existing?.name || defaultName(state.progression));
  renderFavCount();
  toast(existing ? 'Saved changes to favorites' : 'Saved to favorites ★');
}

function openFavorites() {
  const render = () =>
    renderFavorites(els.favSheet, store.list(), {
      currentId: state.progression.id,
      onLoad: (f) => {
        state.settings = normalizeSettings({ ...state.settings, ...f.progression.settings });
        state.dirty = false;
        closeSheet();
        renderSettings();
        renderGenerateButton();
        setProgression(f.progression);
        toast(`Opened “${f.name}”`);
      },
      onDelete: (f) => {
        store.remove(f.id);
        renderFavCount();
        render();
        toast('Deleted');
      },
      onRename: (id, name) => {
        store.rename(id, name);
        toast('Renamed');
      },
      onClose: closeSheet,
    });
  render();
  openSheet(els.favSheet);
}

function fileBase() {
  const s = state.progression.settings;
  return `chordlab-${toAscii(s.tonic)}-${s.mode}-${s.genre}-${s.timeSignature.replace('/', '-')}`.toLowerCase();
}

function openExport() {
  const text = progressionToText(state.progression);
  renderExport(els.exportSheet, {
    text,
    onCopy: async () => toast((await copyText(text)) ? 'Chord chart copied' : 'Copy failed – select the text instead'),
    onText: async () => {
      const r = await shareOrDownload(new Blob([text], { type: 'text/plain' }), `${fileBase()}.txt`);
      if (r !== 'cancelled') toast('Text file ready');
    },
    onMidi: async () => {
      const bytes = progressionToMidi(state.progression, state.voicings, { instrument: state.playback.instrument });
      const r = await shareOrDownload(new Blob([bytes], { type: 'audio/midi' }), `${fileBase()}.mid`);
      if (r !== 'cancelled') toast('MIDI file ready');
    },
    onClose: closeSheet,
  });
  openSheet(els.exportSheet);
}

/* ------------------------------------------------------------------ init */

function bind() {
  els.generate.addEventListener('click', generate);
  els.play.addEventListener('click', togglePlay);
  $('#tempo-down').addEventListener('click', () => setTempo(state.settings.tempo - 1));
  $('#tempo-up').addEventListener('click', () => setTempo(state.settings.tempo + 1));
  els.metronome.addEventListener('click', () => {
    state.playback.metronome = !state.playback.metronome;
    transport.setOptions({ metronome: state.playback.metronome });
    renderTransportToggles();
    persist();
  });
  els.loop.addEventListener('click', () => {
    state.playback.loop = !state.playback.loop;
    transport.setOptions({ loop: state.playback.loop });
    renderTransportToggles();
    persist();
  });
  $('#save-btn').addEventListener('click', saveFavorite);
  $('#export-btn').addEventListener('click', openExport);
  $('#favorites-btn').addEventListener('click', openFavorites);
  document.addEventListener('keydown', (e) => {
    const tag = e.target?.tagName;
    if (e.code === 'Space' && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tag) && !document.body.classList.contains('sheet-open')) {
      e.preventDefault();
      togglePlay();
    }
  });
  initSheets();
}

function init() {
  state.progression = prefs.last && isValidProgression(prefs.last) ? prefs.last : generateProgression(state.settings);
  // Keep the live settings in sync with the restored progression.
  for (const k of ['tonic', 'mode', 'timeSignature', 'tempo', 'voicing']) state.settings[k] = state.progression.settings[k];
  state.progression = { ...state.progression, settings: normalizeSettings(state.progression.settings) };
  state.dirty = GENERATION_KEYS.some((k) => String(state.progression.settings[k]) !== String(state.settings[k]));
  transport.setOptions({ ...state.playback, tempo: state.settings.tempo });
  bind();
  renderSettings();
  renderGenerateButton();
  renderTransportToggles();
  renderFavCount();
  revoice();
  renderProgressionArea();
  persist();
  document.body.classList.add('ready');
}

init();

// Expose a tiny hook for automated browser checks.
window.__chordlab = { state, transport };
