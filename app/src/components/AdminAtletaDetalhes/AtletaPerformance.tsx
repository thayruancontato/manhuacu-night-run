import React from 'react';
import { ArrowRight } from 'lucide-react';

interface AtletaPerformanceProps {
  // Add chart data if needed
}

export const AtletaPerformance: React.FC<AtletaPerformanceProps> = () => {
  return (
    <div className="atleta-det-perf-grid">
      <div className="perf-stats">
        <div className="perf-block">
          <span className="perf-label">Melhor tempo</span>
          <span className="perf-big-value">00:54:31</span>
        </div>
        <div className="perf-block">
          <span className="perf-label">Ritmo médio</span>
          <span className="perf-big-value">05:27</span>
          <span className="perf-unit">min/km</span>
        </div>
      </div>
      <div className="perf-chart">
        <svg viewBox="0 0 200 80" className="perf-chart-svg">
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--adm-accent)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="var(--adm-accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 60 Q20 55, 40 50 T80 35 T120 25 T160 30 T200 15"
            fill="none"
            stroke="var(--adm-accent)"
            strokeWidth="2"
          />
          <path
            d="M0 60 Q20 55, 40 50 T80 35 T120 25 T160 30 T200 15 L200 80 L0 80 Z"
            fill="url(#chartGrad)"
          />
          <circle cx="40" cy="50" r="3" fill="var(--adm-accent)" />
          <circle cx="120" cy="25" r="3" fill="var(--adm-accent)" />
          <circle cx="200" cy="15" r="3" fill="var(--adm-accent)" />

          <text x="195" y="12" fill="var(--adm-text-muted)" fontSize="6" textAnchor="end">01:20:00</text>
          <text x="195" y="32" fill="var(--adm-text-muted)" fontSize="6" textAnchor="end">01:00:00</text>
          <text x="195" y="55" fill="var(--adm-text-muted)" fontSize="6" textAnchor="end">00:40:00</text>
        </svg>
        <div className="perf-chart-labels">
          <span>ABR/24</span>
          <span>MAI/25</span>
          <span>MAI/26</span>
        </div>
      </div>
    </div>
  );
};
