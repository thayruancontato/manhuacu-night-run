import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import {
  ArrowDownLeft, ArrowUpRight, BarChart3, CheckSquare,
  FileText, Printer, RefreshCw, Wallet
} from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { formatDateBR, formatDateTimeBR, toDateValue } from '../utils/dateUtils';
import { TAMANHOS_CAMISETA } from '../types';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { findCamisetaByValue, formatCamisetaLabel, getCamisetaType } from '../utils/camisetaUtils';
import { SkeletonTable } from '../components/Skeleton';
import '../styles/admin.css';

type Provider = 'asaas' | 'cora';
type MovementType = 'entrada' | 'saida';
type ReportOptionKey =
  | 'executiveSummary'
  | 'balances'
  | 'paymentStatus'
  | 'paymentMethods'
  | 'providers'
  | 'dailyRevenue'
  | 'entries'
  | 'exits'
  | 'shirts'
  | 'teams'
  | 'pending'
  | 'fees'
  | 'bankExtract';

type Movement = {
  id: string;
  type: MovementType;
  provider: Provider;
  date: Date;
  amount: number;
  title: string;
  description: string;
};

type SemanticTone = 'income' | 'expense' | 'pending' | 'neutral' | 'danger' | 'bank';

type ReportData = {
  generatedAt: Date;
  registrations: any[];
  balances: any;
  bankMovements: any;
};

const PIX_FEE_BY_PROVIDER = { asaas: 200, cora: 50 } as const;
const TONES: Record<SemanticTone, { color: string; soft: string; border: string; label: string }> = {
  income: { color: '#15803d', soft: '#ecfdf3', border: '#bbf7d0', label: 'Entrada / recebido' },
  expense: { color: '#b91c1c', soft: '#fef2f2', border: '#fecaca', label: 'Saida / taxa' },
  pending: { color: '#b45309', soft: '#fffbeb', border: '#fde68a', label: 'Pendente' },
  neutral: { color: '#071A45', soft: '#f8fafc', border: '#dbe3ef', label: 'Informativo' },
  danger: { color: '#991b1b', soft: '#fff1f2', border: '#fecdd3', label: 'Cancelado / alerta' },
  bank: { color: '#2563eb', soft: '#eff6ff', border: '#bfdbfe', label: 'Banco / conciliacao' },
};

const reportOptions: { key: ReportOptionKey; title: string; description: string }[] = [
  { key: 'executiveSummary', title: 'Resumo executivo', description: 'Totais, liquido, pendente, cancelado e ticket medio.' },
  { key: 'balances', title: 'Saldo atual das contas', description: 'Saldo atual Cora e Asaas retornado pelos bancos.' },
  { key: 'paymentStatus', title: 'Grafico por status', description: 'Quantidade e valores pagos, pendentes e cancelados.' },
  { key: 'paymentMethods', title: 'Grafico por tipo de pagamento', description: 'PIX e cartao, com valores e quantidades.' },
  { key: 'providers', title: 'Grafico por banco', description: 'Distribuicao por Cora e Asaas.' },
  { key: 'dailyRevenue', title: 'Evolucao diaria', description: 'Receita confirmada por dia em todo o periodo.' },
  { key: 'entries', title: 'Tabela completa de entradas bancarias', description: 'Entradas reais retornadas pelos extratos Cora e Asaas.' },
  { key: 'exits', title: 'Tabela completa de saidas bancarias', description: 'Saidas reais retornadas pelos extratos Cora e Asaas.' },
  { key: 'shirts', title: 'Camisetas por tamanho', description: 'Solicitado, separado e pendente seguindo a aba de camisas.' },
  { key: 'teams', title: 'Equipes', description: 'Quantidade de inscritos por equipe informada no cadastro.' },
  { key: 'pending', title: 'Pendencias', description: 'Inscricoes pendentes, valores e bancos vinculados.' },
  { key: 'fees', title: 'Taxas e liquido', description: 'Taxas por banco e valor liquido.' },
  { key: 'bankExtract', title: 'Extrato bancario real', description: 'Entradas e saidas retornadas pelo Worker.' },
];

const defaultOptions = reportOptions.reduce((acc, option) => ({ ...acc, [option.key]: true }), {} as Record<ReportOptionKey, boolean>);

const providerOf = (registration: any): Provider => (
  registration.creditCardAsaasPaymentId ? 'asaas' : registration.paymentProvider === 'cora' ? 'cora' : 'asaas'
);

