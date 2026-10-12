/** Expanded chord view: big diagram, fingering, notes, explanation and sound. */
import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { ChordDiagram } from './ChordDiagram';
import { Term } from './Glossary';
import { IconSpeaker } from './icons';
import { type ChordShape, type Tuning, STANDARD, describeFingering, shapesForChord, tuningNotes, isStandardTuning } from '../music/guitar';
import { chordTones, describeChordName, displayChord, parseChord, qualityOf } from '../music/chords';
import { noteName } from '../music/notes';
import { type Key, romanNumeral } from '../music/keys';
import { audio } from '../audio/engine';

interface Props {
  symbol: string | null;
  onClose: () => void;
  tuning?: Tuning;
  capo?: number;
  songShapes?: Record<string, ChordShape>;
  songKey?: Key | null;
}

export function ChordDetail({ symbol, onClose, tuning = STANDARD, capo = 0, songShapes, songKey }: Props) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [symbol]);
  if (!symbol) return null;
  const chord = parseChord(symbol);
  const shapes = shapesForChord(symbol, tuning, songShapes);
  const shape = shapes[Math.min(index, shapes.length - 1)];

  const play = async (arpeggio = false) => {
    if (!shape) return;
    await audio.unlock();
    const strings = shape.frets.map((f, i) => (f === null ? null : tuning.notes[i] + f + capo));
    audio.warm(strings.filter((n): n is number => n !== null));
    const t = audio.now() + 0.05;
    if (arpeggio) {
      strings.forEach((n, i) => {
        if (n === null) return;
        const only = strings.map((m, j) => (j === i ? m : null));
        audio.strum(t + i * 0.28, { strings: only, stroke: 'D', accent: false });
      });
    } else audio.strum(t, { strings, stroke: 'D', accent: true });
  };

  return (
    <Sheet open title={displayChord(symbol)} onClose={onClose}>
      <div className="chord-detail">
        <div className="chord-detail-diagram">
          <ChordDiagram shape={shape} width={220} stringNames={tuningNotes(tuning)} label={displayChord(symbol)} />
          {shapes.length > 1 && (
            <div className="voicing-switch" role="group" aria-label="Voicings">
              {shapes.map((s, i) => (
                <button key={i} type="button" className={`chip${i === index ? ' chip-on' : ''}`} onClick={() => setIndex(i)} aria-pressed={i === index}>
                  {s.label ?? `Shape ${i + 1}`}
                </button>
              ))}
            </div>
          )}
          {shape && (
            <div className="row gap">
              <button type="button" className="btn btn-primary" onClick={() => play(false)}>
                <IconSpeaker size={18} /> Strum
              </button>
              <button type="button" className="btn" onClick={() => play(true)}>
                Note by note
              </button>
            </div>
          )}
        </div>
        <div className="chord-detail-text">
          {chord && (
            <>
              <p className="chord-fullname">
                {describeChordName(chord)}
                {songKey && <span className="muted"> · {romanNumeral(symbol, songKey)} in {noteName(songKey.tonic, 'unicode')}{songKey.mode === 'minor' ? ' minor' : ' major'}</span>}
              </p>
              <p className="muted">
                Notes: {chordTones(chord).map((n) => noteName(n, 'unicode')).join(' · ')}
                {chord.bass && ` (bass ${noteName(chord.bass, 'unicode')})`}
              </p>
              <p>{qualityOf(chord).sound}</p>
            </>
          )}
          {shape ? (
            <>
              <h3 className="h3">How to play it</h3>
              <ol className="steps">
                {describeFingering(shape).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {shape.barres.length > 0 && (
                <p className="muted small">
                  This is a <Term id="barre">barre chord</Term>. If it buzzes, check each string one at a time.
                </p>
              )}
              {shape.source === 'search' && <p className="muted small">Shape found by StrumFlow's fretboard search — finger numbers are up to you.</p>}
            </>
          ) : (
            <p className="muted">No guitar shape found for this chord.</p>
          )}
          {!isStandardTuning(tuning) && <p className="muted small">Shapes are for {tuning.name} tuning ({tuningNotes(tuning).join(' ')}).</p>}
          {capo > 0 && <p className="muted small">With the capo on fret {capo}, fret numbers are counted from the capo.</p>}
          <p className="small">
            <Term id="diagram">How to read chord diagrams</Term>
          </p>
        </div>
      </div>
    </Sheet>
  );
}
