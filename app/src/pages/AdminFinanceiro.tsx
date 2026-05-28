import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Wallet, TrendingUp, AlertCircle, CheckCircle, Clock, 
  Download, Search, Filter, Eye, ChevronLeft, ChevronRight,
  Calendar, ArrowRight, ArrowDownLeft, ArrowUpRight, CreditCard
} from 'lucide-react';
import { KITS } from '../types';
import AdminStatCard from '../components/admin/AdminStatCard';
import AdminDonutChart from '../components/admin/AdminDonutChart';
import AdminLineChart from '../components/admin/AdminLineChart';
import AdminSparkline from '../components/admin/AdminSparkline';
import { useDialog } from '../context/CustomDialogContext';
import { exportToCSV } from '../utils/exportUtils';
import { formatDateBR, formatDateTimeBR } from '../utils/dateUtils';
import { SkeletonBlock, SkeletonCard, SkeletonTable } from '../components/Skeleton';
import '../styles/admin.css';

const PIX_FEE_BY_PROVIDER = {
  asaas: 200,
  cora: 50,
} as const;

type PaymentProvider = keyof typeof PIX_FEE_BY_PROVIDER;

const providerOf = (registration: any): PaymentProvider => (
  registration.creditCardAsaasPaymentId ? 'asaas' : registration.paymentProvider === 'cora' ? 'cora' : 'asaas'
);

const feeOf = (registration: any) => Number(registration.paymentFee ?? PIX_FEE_BY_PROVIDER[providerOf(registration)] ?? 0);

