import React, { useState } from 'react';

interface DataPoint {
  label: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  height: number;
  color?: string;
}

export default function AdminLineChart({ data, height = 200, color = '#6BFF2A' }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const padding = { top: 40, right: 30, bottom: 50, left: 60 };
  const chartH = height;

  const viewBoxW = 800;
  const viewBoxH = chartH;
  const gLeft = padding.left;
  const gRight = viewBoxW - padding.right;
  const gTop = padding.top;
  const gBottom = viewBoxH - padding.bottom;
  const gW = gRight - gLeft;
  const gH = gBottom - gTop;

  const points = data.map((d, i) => {
    const x = gLeft + (i / Math.max(data.length - 1, 1)) * gW;
    const y = gBottom - (d.value / maxVal) * gH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${gBottom} L ${points[0].x} ${gBottom} Z`;

  // Y-axis gridlines
  const gridLines = 5;
  const gridValues = Array.from({ length: gridLines }, (_, i) => Math.round((maxVal / (gridLines - 1)) * i));

  const activeTooltipIndex = hoveredIndex !== null ? hoveredIndex : points.length - 1;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox={`0 0 ${viewBoxW} ${viewBoxH}`} style={{ width: '100%', height: '100%', overflow: 'visible' }} preserveAspectRatio="none">
        {/* Grid lines */}
        {gridValues.map((v, i) => {
          const y = gBottom - (v / maxVal) * gH;
          return (
            <g key={i}>
              <line x1={gLeft} x2={gRight} y1={y} y2={y} stroke="#f1f5f9" strokeWidth={1} />
              <text x={gLeft - 12} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="11" fontWeight="600">{v}</text>
            </g>
          );
        })}

        {/* Area fill */}
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.2} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#areaGrad)" style={{ transition: 'all 0.3s' }} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'all 0.3s' }} />

        {/* Interaction zones */}
        {points.map((p, i) => (
          <g 
            key={i} 
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{ cursor: 'pointer' }}
          >
            <rect x={p.x - (gW / points.length) / 2} y={0} width={gW / points.length} height={viewBoxH} fill="transparent" />
            
            <circle 
              cx={p.x} cy={p.y} 
              r={hoveredIndex === i ? 6 : 4} 
              fill={color} 
              stroke="#fff"
              strokeWidth={2}
              style={{ transition: 'all 0.2s' }} 
            />
            
            {/* X labels */}
            <text x={p.x} y={gBottom + 25} textAnchor="middle" fill={hoveredIndex === i ? '#071A45' : '#94a3b8'} fontSize="10" fontWeight="700" style={{ transition: 'all 0.2s' }}>
              {p.label}
            </text>
          </g>
        ))}

        {/* Tooltip */}
        {points.length > 0 && activeTooltipIndex >= 0 && (() => {
          const active = points[activeTooltipIndex];
          const isRightSide = activeTooltipIndex > points.length / 2;
          return (
            <g style={{ pointerEvents: 'none' }}>
              <line 
                x1={active.x} x2={active.x} 
                y1={gTop} y2={gBottom} 
                stroke={color} strokeWidth={1} strokeDasharray="4 4" opacity={0.4} 
              />
              <g transform={`translate(${active.x + (isRightSide ? -110 : 10)}, ${active.y - 60})`}>
                <rect width={100} height={45} rx={12} fill="#071A45" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))' }} />
                <text x={50} y={18} textAnchor="middle" fill="white" fontSize="11" fontWeight="800">{active.label}</text>
                <text x={50} y={32} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="10" fontWeight="600">Receita: R$ {active.value.toFixed(0)}</text>
              </g>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
