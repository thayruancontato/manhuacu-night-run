import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import {
  Users, DollarSign, Package, Gift, Calendar,
  ExternalLink, ArrowRight, Eye
} from 'lucide-react';
import AdminStatCard from '../components/admin/AdminStatCard';
import AdminDonutChart from '../components/admin/AdminDonutChart';
import AdminLineChart from '../components/admin/AdminLineChart';
import AdminActivityFeed from '../components/admin/AdminActivityFeed';
import type { Activity } from '../components/admin/AdminActivityFeed';
import { KITS } from '../types';
import { useDialog } from '../context/CustomDialogContext';
import { exportToCSV } from '../utils/exportUtils';
import { formatDateBR } from '../utils/dateUtils';
import { SkeletonBlock, SkeletonCard, SkeletonTable } from '../components/Skeleton';
import '../styles/admin.css';

export default function AdminDashboard() {
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all'); // all, 30d, 7d, month
  const navigate = useNavigate();

  const { showAlert } = useDialog();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const q = query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const filteredRegistrations = useMemo(() => {
    if (timeRange === 'all') return registrations;
    const now = new Date();
    const limit = new Date();
    if (timeRange === '7d') limit.setDate(now.getDate() - 7);
    else if (timeRange === '30d') limit.setDate(now.getDate() - 30);
    else if (timeRange === 'month') {
      limit.setDate(1);
      limit.setHours(0, 0, 0, 0);
    }
    return registrations.filter(r => {
      const ct = r.createdAt?.toDate?.();
      return ct && ct >= limit;
    });
  }, [registrations, timeRange]);

  // Stats (use filtered data)
  const total = filteredRegistrations.length;
  const pagos = filteredRegistrations.filter(r => r.paymentStatus === 'pago');
  const receita = pagos.reduce((s, r) => s + (r.amount || 0), 0);
  const kitsConfirmados = pagos.length;
  const cat5 = filteredRegistrations.filter(r => r.categoria === 'corrida_5km' || r.categoria === '5km').length;
  const cat10 = filteredRegistrations.filter(r => r.categoria === 'corrida_10km' || r.categoria === '10km').length;
  const catKids = filteredRegistrations.filter(r => r.categoria === 'kids').length;
  const catCam = filteredRegistrations.filter(r => r.categoria === 'caminhada').length;

  // Chart data â€” baseia no timeRange selecionado
  const chartData = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    const count = (timeRange === 'all' || timeRange === '30d' || timeRange === 'month') ? 30 : 7;
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const val = registrations.filter(r => {
        const ct = r.createdAt?.toDate?.();
        if (!ct) return false;
        return ct.getDate() === d.getDate() && ct.getMonth() === d.getMonth() && ct.getFullYear() === d.getFullYear();
      }).length;
      days.push({ label: dayStr, value: val });
    }
    return days;
  }, [registrations, timeRange]);

  // Atividades recentes
  const activities: Activity[] = useMemo(() => {
    return filteredRegistrations.slice(0, 5).map(r => {
      const isPago = r.paymentStatus === 'pago';
      const ct = r.createdAt?.toDate?.();
      const timeStr = ct ? formatTimeAgo(ct) : '';
      return {
        type: isPago ? 'payment' as const : 'registration' as const,
        title: isPago ? 'Novo pagamento aprovado' : 'Nova inscrição realizada',
        description: `${r.nome.split(' ')[0] || 'Atleta'} - ${r.categoria.toUpperCase() || ''}`,
        time: timeStr,
      };
    });
  }, [filteredRegistrations]);

  const recentRegs = filteredRegistrations.slice(0, 5);

  const handleExport = () => {
    if (filteredRegistrations.length === 0) return showAlert('Nenhum dado para exportar.', 'warning');
    
    exportToCSV(filteredRegistrations, 'dashboard_inscritos_mcu', [
      { header: 'Nome', key: 'nome' },
      { header: 'CPF', key: 'cpf' },
      { header: 'Modalidade', key: 'categoria', transform: (v) => v.toUpperCase() },
      { header: 'Status', key: 'paymentStatus' },
      { header: 'Data', key: 'createdAt', transform: (v) => formatDateBR(v, '') }
    ]);
  };

  // Pre-calculate derived values
  const ticketMedio = pagos.length > 0 ? receita / pagos.length : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Dashboard Administrativo</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Resumo em tempo real da MCU Night Run 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Calendar style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} size={16} />
            <select 
              value={timeRange} 
              onChange={e => setTimeRange(e.target.value)}
              style={{ background: '#fff', padding: '10px 20px 10px 40px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 700, color: '#475569', outline: 'none', cursor: 'pointer', appearance: 'none' }}
            >
              <option value="all">Todo o per?odo</option>
              <option value="month">Este m?s</option>
              <option value="30d">Últimos 30 dias</option>
              <option value="7d">Últimos 7 dias</option>
            </select>
          </div>
          <button onClick={() => window.open('https://night-run-uba.web.app', '_blank')} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            Acessar Site <ExternalLink size={16} />
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24, marginBottom: 32 }}>
        {loading ? Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i}>
            <div className="ui-skeleton-stat-top">
              <SkeletonBlock width={44} height={44} radius={12} />
              <SkeletonBlock width={72} height={24} radius={999} />
            </div>
            <SkeletonBlock height={26} width="48%" radius={999} />
            <SkeletonBlock height={12} width="62%" radius={999} style={{ marginTop: 14 }} />
            <SkeletonBlock height={10} width="44%" radius={999} style={{ marginTop: 10 }} />
          </SkeletonCard>
        )) : [
          { label: 'Inscritos', value: total, sub: `+${chartData[chartData.length-1].value || 0} hoje`, icon: Users, color: '#3b82f6' },
          { label: 'Faturamento', value: (receita / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), sub: 'Total no per?odo', icon: DollarSign, color: '#10b981' },
          { label: 'Kits Confirmados', value: kitsConfirmados, sub: `${total > 0 ? Math.round((kitsConfirmados / total) * 100) : 0}% do total`, icon: Package, color: '#f59e0b' }
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${s.color}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
                <s.icon size={22} />
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', background: '#d1fae5', padding: '4px 8px', borderRadius: 6 }}>ATIVO</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Gráfico de Inscrições */}
        <div style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45' }}>Inscrições ({timeRange === 'all' ? 'Total' : timeRange === 'month' ? 'Mensal' : timeRange === '30d' ? '30 dias' : '7 dias'})</h3>
            <button 
              onClick={handleExport} 
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Exportar CSV <ArrowRight size={14} />
            </button>
          </div>
          {loading ? <SkeletonBlock height={200} width="100%" radius={18} /> : <AdminLineChart data={chartData} height={200} />}
        </div>

        {/* Modalidades */}
        <div style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45', alignSelf: 'flex-start', marginBottom: 24 }}>Inscrições por Modalidade</h3>
          {loading ? (
            <SkeletonBlock height={180} width={180} radius={999} />
          ) : (
            <AdminDonutChart
              total={total}
              size={180}
              strokeWidth={30}
              segments={[
                { label: '5KM', value: cat5, color: '#071A45' },
                { label: '10KM', value: cat10, color: '#3b82f6' },
                { label: 'Kids', value: catKids, color: '#94a3b8' },
                { label: 'Caminhada', value: catCam, color: '#6BFF2A' },
              ]}
            />
          )}
        </div>
      </div>

      {/* Tabela de Últimas Inscrições */}
      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45' }}>Últimas Inscrições</h3>
          <button onClick={() => navigate('/admin/inscritos')} style={{ background: '#f1f5f9', border: 'none', padding: '8px 16px', borderRadius: 8, color: '#475569', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
            Ver Todos
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Atleta</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Modalidade</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Data</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} style={{ padding: 0 }}>
                    <div style={{ padding: 24 }}>
                      <SkeletonTable rows={5} columns={4} />
                    </div>
                  </td>
                </tr>
              ) : recentRegs.map(r => {
                const ct = r.createdAt?.toDate?.() || new Date();
                const isPaid = r.paymentStatus === 'pago';
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => navigate(`/admin/inscritos/${r.id}`)}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f1f5f9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {r.fotoUrl ? (
                            <img src={r.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#071A45' }}>{r.nome.slice(0, 2).toUpperCase()}</span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, color: '#071A45', fontSize: '0.9rem' }}>{r.nome}</div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>{r.categoria.toUpperCase()}</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                        background: isPaid ? '#dcfce7' : '#fef9c3',
                        color: isPaid ? '#166534' : '#854d0e'
                      }}>
                        {isPaid ? 'PAGO' : 'PENDENTE'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>
                      {formatDateBR(ct)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60) return 'Agora';
  if (diff < 3600) return `H? ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `H? ${Math.floor(diff / 3600)} hora${Math.floor(diff / 3600) > 1 ? 's' : ''}`;
  return `H? ${Math.floor(diff / 86400)} dia${Math.floor(diff / 86400) > 1 ? 's' : ''}`;
}
