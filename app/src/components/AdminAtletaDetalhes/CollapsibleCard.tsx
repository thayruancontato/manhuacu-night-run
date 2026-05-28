import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleCardProps {
  title: string;
  icon: React.ReactNode;
  iconColor: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className: string;
  noPadding: boolean;
}

export const CollapsibleCard: React.FC<CollapsibleCardProps> = ({
  title, icon, iconColor, collapsed, onToggle, children, className = '', noPadding = false
}) => {
  return (
    <div className={`atleta-det-card ${className} ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="atleta-det-card-header" onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ color: iconColor || 'var(--adm-accent)', display: 'flex', alignItems: 'center' }}>
          {icon}
        </div>
        <h3 style={{ flex: 1 }}>{title}</h3>
        <div className="collapse-toggle-icon">
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </div>
      </div>
      {!collapsed && (
        <div className="atleta-det-card-body" style={noPadding ? { padding: 0 } : {}}>
          {children}
        </div>
      )}
    </div>
  );
};
