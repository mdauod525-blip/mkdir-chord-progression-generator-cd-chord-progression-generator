/** Import songs from a JSON file or a pasted plain-text chord sheet. */
import { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { importText, type ImportResult } from '../data/io';
import type { AppStore } from '../state/app';
import { DEMO_SONGS } from '../data/demos';
import { newId } from '../data/song';
import { toast } from '../ui/toast';

const EXAMPLE = `Title: Paper Boats
Artist: Me
Key: D
BPM: 72
Time: 3/4

[Verse]
| D | A | Bm G | G |

[Chorus]
G        D
words go under chords`;

export function ImportSheet({ open, onClose, onImported, store }: { open: boolean; onClose: () => void; onImported: (firstId: string | null) => void; store: AppStore }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const run = (input: string) => {
    const r = importText(input);
    setResult(r);
    if (!r.songs.length && !r.patterns.length) return;
    const taken = new Set([...store.getSnapshot().userSongs.map((s) => s.id), ...DEMO_SONGS.map((s) => s.id)]);
    let firstId: string | null = null;
    let saved = 0;
    for (const s of r.songs) {
      // Never overwrite an existing song or a demo: give clashing imports a new id.
      const id = taken.has(s.id) || s.id.startsWith('demo-') ? newId('song') : s.id;
      try {
        store.saveSong({ ...s, id });
        saved++;
        firstId ??= id;
      } catch (e) {
        r.errors.push((e as Error).message);
      }
    }
    for (const p of r.patterns) {
      try {
        store.savePattern(p);
      } catch (e) {
        r.errors.push((e as Error).message);
      }
    }
    setResult({ ...r });
    if (saved) {
      toast(`Imported ${saved} song${saved === 1 ? '' : 's'}`);
      if (!r.errors.length) {
        setText('');
        onClose();
        onImported(saved === 1 ? firstId : null);
      }
    } else if (r.patterns.length) toast(`Imported ${r.patterns.length} pattern(s)`);
  };

  return (
    <Sheet open={open} title="Import songs" onClose={onClose} wide>
      <p className="muted small">
        Import a StrumFlow <code>.json</code> file (exported from this app or written by hand — see the format in the project docs), or paste a plain-text chord sheet with bar lines
        (<code>| G | D Em |</code>) or chords above lyrics. Imported songs are marked as unverified.
      </p>
      <label className="btn">
        Choose a file…
        <input
          type="file"
          accept=".json,.txt,.strumflow,application/json,text/plain"
          className="visually-hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 2_000_000) {
              setResult({ songs: [], patterns: [], errors: ['That file is larger than 2 MB — is it really a song file?'], warnings: [] });
              return;
            }
            run(await file.text());
            e.target.value = '';
          }}
        />
      </label>
      <label className="field">
        <span>…or paste a chord sheet</span>
        <textarea rows={9} value={text} placeholder={EXAMPLE} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      <div className="row gap">
        <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => run(text)}>
          Import text
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setText(EXAMPLE)}>
          Show an example
        </button>
      </div>
      {result && (result.errors.length > 0 || result.warnings.length > 0) && (
        <div className="import-report">
          {result.errors.length > 0 && (
            <>
              <h3 className="h3 danger-text">Problems</h3>
              <ul>
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </>
          )}
          {result.warnings.length > 0 && (
            <>
              <h3 className="h3">Notes</h3>
              <ul>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
