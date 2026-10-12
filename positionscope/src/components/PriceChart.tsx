'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, LineStyle, type IChartApi, type ISeriesApi, type LineData, type Time } from 'lightweight-charts';
import type { Bar } from '@/lib/types';
import { atr, bollinger, ema, macd, relativeStrengthLine, roc, rsi, sma, toWeekly, type Series } from '@/lib/indicators';
import type { LevelZone, FibReference } from '@/lib/analysis/levels';
import type { Setup } from '@/lib/analysis/setups';
import { Segmented } from './ui';

export type Overlay = 'sma20' | 'sma50' | 'sma100' | 'sma200' | 'ema20' | 'ema50' | 'ema100' | 'ema200' | 'bb' | 'levels' | 'setup' | 'fib';
export type PaneKey = 'volume' | 'rsi' | 'macd' | 'rs' | 'roc' | 'atr';
type Range = '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'All';

const MA_COLORS: Record<string, string> = { sma20: '#e8a33d', sma50: '#3b82f6', sma100: '#a855f7', sma200: '#ef4444', ema20: '#14b8a6', ema50: '#0ea5e9', ema100: '#d946ef', ema200: '#f97316' };
const OVERLAY_LABELS: Record<Overlay, string> = { sma20: 'SMA 20', sma50: 'SMA 50', sma100: 'SMA 100', sma200: 'SMA 200', ema20: 'EMA 20', ema50: 'EMA 50', ema100: 'EMA 100', ema200: 'EMA 200', bb: 'Bollinger', levels: 'S/R zones', setup: 'Entry/stop/targets', fib: 'Fibonacci' };
const PANE_LABELS: Record<PaneKey, string> = { volume: 'Volume', rsi: 'RSI 14', macd: 'MACD', rs: 'RS vs bench', roc: 'ROC', atr: 'ATR 14' };

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function line(bars: Bar[], s: Series): LineData<Time>[] {
  const out: LineData<Time>[] = [];
  s.forEach((v, i) => {
    if (v !== null && Number.isFinite(v)) out.push({ time: bars[i].time as Time, value: v });
  });
  return out;
}

