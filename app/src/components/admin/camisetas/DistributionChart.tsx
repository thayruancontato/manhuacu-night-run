import { TAMANHOS_CAMISETA } from '../../../types';
import { AlertTriangle } from 'lucide-react';
import AdminDonutChart from '../AdminDonutChart';

interface DistributionChartProps {
  counts: Record<string, number>;
  total: number;
}

export function DistributionChart({ counts, total }: DistributionChartProps) {
  // Cores vibrantes conforme o novo padrão visual
  const colors = [
    '#8b5cf6', // Violet
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ef4444', // Red
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#6366f1', // Indigo
    '#f97316', // Orange
    '#14b8a6', // Teal
  ];
  
  // Preparar dados para o componente AdminDonutChart
  const segments = TAMANHOS_CAMISETA.map((t, i) => ({
    label: t.label,
    value: counts[t.id] || 0,
    color: colors[i % colors.length]
  })).filter(s => s.value > 0);

  // Se não houver dados, mostrar mensagem
  if (total === 0) return (
    <div className="adm-card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center' }}>
      <div>
        <AlertTriangle size={48} color="var(--adm-text-dim)" style={{ marginBottom: 15 }} />
        <p style={{ color: 'var(--adm-text-dim)' }}>Sem dados de inscrições para exibir a distribuição.</p>
      </div>
    </div>
  );

  return (
    <div className="adm-card" style={{ height: '100%' }}>
      <div className="adm-card-header">
        <div>
          <h3 style={{ margin: 0 }}>Distribuição de tamanhos</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--adm-text-dim)' }}>Percentual de solicitação por tamanho</span>
        </div>
      </div>
      <div className="adm-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '30px 20px' }}>
        
        <AdminDonutChart 
          segments={segments}
          total={total}
          size={200}
          strokeWidth={28}
        />

        {/* Info Box */}
        <div style={{ marginTop: 'auto', padding: 15, background: 'rgba(245,158,11,0.05)', borderRadius: 12, border: '1px solid rgba(245,158,11,0.1)', display: 'flex', gap: 12 }}>
          <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ margin: '0 0 5px 0', fontSize: '0.85rem', color: '#f59e0b' }}>Atenção necessária</h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--adm-text-dim)', lineHeight: 1.4 }}>
              Alguns tamanhos estão com estoque crítico (menos de 5 unidades).
            </p>
            <button className="adm-btn-outline" style={{ marginTop: 10, padding: '4px 8px', fontSize: '0.7rem' }}>Ver detalhes</button>
          </div>
        </div>
      </div>
    </div>
  );
}
