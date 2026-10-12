/** Guitar chord diagram rendered from structured shape data. */
import { type ChordShape, diagramBaseFret, shapeToString } from '../music/guitar';

interface Props {
  shape: ChordShape | undefined;
  /** Rendered width in px (height follows). */
  width?: number;
  showFingers?: boolean;
  /** String names under the diagram (large view). */
  stringNames?: string[];
  label?: string;
}

const FRETS = 5;
const LEFT = 20;
const RIGHT = 8;
const TOP = 22;
const VBW = 100;
const FRET_H = 18;
const SPACING = (VBW - LEFT - RIGHT) / 5;

export function ChordDiagram({ shape, width = 96, showFingers = true, stringNames, label }: Props) {
  const bottom = TOP + FRETS * FRET_H;
  const vbh = bottom + (stringNames ? 16 : 6);
  if (!shape) {
    return (
      <svg className="chord-diagram" width={width} height={(width * vbh) / VBW} viewBox={`0 0 ${VBW} ${vbh}`} role="img" aria-label="No diagram available">
        <text x={VBW / 2} y={vbh / 2} textAnchor="middle" className="cd-empty">
          no shape
        </text>
      </svg>
    );
  }
  const base = diagramBaseFret(shape);
  const x = (s: number) => LEFT + s * SPACING;
  const y = (fret: number) => TOP + (fret - base + 0.5) * FRET_H;
  const aria = `${label ? `${label} chord: ` : ''}${shapeToString(shape).split('').join(' ')}${base > 1 ? `, starting at fret ${base}` : ''}`;
  const barreCovered = (s: number, f: number | null) => shape.barres.some((b) => b.fret === f && s >= b.from && s <= b.to);

  return (
    <svg className="chord-diagram" width={width} height={(width * vbh) / VBW} viewBox={`0 0 ${VBW} ${vbh}`} role="img" aria-label={aria}>
      {/* nut or position marker */}
      {base === 1 ? (
        <rect x={x(0) - 1} y={TOP - 3} width={x(5) - x(0) + 2} height={4} rx={1} className="cd-nut" />
      ) : (
        <text x={LEFT - 5} y={TOP + FRET_H * 0.68} textAnchor="end" className="cd-fretnum">
          {base}fr
        </text>
      )}
      {/* frets */}
      {Array.from({ length: FRETS + 1 }, (_, i) => (
        <line key={`f${i}`} x1={x(0)} x2={x(5)} y1={TOP + i * FRET_H} y2={TOP + i * FRET_H} className="cd-fret" />
      ))}
      {/* strings (thicker for bass strings) */}
      {Array.from({ length: 6 }, (_, s) => (
        <line key={`s${s}`} x1={x(s)} x2={x(s)} y1={TOP} y2={bottom} className="cd-string" strokeWidth={1.6 - s * 0.16} />
      ))}
      {/* open / muted markers */}
      {shape.frets.map((f, s) =>
        f === null ? (
          <g key={`m${s}`} className="cd-mute" transform={`translate(${x(s)} ${TOP - 11})`}>
            <path d="M-3.5 -3.5 L3.5 3.5 M3.5 -3.5 L-3.5 3.5" />
          </g>
        ) : f === 0 ? (
          <circle key={`o${s}`} cx={x(s)} cy={TOP - 11} r={3.6} className="cd-open" />
        ) : null,
      )}
      {/* barres */}
      {shape.barres.map((b, i) => (
        <g key={`b${i}`}>
          <rect x={x(b.from) - 5.5} y={y(b.fret) - 5.5} width={x(b.to) - x(b.from) + 11} height={11} rx={5.5} className="cd-barre" />
          {showFingers && (
            <text x={x(b.from)} y={y(b.fret) + 3.6} textAnchor="middle" className="cd-finger">
              {b.finger}
            </text>
          )}
        </g>
      ))}
      {/* finger dots */}
      {shape.frets.map((f, s) => {
        if (f === null || f === 0) return null;
        const finger = shape.fingers[s];
        const onBarre = barreCovered(s, f) && shape.barres.some((b) => b.fret === f && b.finger === finger);
        if (onBarre) return null;
        return (
          <g key={`d${s}`}>
            <circle cx={x(s)} cy={y(f)} r={5.8} className="cd-dot" />
            {showFingers && finger != null && finger !== 0 && (
              <text x={x(s)} y={y(f) + 3.6} textAnchor="middle" className="cd-finger">
                {finger}
              </text>
            )}
          </g>
        );
      })}
      {stringNames &&
        stringNames.map((n, s) => (
          <text key={`n${s}`} x={x(s)} y={bottom + 12} textAnchor="middle" className="cd-stringname">
            {n}
          </text>
        ))}
    </svg>
  );
}
