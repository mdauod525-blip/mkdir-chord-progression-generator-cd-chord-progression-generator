import { useState } from 'react';
import { app, useApp } from '../state/app';
import { exportLibraryJson } from '../data/io';
import { saveTextFile } from '../ui/download';
import { ImportSheet } from './ImportSheet';
import { Term } from '../ui/Glossary';
import { toast } from '../ui/toast';
import { navigate } from '../state/router';
import { audio, AudioEngine } from '../audio/engine';

export function Settings() {
  const state = useApp();
  const [importing, setImporting] = useState(false);
  const [soundStatus, setSoundStatus] = useState<string | null>(null);

  const testSound = async () => {
    if (!AudioEngine.supported()) {
      setSoundStatus('This browser does not support Web Audio.');
      return;
    }
    const ctx = await audio.unlock();
    if (!ctx) return setSoundStatus('Audio could not start.');
    const t = audio.now() + 0.1;
    [0, 0.5, 1].forEach((d, i) => audio.click(t + d, i === 0 ? 2 : 1));
    const g: (number | null)[] = [43, 47, 50, 55, 59, 67];
    audio.warm(g.filter((n): n is number => n !== null));
    audio.strum(t + 1.5, { strings: g, stroke: 'D', accent: true });
    setSoundStatus(`Audio is ${ctx.state} (${ctx.sampleRate} Hz). You should hear three clicks, then a G chord.`);
  };
  const p = state.prefs;
  return (
    <div className="screen settings">
      <header className="screen-head">
        <h1>Settings</h1>
      </header>
      <section className="card">
        <h2 className="h2">Appearance</h2>
        <div className="seg-control" role="radiogroup" aria-label="Theme">
          {(['dark', 'light'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={p.theme === t} className={p.theme === t ? 'on' : ''} onClick={() => app.setPrefs({ theme: t })}>
              {t === 'dark' ? 'Dark (practice)' : 'Light'}
            </button>
          ))}
        </div>
        <h2 className="h2">Chord names</h2>
        <p className="muted small">When transposing, black-key chords are spelled…</p>
        <div className="seg-control" role="radiogroup" aria-label="Accidentals">
          {(['auto', 'sharp', 'flat'] as const).map((x) => (
            <button key={x} type="button" role="radio" aria-checked={p.prefer === x} className={p.prefer === x ? 'on' : ''} onClick={() => app.setPrefs({ prefer: x })}>
              {x === 'auto' ? 'To fit the key' : x === 'sharp' ? 'With sharps ♯' : 'With flats ♭'}
            </button>
          ))}
        </div>
        <label className="switch-row">
          <input type="checkbox" checked={p.numerals} onChange={(e) => app.setPrefs({ numerals: e.target.checked })} />
          <span>
            Show <Term id="roman">Roman numerals</Term> next to chords
          </span>
        </label>
      </section>

      <section className="card">
        <h2 className="h2">Sound check</h2>
        <button type="button" className="btn btn-primary" onClick={() => void testSound()}>
          Test sound
        </button>
        {soundStatus && <p className="small" role="status">{soundStatus}</p>}
        <ul className="small muted tips">
          <li>Turn the volume up with the side buttons while the sound plays.</li>
          <li>iPhone: if you still hear nothing, flip the ring/silent switch to ring (orange hidden) and try again.</li>
          <li>Bluetooth headphones can add a short delay; the app compensates for it where the browser reports it.</li>
        </ul>
      </section>

      <section className="card">
        <h2 className="h2">Your data</h2>
        <p className="muted small">
          {state.userSongs.length} song(s) and {state.userPatterns.length} pattern(s) are saved on this device
          {state.persistent ? '' : ' — but this browser blocks storage, so they will be lost when the tab closes. Export them to keep them'}. No account is needed; nothing is uploaded.
        </p>
        <div className="row gap wrap">
          <button
            type="button"
            className="btn"
            onClick={() => void saveTextFile(`strumflow-library-${new Date().toISOString().slice(0, 10)}.json`, exportLibraryJson(state.userSongs, state.userPatterns))}
            disabled={!state.userSongs.length && !state.userPatterns.length}
          >
            Export all (JSON)
          </button>
          <button type="button" className="btn" onClick={() => setImporting(true)}>
            Import…
          </button>
          <button
            type="button"
            className="btn btn-ghost danger-text"
            onClick={() => {
              if (!confirm('Delete all your songs, patterns, favorites and history from this device?')) return;
              app.clearAll();
              toast('Your data was deleted');
            }}
          >
            Delete my data
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="h2">About</h2>
        <p className="small">
          StrumFlow helps you learn songs on guitar: chord shapes, strumming, timing, and a practice player with a metronome. The built-in songs are original exercises written for
          StrumFlow; they are not transcriptions of commercial recordings. StrumFlow doesn’t include a song catalog — add songs you have the right to use.
        </p>
        <p className="small">
          The practice guitar and metronome are generated in your browser. On iPhone, audio starts after your first tap; if you hear nothing, check the volume and the silent switch.
        </p>
        <p className="small">
          Also included: <a href="./chordlab/">ChordLab</a>, a chord progression generator.
        </p>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
          Back to home
        </button>
      </section>
      <ImportSheet open={importing} onClose={() => setImporting(false)} onImported={(id) => id && navigate(`/song/${encodeURIComponent(id)}`)} store={app} />
    </div>
  );
}
