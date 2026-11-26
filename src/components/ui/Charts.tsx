import React, { useState } from 'react';
import type { Machine } from '../../types';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  data: number[];
}

export function TelemetryLineChart({
  labels,
  series,
  unit = '',
  threshold,
  thresholdLabel,
  height = 200,
}: {
  labels: string[];
  series: ChartSeries[];
  unit?: string;
  threshold?: number;
  thresholdLabel?: string;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 560;
  const padLeft = 42;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 26;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const allValues = series.flatMap((s) => s.data);
  if (threshold !== undefined) allValues.push(threshold);
  const rawMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const rawMax = allValues.length > 0 ? Math.max(...allValues) : 100;
  const span = Math.max(1, rawMax - rawMin);
  const minVal = Math.max(0, rawMin - span * 0.15);
  const maxVal = rawMax + span * 0.15;

  const pointCount = Math.max(2, labels.length);
  const xFor = (i: number) => padLeft + (i / (pointCount - 1)) * chartW;
  const yFor = (v: number) =>
    padTop + chartH - ((v - minVal) / Math.max(0.001, maxVal - minVal)) * chartH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minVal + t * (maxVal - minVal));

  return (
    <div className="w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Grid lines */}
        {ticks.map((tick, idx) => {
          const y = yFor(tick);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#E5EBF1"
                strokeWidth="1"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-[#8A96A3] text-[10px] font-mono tabular-nums"
              >
                {tick >= 100 ? Math.round(tick) : tick.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Threshold line */}
        {threshold !== undefined && (
          <g>
            <line
              x1={padLeft}
              y1={yFor(threshold)}
              x2={width - padRight}
              y2={yFor(threshold)}
              stroke="#C74747"
              strokeWidth="1.25"
              strokeDasharray="4 3"
            />
            {thresholdLabel && (
              <text
                x={width - padRight - 4}
                y={yFor(threshold) - 5}
                textAnchor="end"
                className="fill-[#C74747] text-[10px] font-medium"
              >
                {thresholdLabel}
              </text>
            )}
          </g>
        )}

        {/* Series paths */}
        {series.map((s) => {
          if (s.data.length === 0) return null;
          const d = s.data
            .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`)
            .join(' ');
          return (
            <path
              key={s.key}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* X-axis labels */}
        {labels.map((lbl, idx) => {
          const step = Math.max(1, Math.floor(labels.length / 5));
          if (idx % step !== 0 && idx !== labels.length - 1) return null;
          return (
            <text
              key={idx}
              x={xFor(idx)}
              y={height - 6}
              textAnchor="middle"
              className="fill-[#8A96A3] text-[10px] font-mono tabular-nums"
            >
              {lbl.slice(0, 5)}
            </text>
          );
        })}

        {/* Hover vertical indicator & points */}
        {hoverIdx !== null && hoverIdx < labels.length && (
          <g>
            <line
              x1={xFor(hoverIdx)}
              y1={padTop}
              x2={xFor(hoverIdx)}
              y2={padTop + chartH}
              stroke="#2563A6"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            {series.map((s) => {
              const v = s.data[hoverIdx];
              if (v === undefined) return null;
              return (
                <circle
                  key={s.key}
                  cx={xFor(hoverIdx)}
                  cy={yFor(v)}
                  r="3.5"
                  fill="#FFFFFF"
                  stroke={s.color}
                  strokeWidth="2"
                />
              );
            })}
          </g>
        )}

        {/* Invisible hover columns */}
        {labels.map((_, idx) => {
          const colW = chartW / pointCount;
          return (
            <rect
              key={idx}
              x={xFor(idx) - colW / 2}
              y={padTop}
              width={colW}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
            />
          );
        })}
      </svg>

      {/* Legend + live hover readout */}
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-[#E5EBF1] text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {series.map((s) => {
            const val =
              hoverIdx !== null && s.data[hoverIdx] !== undefined
                ? s.data[hoverIdx]
                : s.data[s.data.length - 1];
            return (
              <div key={s.key} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-[2px] inline-block shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-[#667586]">{s.label}:</span>
                <span className="font-mono tabular-nums font-medium text-[#172334]">
                  {val !== undefined ? `${val}${unit ? ` ${unit}` : ''}` : '—'}
                </span>
              </div>
            );
          })}
        </div>
        <span className="text-[#8A96A3] font-mono tabular-nums">
          {hoverIdx !== null ? labels[hoverIdx] : labels[labels.length - 1] || ''}
        </span>
      </div>
    </div>
  );
}

export function StatusDistributionBar({ machines }: { machines: Machine[] }) {
  const total = Math.max(1, machines.length);
  const running = machines.filter((m) => m.status === 'running').length;
  const warning = machines.filter((m) => m.status === 'warning').length;
  const critical = machines.filter((m) => m.status === 'critical').length;
  const offline = machines.filter((m) => m.status === 'offline').length;

  const segments = [
    { label: 'Running', count: running, color: '#16836B' },
    { label: 'Warning', count: warning, color: '#D99A25' },
    { label: 'Critical', count: critical, color: '#C74747' },
    { label: 'Offline', count: offline, color: '#7B8794' },
  ];

  return (
    <div>
      <div className="h-3 w-full rounded bg-[#EAF0F6] overflow-hidden flex">
        {segments.map((seg) =>
          seg.count > 0 ? (
            <div
              key={seg.label}
              style={{
                width: `${(seg.count / total) * 100}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.label}: ${seg.count}`}
            />
          ) : null
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center justify-between text-xs border-b border-[#EAF0F6] pb-1.5">
            <span className="flex items-center gap-1.5 text-[#667586]">
              <span
                className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                style={{ backgroundColor: seg.color }}
              />
              {seg.label}
            </span>
            <span className="font-mono tabular-nums font-semibold text-[#172334]">
              {String(seg.count).padStart(2, '0')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarMetricList({
  items,
  unit = '%',
}: {
  items: { label: string; sublabel?: string; value: number; max?: number; color?: string }[];
  unit?: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const max = item.max || 100;
        const pct = Math.min(100, Math.max(0, (item.value / max) * 100));
        return (
          <div key={item.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="min-w-0 truncate">
                <span className="font-medium text-[#172334]">{item.label}</span>
                {item.sublabel && (
                  <span className="text-[#8A96A3] ml-1.5">· {item.sublabel}</span>
                )}
              </div>
              <span className="font-mono tabular-nums font-semibold text-[#172B4D] ml-2 shrink-0">
                {item.value}
                {unit}
              </span>
            </div>
            <div className="h-2 w-full bg-[#EAF0F6] rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  backgroundColor: item.color || '#2563A6',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HealthArcGauge({
  score,
  label = 'Health Score',
}: {
  score: number;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, score));
  const color =
    clamped >= 80 ? '#16836B' : clamped >= 55 ? '#D99A25' : '#C74747';
  const radius = 50;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 120 72" className="w-36 h-22">
        <path
          d="M 10 62 A 50 50 0 0 1 110 62"
          fill="none"
          stroke="#EAF0F6"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 10 62 A 50 50 0 0 1 110 62"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
        <text
          x="60"
          y="54"
          textAnchor="middle"
          className="fill-[#172B4D] text-[20px] font-semibold font-mono tabular-nums"
        >
          {clamped}%
        </text>
      </svg>
      <span className="text-xs font-medium text-[#667586] -mt-1">{label}</span>
    </div>
  );
}
