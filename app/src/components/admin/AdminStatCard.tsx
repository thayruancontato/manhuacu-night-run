import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface Props {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string | number;
  sub: string;
  trend?: { value: string; direction: 'up' | 'down' | 'neutral' };
}

export default function AdminStatCard({ icon, iconBg, label, value, sub, trend }: Props) {
  return (
    <div className="adm-stat-card">
      <div className="adm-stat-icon" style={{ background: iconBg }}>
        {icon}
      </div>
      <div className="adm-stat-info">
        <div className="label">{label}</div>
        <div className="value">{value}</div>
        {sub && <div className="sub">{sub}</div>}
        {trend && (
          <div className={`adm-stat-trend ${trend.direction}`}>
            {trend.direction === 'up' && <TrendingUp size={12} />}
            {trend.direction === 'down' && <TrendingDown size={12} />}
            {trend.direction === 'neutral' && <Minus size={12} />}
            {trend.value}
          </div>
        )}
      </div>
    </div>
  );
}
