import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ChevronDown, Eye, FileText, RefreshCw, Search, Upload } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { SkeletonTable } from '../components/Skeleton';
import { formatDateBR } from '../utils/dateUtils';
import '../styles/admin.css';

type PaymentProvider = 'asaas' | 'cora';
type MovementType = 'entrada' | 'saida';
type SortOption = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'title_asc' | 'title_desc' | 'type_asc';

type AccountMovement = {
  id: string;
  type: MovementType;
  date: Date;
  amount: number;
  title: string;
  description: string;
  registrationId: string;
  raw?: any;
  receipt?: any;
  athlete?: any;
};

const fmt = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dateInputValue = (date: Date) => date.toISOString().slice(0, 10);
const receiptKeyFor = (provider: PaymentProvider, item: { id: string }) => `${provider}_${item.id}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180);

const defaultStartDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return dateInputValue(date);
};

export default function AdminContaHistorico() {
  const { provider: providerParam } = useParams<{ provider: string }>();
  const navigate = useNavigate();
  const { showAlert } = useDialog();
  const provider: PaymentProvider = providerParam === 'cora' ? 'cora' : 'asaas';
  const providerName = provider === 'cora' ? 'Cora' : 'Asaas';
  const providerLogo = provider === 'cora' ? '/cora-logo.svg' : '/asaas-logo.svg';

  const [movementsData, setMovementsData] = useState<any>(null);
  const [receipts, setReceipts] = useState<Record<string, any>>({});
  const [registrationsById, setRegistrationsById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingReceiptId, setUploadingReceiptId] = useState('');
  const [expandedId, setExpandedId] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'todos' | MovementType>('todos');
  const [sortBy, setSortBy] = useState<SortOption>('date_desc');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(() => dateInputValue(new Date()));

  useEffect(() => { load(); }, [startDate, endDate]);
  useEffect(() => { loadReceipts(); }, [provider]);
  useEffect(() => { loadRegistrations(); }, []);

  const load = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) {
      showAlert('Worker nao configurado para buscar extrato real.', 'error');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const params = new URLSearchParams({ start: startDate, end: endDate });
      const res = await fetch(`${workerUrl}/bank-movements?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar extrato.');
      setMovementsData(data);
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao carregar historico da conta.', 'error');
      setMovementsData(null);
    } finally {
      setLoading(false);
    }
  };

  const loadReceipts = async () => {
    try {
      const snap = await getDocs(collection(db, 'nightrun_bank_movement_receipts'));
      const map: Record<string, any> = {};
      snap.docs.forEach(item => {
        const data = item.data();
        if (data.provider === provider) map[item.id] = { id: item.id, ...data };
      });
      setReceipts(map);
    } catch (error) {
      console.error(error);
      showAlert('Erro ao carregar comprovantes.', 'error');
    }
  };

  const loadRegistrations = async () => {
    try {
      const snap = await getDocs(collection(db, 'nightrun_registrations'));
      const map: Record<string, any> = {};
      snap.docs.forEach(item => {
        map[item.id] = { id: item.id, ...item.data() };
      });
      setRegistrationsById(map);
    } catch (error) {
      console.error(error);
      showAlert('Erro ao carregar fotos dos atletas.', 'error');
    }
  };

  const handleReceiptUpload = async (movement: AccountMovement, file?: File) => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!file || !workerUrl) return;
    if (file.size > 10 * 1024 * 1024) {
      showAlert('Arquivo muito grande. Envie um comprovante de até 10MB.', 'warning');
      return;
    }

    const key = receiptKeyFor(provider, movement);
    setUploadingReceiptId(key);
    try {
      const formData = new FormData();
      formData.append('file', file, file.name);
      formData.append('folder', 'bank_receipts');
      const res = await fetch(`${workerUrl}/media/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Falha ao enviar comprovante.');

      const payload = {
        provider,
        movementId: movement.id,
        movementType: movement.type,
        movementTitle: movement.title,
        movementDescription: movement.description,
        movementAmount: movement.amount,
        movementDate: movement.date.toISOString(),
        receiptUrl: data.url,
        receiptKey: data.key || '',
        fileName: file.name,
        contentType: file.type || '',
        updatedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, 'nightrun_bank_movement_receipts', key), payload, { merge: true });
      setReceipts(prev => ({ ...prev, [key]: { id: key, ...payload } }));
      showAlert('Comprovante anexado!', 'success');
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao anexar comprovante.', 'error');
    } finally {
      setUploadingReceiptId('');
    }
  };

  const movements = useMemo(() => {
    const items = movementsData?.[provider]?.items || [];
    return items.map((item: any): AccountMovement => {
      const date = item.date ? new Date(item.date) : new Date();
      const base = {
        id: item.id || `${provider}-${item.type}-${item.date}-${item.amount}`,
        type: item.type === 'saida' ? 'saida' as const : 'entrada' as const,
        date: Number.isNaN(date.getTime()) ? new Date() : date,
        amount: Number(item.amount || 0),
        title: item.title || (item.type === 'saida' ? `Saida ${providerName}` : `Entrada ${providerName}`),
        description: item.description || 'Movimentacao real do banco',
        registrationId: item.registrationId || '',
        raw: item.raw || {},
        athlete: item.registrationId ? registrationsById[item.registrationId] : null,
      };
      return { ...base, receipt: receipts[receiptKeyFor(provider, base)] };
    });
  }, [movementsData, provider, providerName, receipts, registrationsById]);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const minCents = minAmount ? Math.round(Number(minAmount.replace(',', '.')) * 100) : null;
    const maxCents = maxAmount ? Math.round(Number(maxAmount.replace(',', '.')) * 100) : null;

    const result = movements.filter((item: AccountMovement) => {
      const matchType = typeFilter === 'todos' || item.type === typeFilter;
      const matchSearch = !normalizedSearch || [item.title, item.description, item.type]
        .some(value => String(value || '').toLowerCase().includes(normalizedSearch));
      const matchMin = minCents === null || item.amount >= minCents;
      const matchMax = maxCents === null || item.amount <= maxCents;
      return matchType && matchSearch && matchMin && matchMax;
    });

    return result.sort((a: AccountMovement, b: AccountMovement) => {
      if (sortBy === 'date_asc') return a.date.getTime() - b.date.getTime();
      if (sortBy === 'date_desc') return b.date.getTime() - a.date.getTime();
      if (sortBy === 'amount_asc') return a.amount - b.amount;
      if (sortBy === 'amount_desc') return b.amount - a.amount;
      if (sortBy === 'title_asc') return a.title.localeCompare(b.title, 'pt-BR');
      if (sortBy === 'title_desc') return b.title.localeCompare(a.title, 'pt-BR');
      if (sortBy === 'type_asc') return a.type.localeCompare(b.type, 'pt-BR') || b.date.getTime() - a.date.getTime();
      return 0;
    });
  }, [movements, search, typeFilter, sortBy, minAmount, maxAmount]);

  const entradaTotal = movements.filter((item: AccountMovement) => item.type === 'entrada').reduce((sum: number, item: AccountMovement) => sum + item.amount, 0);
  const saidaTotal = movements.filter((item: AccountMovement) => item.type === 'saida').reduce((sum: number, item: AccountMovement) => sum + item.amount, 0);
  const saldoCalculado = entradaTotal - saidaTotal;
  const providerStatus = movementsData?.[provider];

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 22, padding: 22, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', marginBottom: 22 }}>
        <button type="button" onClick={() => navigate('/admin/financeiro')} style={{ background: 'transparent', border: 'none', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 900, cursor: 'pointer', padding: 0, marginBottom: 16 }}>
            <ArrowLeft size={17} /> Voltar ao financeiro
          </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'stretch', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 280 }}>
            <div style={{ width: 74, height: 74, borderRadius: 18, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <img src={providerLogo} alt={providerName} style={{ width: provider === 'cora' ? 56 : 62, height: 28, objectFit: 'contain' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 950, color: '#071A45', margin: 0 }}>Historico da conta</h1>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 5, gap: 5 }}>
              {([
                { id: 'cora' as const, name: 'Cora', logo: '/cora-logo.svg', width: 50 },
                { id: 'asaas' as const, name: 'Asaas', logo: '/asaas-logo.svg', width: 62 },
              ]).map(bank => {
                const active = provider === bank.id;
                return (
                  <button
                    key={bank.id}
                    type="button"
                    onClick={() => navigate(`/admin/financeiro/${bank.id}`)}
                    style={{
                      border: 'none',
                      borderRadius: 12,
                      padding: '11px 14px',
                      minHeight: 44,
                      minWidth: 92,
                      background: active ? '#071A45' : '#fff',
                      color: active ? '#fff' : '#64748b',
                      fontWeight: 950,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      boxShadow: active ? '0 5px 16px rgba(7,26,69,0.18)' : '0 1px 2px rgba(15,23,42,0.04)'
                    }}
                  >
                    <img src={bank.logo} alt={bank.name} style={{ width: bank.width, height: 19, objectFit: 'contain', filter: active && bank.id === 'asaas' ? 'brightness(0) invert(1)' : 'none' }} />
                  </button>
                );
              })}
            </div>
            <button onClick={load} disabled={loading} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '13px 18px', borderRadius: 14, fontWeight: 900, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, boxShadow: '0 6px 16px rgba(7,26,69,0.18)' }}>
              <RefreshCw size={17} /> {loading ? 'Atualizando...' : 'Atualizar extrato'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
        <SummaryCard label="Entradas" value={fmt(entradaTotal)} color="#166534" background="#dcfce7" icon={<ArrowDownLeft size={20} />} />
        <SummaryCard label="Saidas" value={fmt(saidaTotal)} color="#ef4444" background="#fee2e2" icon={<ArrowUpRight size={20} />} />
        <SummaryCard label="Saldo calculado" value={fmt(saldoCalculado)} color="#071A45" background="#fff" icon={<img src={providerLogo} alt="" style={{ width: provider === 'cora' ? 42 : 52, height: 18, objectFit: 'contain' }} />} />
      </div>

      {providerStatus?.ok === false && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', padding: '10px 12px', borderRadius: 12, marginBottom: 14, fontSize: '.78rem', fontWeight: 800 }}>
          {providerStatus.error || `Falha ao consultar extrato ${providerName}.`}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 18, marginBottom: 18, display: 'grid', gridTemplateColumns: 'minmax(260px, 1.5fr) repeat(5, minmax(150px, 1fr))', gap: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por descricao, pessoa, tipo..." style={inputStyle({ paddingLeft: 42 })} />
        </div>
        <select value={typeFilter} onChange={event => setTypeFilter(event.target.value as any)} style={inputStyle()}>
          <option value="todos">Todos os tipos</option>
          <option value="entrada">Entradas</option>
          <option value="saida">Saidas</option>
        </select>
        <select value={sortBy} onChange={event => setSortBy(event.target.value as SortOption)} style={inputStyle()}>
          <option value="date_desc">Mais recentes</option>
          <option value="date_asc">Mais antigos</option>
          <option value="amount_desc">Maior valor</option>
          <option value="amount_asc">Menor valor</option>
          <option value="title_asc">Lancamento A-Z</option>
          <option value="title_desc">Lancamento Z-A</option>
          <option value="type_asc">Tipo</option>
        </select>
        <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} style={inputStyle()} />
        <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} style={inputStyle()} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input value={minAmount} onChange={event => setMinAmount(event.target.value)} placeholder="Min R$" inputMode="decimal" style={inputStyle()} />
          <input value={maxAmount} onChange={event => setMaxAmount(event.target.value)} placeholder="Max R$" inputMode="decimal" style={inputStyle()} />
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24 }}><SkeletonTable rows={8} columns={5} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ minHeight: 260, display: 'grid', placeItems: 'center', color: '#94a3b8', fontWeight: 900 }}>Nenhuma movimentacao encontrada.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #eef2f7' }}>
                  <th style={th}>Tipo</th>
                  <th style={th}>Lancamento</th>
                  <th style={th}>Valor</th>
                  <th style={th}>Data</th>
                  <th style={{ ...th, textAlign: 'right', minWidth: 190 }}>Comprovante / Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item: AccountMovement) => {
                  const isEntrada = item.type === 'entrada';
                  const isExpanded = expandedId === item.id;
                  const showAthletePhoto = isEntrada && Boolean(item.registrationId && item.athlete?.fotoUrl);
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? '' : item.id)}
                        aria-expanded={isExpanded}
                        style={{ borderBottom: isExpanded ? 'none' : '1px solid #eef2f7', cursor: 'pointer', background: isExpanded ? '#f8fafc' : '#fff' }}
                      >
                        <td style={td}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: isEntrada ? '#dcfce7' : '#fee2e2', color: isEntrada ? '#166534' : '#ef4444', padding: '6px 10px', borderRadius: 999, fontSize: '.72rem', fontWeight: 950, textTransform: 'uppercase' }}>
                            {isEntrada ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                            {isEntrada ? 'Entrada' : 'Saida'}
                          </span>
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                            <ChevronDown size={18} style={{ marginTop: 1, flexShrink: 0, color: '#64748b', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease' }} />
                            {showAthletePhoto && (
                              <img
                                src={item.athlete.fotoUrl}
                                alt={item.athlete.nome || item.title}
                                style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'cover', border: '2px solid #dcfce7', flexShrink: 0, background: '#f1f5f9' }}
                              />
                            )}
                            <div>
                              <strong style={{ display: 'block', color: '#071A45', fontSize: '.9rem', fontWeight: 950 }}>{item.title}</strong>
                              <span style={{ display: 'block', color: '#64748b', fontSize: '.76rem', fontWeight: 700, marginTop: 3 }}>{item.description}</span>
                            </div>
                          </div>
                        </td>
                        <td style={td}>
                          <strong style={{ color: isEntrada ? '#166534' : '#ef4444', fontSize: '.92rem', fontWeight: 950 }}>{isEntrada ? '+' : '-'} {fmt(item.amount)}</strong>
                        </td>
                        <td style={td}>
                          <strong style={{ display: 'block', color: '#071A45', fontSize: '.82rem', fontWeight: 900 }}>{formatDateBR(item.date)}</strong>
                          <span style={{ display: 'block', color: '#94a3b8', fontSize: '.72rem', fontWeight: 800 }}>{item.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', minWidth: 190 }}>
                          <div onClick={event => event.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
                            {item.receipt?.receiptUrl && (
                              <a href={item.receipt.receiptUrl} target="_blank" rel="noreferrer" title={item.receipt.fileName || 'Ver comprovante'} style={{ background: '#dcfce7', border: 'none', padding: '9px 11px', borderRadius: 10, color: '#166534', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 900, textDecoration: 'none' }}>
                                <FileText size={18} />
                                Ver
                              </a>
                            )}
                            <label title={item.receipt?.receiptUrl ? 'Trocar comprovante' : 'Anexar comprovante'} style={{ background: uploadingReceiptId === receiptKeyFor(provider, item) ? '#e2e8f0' : '#f1f5f9', border: 'none', padding: '9px 11px', borderRadius: 10, color: '#071A45', cursor: uploadingReceiptId ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 900 }}>
                              <Upload size={18} />
                              Anexar
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                disabled={Boolean(uploadingReceiptId)}
                                onChange={event => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  handleReceiptUpload(item, file);
                                }}
                                style={{ display: 'none' }}
                              />
                            </label>
                            {item.registrationId && (
                              <button type="button" onClick={() => navigate(`/admin/inscritos/${item.registrationId}`)} title="Ver cadastro" style={{ background: '#f1f5f9', border: 'none', padding: '9px 11px', borderRadius: 10, color: '#071A45', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 900 }}>
                                <Eye size={18} />
                                Cadastro
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ borderBottom: '1px solid #eef2f7', background: '#f8fafc' }}>
                          <td colSpan={5} style={{ padding: '0 20px 18px 20px' }}>
                            <div style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 16, padding: 16 }}>
                              {showAthletePhoto && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 12, marginBottom: 14 }}>
                                  <img src={item.athlete.fotoUrl} alt={item.athlete.nome || 'Atleta'} style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', border: '2px solid #dcfce7', flexShrink: 0 }} />
                                  <div>
                                    <span style={{ display: 'block', color: '#166534', fontSize: '.68rem', fontWeight: 950, textTransform: 'uppercase', marginBottom: 4 }}>Entrada de inscricao</span>
                                    <strong style={{ display: 'block', color: '#071A45', fontSize: '1rem', fontWeight: 950 }}>{item.athlete.nome || item.description}</strong>
                                    <span style={{ display: 'block', color: '#64748b', fontSize: '.76rem', fontWeight: 800, marginTop: 3 }}>Foto do atleta vinculada ao cadastro</span>
                                  </div>
                                </div>
                              )}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 14 }}>
                                <DetailField label="ID do movimento" value={item.id} />
                                <DetailField label="Banco" value={providerName} />
                                <DetailField label="Tipo" value={isEntrada ? 'Entrada' : 'Saida'} />
                                <DetailField label="Valor" value={`${isEntrada ? '+' : '-'} ${fmt(item.amount)}`} highlight={isEntrada ? '#166534' : '#ef4444'} />
                                <DetailField label="Data completa" value={`${formatDateBR(item.date)} ${item.date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`} />
                                <DetailField label="Cadastro vinculado" value={item.registrationId || 'Nao vinculado'} />
                                <DetailField label="Lancamento" value={item.title} wide />
                                <DetailField label="Descricao" value={item.description} wide />
                                <DetailField label="Comprovante" value={item.receipt?.fileName || (item.receipt?.receiptUrl ? 'Comprovante anexado' : 'Sem comprovante anexado')} wide />
                              </div>
                              {item.receipt?.receiptUrl && (
                                <a href={item.receipt.receiptUrl} target="_blank" rel="noreferrer" style={{ color: '#071A45', fontWeight: 900, fontSize: '.76rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                                  <FileText size={16} /> Abrir comprovante anexado
                                </a>
                              )}
                              <div>
                                <strong style={{ display: 'block', color: '#071A45', fontSize: '.78rem', fontWeight: 950, textTransform: 'uppercase', marginBottom: 8 }}>Dados completos retornados pelo banco</strong>
                                <pre style={{ margin: 0, maxHeight: 280, overflow: 'auto', background: '#0f172a', color: '#dbeafe', borderRadius: 12, padding: 14, fontSize: '.72rem', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                  {JSON.stringify(item.raw || {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle = (extra: CSSProperties = {}): CSSProperties => ({
  width: '100%',
  minHeight: 44,
  padding: '11px 14px',
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  color: '#071A45',
  fontWeight: 800,
  outline: 'none',
  ...extra,
});

const th: CSSProperties = {
  padding: '15px 20px',
  textAlign: 'left',
  color: '#64748b',
  fontSize: '.7rem',
  fontWeight: 950,
  textTransform: 'uppercase',
};

const td: CSSProperties = {
  padding: '15px 20px',
  verticalAlign: 'middle',
};

function SummaryCard({ label, value, color, background, icon }: { label: string; value: string; color: string; background: string; icon: ReactNode }) {
  return (
    <div style={{ background, border: '1px solid #e2e8f0', borderRadius: 16, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fff', color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{icon}</div>
      <div>
        <span style={{ display: 'block', color: '#64748b', fontSize: '.7rem', fontWeight: 950, textTransform: 'uppercase', marginBottom: 4 }}>{label}</span>
        <strong style={{ color, fontSize: '1.18rem', fontWeight: 950 }}>{value}</strong>
      </div>
    </div>
  );
}

function DetailField({ label, value, highlight, wide = false }: { label: string; value: ReactNode; highlight?: string; wide?: boolean }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', gridColumn: wide ? 'span 2' : undefined, minWidth: 0 }}>
      <span style={{ display: 'block', color: '#64748b', fontSize: '.66rem', fontWeight: 950, textTransform: 'uppercase', marginBottom: 5 }}>{label}</span>
      <strong style={{ display: 'block', color: highlight || '#071A45', fontSize: '.82rem', fontWeight: 900, overflowWrap: 'anywhere' }}>{value}</strong>
    </div>
  );
}
