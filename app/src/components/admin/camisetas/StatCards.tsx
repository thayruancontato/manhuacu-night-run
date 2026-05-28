import { Shirt, Box, CheckCircle, AlertTriangle } from 'lucide-react';
import AdminStatCard from '../AdminStatCard';

interface StatCardsProps {
  total: number;
  separadas: number;
  pendentes: number;
  semEstoque: number;
}

export function StatCards({ total, separadas, pendentes, semEstoque }: StatCardsProps) {
  const percSeparadas = total > 0 ? ((separadas / total) * 100).toFixed(1) : '0';
  const percPendentes = total > 0 ? ((pendentes / total) * 100).toFixed(1) : '0';

  return (
    <div className="adm-stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
      <AdminStatCard 
        icon={<Shirt size={22} />}
        iconBg="rgba(168,85,247,0.15)"
        label="TOTAL SOLICITADO"
        value={total.toLocaleString()}
        sub="100% do total de inscritos"
      />

      <AdminStatCard 
        icon={<Box size={22} />}
        iconBg="rgba(59,130,246,0.15)"
        label="JÁ SEPARADAS"
        value={separadas.toLocaleString()}
        sub={`${percSeparadas}% do total`}
      />

      <AdminStatCard 
        icon={<CheckCircle size={22} />}
        iconBg="rgba(34,197,94,0.15)"
        label="PENDENTES"
        value={pendentes.toLocaleString()}
        sub={`${percPendentes}% do total`}
      />

      <AdminStatCard 
        icon={<AlertTriangle size={22} />}
        iconBg="rgba(245,158,11,0.15)"
        label="SEM ESTOQUE"
        value={semEstoque.toLocaleString()}
        sub="Atenção necessária"
      />
    </div>
  );
}
