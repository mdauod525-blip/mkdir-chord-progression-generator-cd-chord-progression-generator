'use client';
import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export type MapPoint = { id: string; lat: number; lng: number; label: string; score: number | null; band?: string | null; demo?: boolean };

function color(score: number | null) {
  if (score === null) return '#898781';
  if (score >= 80) return '#0ca30c';
  if (score >= 70) return '#2a78d6';
  if (score >= 60) return '#eda100';
  return '#d03b3b';
}

// OpenStreetMap tiles (free; respect the OSM tile usage policy — self-host or use a provider at scale).
export function PropertyMap({ points, height = 320, onSelect }: { points: MapPoint[]; height?: number; onSelect?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let map: any;
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false }).setView([39.0, -77.6], 8);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const bounds: [number, number][] = [];
      for (const p of points) {
        const m = L.circleMarker([p.lat, p.lng], { radius: 7, color: '#ffffff', weight: 2, fillColor: color(p.score), fillOpacity: 0.95 }).addTo(map);
        m.bindTooltip(`${p.label}${p.demo ? ' (DEMO)' : ''}<br/>${p.score !== null ? `Score ${p.score.toFixed(0)} — ${p.band ?? ''}` : 'Not analyzed'}`);
        if (onSelect) m.on('click', () => onSelect(p.id));
        bounds.push([p.lat, p.lng]);
      }
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
      else if (bounds.length === 1) map.setView(bounds[0], 14);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, onSelect]);
  return (
    <div>
      <div ref={ref} style={{ height }} className="w-full" role="img" aria-label="Map of properties colored by deal score" />
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-2">
        {[['≥ 80 strong', 80], ['70–79 potential', 70], ['60–69 investigate', 60], ['< 60 not recommended', 0]].map(([l, s]) => (
          <span key={l as string} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color(s as number) }} />{l}</span>
        ))}
      </div>
    </div>
  );
}