function rangeStart(last: string, r: Range): string | null {
  if (r === 'All') return null;
  const d = new Date(last + 'T00:00:00Z');
  const months = { '3M': 3, '6M': 6, '1Y': 12, '3Y': 36, '5Y': 60 }[r];
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

export function PriceChart({ daily, benchmark, zones, fib, setup }: { daily: Bar[]; benchmark: Bar[]; zones: LevelZone[]; fib: FibReference | null; setup: Setup | null }) {
  const el = useRef<HTMLDivElement>(null);
  const [tf, setTf] = useState<'daily' | 'weekly'>('daily');
  const [range, setRange] = useState<Range>('1Y');
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(['sma50', 'sma200', 'levels', 'setup']));
  const [panes, setPanes] = useState<Set<PaneKey>>(new Set(['volume', 'rsi']));
  const [theme, setTheme] = useState(0);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const bars = useMemo(() => (tf === 'daily' ? daily : toWeekly(daily).bars), [daily, tf]);
  const benchBars = useMemo(() => (tf === 'daily' ? benchmark : toWeekly(benchmark).bars), [benchmark, tf]);

  useEffect(() => {
    if (!el.current || bars.length < 2) return;
    const text = css('--muted');
    const grid = css('--chart-grid');
    const border = css('--border');
    const up = css('--up');
    const down = css('--down');
    const chart: IChartApi = createChart(el.current, {
      autoSize: true,
      // Explicit locale: some environments report tags like "en-US@posix" that Intl rejects.
      localization: { locale: 'en-US' },
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: text, fontSize: 11, panes: { separatorColor: border, enableResize: false } },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, rightOffset: 4 },
      crosshair: { mode: 0 },
      handleScroll: { vertTouchDrag: false },
    });
    const closes = bars.map((b) => b.close);
    const candle: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, { upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
    candle.setData(bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));

    for (const o of overlays) {
      const m = /^(sma|ema)(\d+)$/.exec(o);
      if (m) {
        const period = Number(m[2]);
        const s = m[1] === 'sma' ? sma(closes, period) : ema(closes, period);
        chart.addSeries(LineSeries, { color: MA_COLORS[o], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, lineStyle: m[1] === 'ema' ? LineStyle.Dashed : LineStyle.Solid }).setData(line(bars, s));
      }
    }
    if (overlays.has('bb')) {
      const b = bollinger(closes, 20, 2);
      for (const s of [b.upper, b.lower]) chart.addSeries(LineSeries, { color: text, lineWidth: 1, lineStyle: LineStyle.Dotted, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }).setData(line(bars, s));
    }
    if (overlays.has('levels')) {
      for (const z of zones) {
        const color = (z.role === 'support' ? up : z.role === 'resistance' ? down : text) + '80';
        candle.createPriceLine({ price: z.high, color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: '' });
        candle.createPriceLine({ price: z.low, color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: `${z.role === 'testing' ? 'zone' : z.role === 'support' ? 'S' : 'R'} ${z.strength}` });
      }
    }
    if (overlays.has('fib') && fib) {
      for (const l of fib.levels) candle.createPriceLine({ price: l.price, color: css('--demo'), lineWidth: 1, lineStyle: LineStyle.SparseDotted, axisLabelVisible: false, title: `Fib ${(l.ratio * 100).toFixed(1)}%` });
    }
    if (overlays.has('setup') && setup) {
      const accent = css('--accent');
      candle.createPriceLine({ price: setup.entryHigh, color: accent, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'entry hi' });
      candle.createPriceLine({ price: setup.entryLow, color: accent, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'entry lo' });
      candle.createPriceLine({ price: setup.invalidation, color: down, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'invalidation' });
      setup.targets.forEach((t, i) => candle.createPriceLine({ price: t.low, color: up, lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `target ${i + 1}` }));
    }

    let pane = 0;
    if (panes.has('volume')) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(bars.map((b, i) => ({ time: b.time as Time, value: b.volume, color: (i > 0 && b.close < bars[i - 1].close ? down : up) + '55' })));
    }
    const addPane = (fn: (idx: number) => void) => {
      pane++;
      fn(pane);
    };
    if (panes.has('rsi')) addPane((p) => {
      const s = chart.addSeries(LineSeries, { color: css('--accent'), lineWidth: 1, priceLineVisible: false }, p);
      s.setData(line(bars, rsi(closes, 14)));
      s.createPriceLine({ price: 70, color: text, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: '70' });
      s.createPriceLine({ price: 30, color: text, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: '30' });
    });
    if (panes.has('macd')) addPane((p) => {
      const m = macd(closes);
      chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, p).setData(m.histogram.flatMap((v, i) => (v === null ? [] : [{ time: bars[i].time as Time, value: v, color: v >= 0 ? up : down }])));
      chart.addSeries(LineSeries, { color: css('--accent'), lineWidth: 1, priceLineVisible: false }, p).setData(line(bars, m.macd));
      chart.addSeries(LineSeries, { color: '#e8a33d', lineWidth: 1, priceLineVisible: false }, p).setData(line(bars, m.signal));
    });
    if (panes.has('rs') && benchBars.length) addPane((p) => {
      chart.addSeries(LineSeries, { color: css('--demo'), lineWidth: 1, priceLineVisible: false }, p).setData(line(bars, relativeStrengthLine(bars, benchBars)));
    });
    if (panes.has('roc')) addPane((p) => {
      const s = chart.addSeries(LineSeries, { color: '#14b8a6', lineWidth: 1, priceLineVisible: false }, p);
      s.setData(line(bars, roc(closes, tf === 'daily' ? 20 : 10)));
      s.createPriceLine({ price: 0, color: text, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: '' });
    });
    if (panes.has('atr')) addPane((p) => {
      chart.addSeries(LineSeries, { color: '#f97316', lineWidth: 1, priceLineVisible: false }, p).setData(line(bars, atr(bars, 14)));
    });
    chart.panes().forEach((pn, i) => i > 0 && pn.setHeight(90));

    const start = rangeStart(bars[bars.length - 1].time, range);
    if (start && start > bars[0].time) chart.timeScale().setVisibleRange({ from: start as Time, to: bars[bars.length - 1].time as Time });
    else chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, benchBars, overlays, panes, range, zones, fib, setup, theme, tf]);

  const toggle = <T,>(set: Set<T>, v: T, fn: (s: Set<T>) => void) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    fn(n);
  };
  const height = 300 + (panes.size - (panes.has('volume') ? 1 : 0)) * 95;
  const ranges: Range[] = ['3M', '6M', '1Y', '3Y', '5Y', 'All'];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Timeframe" value={tf} onChange={setTf} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} />
        <div className="no-scrollbar flex gap-1 overflow-x-auto" role="radiogroup" aria-label="Range">
          {ranges.map((r) => (
            <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)} className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold ${range === r ? 'bg-accent text-white' : 'bg-surface-2 text-muted'}`}>{r}</button>
          ))}
        </div>
      </div>
      <div ref={el} style={{ height }} className="w-full" aria-label={`${tf} candlestick chart`} role="img" />
      {tf === 'weekly' && <p className="mt-1 text-[11px] text-muted">Weekly bars are built from daily data; the latest week may be incomplete until Friday’s close.</p>}
      <details className="mt-2 rounded-xl bg-surface-2 p-2.5 text-sm">
        <summary className="cursor-pointer font-medium">Indicators & overlays</summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(OVERLAY_LABELS) as Overlay[]).map((o) => (
            <button key={o} aria-pressed={overlays.has(o)} onClick={() => toggle(overlays, o, setOverlays)} className={`min-h-9 rounded-lg border px-2.5 text-xs font-medium ${overlays.has(o) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted'}`}>
              {MA_COLORS[o] && <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: MA_COLORS[o] }} />}
              {OVERLAY_LABELS[o]}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(Object.keys(PANE_LABELS) as PaneKey[]).map((p) => (
            <button key={p} aria-pressed={panes.has(p)} onClick={() => toggle(panes, p, setPanes)} className={`min-h-9 rounded-lg border px-2.5 text-xs font-medium ${panes.has(p) ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted'}`}>
              {PANE_LABELS[p]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">SMA solid, EMA dashed. Zones show as paired lines (green = support, red = resistance, grey = price inside zone). Levels are computed on daily data.</p>
      </details>
    </div>
  );
}
