/**
 * Export sheet + helpers for copying, sharing and downloading files on iOS.
 */
import { h, mount } from './dom.js';

/** Share a file through the iOS share sheet when possible, else download it. */
export async function shareOrDownload(blob, filename) {
  const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type }) : null;
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      // Fall through to a regular download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

/** Copy text to the clipboard with a fallback for older browsers/iframes. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' }, readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export function renderExport(el, { text, onCopy, onText, onMidi, onClose }) {
  mount(
    el,
    h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head simple' }, h('h3', { id: 'export-title' }, 'Export'), h('button', { type: 'button', class: 'action small', onclick: onClose }, 'Close')),
    h('pre', { class: 'export-preview', tabindex: '0', 'aria-label': 'Chord chart preview' }, text),
    h(
      'div',
      { class: 'export-actions' },
      h('button', { type: 'button', class: 'action primary', onclick: onCopy, 'data-autofocus': true }, 'Copy chart'),
      h('button', { type: 'button', class: 'action', onclick: onText }, 'Text file (.txt)'),
      h('button', { type: 'button', class: 'action', onclick: onMidi }, 'MIDI file (.mid)'),
    ),
    h('p', { class: 'hint' }, 'MIDI includes separate chord and bass tracks with tempo, time and key signature – open it in GarageBand, Logic, Ableton or any DAW.'),
  );
}
