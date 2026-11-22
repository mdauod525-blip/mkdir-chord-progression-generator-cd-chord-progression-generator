'use client';
// Charts follow the reference data-viz palette: one hue for single-measure charts, fixed
// categorical order (blue, orange) for two series, hairline grid, tooltips on every mark.
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { compactUsd, pct } from '@/lib/format';

const axis = { stroke: 'var(--axis)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false } as const;
const grid = <CartesianGrid stroke="var(--line)" strokeDasharray="0" vertical={false} />;
const tooltipStyle = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--ink)' },
  labelStyle: { color: 'var(--ink)', fontWeight: 600 },
  itemStyle: { color: 'var(--ink-2)' },
  cursor: { fill: 'var(--surface-2)' },
};

export function SimpleBars({ data, x, y, height = 220, valueLabel, horizontal = false }: {
  data: any[]; x: string; y: string; height?: number; valueLabel: string; horizontal?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: horizontal ? 8 : -12, bottom: 0 }}>
        {grid}
        {horizontal ? (
          <>
            <XAxis type="number" allowDecimals={false} {...axis} />
            <YAxis type="category" dataKey={x} width={130} {...axis} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} {...axis} interval={0} />
            <YAxis allowDecimals={false} {...axis} />
          </>
        )}
        <Tooltip {...tooltipStyle} formatter={(v) => [v as number, valueLabel]} />
        <Bar isAnimationActive={false} dataKey={y} name={valueLabel} fill="var(--series-1)" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MarketBars({ data }: { data: { market: string; deals: number; qualified: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke="var(--line)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...axis} />
        <YAxis type="category" dataKey="market" width={150} {...axis} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--ink-2)' }} iconType="square" />
        <Bar isAnimationActive={false} dataKey="deals" name="Analyzed" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={14} />
        <Bar isAnimationActive={false} dataKey="qualified" name="Qualified" fill="var(--series-2)" radius={[0, 4, 4, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RoiScatter({ data, onSelect }: { data: { id: string; label: string; score: number; roi: number; profit: number | null }[]; onSelect?: (id: string) => void }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
        <CartesianGrid stroke="var(--line)" />
        <XAxis type="number" dataKey="score" name="Deal score" domain={[0, 100]} {...axis} label={{ value: 'Deal score', position: 'insideBottom', offset: -2, fill: 'var(--muted)', fontSize: 11 }} />
        <YAxis type="number" dataKey="roi" name="ROI" unit="%" {...axis} />
        <ZAxis range={[70, 70]} />
        <Tooltip
          {...tooltipStyle}
          cursor={{ strokeDasharray: '3 3', stroke: 'var(--axis)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <div style={tooltipStyle.contentStyle} className="px-2.5 py-2">
                <div className="font-semibold">{p.label}</div>
                <div className="text-ink-2">Score {p.score.toFixed(0)} · ROI {pct(p.roi)} · Profit {compactUsd(p.profit)}</div>
              </div>
            );
          }}
        />
        <Scatter isAnimationActive={false} data={data} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} onClick={(d: any) => onSelect?.(d?.payload?.id ?? d?.id)} cursor="pointer" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
