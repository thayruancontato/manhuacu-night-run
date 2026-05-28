import React, { useState, useEffect } from 'react';

interface Segment {
  label: string;
  value: number;
  color: string;
}

interface Props {
  segments: Segment[];
  total: number;
  size: number;
  strokeWidth: number;
}

export default function AdminDonutChart({ segments, total, size = 180, strokeWidth = 32 }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    // Start animation shortly after mount
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  let accumulated = 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 30, flexWrap: 'wrap', justifyContent: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
          {/* Background circle */}
          <circle
            cx={center} cy={center} r={radius}
            fill="none" stroke="#f1f5f9"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {segments.map((seg, i) => {
            const pct = total > 0 ? seg.value / total : 0;
            const dashLen = animated ? pct * circumference : 0;
            const dashOffset = -accumulated * circumference;
            accumulated += pct;

            const isHovered = hoveredIndex === i;
            
            return (
              <circle
                key={i}
                cx={center} cy={center} r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? strokeWidth + 6 : strokeWidth}
                strokeDasharray={`${dashLen} ${circumference}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${center} ${center})`}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ 
                  transition: 'stroke-dasharray 1s cubic-bezier(0.175, 0.885, 0.32, 1), stroke-width 0.2s',
                  cursor: 'pointer',
                  filter: isHovered ? `drop-shadow(0 4px 12px ${seg.color}40)` : 'none'
                }}
              />
            );
          })}
        </svg>
        {/* Center text */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#071A45', transition: 'color 0.2s' }}>
            {hoveredIndex !== null ? segments[hoveredIndex].value.toLocaleString('pt-BR') : total.toLocaleString('pt-BR')}
          </span>
          <span style={{ fontSize: '.75rem', fontWeight: 700, color: '#64748b', transition: 'color 0.2s' }}>
            {hoveredIndex !== null ? segments[hoveredIndex].label : 'Total'}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {segments.map((seg, i) => {
          const pct = total > 0 ? ((seg.value / total) * 100).toFixed(0) : '0';
          const isHovered = hoveredIndex === i;
          return (
            <div 
              key={i} 
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              style={{ 
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: hoveredIndex === null || isHovered ? 1 : 0.4,
                transform: isHovered ? 'translateX(4px)' : 'none',
                transition: 'all 0.2s',
                cursor: 'pointer'
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: seg.color }} />
              <span style={{ color: isHovered ? '#071A45' : '#64748b', fontWeight: 700, minWidth: 80, fontSize: '0.85rem' }}>{seg.label}</span>
              <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
