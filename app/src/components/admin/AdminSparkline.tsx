import React from 'react';

interface Props {
  data: number[];
  color: string;
  height?: number;
}

export default function AdminSparkline({ data, color, height = 30 }: Props) {
  if (data.length < 2) return null;

  const maxVal = Math.max(...data, 1);
  const minVal = Math.min(...data);
  const range = maxVal - minVal || 1;
  
  const width = 100; // viewBox units
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - minVal) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const areaPath = `0,${height} ${points} ${width},${height} Z`;

  return (
    <div className="adm-sparkline-container" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`sparkGrad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`M ${areaPath}`} fill={`url(#sparkGrad-${color.replace('#','')})`} />
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      </svg>
    </div>
  );
}