const paymentMethodOf = (registration: any) => (
  registration.creditCardAsaasPaymentId || registration.paymentMethod === 'credit_card' ? 'Cartao' : 'PIX'
);

const feeOf = (registration: any) => Number(registration.paymentFee ?? PIX_FEE_BY_PROVIDER[providerOf(registration)] ?? 0);
const fmt = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '0%';
const toneOfLabel = (label: string): SemanticTone => {
  const normalized = label.toLowerCase();
  if (normalized.includes('pago') || normalized.includes('pix') || normalized.includes('cartao')) return 'income';
  if (normalized.includes('pendente')) return 'pending';
  if (normalized.includes('cancel')) return 'danger';
  if (normalized.includes('cora') || normalized.includes('asaas')) return 'bank';
  return 'neutral';
};
const colorForLabel = (label: string) => TONES[toneOfLabel(label)].color;

const dateOf = (registration: any) => (
  toDateValue(registration.manualPaymentConfirmedAt || registration.paymentConfirmedAt || registration.paidAt || registration.createdAt) || new Date()
);

const balanceCents = (bank: any, provider: Provider) => {
  if (!bank?.ok) return 0;
  const cents = Number(bank.balanceCents || 0);
  if (provider === 'cora') {
    const rawBalance = Number(bank.raw?.balance);
    if (Number.isFinite(rawBalance) && cents === rawBalance * 100) return rawBalance;
  }
  return cents;
};

