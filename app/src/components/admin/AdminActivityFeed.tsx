import { CheckCircle, Gift, UserPlus, Settings } from 'lucide-react';

interface Activity {
  type: 'payment' | 'prize' | 'registration' | 'config';
  title: string;
  description: string;
  time: string;
}

interface Props {
  activities: Activity[];
}

const iconMap = {
  payment: { icon: CheckCircle, bg: 'rgba(34,197,94,.12)', color: '#22c55e' },
  prize: { icon: Gift, bg: 'rgba(168,85,247,.12)', color: '#a855f7' },
  registration: { icon: UserPlus, bg: 'rgba(59,130,246,.12)', color: '#3b82f6' },
  config: { icon: Settings, bg: 'rgba(245,158,11,.12)', color: '#f59e0b' },
};

export default function AdminActivityFeed({ activities }: Props) {
  if (activities.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', opacity: .4 }}>
        <p>Nenhuma atividade recente.</p>
      </div>
    );
  }

  return (
    <div>
      {activities.map((act, i) => {
        const cfg = iconMap[act.type] || iconMap.config;
        const Icon = cfg.icon;
        return (
          <div key={i} className="adm-activity-item">
            <div className="adm-activity-icon" style={{ background: cfg.bg }}>
              <Icon size={18} color={cfg.color} />
            </div>
            <div className="adm-activity-text">
              <div className="title">{act.title}</div>
              <div className="desc">{act.description}</div>
            </div>
            <div className="adm-activity-time">{act.time}</div>
          </div>
        );
      })}
    </div>
  );
}

export type { Activity };