const movementDateOf = (registration: any) => {
  const value = registration.manualPaymentConfirmedAt || registration.paymentConfirmedAt || registration.paidAt || registration.updatedAt || registration.createdAt;
  const date = value?.toDate?.() || (value ? new Date(value) : new Date());
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

export default function AdminFinanceiro() {
  const navigate = useNavigate();
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterKit, setFilterKit] = useState('todos');
  const [bankBalances, setBankBalances] = useState<any>(null);
  const [bankMovements, setBankMovements] = useState<any>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [loadingMovements, setLoadingMovements] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const { showAlert } = useDialog();
  const safeBankBalances = bankBalances || {
    asaas: { ok: false, error: '' },
    cora: { ok: false, error: '' }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { loadBankBalances(); }, []);
  useEffect(() => { loadBankMovements(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setRegs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { 
      console.error(e); 
      showAlert('Erro ao carregar dados financeiros.', 'error');
    } finally { 
      setLoading(false); 
    }
  };

  const loadBankBalances = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return;
    setLoadingBalances(true);
    try {
      const res = await fetch(`${workerUrl}/bank-balances`);
      const data = await res.json();
      setBankBalances(data);
    } catch (error) {
      console.error(error);
      setBankBalances({
        asaas: { ok: false, error: 'Erro ao consultar.' },
        cora: { ok: false, error: 'Erro ao consultar.' }
      });
    } finally {
      setLoadingBalances(false);
    }
  };

  const loadBankMovements = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return;
    setLoadingMovements(true);
    try {
      const res = await fetch(`${workerUrl}/bank-movements`);
      const data = await res.json();
      setBankMovements(data);
    } catch (error) {
      console.error(error);
      setBankMovements({
        asaas: { ok: false, error: 'Erro ao consultar extrato.', items: [] },
        cora: { ok: false, error: 'Erro ao consultar extrato.', items: [] }
      });
    } finally {
      setLoadingMovements(false);
    }
  };

  const filtered = useMemo(() => {
    return regs.filter(r => {
      const matchSearch = !search || 
        r.nome.toLowerCase().includes(search.toLowerCase()) || 
        r.cpf.includes(search) || 
        r.email.toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === 'todos' || r.paymentStatus === filterStatus;
      const matchKit = filterKit === 'todos' || r.kit === filterKit;
      return matchSearch && matchStatus && matchKit;
    });
  }, [regs, search, filterStatus, filterKit]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, filterKit]);

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const stats = useMemo(() => {
    const netOf = (registration: any) => Math.max((registration.amount || 0) - feeOf(registration), 0);
    const paymentMethodOf = (registration: any): 'card' | 'pix' => (
      registration.creditCardAsaasPaymentId || registration.paymentMethod === 'credit_card' ? 'card' : 'pix'
    );
    const byProvider = (items: any[]) => items.reduce((acc, registration) => {
      const provider = providerOf(registration);
      acc[provider] += registration.amount || 0;
      return acc;
    }, { cora: 0, asaas: 0 });
    const netByProvider = (items: any[]) => items.reduce((acc, registration) => {
      const provider = providerOf(registration);
      acc[provider] += netOf(registration);
      return acc;
    }, { cora: 0, asaas: 0 });

    const total = regs.reduce((s, r) => s + (r.amount || 0), 0);
    const totalLiquido = regs.reduce((s, r) => s + netOf(r), 0);
    const pagos = regs.filter(r => r.paymentStatus === 'pago');
    const recebido = pagos.reduce((s, r) => s + (r.amount || 0), 0);
    const recebidoLiquido = pagos.reduce((s, r) => s + netOf(r), 0);
    const pendentes = regs.filter(r => r.paymentStatus === 'pendente');
    const pendente = pendentes.reduce((s, r) => s + (r.amount || 0), 0);
    const pendenteLiquido = pendentes.reduce((s, r) => s + netOf(r), 0);
    const cancelados = regs.filter(r => r.paymentStatus === 'cancelado');
    const cancelado = cancelados.reduce((s, r) => s + (r.amount || 0), 0);
    const canceladoLiquido = cancelados.reduce((s, r) => s + netOf(r), 0);
    const emptyPaymentBucket = () => ({ count: 0, amount: 0 });
    const emptyPaymentMethodStats = () => ({
      confirmado: {
        ...emptyPaymentBucket(),
        provider: { cora: emptyPaymentBucket(), asaas: emptyPaymentBucket() }
      },
      pendente: {
        ...emptyPaymentBucket(),
        provider: { cora: emptyPaymentBucket(), asaas: emptyPaymentBucket() }
      }
    });
    const byMethodAndProvider = regs.reduce((acc, registration) => {
      const method = paymentMethodOf(registration);
      const provider = providerOf(registration);
      const statusKey = registration.paymentStatus === 'pago' ? 'confirmado' : registration.paymentStatus === 'pendente' ? 'pendente' : null;

      if (statusKey) {
        const amount = registration.amount || 0;
        acc[method][statusKey].count += 1;
        acc[method][statusKey].amount += amount;
        acc[method][statusKey].provider[provider].count += 1;
        acc[method][statusKey].provider[provider].amount += amount;
      }

      return acc;
    }, {
      pix: emptyPaymentMethodStats(),
      card: emptyPaymentMethodStats(),
    });

    const getPerc = (val: number) => total > 0 ? ((val / total) * 100).toFixed(1) : '0';

    return {
      total, totalLiquido, recebido, recebidoLiquido, pendente, pendenteLiquido, cancelado, canceladoLiquido,
      totalByProvider: byProvider(regs),
      totalNetByProvider: netByProvider(regs),
      recebidoByProvider: byProvider(pagos),
      recebidoNetByProvider: netByProvider(pagos),
      pendenteByProvider: byProvider(pendentes),
      pendenteNetByProvider: netByProvider(pendentes),
      canceladoByProvider: byProvider(cancelados),
      canceladoNetByProvider: netByProvider(cancelados),
      percRecebido: getPerc(recebido),
      percPendente: getPerc(pendente),
      percCancelado: getPerc(cancelado),
      countRecebido: pagos.length,
      countPendente: pendentes.length,
      countCancelado: cancelados.length,
      byMethodAndProvider
    };
  }, [regs]);

  const syntheticAccountHistory = useMemo(() => {
    const paid = regs
      .filter(r => r.paymentStatus === 'pago')
      .map(registration => {
        const provider = providerOf(registration);
        const date = movementDateOf(registration);
        const fee = feeOf(registration);
        return {
          registration,
          provider,
          date,
          fee,
          entrada: {
            id: `${registration.id}-entrada`,
            type: 'entrada' as const,
            provider,
            date,
            amount: Number(registration.amount || 0),
            title: registration.nome || 'Atleta',
            description: KITS.find(k => k.id === registration.kit)?.nome || registration.kit || 'Inscricao',
          },
          saida: fee > 0 ? {
            id: `${registration.id}-saida`,
            type: 'saida' as const,
            provider,
            date,
            amount: fee,
            title: `Taxa ${provider === 'cora' ? 'Cora' : 'Asaas'}`,
            description: registration.nome || 'Atleta',
          } : null,
        };
      });

    const entradas = paid
      .map(item => item.entrada)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const saidas = paid
      .map(item => item.saida)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a: any, b: any) => b.date.getTime() - a.date.getTime());

    return {
      entradas,
      saidas,
      byProvider: {
        cora: {
          entradas: entradas.filter(item => item.provider === 'cora'),
          saidas: saidas.filter((item: any) => item.provider === 'cora'),
        },
        asaas: {
          entradas: entradas.filter(item => item.provider === 'asaas'),
          saidas: saidas.filter((item: any) => item.provider === 'asaas'),
        },
      },
      entradaTotal: entradas.reduce((sum, item) => sum + item.amount, 0),
      saidaTotal: saidas.reduce((sum: number, item: any) => sum + item.amount, 0),
    };
  }, [regs]);

  const accountHistory = useMemo(() => {
    const normalizeMovement = (item: any, provider: PaymentProvider) => {
      const date = item.date ? new Date(item.date) : new Date();
      return {
        id: item.id || `${provider}-${item.type}-${item.date}-${item.amount}-${item.title}`,
        type: item.type === 'saida' ? 'saida' as const : 'entrada' as const,
        provider,
        date: Number.isNaN(date.getTime()) ? new Date() : date,
        amount: Number(item.amount || 0),
        title: item.title || (item.type === 'saida' ? `Saida ${provider === 'cora' ? 'Cora' : 'Asaas'}` : `Entrada ${provider === 'cora' ? 'Cora' : 'Asaas'}`),
        description: item.description || 'Movimentacao real do banco',
      };
    };

    const hasRealMovements = Boolean(bankMovements?.asaas?.items || bankMovements?.cora?.items);
    if (!hasRealMovements) return syntheticAccountHistory;

    const entradas = [
      ...(bankMovements?.cora?.items || []).map((item: any) => normalizeMovement(item, 'cora')),
      ...(bankMovements?.asaas?.items || []).map((item: any) => normalizeMovement(item, 'asaas')),
    ]
      .filter(item => item.type === 'entrada')
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const saidas = [
      ...(bankMovements?.cora?.items || []).map((item: any) => normalizeMovement(item, 'cora')),
      ...(bankMovements?.asaas?.items || []).map((item: any) => normalizeMovement(item, 'asaas')),
    ]
      .filter(item => item.type === 'saida')
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      entradas,
      saidas,
      byProvider: {
        cora: {
          entradas: entradas.filter(item => item.provider === 'cora'),
          saidas: saidas.filter(item => item.provider === 'cora'),
        },
        asaas: {
          entradas: entradas.filter(item => item.provider === 'asaas'),
          saidas: saidas.filter(item => item.provider === 'asaas'),
        },
      },
      entradaTotal: entradas.reduce((sum, item) => sum + item.amount, 0),
      saidaTotal: saidas.reduce((sum, item) => sum + item.amount, 0),
    };
  }, [bankMovements, syntheticAccountHistory]);

  const fmt = (v: number) => (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtBankBalance = (bank: any, provider: 'asaas' | 'cora') => {
    if (!bank) return 'Carregando...';
    if (!bank.ok) return 'Indisponível';
    let cents = Number(bank.balanceCents || 0);
    if (provider === 'cora') {
      const rawBalance = Number(bank.raw?.balance);
      if (Number.isFinite(rawBalance) && cents === rawBalance * 100) cents = rawBalance;
    }
    return fmt(cents);
  };
  const paymentMethodSummary = {
    confirmado: {
      count: stats.byMethodAndProvider.pix.confirmado.count + stats.byMethodAndProvider.card.confirmado.count,
      amount: stats.byMethodAndProvider.pix.confirmado.amount + stats.byMethodAndProvider.card.confirmado.amount,
    },
    pendente: {
      count: stats.byMethodAndProvider.pix.pendente.count + stats.byMethodAndProvider.card.pendente.count,
      amount: stats.byMethodAndProvider.pix.pendente.amount + stats.byMethodAndProvider.card.pendente.amount,
    }
  };

  // Chart data: últimos 15 dias para evolução
  const evolutionData = useMemo(() => {
    const days: { label: string; value: number }[] = [];
    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      const totalDay = regs
        .filter(r => {
          const ct = r.createdAt?.toDate?.();
          if (!ct || r.paymentStatus !== 'pago') return false;
          return ct.getDate() === d.getDate() && ct.getMonth() === d.getMonth() && ct.getFullYear() === d.getFullYear();
        })
        .reduce((s, r) => s + (r.amount || 0), 0);
      days.push({ label: dayStr, value: totalDay / 100 });
    }
    return days;
  }, [regs]);

  // Sparkline mock data
  const sparklineData = (val: number) => [val * 0.8, val * 0.9, val * 0.85, val * 1.1, val * 0.95, val * 1.05, val];

  const handleExport = () => {
    if (filtered.length === 0) return showAlert('Nenhum dado para exportar.', 'warning');
    
    exportToCSV(filtered, 'financeiro_mcu_night_run', [
      { header: 'Nome', key: 'nome' },
      { header: 'CPF', key: 'cpf' },
      { header: 'E-mail', key: 'email' },
      { header: 'Kit', key: 'kit', transform: (v) => KITS.find(k => k.id === v)?.nome || v },
      { header: 'Valor (R$)', key: 'amount', transform: (v) => (v / 100).toFixed(2) },
      { header: 'Status Pagamento', key: 'paymentStatus' },
      { header: 'Data Inscrição', key: 'createdAt', transform: (v) => formatDateBR(v, '') }
    ]);
  };

  const renderMovementList = (items: any[], type: 'entrada' | 'saida', showProviderLogo = true) => {
    const isEntrada = type === 'entrada';
    const previewLimit = 3;
    const visibleItems = items.slice(0, previewLimit);
    if (visibleItems.length === 0) {
      return (
        <div style={{ minHeight: 150, display: 'grid', placeItems: 'center', color: '#94a3b8', fontWeight: 800, textAlign: 'center' }}>
          Nenhuma movimentacao registrada.
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        {visibleItems.map(item => (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #eef2f7' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: isEntrada ? '#dcfce7' : '#fee2e2', color: isEntrada ? '#166534' : '#ef4444', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {isEntrada ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <strong style={{ color: '#071A45', fontSize: '.88rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</strong>
                  {showProviderLogo && <img src={item.provider === 'cora' ? '/cora-logo.svg' : '/asaas-logo.svg'} alt={item.provider === 'cora' ? 'Cora' : 'Asaas'} style={{ width: item.provider === 'cora' ? 38 : 46, height: 16, objectFit: 'contain', flexShrink: 0 }} />}
                </div>
                <span style={{ display: 'block', color: '#64748b', fontSize: '.74rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>{item.description}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <strong style={{ display: 'block', color: isEntrada ? '#166534' : '#ef4444', fontSize: '.9rem', fontWeight: 950 }}>{isEntrada ? '+' : '-'} {fmt(item.amount)}</strong>
              <span style={{ display: 'block', color: '#94a3b8', fontSize: '.7rem', fontWeight: 800, marginTop: 3 }}>
                {formatDateTimeBR(item.date)}
              </span>
            </div>
          </div>
        ))}
        {items.length > previewLimit && (
          <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#64748b', borderRadius: 12, padding: '10px 12px', textAlign: 'center', fontSize: '.76rem', fontWeight: 900 }}>
            + {items.length - previewLimit} movimentacoes no historico completo
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Financeiro</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Acompanhe o desempenho financeiro e o status das cobranças.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#475569', padding: '10px 20px', borderRadius: 12, fontWeight: 700, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={16} /> 01/05/2026 - 31/07/2026
          </div>
          <button 
            onClick={handleExport}
            style={{ background: '#071A45', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <Download size={18} /> Exportar Relatório
          </button>
        </div>
      </div>

      {/* Stats Quick Row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} style={{ flex: 1, minWidth: 240 }}>
            <div className="ui-skeleton-stat-top">
              <SkeletonBlock width={42} height={42} radius={12} />
              <SkeletonBlock width={80} height={24} radius={999} />
            </div>
            <SkeletonBlock height={12} width="42%" radius={999} />
            <SkeletonBlock height={24} width="54%" radius={999} style={{ marginTop: 12 }} />
            <SkeletonBlock height={10} width="36%" radius={999} style={{ marginTop: 10 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
              <SkeletonBlock height={58} width="100%" radius={10} />
              <SkeletonBlock height={58} width="100%" radius={10} />
            </div>
          </SkeletonCard>
        )) : [
          { label: 'Receita Total', value: fmt(stats.total), net: fmt(stats.totalLiquido), icon: Wallet, color: '#22c55e', sub: 'Valor total arrecadado', provider: stats.totalByProvider, providerNet: stats.totalNetByProvider },
          { label: 'Pendente', value: fmt(stats.pendente), net: fmt(stats.pendenteLiquido), icon: Clock, color: '#f59e0b', sub: stats.percPendente + '% do total', provider: stats.pendenteByProvider, providerNet: stats.pendenteNetByProvider },
          { label: 'Recebido', value: fmt(stats.recebido), net: fmt(stats.recebidoLiquido), icon: CheckCircle, color: '#3b82f6', sub: stats.percRecebido + '% do total', provider: stats.recebidoByProvider, providerNet: stats.recebidoNetByProvider },
          { label: 'Cancelado', value: fmt(stats.cancelado), net: fmt(stats.canceladoLiquido), icon: AlertCircle, color: '#ef4444', sub: stats.percCancelado + '% do total', provider: stats.canceladoByProvider, providerNet: stats.canceladoNetByProvider }
        ].map((s, i) => (
          <div key={i} style={{ background: '#fff', flex: 1, minWidth: 240, padding: '20px', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${s.color}15`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <s.icon size={22} />
                </div>
                <div style={{ width: 80, height: 24 }}><AdminSparkline data={sparklineData(100)} color={s.color} /></div>
             </div>
             <div>
               <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
               <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#071A45', marginBottom: 2 }}>{s.value}</div>
               <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', marginBottom: 4 }}>Líquido: {s.net}</div>
               <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#94a3b8' }}>{s.sub}</div>
               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                 <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '7px 8px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.62rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 3 }}>
                     <img src="/cora-logo.svg" alt="Cora" style={{ width: 34, height: 15, objectFit: 'contain' }} />
                   </div>
                   <strong style={{ color: '#071A45', fontSize: '0.76rem', fontWeight: 900 }}>{fmt(s.provider.cora)}</strong>
                 </div>
                 <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '7px 8px' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: '0.62rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 3 }}>
                     <img src="/asaas-logo.svg" alt="Asaas" style={{ width: 42, height: 15, objectFit: 'contain' }} />
                   </div>
                   <strong style={{ color: '#071A45', fontSize: '0.76rem', fontWeight: 900 }}>{fmt(s.provider.asaas)}</strong>
                 </div>
               </div>
             </div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h2 style={{ color: '#071A45', fontSize: '1.05rem', fontWeight: 950, margin: 0 }}>Pagamentos por forma</h2>
            <p style={{ color: '#64748b', fontSize: '.82rem', fontWeight: 700, margin: '4px 0 0' }}>Confirmados e pendentes por Pix e cartão, separado por banco.</p>
          </div>
          <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: 8, padding: '6px 9px', fontSize: '.72rem', fontWeight: 900 }}>
            Confirmado: {paymentMethodSummary.confirmado.count} / {fmt(paymentMethodSummary.confirmado.amount)} | Pendente: {paymentMethodSummary.pendente.count} / {fmt(paymentMethodSummary.pendente.amount)}
          </span>
        </div>
        {loading ? (
          <SkeletonTable rows={2} columns={3} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
            {[
              { key: 'pix' as const, label: 'Pix', color: '#22c55e', icon: Wallet },
              { key: 'card' as const, label: 'Cartao', color: '#3b82f6', icon: CreditCard },
            ].map(method => {
              const Icon = method.icon;
              const data = stats.byMethodAndProvider[method.key];
              const providers = [
                { key: 'cora' as const, label: 'Cora', logo: '/cora-logo.svg', width: 38 },
                { key: 'asaas' as const, label: 'Asaas', logo: '/asaas-logo.svg', width: 46 },
              ];
              return (
                <div key={method.key} style={{ border: '1px solid #eef2f7', borderRadius: 14, background: '#f8fafc', padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: `${method.color}18`, color: method.color, display: 'grid', placeItems: 'center' }}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <span style={{ display: 'block', color: '#64748b', fontSize: '.68rem', fontWeight: 950, textTransform: 'uppercase' }}>{method.label}</span>
                      <strong style={{ display: 'block', color: '#071A45', fontSize: '1.08rem', fontWeight: 950 }}>{fmt(data.confirmado.amount + data.pendente.amount)}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div style={{ background: '#ecfdf5', border: '1px solid #bbf7d0', borderRadius: 10, padding: '9px 10px' }}>
                      <span style={{ display: 'block', color: '#166534', fontSize: '.67rem', fontWeight: 950, textTransform: 'uppercase' }}>Confirmado</span>
                      <strong style={{ display: 'block', color: '#071A45', fontSize: '.84rem', fontWeight: 950, marginTop: 3 }}>{data.confirmado.count} inscr.</strong>
                      <span style={{ display: 'block', color: '#166534', fontSize: '.78rem', fontWeight: 900 }}>{fmt(data.confirmado.amount)}</span>
                    </div>
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '9px 10px' }}>
                      <span style={{ display: 'block', color: '#c2410c', fontSize: '.67rem', fontWeight: 950, textTransform: 'uppercase' }}>Pendente</span>
                      <strong style={{ display: 'block', color: '#071A45', fontSize: '.84rem', fontWeight: 950, marginTop: 3 }}>{data.pendente.count} inscr.</strong>
                      <span style={{ display: 'block', color: '#c2410c', fontSize: '.78rem', fontWeight: 900 }}>{fmt(data.pendente.amount)}</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {providers.map(provider => (
                      <div key={provider.key} style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 10, padding: '9px 10px' }}>
                        <img src={provider.logo} alt={provider.label} style={{ width: provider.width, height: 15, objectFit: 'contain', display: 'block', marginBottom: 7 }} />
                        <div style={{ display: 'grid', gap: 5 }}>
                          <div>
                            <span style={{ display: 'block', color: '#166534', fontSize: '.64rem', fontWeight: 950, textTransform: 'uppercase' }}>Confirmado</span>
                            <strong style={{ color: '#071A45', fontSize: '.78rem', fontWeight: 950 }}>{data.confirmado.provider[provider.key].count} / {fmt(data.confirmado.provider[provider.key].amount)}</strong>
                          </div>
                          <div>
                            <span style={{ display: 'block', color: '#c2410c', fontSize: '.64rem', fontWeight: 950, textTransform: 'uppercase' }}>Pendente</span>
                            <strong style={{ color: '#071A45', fontSize: '.78rem', fontWeight: 950 }}>{data.pendente.provider[provider.key].count} / {fmt(data.pendente.provider[provider.key].amount)}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 28 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <img src="/cora-logo.svg" alt="Cora" style={{ height: 20, maxWidth: 62, objectFit: 'contain' }} />
                <span style={{ color: '#64748b', fontWeight: 900, fontSize: '.72rem', textTransform: 'uppercase' }}>Saldo atual</span>
              </div>
              {loadingBalances ? (
                <SkeletonBlock width={150} height={28} radius={999} />
              ) : (
                <strong style={{ color: '#071A45', fontSize: '1.45rem', fontWeight: 950 }}>{fmtBankBalance(safeBankBalances.cora, 'cora')}</strong>
              )}
              <div style={{ marginTop: 8, color: '#64748b', fontSize: '.76rem', fontWeight: 900, textTransform: 'uppercase' }}>
                Confirmado: <span style={{ color: '#071A45' }}>{fmt(stats.recebidoByProvider.cora)}</span>
              </div>
              {!safeBankBalances.cora.ok && safeBankBalances.cora.error && <div style={{ color: '#ef4444', fontSize: '.72rem', fontWeight: 700, marginTop: 6 }}>{safeBankBalances.cora.error}</div>}
            </div>
            <button onClick={loadBankBalances} disabled={loadingBalances} style={{ background: '#f1f5f9', border: 'none', color: '#475569', padding: '8px 10px', borderRadius: 10, fontWeight: 900, cursor: loadingBalances ? 'wait' : 'pointer' }}>
              Atualizar
            </button>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <img src="/asaas-logo.svg" alt="Asaas" style={{ height: 20, maxWidth: 72, objectFit: 'contain' }} />
                <span style={{ color: '#64748b', fontWeight: 900, fontSize: '.72rem', textTransform: 'uppercase' }}>Saldo atual</span>
              </div>
              {loadingBalances ? (
                <SkeletonBlock width={150} height={28} radius={999} />
              ) : (
                <strong style={{ color: '#071A45', fontSize: '1.45rem', fontWeight: 950 }}>{fmtBankBalance(safeBankBalances.asaas, 'asaas')}</strong>
              )}
              <div style={{ marginTop: 8, color: '#64748b', fontSize: '.76rem', fontWeight: 900, textTransform: 'uppercase' }}>
                Confirmado: <span style={{ color: '#071A45' }}>{fmt(stats.recebidoByProvider.asaas)}</span>
              </div>
              {!safeBankBalances.asaas.ok && safeBankBalances.asaas.error && <div style={{ color: '#ef4444', fontSize: '.72rem', fontWeight: 700, marginTop: 6 }}>{safeBankBalances.asaas.error}</div>}
            </div>
            <button onClick={loadBankBalances} disabled={loadingBalances} style={{ background: '#f1f5f9', border: 'none', color: '#475569', padding: '8px 10px', borderRadius: 10, fontWeight: 900, cursor: loadingBalances ? 'wait' : 'pointer' }}>
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 950, color: '#071A45', margin: 0 }}>Historico das contas</h2>
            <p style={{ color: '#64748b', fontWeight: 700, margin: '4px 0 0', fontSize: '.86rem' }}>Extrato real dos bancos Cora e Asaas dos ultimos 90 dias.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ background: '#dcfce7', color: '#166534', padding: '7px 10px', borderRadius: 8, fontWeight: 900, fontSize: '.76rem' }}>Entradas: {fmt(accountHistory.entradaTotal)}</span>
            <span style={{ background: '#fee2e2', color: '#ef4444', padding: '7px 10px', borderRadius: 8, fontWeight: 900, fontSize: '.76rem' }}>Saidas: {fmt(accountHistory.saidaTotal)}</span>
            <button onClick={loadBankMovements} disabled={loadingMovements} style={{ background: '#f1f5f9', border: 'none', color: '#475569', padding: '7px 10px', borderRadius: 8, fontWeight: 900, fontSize: '.76rem', cursor: loadingMovements ? 'wait' : 'pointer' }}>
              {loadingMovements ? 'Atualizando...' : 'Atualizar extrato'}
            </button>
          </div>
        </div>
        {(bankMovements?.cora?.ok === false || bankMovements?.asaas?.ok === false) && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', padding: '10px 12px', borderRadius: 12, marginBottom: 14, fontSize: '.78rem', fontWeight: 800 }}>
            {bankMovements?.cora?.ok === false && <span>Cora: {bankMovements.cora.error || 'falha ao consultar extrato.'} </span>}
            {bankMovements?.asaas?.ok === false && <span>Asaas: {bankMovements.asaas.error || 'falha ao consultar extrato.'}</span>}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
          {([
            { id: 'cora' as const, name: 'Cora', logo: '/cora-logo.svg', logoWidth: 58 },
            { id: 'asaas' as const, name: 'Asaas', logo: '/asaas-logo.svg', logoWidth: 70 },
          ]).map(account => {
            const entradas = accountHistory.byProvider[account.id].entradas;
            const saidas = accountHistory.byProvider[account.id].saidas;
            const entradaTotal = entradas.reduce((sum, item) => sum + item.amount, 0);
            const saidaTotal = saidas.reduce((sum, item) => sum + item.amount, 0);

            return (
              <section key={account.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #eef2f7', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src={account.logo} alt={account.name} style={{ width: account.logoWidth, height: 22, objectFit: 'contain' }} />
                    <strong style={{ color: '#071A45', fontSize: '.96rem', fontWeight: 950 }}>Conta {account.name}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: '#64748b', background: '#f1f5f9', padding: '5px 8px', borderRadius: 8, fontSize: '.72rem', fontWeight: 900 }}>{entradas.length + saidas.length} registros</span>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/financeiro/${account.id}`)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#071A45', color: '#fff', border: 'none', padding: '7px 10px', borderRadius: 8, fontSize: '.72rem', fontWeight: 900, cursor: 'pointer' }}
                    >
                      Historico completo <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
                  <div style={{ background: '#dcfce7', color: '#166534', borderRadius: 10, padding: '10px 12px' }}>
                    <span style={{ display: 'block', fontSize: '.66rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>Entrada</span>
                    <strong style={{ fontSize: '.92rem', fontWeight: 950 }}>{fmt(entradaTotal)}</strong>
                  </div>
                  <div style={{ background: '#fee2e2', color: '#ef4444', borderRadius: 10, padding: '10px 12px' }}>
                    <span style={{ display: 'block', fontSize: '.66rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 4 }}>Saida</span>
                    <strong style={{ fontSize: '.92rem', fontWeight: 950 }}>{fmt(saidaTotal)}</strong>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 18 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#071A45', fontSize: '.86rem', fontWeight: 950, margin: 0 }}>
                        <ArrowDownLeft size={16} color="#166534" /> Entradas
                      </h3>
                      <span style={{ color: '#166534', background: '#dcfce7', padding: '4px 7px', borderRadius: 8, fontSize: '.68rem', fontWeight: 900 }}>{entradas.length}</span>
                    </div>
                    {loading || loadingMovements ? <SkeletonTable rows={3} columns={2} /> : renderMovementList(entradas, 'entrada', false)}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#071A45', fontSize: '.86rem', fontWeight: 950, margin: 0 }}>
                        <ArrowUpRight size={16} color="#ef4444" /> Saidas
                      </h3>
                      <span style={{ color: '#ef4444', background: '#fee2e2', padding: '4px 7px', borderRadius: 8, fontSize: '.68rem', fontWeight: 900 }}>{saidas.length}</span>
                    </div>
                    {loading || loadingMovements ? <SkeletonTable rows={3} columns={2} /> : renderMovementList(saidas, 'saida', false)}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginBottom: 32 }}>
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45' }}>Evolução da Receita</h3>
            <div style={{ display: 'flex', gap: 8 }}>
               <select style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', outline: 'none' }}>
                 <option>Diário</option>
                 <option>Semanal</option>
               </select>
            </div>
          </div>
          <div style={{ height: 250, paddingBottom: 20 }}>
            {loading ? <SkeletonBlock height={250} width="100%" radius={18} /> : <AdminLineChart data={evolutionData} height={250} />}
          </div>
        </div>

        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: 24 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45', marginBottom: 24 }}>Distribuição por Status</h3>
          <div style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {loading ? (
              <SkeletonBlock height={180} width={180} radius={999} />
            ) : (
              <AdminDonutChart 
                total={stats.total / 100}
                size={180}
                strokeWidth={24}
                segments={[
                  { label: 'Recebido', value: stats.recebido / 100, color: '#22c55e' },
                  { label: 'Pendente', value: stats.pendente / 100, color: '#f59e0b' },
                  { label: 'Cancelado', value: stats.cancelado / 100, color: '#ef4444' },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* Transactions Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 40 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#071A45' }}>Transações</h2>
      </div>

      {/* Filters Area */}
      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: '24px', marginBottom: 24, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 300, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
            <input 
              type="text" 
              placeholder="Buscar por nome, CPF ou e-mail..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '14px 16px 14px 48px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: '0.95rem', outline: 'none', background: '#f8fafc', fontWeight: 600, color: '#071A45', transition: 'all 0.2s' }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', minWidth: 140 }}>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 700, color: '#071A45', outline: 'none', cursor: 'pointer', background: '#fff', appearance: 'none' }}>
                <option value="todos">Status</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="cancelado">Cancelado</option>
              </select>
              <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }}><Filter size={14} /></div>
            </div>

            <div style={{ position: 'relative', minWidth: 140 }}>
              <select value={filterKit} onChange={e => setFilterKit(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 700, color: '#071A45', outline: 'none', cursor: 'pointer', background: '#fff', appearance: 'none' }}>
                <option value="todos">Kit</option>
                {KITS.map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}
              </select>
              <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }}><Filter size={14} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Atleta</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Kit</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Valor</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Inscrição</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <div style={{ padding: 24 }}>
                      <SkeletonTable rows={6} columns={6} />
                    </div>
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontWeight: 600 }}>Nenhuma transação encontrada.</td></tr>
              ) : paginatedData.map(r => {
                const isPaid = r.paymentStatus === 'pago';
                const ct = r.createdAt?.toDate?.() || new Date();
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 800, color: '#071A45', overflow: 'hidden' }}>
                          {r.fotoUrl ? (
                            <img src={r.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            r.nome.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#071A45', fontSize: '0.9rem' }}>{r.nome}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>{r.email}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#475569', fontSize: '0.85rem', fontWeight: 600 }}>
                      {KITS.find(k => k.id === r.kit)?.nome || r.kit}
                    </td>
                    <td style={{ padding: '16px 24px', fontWeight: 800, color: '#071A45' }}>{fmt(r.amount || 0)}</td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                        background: isPaid ? '#dcfce7' : r.paymentStatus === 'cancelado' ? '#fee2e2' : '#fef9c3',
                        color: isPaid ? '#166534' : r.paymentStatus === 'cancelado' ? '#ef4444' : '#854d0e'
                      }}>
                        {r.paymentStatus.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                      {formatDateBR(ct)}
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => navigate(`/admin/inscritos/${r.id}`)}
                          style={{ background: '#f1f5f9', border: 'none', padding: 8, borderRadius: 8, color: '#071A45', cursor: 'pointer' }} 
                          title="Ver Detalhes"
                        >
                          <Eye size={18} />
                        </button>
                        <button 
                          onClick={() => r.invoiceUrl ? window.open(r.invoiceUrl, '_blank') : navigate(`/admin/inscritos/${r.id}`)}
                          style={{ background: '#f1f5f9', border: 'none', padding: 8, borderRadius: 8, color: '#071A45', cursor: 'pointer' }} 
                          title="Baixar Comprovante"
                        >
                          <Download size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Página {currentPage} de {totalPages}</span>
             <div style={{ display: 'flex', gap: 8 }}>
               <button 
                 disabled={currentPage === 1}
                 onClick={() => setCurrentPage(prev => prev - 1)}
                 style={{ background: '#fff', border: '1px solid #e2e8f0', padding: 8, borderRadius: 8, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: currentPage === 1 ? '#cbd5e1' : '#475569' }}
               >
                 <ChevronLeft size={18} />
               </button>
               <button 
                 disabled={currentPage === totalPages}
                 onClick={() => setCurrentPage(prev => prev + 1)}
                 style={{ background: '#fff', border: '1px solid #e2e8f0', padding: 8, borderRadius: 8, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', color: currentPage === totalPages ? '#cbd5e1' : '#475569' }}
               >
                 <ChevronRight size={18} />
               </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