export default function AdminFinanceiroRelatorios() {
  const { showAlert } = useDialog();
  const [selected, setSelected] = useState<Record<ReportOptionKey, boolean>>(defaultOptions);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);
  const [kitsCadastrados, setKitsCadastrados] = useState<KitRecord[]>([]);

  useEffect(() => { fetchKits().then(setKitsCadastrados).catch(e => console.error('Erro ao carregar kits', e)); }, []);

  const toggle = (key: ReportOptionKey) => setSelected(prev => ({ ...prev, [key]: !prev[key] }));
  const include = (key: ReportOptionKey) => Boolean(selected[key]);

  const loadReport = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    setLoading(true);
    try {
      const registrationsSnap = await getDocs(query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc')));
      const registrations = registrationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const [balancesRes, movementsRes] = await Promise.allSettled([
        workerUrl ? fetch(`${workerUrl}/bank-balances`).then(res => res.json()) : Promise.resolve(null),
        workerUrl ? fetch(`${workerUrl}/bank-movements`).then(res => res.json()) : Promise.resolve(null),
      ]);
      setReport({
        generatedAt: new Date(),
        registrations,
        balances: balancesRes.status === 'fulfilled' ? balancesRes.value : null,
        bankMovements: movementsRes.status === 'fulfilled' ? movementsRes.value : null,
      });
    } catch (error) {
      console.error(error);
      showAlert('Erro ao gerar relatorio financeiro.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const model = useMemo(() => {
    const registrations = report?.registrations || [];
    const paid = registrations.filter(item => item.paymentStatus === 'pago');
    const pending = registrations.filter(item => item.paymentStatus === 'pendente');
    const canceled = registrations.filter(item => item.paymentStatus === 'cancelado');
    const total = registrations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paidTotal = paid.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pendingTotal = pending.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const canceledTotal = canceled.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const feesTotal = paid.reduce((sum, item) => sum + feeOf(item), 0);

    const entries: Movement[] = paid
      .map(item => ({
        id: `${item.id}-entrada`,
        type: 'entrada' as const,
        provider: providerOf(item),
        date: dateOf(item),
        amount: Number(item.amount || 0),
        title: item.nome || 'Atleta',
        description: `${paymentMethodOf(item)} - ${resolveKitNome(kitsCadastrados, item.kit)}`,
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const feeExits: Movement[] = paid
      .map(item => ({
        id: `${item.id}-taxa`,
        type: 'saida' as const,
        provider: providerOf(item),
        date: dateOf(item),
        amount: feeOf(item),
        title: `Taxa ${providerOf(item) === 'cora' ? 'Cora' : 'Asaas'}`,
        description: item.nome || 'Atleta',
      }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const bankItems: Movement[] = [
      ...(report?.bankMovements?.cora?.items || []),
      ...(report?.bankMovements?.asaas?.items || []),
    ].map((item: any) => ({
      id: item.id,
      type: item.type === 'saida' ? 'saida' : 'entrada',
      provider: item.provider === 'cora' ? 'cora' : 'asaas',
      date: toDateValue(item.date) || new Date(),
      amount: Number(item.amount || 0),
      title: item.title || 'Movimento bancario',
      description: item.description || '',
    }));
    const bankEntries = bankItems
      .filter(item => item.type === 'entrada')
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const bankExits = bankItems
      .filter(item => item.type === 'saida')
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    const byStatus = [
      { label: 'Pago', count: paid.length, amount: paidTotal, color: '#16a34a' },
      { label: 'Pendente', count: pending.length, amount: pendingTotal, color: '#f59e0b' },
      { label: 'Cancelado', count: canceled.length, amount: canceledTotal, color: '#ef4444' },
    ];
    const byMethod = groupStats(paid, paymentMethodOf);
    const byProvider = groupStats(paid, item => providerOf(item) === 'cora' ? 'Cora' : 'Asaas');
    const daily = groupDaily(paid);
    const shirtCounts = buildShirtRows(registrations);
    const teamRows = buildTeamRows(registrations);

    return {
      registrations,
      paid,
      pending,
      canceled,
      total,
      paidTotal,
      pendingTotal,
      canceledTotal,
      feesTotal,
      netTotal: Math.max(paidTotal - feesTotal, 0),
      ticket: paid.length ? Math.round(paidTotal / paid.length) : 0,
      entries: bankEntries,
      systemEntries: entries,
      feeExits,
      exits: bankExits,
      bankItems,
      byStatus,
      byMethod,
      byProvider,
      daily,
      shirtCounts,
      teamRows,
      totalBalance: balanceCents(report?.balances?.cora, 'cora') + balanceCents(report?.balances?.asaas, 'asaas'),
    };
  }, [report, kitsCadastrados]);

  return (
    <div className="finance-report-page" style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div className="finance-report-controls no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 950 }}>Relatorios financeiros</h1>
          <p style={{ margin: '5px 0 0', color: '#64748b', fontWeight: 700 }}>Escolha os topicos, confirme e gere um relatorio visual completo.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => window.print()} disabled={!report} style={actionButton('#fff', '#071A45', '1px solid #cbd5e1')}>
            <Printer size={17} /> Imprimir / PDF
          </button>
          <button onClick={loadReport} disabled={loading} style={actionButton('#071A45', '#fff')}>
            {loading ? <RefreshCw size={17} /> : <FileText size={17} />} {loading ? 'Gerando...' : 'Confirmar e gerar'}
          </button>
        </div>
      </div>

      <section className="finance-report-controls no-print" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
          {reportOptions.map(option => (
            <label key={option.key} style={{ border: `1px solid ${selected[option.key] ? '#071A45' : '#e2e8f0'}`, background: selected[option.key] ? '#f8fafc' : '#fff', borderRadius: 12, padding: 12, display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', minHeight: 86 }}>
              <input type="checkbox" checked={selected[option.key]} onChange={() => toggle(option.key)} style={{ marginTop: 3, width: 16, height: 16 }} />
              <span>
                <strong style={{ display: 'block', color: '#071A45', fontSize: '.86rem', fontWeight: 950 }}>{option.title}</strong>
                <small style={{ display: 'block', color: '#64748b', fontWeight: 700, lineHeight: 1.35, marginTop: 3 }}>{option.description}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      {loading && <div className="no-print" style={{ background: '#fff', borderRadius: 16, padding: 24 }}><SkeletonTable rows={8} columns={5} /></div>}

      {!loading && !report && (
        <div className="no-print" style={{ minHeight: 280, display: 'grid', placeItems: 'center', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 16, color: '#64748b', fontWeight: 900, textAlign: 'center' }}>
          <div><BarChart3 size={42} style={{ marginBottom: 10 }} />Selecione os marcadores e clique em confirmar para criar o relatorio.</div>
        </div>
      )}

      {!loading && report && (
        <main id="finance-report" className="finance-report-document" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, overflow: 'hidden' }}>
          <ReportCover generatedAt={report.generatedAt} count={model.registrations.length} />

          {include('executiveSummary') && (
            <ReportSection title="Resumo executivo" subtitle="Visao geral do periodo completo cadastrado no sistema.">
              <div className="finance-report-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Metric icon={<Wallet size={19} />} label="Receita confirmada" value={fmt(model.paidTotal)} tone="income" />
                <Metric icon={<CheckSquare size={19} />} label="Inscricoes pagas" value={String(model.paid.length)} tone="income" />
                <Metric icon={<ArrowUpRight size={19} />} label="Taxas" value={fmt(model.feesTotal)} tone="expense" />
                <Metric icon={<Wallet size={19} />} label="Liquido" value={fmt(model.netTotal)} tone="neutral" />
                <Metric icon={<FileText size={19} />} label="Pendente" value={fmt(model.pendingTotal)} tone="pending" />
                <Metric icon={<BarChart3 size={19} />} label="Ticket medio" value={fmt(model.ticket)} tone="bank" />
              </div>
            </ReportSection>
          )}

          {include('balances') && (
            <ReportSection title="Saldo atual das contas" subtitle="Saldos retornados diretamente pelos bancos no momento da geracao.">
              <div className="finance-report-metric-grid finance-report-balance-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <BalanceCard name="Cora" logo="/cora-logo.svg" value={fmt(balanceCents(report.balances?.cora, 'cora'))} ok={report.balances?.cora?.ok} />
                <BalanceCard name="Asaas" logo="/asaas-logo.svg" value={fmt(balanceCents(report.balances?.asaas, 'asaas'))} ok={report.balances?.asaas?.ok} pendingCredit={report.balances?.asaas?.pendingCredit} />
                <Metric icon={<Wallet size={19} />} label="Saldo total" value={fmt(model.totalBalance)} tone="bank" />
              </div>
            </ReportSection>
          )}

          {include('paymentStatus') && <ChartSection title="Pagamentos por status" data={model.byStatus} total={model.total} />}
          {include('paymentMethods') && <ChartSection title="Tipos de pagamento" data={model.byMethod} total={model.paidTotal} />}
          {include('providers') && <ChartSection title="Distribuicao por banco" data={model.byProvider} total={model.paidTotal} />}
          {include('dailyRevenue') && <DailyChart data={model.daily} />}
          {include('fees') && <FeesSection entries={model.systemEntries} exits={model.feeExits} />}
          {include('pending') && <RegistrationTable title="Pendencias de pagamento" rows={model.pending} />}
          {include('shirts') && <ShirtSizeTable rows={model.shirtCounts} />}
          {include('teams') && <TeamTable rows={model.teamRows} />}
          {include('entries') && <MovementTable title="Historico completo de entradas bancarias" rows={model.entries} />}
          {include('exits') && <MovementTable title="Historico completo de saidas bancarias" rows={model.exits} />}
          {include('bankExtract') && <MovementTable title="Extrato bancario real retornado" rows={model.bankItems} />}
        </main>
      )}
    </div>
  );
}

function groupStats(registrations: any[], getLabel: (item: any) => string) {
  const fallbackColors = ['#071A45', '#2563eb', '#7c3aed', '#0f766e'];
  return Object.values(registrations.reduce((acc: Record<string, any>, item) => {
    const label = getLabel(item);
    if (!acc[label]) {
      const color = colorForLabel(label) || fallbackColors[Object.keys(acc).length % fallbackColors.length];
      acc[label] = { label, count: 0, amount: 0, color };
    }
    acc[label].count += 1;
    acc[label].amount += Number(item.amount || 0);
    return acc;
  }, {})).sort((a: any, b: any) => b.amount - a.amount) as { label: string; count: number; amount: number; color: string }[];
}

function groupDaily(registrations: any[]) {
  return Object.values(registrations.reduce((acc: Record<string, any>, item) => {
    const date = formatDateBR(dateOf(item));
    if (!acc[date]) acc[date] = { label: date, count: 0, amount: 0, color: TONES.income.color };
    acc[date].count += 1;
    acc[date].amount += Number(item.amount || 0);
    return acc;
  }, {})).sort((a: any, b: any) => (toDateValue(a.label)?.getTime() || 0) - (toDateValue(b.label)?.getTime() || 0)) as any[];
}

function buildShirtRows(registrations: any[]) {
  const counts: Record<string, number> = {};
  const separated: Record<string, number> = {};
  const catalog = TAMANHOS_CAMISETA.map(size => ({ ...size, label: formatCamisetaLabel(size.id, size) || size.label }));
  TAMANHOS_CAMISETA.forEach(size => {
    counts[size.id] = 0;
    separated[size.id] = 0;
  });

  registrations.forEach(item => {
    const resolved = findCamisetaByValue(TAMANHOS_CAMISETA, item.tamanhoCamiseta, item.tamanhoCamisetaTipo);
    const sizeId = resolved?.id || item.tamanhoCamiseta;
    if (sizeId && counts[sizeId] !== undefined) {
      counts[sizeId] += 1;
      if (item.camisaSeparada) separated[sizeId] += 1;
    } else if (sizeId) {
      counts[sizeId] = 1;
      separated[sizeId] = item.camisaSeparada ? 1 : 0;
      catalog.push({
        id: sizeId,
        label: formatCamisetaLabel(sizeId, { id: sizeId, tipo: item.tamanhoCamisetaTipo }) || String(sizeId),
        tipo: getCamisetaType(sizeId, { tipo: item.tamanhoCamisetaTipo }),
      } as any);
    }
  });

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const rows = catalog.map(size => {
    const solicitado = counts[size.id] || 0;
    const separado = separated[size.id] || 0;
    const pendente = solicitado - separado;
    return {
      label: size.label,
      tipo: size.tipo,
      solicitado,
      separado,
      pendente,
      participacao: total > 0 ? `${((solicitado / total) * 100).toFixed(1)}%` : '0%',
      participationValue: total > 0 ? (solicitado / total) * 100 : 0,
    };
  }).sort((a, b) => b.participationValue - a.participationValue || a.label.localeCompare(b.label));

  const totalSeparado = Object.values(separated).reduce((sum, value) => sum + value, 0);
  rows.push({
    label: 'TOTAL',
    tipo: '',
    solicitado: total,
    separado: totalSeparado,
    pendente: total - totalSeparado,
    participacao: total > 0 ? '100%' : '0%',
    participationValue: 100,
  });

  return rows;
}

function normalizeTeamName(registration: any) {
  if (registration.integranteEquipe !== 'sim') return '';
  return String(registration.equipeNome || '').trim().replace(/\s+/g, ' ');
}

function buildTeamRows(registrations: any[]) {
  const teamItems = registrations.filter(item => normalizeTeamName(item));
  const totalTeams = teamItems.length;
  const grouped = Object.values(teamItems.reduce((acc: Record<string, any>, item) => {
    const name = normalizeTeamName(item);
    const key = name.toLocaleUpperCase('pt-BR');
    if (!acc[key]) {
      acc[key] = { name, logoUrl: teamLogoOf(item), total: 0, paid: 0, pending: 0, amount: 0, participationValue: 0, participation: '0%' };
    }
    if (!acc[key].logoUrl) acc[key].logoUrl = teamLogoOf(item);
    acc[key].total += 1;
    if (item.paymentStatus === 'pago') {
      acc[key].paid += 1;
      acc[key].amount += Number(item.amount || 0);
    } else if (item.paymentStatus === 'pendente') {
      acc[key].pending += 1;
    }
    return acc;
  }, {})).map((row: any) => ({
    ...row,
    participationValue: totalTeams > 0 ? (row.total / totalTeams) * 100 : 0,
    participation: totalTeams > 0 ? `${((row.total / totalTeams) * 100).toFixed(1)}%` : '0%',
  })).sort((a: any, b: any) => b.participationValue - a.participationValue || a.name.localeCompare(b.name));

  const totalPaid = grouped.reduce((sum: number, row: any) => sum + row.paid, 0);
  const totalPending = grouped.reduce((sum: number, row: any) => sum + row.pending, 0);
  const totalAmount = grouped.reduce((sum: number, row: any) => sum + row.amount, 0);
  grouped.push({
    name: 'TOTAL',
    total: totalTeams,
    paid: totalPaid,
    pending: totalPending,
    amount: totalAmount,
    participation: totalTeams > 0 ? '100%' : '0%',
    participationValue: 100,
  });

  return grouped;
}

function teamLogoOf(registration: any) {
  return String(
    registration.equipeLogoUrl ||
    registration.logoEquipeUrl ||
    registration.equipeImagemUrl ||
    registration.imagemEquipeUrl ||
    registration.equipeFotoUrl ||
    registration.fotoEquipeUrl ||
    ''
  ).trim();
}

function teamInitials(name: string) {
  return String(name || 'Equipe')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function actionButton(background: string, color: string, border = 'none') {
  return { minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, background, color, border, borderRadius: 10, padding: '10px 15px', fontWeight: 900, cursor: 'pointer' } as const;
}

function ReportCover({ generatedAt, count }: { generatedAt: Date; count: number }) {
  return (
    <header className="finance-report-cover" style={{ background: '#071A45', color: '#fff', padding: 28, display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 950 }}>Relatorio financeiro MCU Night Run</h2>
        <p style={{ margin: '7px 0 0', color: '#cbd5e1', fontWeight: 700 }}>Gerado em {formatDateTimeBR(generatedAt)} com {count} inscricoes analisadas.</p>
      </div>
      <img src="/LOGO horizontal NIGHT RUN SEM FUNDO (em amarelo e branco).png" alt="MCU Night Run" style={{ width: 190, height: 54, objectFit: 'contain' }} />
    </header>
  );
}

function ReportSection({ title, subtitle, children }: { title: string; subtitle?: string; children: any }) {
  return (
    <section className="finance-report-section" style={{ padding: 24, borderBottom: '1px solid #e2e8f0' }}>
      <h3 style={{ margin: 0, color: '#071A45', fontSize: '1.18rem', fontWeight: 950 }}>{title}</h3>
      {subtitle && <p style={{ margin: '4px 0 16px', color: '#64748b', fontWeight: 700, fontSize: '.84rem' }}>{subtitle}</p>}
      {children}
    </section>
  );
}

function Metric({ icon, label, value, tone = 'neutral' }: { icon: any; label: string; value: string; tone?: SemanticTone }) {
  const palette = TONES[tone];
  return (
    <div className="finance-report-card" style={{ border: `1px solid ${palette.border}`, borderLeft: `5px solid ${palette.color}`, borderRadius: 12, padding: 14, background: palette.soft, display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', color: palette.color, display: 'grid', placeItems: 'center', border: `1px solid ${palette.border}` }}>{icon}</div>
      <div><span style={{ display: 'block', color: '#64748b', fontSize: '.68rem', fontWeight: 950, textTransform: 'uppercase' }}>{label}</span><strong style={{ color: palette.color, fontSize: '1.05rem', fontWeight: 950 }}>{value}</strong></div>
    </div>
  );
}

function BalanceCard({ name, logo, value, ok, pendingCredit }: { name: string; logo: string; value: string; ok?: boolean; pendingCredit?: any }) {
  const palette = ok ? TONES.bank : TONES.danger;
  const pendingCreditCents = Number(pendingCredit?.amountCents || 0);
  const pendingCreditCount = Number(pendingCredit?.count || 0);
  return (
    <div className="finance-report-card" style={{ border: `1px solid ${palette.border}`, borderLeft: `5px solid ${palette.color}`, borderRadius: 12, padding: 16, background: palette.soft }}>
      <img src={logo} alt={name} style={{ width: name === 'Cora' ? 58 : 72, height: 24, objectFit: 'contain', marginBottom: 10 }} />
      <strong style={{ display: 'block', color: palette.color, fontSize: '1.35rem', fontWeight: 950 }}>{ok ? value : 'Indisponivel'}</strong>
      <span style={{ color: '#64748b', fontSize: '.76rem', fontWeight: 800 }}>Conta {name}</span>
      {name === 'Asaas' && ok && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #bfdbfe' }}>
          <span style={{ display: 'block', color: '#64748b', fontSize: '.66rem', fontWeight: 950, textTransform: 'uppercase' }}>Cartao confirmado a creditar no Asaas</span>
          <strong style={{ display: 'block', color: pendingCreditCents > 0 ? '#b45309' : '#2563eb', fontSize: '1rem', fontWeight: 950, marginTop: 3 }}>{fmt(pendingCreditCents)}</strong>
          <span style={{ display: 'block', color: '#64748b', fontSize: '.7rem', fontWeight: 800, marginTop: 2 }}>{pendingCreditCount} pagamento(s), valor liquido direto do Asaas</span>
        </div>
      )}
    </div>
  );
}

function ChartSection({ title, data, total }: { title: string; data: { label: string; count: number; amount: number; color: string }[]; total: number }) {
  return (
    <ReportSection title={title} subtitle="Quantidade, valor e participacao relativa.">
      <div className="finance-report-chart-list" style={{ display: 'grid', gap: 10 }}>
        {data.map(item => (
          <div key={item.label} className="finance-report-chart-row" style={{ display: 'grid', gridTemplateColumns: '150px 1fr 160px', gap: 12, alignItems: 'center' }}>
            <strong style={{ color: item.color, fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: item.color, display: 'inline-block' }} />
              {item.label}
            </strong>
            <div style={{ height: 12, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}><div style={{ width: pct(item.amount, total), height: '100%', background: item.color }} /></div>
            <span className="finance-report-chart-value" style={{ textAlign: 'right', color: '#475569', fontWeight: 850, fontSize: '.8rem' }}>{item.count} / {fmt(item.amount)}</span>
          </div>
        ))}
      </div>
    </ReportSection>
  );
}

function DailyChart({ data }: { data: any[] }) {
  const max = Math.max(...data.map(item => item.amount), 1);
  return (
    <ReportSection title="Evolucao diaria da receita" subtitle="Entradas confirmadas por data de confirmacao/cadastro.">
      <div className="finance-report-daily-chart" style={{ display: 'flex', alignItems: 'end', gap: 7, minHeight: 180, borderBottom: '1px solid #e2e8f0', paddingTop: 10, overflowX: 'auto' }}>
        {data.map(item => (
          <div key={item.label} title={`${item.label}: ${fmt(item.amount)}`} style={{ minWidth: 34, display: 'grid', alignItems: 'end', gap: 6 }}>
            <div style={{ height: Math.max(12, (item.amount / max) * 150), background: TONES.income.color, borderRadius: '7px 7px 0 0' }} />
            <small style={{ color: '#64748b', fontWeight: 800, fontSize: '.62rem', transform: 'rotate(-35deg)', transformOrigin: 'left top', height: 26 }}>{item.label.slice(0, 5)}</small>
          </div>
        ))}
      </div>
    </ReportSection>
  );
}

function ShirtSizeTable({ rows }: { rows: any[] }) {
  return (
    <ReportSection title="Quantidade de camisetas por tamanho" subtitle="Mesma logica da aba de camisas: solicitado, separado e pendente por tamanho.">
      <SimpleTable
        headers={['Tamanho', 'Tipo', 'Solicitado', 'Separado', 'Pendente', 'Participacao']}
        rows={rows.map(row => [
          row.label,
          row.tipo || '-',
          row.solicitado,
          row.separado,
          row.pendente,
          row.participacao,
        ])}
        rowTones={rows.map(row => row.label === 'TOTAL' ? 'bank' : row.pendente > 0 ? 'pending' : 'income')}
      />
    </ReportSection>
  );
}

function TeamTable({ rows }: { rows: any[] }) {
  const teamRows = rows.filter(row => row.name !== 'TOTAL');
  const total = rows.find(row => row.name === 'TOTAL');
  return (
    <ReportSection title="Equipes" subtitle="Agrupamento por equipe informada no cadastro.">
      <div className="finance-report-team-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
        {teamRows.length === 0 ? (
          <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: 18, color: '#94a3b8', fontWeight: 900, textAlign: 'center' }}>
            Nenhuma equipe informada.
          </div>
        ) : teamRows.map(row => (
          <div key={row.name} className="finance-report-team-card" style={{ border: '1px solid #dbe3ef', borderLeft: `5px solid ${row.pending > 0 ? TONES.pending.color : TONES.income.color}`, borderRadius: 12, padding: 14, background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '42px minmax(0, 1fr)', gap: 11, alignItems: 'center' }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#f1f5f9', color: '#071A45', display: 'grid', placeItems: 'center', overflow: 'hidden', fontWeight: 950, fontSize: '.78rem', border: '1px solid #e2e8f0' }}>
                {row.logoUrl ? <img src={row.logoUrl} alt={row.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : teamInitials(row.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: '#071A45', fontSize: '.92rem', fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</strong>
                <span style={{ display: 'block', color: '#64748b', fontSize: '.68rem', fontWeight: 900, textTransform: 'uppercase', marginTop: 2 }}>{row.total} inscrito(s) / {row.paid} pago(s)</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginTop: 12 }}>
              <span style={{ color: '#64748b', fontSize: '.7rem', fontWeight: 900 }}>Participacao</span>
              <strong style={{ color: '#071A45', fontSize: '.84rem', fontWeight: 950 }}>{row.participation}</strong>
            </div>
            <div style={{ height: 9, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
              <div style={{ width: row.participation, height: '100%', background: row.pending > 0 ? TONES.pending.color : TONES.income.color }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 12 }}>
              <span style={{ background: '#ecfdf3', color: '#15803d', borderRadius: 8, padding: '7px 6px', fontSize: '.68rem', fontWeight: 950 }}>Pagos<br />{row.paid}</span>
              <span style={{ background: '#fffbeb', color: '#b45309', borderRadius: 8, padding: '7px 6px', fontSize: '.68rem', fontWeight: 950 }}>Pend.<br />{row.pending}</span>
              <span style={{ background: '#eff6ff', color: '#2563eb', borderRadius: 8, padding: '7px 6px', fontSize: '.68rem', fontWeight: 950 }}>Valor<br />{fmt(row.amount)}</span>
            </div>
          </div>
        ))}
      </div>
      {total && (
        <div style={{ marginTop: 12, border: '1px solid #bfdbfe', borderLeft: `5px solid ${TONES.bank.color}`, borderRadius: 12, background: TONES.bank.soft, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', color: '#071A45', fontWeight: 950 }}>
          <span>Total em equipes: {total.total}</span>
          <span>Pagos: {total.paid}</span>
          <span>Pendentes: {total.pending}</span>
          <span>Valor pago: {fmt(total.amount)}</span>
        </div>
      )}
    </ReportSection>
  );
}

function FeesSection({ entries, exits }: { entries: Movement[]; exits: Movement[] }) {
  const totalEntries = entries.reduce((sum, item) => sum + item.amount, 0);
  const totalExits = exits.reduce((sum, item) => sum + item.amount, 0);
  return (
    <ReportSection title="Taxas e valor liquido">
      <div className="finance-report-metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Metric icon={<ArrowDownLeft size={19} />} label="Bruto confirmado" value={fmt(totalEntries)} tone="income" />
        <Metric icon={<ArrowUpRight size={19} />} label="Taxas por pagamento" value={fmt(totalExits)} tone="expense" />
        <Metric icon={<Wallet size={19} />} label="Liquido" value={fmt(Math.max(totalEntries - totalExits, 0))} tone="neutral" />
      </div>
    </ReportSection>
  );
}

function RegistrationTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <ReportSection title={title} subtitle={`${rows.length} registros.`}>
      <SimpleTable headers={['Nome', 'Banco', 'Metodo', 'Valor', 'Data']} rows={rows.map(item => [item.nome || '-', providerOf(item).toUpperCase(), paymentMethodOf(item), fmt(Number(item.amount || 0)), formatDateBR(item.createdAt)])} rowTones={rows.map(() => 'pending')} />
    </ReportSection>
  );
}

function MovementTable({ title, rows }: { title: string; rows: Movement[] }) {
  return (
    <ReportSection title={title} subtitle={`${rows.length} lancamentos.`}>
      <SimpleTable headers={['Data', 'Banco', 'Lancamento', 'Descricao', 'Valor']} rows={rows.map(item => [formatDateBR(item.date), item.provider.toUpperCase(), item.title, item.description, `${item.type === 'saida' ? '-' : '+'} ${fmt(item.amount)}`])} rowTones={rows.map(item => item.type === 'saida' ? 'expense' : 'income')} />
    </ReportSection>
  );
}

function SimpleTable({ headers, rows, rowTones }: { headers: string[]; rows: any[][]; rowTones?: SemanticTone[] }) {
  return (
    <div className="finance-report-table-wrap" style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
      <table className="finance-report-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
        <thead><tr style={{ background: '#f8fafc' }}>{headers.map(header => <th key={header} style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', textTransform: 'uppercase', fontSize: '.66rem' }}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={headers.length} style={{ padding: 18, textAlign: 'center', color: '#94a3b8', fontWeight: 800 }}>Nenhum registro.</td></tr> : rows.map((row, index) => (
            <tr key={index} style={{ borderTop: '1px solid #eef2f7', background: rowTones?.[index] ? TONES[rowTones[index]].soft : '#fff' }}>{row.map((cell, cellIndex) => {
              const tone = rowTones?.[index];
              const palette = tone ? TONES[tone] : TONES.neutral;
              const isValue = cellIndex === row.length - 1 && tone;
              return <td key={cellIndex} style={{ padding: '9px 12px', color: isValue ? palette.color : '#334155', fontWeight: cellIndex === 0 || isValue ? 900 : 700, borderLeft: cellIndex === 0 && tone ? `4px solid ${palette.color}` : undefined }}>{cell}</td>;
            })}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
