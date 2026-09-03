import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, ExternalLink, FileText, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { SkeletonTable } from '../components/Skeleton';
import { formatDateBR } from '../utils/dateUtils';
import '../styles/admin.css';

type Provider = 'cora' | 'asaas';

type Invoice = {
  id: string;
  provider: Provider;
  customer: string;
  description: string;
  amount: number;
  dueDate: string;
  createdAt: string;
  status: string;
  statusLabel: string;
  invoiceUrl: string;
  bankManaged?: boolean;
};

type ReconcileResult = {
  ok: boolean;
  apply?: boolean;
  checked: number;
  conflictCount: number;
  alreadyAlignedCount: number;
  appliedCount?: number;
  errorCount: number;
  conflicts: Array<{
    registrationId: string;
    paymentId: string;
    nome: string;
    amount: number;
    asaasStatus: string;
    asaasStatusLabel: string;
    invoiceUrl: string;
    paidDate: string;
  }>;
  applied?: any[];
  errors: Array<{ nome?: string; paymentId?: string; error?: string; asaasStatus?: string }>;
};

type ReverseConflict = {
  registrationId: string;
  paymentId: string;
  nome: string;
  amount: number;
  systemStatus: string;
  asaasStatus: string;
  asaasStatusLabel: string;
  invoiceUrl: string;
  euVouCardUrl: string;
  hasCard: boolean;
};

type ReverseReconcileResult = {
  ok: boolean;
  confirm?: boolean;
  checked: number;
  conflictCount: number;
  alreadyAlignedCount: number;
  confirmedCount?: number;
  errorCount: number;
  conflicts: ReverseConflict[];
  confirmed?: ReverseConflict[];
  errors: Array<{ nome?: string; paymentId?: string; registrationId?: string; error?: string; asaasStatus?: string }>;
};

type CleanupCandidate = {
  registrationId: string;
  paymentId: string;
  nome: string;
  amount: number;
  systemStatus: string;
  asaasStatus: string;
  asaasStatusLabel: string;
  invoiceUrl: string;
  invoiceExists: boolean;
  invoiceDeleted: boolean;
  canDeleteInvoice: boolean;
};

type CleanupResult = {
  ok: boolean;
  apply?: boolean;
  checked: number;
  candidateCount: number;
  ignoredCount: number;
  deletedCount?: number;
  errorCount: number;
  candidates: CleanupCandidate[];
  deleted?: CleanupCandidate[];
  errors: Array<{ nome?: string; paymentId?: string; registrationId?: string; error?: string; step?: string }>;
};

const banks = [
  { id: 'cora' as const, name: 'Cora', logo: '/cora-logo.svg', width: 52 },
  { id: 'asaas' as const, name: 'Asaas', logo: '/asaas-logo.svg', width: 64 },
];

const fmt = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AdminFaturas() {
  const { showAlert, showConfirm } = useDialog();
  const [provider, setProvider] = useState<Provider>('cora');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [fallbackMode, setFallbackMode] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileApplying, setReconcileApplying] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseConfirmingAll, setReverseConfirmingAll] = useState(false);
  const [reverseResult, setReverseResult] = useState<ReverseReconcileResult | null>(null);
  const [confirmedRows, setConfirmedRows] = useState<Record<string, boolean>>({});
  const [confirmingRowId, setConfirmingRowId] = useState('');
  const [sendingCardId, setSendingCardId] = useState('');
  const [sentCardRows, setSentCardRows] = useState<Record<string, boolean>>({});
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDeleting, setCleanupDeleting] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [selectedCleanupIds, setSelectedCleanupIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setSelectedInvoiceIds({});
    loadInvoices();
  }, [provider]);

  const loadInvoices = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) {
      showAlert('Worker nao configurado para buscar as faturas.', 'error');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${workerUrl}/bank-invoices?provider=${provider}`);
      const data = await res.json();
      if (res.status === 404) {
        await loadRegistrationInvoices();
        return;
      }
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao buscar faturas.');
      setInvoices((Array.isArray(data.items) ? data.items : []).map((item: Invoice) => ({ ...item, bankManaged: true })));
      setFallbackMode(false);
    } catch (error: any) {
      console.error(error);
      setInvoices([]);
      showAlert(error.message || 'Erro ao carregar faturas.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadRegistrationInvoices = async () => {
    const snap = await getDocs(query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc')));
    const items = snap.docs.flatMap(item => {
      const registration: any = item.data();
      const registrationProvider: Provider = registration.creditCardAsaasPaymentId
        ? 'asaas'
        : registration.paymentProvider === 'cora' ? 'cora' : 'asaas';
      if (registrationProvider !== provider) return [];
      const invoiceId = registration.creditCardAsaasPaymentId || registration.asaasPaymentId || registration.coraInvoiceId || registration.coraInvoiceCode || registration.paymentExternalId;
      const invoiceUrl = registration.creditCardInvoiceUrl || registration.invoiceUrl || '';
      if (!invoiceId && !invoiceUrl) return [];
      return [{
        id: String(invoiceId || item.id),
        provider,
        customer: registration.nome || 'Atleta',
        description: registration.modalidadeNome || registration.modalidade || registration.categoria || 'Inscricao MCU Night Run',
        amount: Number(registration.amount || 0),
        dueDate: registration.dueDate || '',
        createdAt: registration.createdAt?.toDate?.()?.toISOString?.() || registration.createdAt || '',
        status: registration.paymentStatus === 'pago' ? 'PAID' : registration.paymentStatus === 'cancelado' ? 'CANCELLED' : 'PENDING',
        statusLabel: registration.paymentStatus === 'pago' ? 'Paga' : registration.paymentStatus === 'cancelado' ? 'Cancelada' : 'Pendente',
        invoiceUrl,
        bankManaged: false,
      } satisfies Invoice];
    });
    setInvoices(items);
    setFallbackMode(true);
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter(invoice => [
      invoice.customer,
      invoice.description,
      invoice.id,
      invoice.statusLabel,
    ].some(value => String(value || '').toLowerCase().includes(term)));
  }, [invoices, search]);

  const isSelectableOverdue = (invoice: Invoice) => (
    provider === 'asaas' &&
    invoice.bankManaged === true &&
    String(invoice.status || '').toUpperCase() === 'OVERDUE'
  );
  const selectableOverdue = filtered.filter(isSelectableOverdue);
  const selectedIds = Object.keys(selectedInvoiceIds).filter(id => selectedInvoiceIds[id]);
  const selectedOverdueIds = selectedIds.filter(id => selectableOverdue.some(invoice => invoice.id === id));

  const deleteInvoice = async (invoice: Invoice) => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return;
    try {
      setDeletingId(invoice.id);
      const res = await fetch(`${workerUrl}/bank-invoices/${provider}/${encodeURIComponent(invoice.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Nao foi possivel excluir a fatura.');
      setInvoices(current => current.filter(item => item.id !== invoice.id));
      showAlert('Fatura excluida com sucesso.', 'success');
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao excluir fatura.', 'error');
    } finally {
      setDeletingId('');
    }
  };

  const requestDelete = (invoice: Invoice) => {
    showConfirm(`Excluir a fatura de ${invoice.customer || 'cliente'} no ${provider === 'cora' ? 'Cora' : 'Asaas'}? Esta acao nao pode ser desfeita.`, () => deleteInvoice(invoice));
  };

  const toggleInvoiceSelection = (invoice: Invoice) => {
    if (!isSelectableOverdue(invoice)) return;
    setSelectedInvoiceIds(current => ({ ...current, [invoice.id]: !current[invoice.id] }));
  };

  const selectAllVisibleOverdue = () => {
    setSelectedInvoiceIds(current => {
      const next = { ...current };
      selectableOverdue.forEach(invoice => { next[invoice.id] = true; });
      return next;
    });
  };

  const clearSelection = () => setSelectedInvoiceIds({});

  const deleteSelectedOverdue = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl || selectedOverdueIds.length === 0) return;
    setBulkDeleting(true);
    try {
      const res = await fetch(`${workerUrl}/bank-invoices/asaas/delete-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedOverdueIds })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao excluir faturas vencidas.');
      setInvoices(current => current.filter(invoice => !selectedOverdueIds.includes(invoice.id)));
      setSelectedInvoiceIds({});
      showAlert(`${data.deletedCount || 0} fatura(s) vencida(s) excluida(s) no Asaas.`, data.errorCount ? 'warning' : 'success');
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao excluir faturas vencidas.', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const requestDeleteSelectedOverdue = () => {
    showConfirm(`Excluir ${selectedOverdueIds.length} fatura(s) vencida(s) no Asaas? Isso nao apaga inscricoes do sistema.`, () => deleteSelectedOverdue());
  };

  const verifyAsaasInvoices = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return showAlert('Worker nao configurado para verificar faturas.', 'error');
    setProvider('asaas');
    setReconcileOpen(true);
    setReconcileLoading(true);
    setReconcileResult(null);
    try {
      const res = await fetch(`${workerUrl}/bank-invoices/asaas/reconcile-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: false })
      });
      const data = await res.json();
      if (res.status === 404) throw new Error('A verificacao ainda depende da atualizacao do Worker bancario.');
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao verificar faturas.');
      setReconcileResult(data);
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao verificar faturas.', 'error');
      setReconcileOpen(false);
    } finally {
      setReconcileLoading(false);
    }
  };

  const applyAsaasCorrections = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl || !reconcileResult?.conflictCount) return;
    setReconcileApplying(true);
    try {
      const res = await fetch(`${workerUrl}/bank-invoices/asaas/reconcile-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true })
      });
      const data = await res.json();
      if (res.status === 404) throw new Error('A correcao ainda depende da atualizacao do Worker bancario.');
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao aplicar correcao.');
      setReconcileResult(data);
      showAlert(`${data.appliedCount || 0} faturas corrigidas no Asaas.`, 'success');
      loadInvoices();
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao aplicar correcao.', 'error');
    } finally {
      setReconcileApplying(false);
    }
  };

  const verifySystemPendingInvoices = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return showAlert('Worker nao configurado para verificar faturas.', 'error');
    setProvider('asaas');
    setReverseOpen(true);
    setReverseLoading(true);
    setReverseResult(null);
    setConfirmedRows({});
    setSentCardRows({});
    try {
      const res = await fetch(`${workerUrl}/bank-invoices/asaas/reconcile-system-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: false })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao verificar faturas pagas no Asaas.');
      setReverseResult(data);
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao verificar faturas pagas no Asaas.', 'error');
      setReverseOpen(false);
    } finally {
      setReverseLoading(false);
    }
  };

  const confirmSystemPayment = async (registrationIds: string[]) => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl || registrationIds.length === 0) return;
    const isBulk = registrationIds.length > 1;
    if (isBulk) setReverseConfirmingAll(true);
    else setConfirmingRowId(registrationIds[0]);
    try {
      const res = await fetch(`${workerUrl}/bank-invoices/asaas/reconcile-system-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, registrationIds })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao confirmar pagamento no sistema.');
      const confirmedIds = (data.confirmed || []).map((item: ReverseConflict) => item.registrationId);
      setConfirmedRows(current => confirmedIds.reduce((acc: Record<string, boolean>, id: string) => ({ ...acc, [id]: true }), current));
      setReverseResult(current => current ? {
        ...current,
        confirmedCount: (current.confirmedCount || 0) + confirmedIds.length,
        errors: data.errors || current.errors,
        errorCount: data.errorCount || current.errorCount,
      } : current);
      showAlert(`${confirmedIds.length} pagamento(s) confirmado(s) no sistema.`, confirmedIds.length ? 'success' : 'warning');
      loadInvoices();
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao confirmar pagamento no sistema.', 'error');
    } finally {
      setReverseConfirmingAll(false);
      setConfirmingRowId('');
    }
  };

  const sendEuVouCard = async (registrationId: string) => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return;
    setSendingCardId(registrationId);
    try {
      const res = await fetch(`${workerUrl}/registrations/${encodeURIComponent(registrationId)}/send-payment-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        const reasons: Record<string, string> = {
          missing_card: 'Card Eu Vou nao gerado para esta inscricao.',
          missing_phone: 'Telefone nao encontrado para esta inscricao.',
          registration_not_paid: 'Confirme o pagamento antes de enviar o card.',
        };
        throw new Error(reasons[data.reason] || data.error || 'Erro ao enviar card Eu Vou.');
      }
      setSentCardRows(current => ({ ...current, [registrationId]: true }));
      showAlert('Card Eu Vou enviado.', 'success');
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao enviar card Eu Vou.', 'error');
    } finally {
      setSendingCardId('');
    }
  };

  const verifyCleanupCandidates = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return showAlert('Worker nao configurado para verificar cadastros.', 'error');
    setProvider('asaas');
    setCleanupOpen(true);
    setCleanupLoading(true);
    setCleanupResult(null);
    setSelectedCleanupIds({});
    try {
      const res = await fetch(`${workerUrl}/bank-invoices/asaas/cleanup-registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: false })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao buscar cadastros pendentes/vencidos.');
      setCleanupResult(data);
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao buscar cadastros pendentes/vencidos.', 'error');
      setCleanupOpen(false);
    } finally {
      setCleanupLoading(false);
    }
  };

  const cleanupSelectedIds = Object.keys(selectedCleanupIds).filter(id => selectedCleanupIds[id]);

  const selectAllCleanupCandidates = () => {
    if (!cleanupResult) return;
    setSelectedCleanupIds(cleanupResult.candidates.reduce((acc: Record<string, boolean>, item) => ({ ...acc, [item.registrationId]: true }), {}));
  };

  const toggleCleanupCandidate = (registrationId: string) => {
    setSelectedCleanupIds(current => ({ ...current, [registrationId]: !current[registrationId] }));
  };

  const deleteSelectedCleanupCandidates = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl || cleanupSelectedIds.length === 0) return;
    setCleanupDeleting(true);
    try {
      const res = await fetch(`${workerUrl}/bank-invoices/asaas/cleanup-registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: true, registrationIds: cleanupSelectedIds })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao apagar cadastros selecionados.');
      const deletedIds = (data.deleted || []).map((item: CleanupCandidate) => item.registrationId);
      setCleanupResult(current => current ? {
        ...current,
        candidates: current.candidates.filter(item => !deletedIds.includes(item.registrationId)),
        candidateCount: Math.max(0, current.candidateCount - deletedIds.length),
        deletedCount: (current.deletedCount || 0) + deletedIds.length,
        errors: data.errors || current.errors,
        errorCount: data.errorCount || current.errorCount,
      } : current);
      setSelectedCleanupIds({});
      setInvoices(current => current.filter(invoice => !deletedIds.includes(invoice.id)));
      showAlert(`${deletedIds.length} cadastro(s) apagado(s).`, data.errorCount ? 'warning' : 'success');
      loadInvoices();
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao apagar cadastros selecionados.', 'error');
    } finally {
      setCleanupDeleting(false);
    }
  };

  const requestDeleteCleanupCandidates = () => {
    showConfirm(`Apagar ${cleanupSelectedIds.length} cadastro(s) do sistema e suas faturas no Asaas quando existirem? Esta acao nao pode ser desfeita.`, () => deleteSelectedCleanupCandidates());
  };

  const statusColors = (status: string) => {
    const normalized = status.toUpperCase();
    if (/PAID|RECEIVED|CONFIRMED/.test(normalized)) return { background: '#dcfce7', color: '#166534' };
    if (/OVERDUE/.test(normalized)) return { background: '#fee2e2', color: '#b91c1c' };
    if (/CANCEL|DELETE|REFUND/.test(normalized)) return { background: '#f1f5f9', color: '#64748b' };
    return { background: '#fef3c7', color: '#92400e' };
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 950, margin: 0 }}>Faturas</h1>
          <p style={{ color: '#64748b', fontWeight: 700, margin: '5px 0 0' }}>Consulte, abra ou exclua as faturas emitidas em cada banco.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={verifyAsaasInvoices} disabled={reconcileLoading || reconcileApplying} title="Verificar faturas pagas no sistema e pendentes no Asaas" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 15px', fontWeight: 900, cursor: reconcileLoading ? 'wait' : 'pointer' }}>
            <AlertTriangle size={17} /> {reconcileLoading ? 'Verificando...' : 'Verificar faturas'}
          </button>
          <button onClick={verifySystemPendingInvoices} disabled={reverseLoading || reverseConfirmingAll} title="Verificar faturas pagas no Asaas e pendentes no sistema" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 15px', fontWeight: 900, cursor: reverseLoading ? 'wait' : 'pointer' }}>
            <CheckCircle size={17} /> {reverseLoading ? 'Verificando...' : 'Pagas no Asaas'}
          </button>
          <button onClick={verifyCleanupCandidates} disabled={cleanupLoading || cleanupDeleting} title="Selecionar cadastros pendentes/vencidos e apagar no Asaas e no sistema" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 15px', fontWeight: 900, cursor: cleanupLoading ? 'wait' : 'pointer' }}>
            <Trash2 size={17} /> {cleanupLoading ? 'Verificando...' : 'Limpar pendentes'}
          </button>
          <button onClick={loadInvoices} disabled={loading} title="Atualizar faturas" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#071A45', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 15px', fontWeight: 900, cursor: loading ? 'wait' : 'pointer' }}>
            <RefreshCw size={17} /> {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 5, padding: 5, width: 'fit-content', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, marginBottom: 18 }}>
        {banks.map(bank => {
          const active = provider === bank.id;
          return (
            <button key={bank.id} onClick={() => setProvider(bank.id)} title={`Faturas do ${bank.name}`} style={{ minWidth: 112, minHeight: 44, border: 'none', borderRadius: 8, background: active ? '#071A45' : '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <img src={bank.logo} alt={bank.name} style={{ width: bank.width, height: 20, objectFit: 'contain', filter: active && bank.id === 'asaas' ? 'brightness(0) invert(1)' : 'none' }} />
            </button>
          );
        })}
      </div>

      {fallbackMode && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', padding: '11px 14px', borderRadius: 10, marginBottom: 16, fontSize: '.8rem', fontWeight: 800 }}>
          Exibindo as faturas vinculadas às inscrições. A exclusão no banco será liberada após a atualização da integração bancária.
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 560 }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente, descricao, ID ou status..." style={{ width: '100%', minHeight: 44, padding: '10px 14px 10px 42px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', color: '#071A45', fontWeight: 700, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          {provider === 'asaas' && selectableOverdue.length > 0 && (
            <>
              <button onClick={selectAllVisibleOverdue} style={{ minHeight: 38, border: '1px solid #cbd5e1', background: '#fff', color: '#071A45', borderRadius: 9, padding: '8px 10px', fontSize: '.72rem', fontWeight: 900, cursor: 'pointer' }}>
                Selecionar vencidas
              </button>
              <button onClick={clearSelection} disabled={selectedOverdueIds.length === 0} style={{ minHeight: 38, border: '1px solid #cbd5e1', background: '#fff', color: selectedOverdueIds.length ? '#071A45' : '#cbd5e1', borderRadius: 9, padding: '8px 10px', fontSize: '.72rem', fontWeight: 900, cursor: selectedOverdueIds.length ? 'pointer' : 'not-allowed' }}>
                Limpar
              </button>
              <button onClick={requestDeleteSelectedOverdue} disabled={bulkDeleting || selectedOverdueIds.length === 0} style={{ minHeight: 38, border: 'none', background: selectedOverdueIds.length ? '#b91c1c' : '#cbd5e1', color: '#fff', borderRadius: 9, padding: '8px 10px', fontSize: '.72rem', fontWeight: 900, cursor: selectedOverdueIds.length ? (bulkDeleting ? 'wait' : 'pointer') : 'not-allowed' }}>
                {bulkDeleting ? 'Excluindo...' : `Excluir selecionadas (${selectedOverdueIds.length})`}
              </button>
            </>
          )}
          <strong style={{ color: '#64748b', fontSize: '.8rem' }}>{filtered.length} de {invoices.length} faturas</strong>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24 }}><SkeletonTable rows={8} columns={6} /></div>
        ) : filtered.length === 0 ? (
          <div style={{ minHeight: 260, display: 'grid', placeItems: 'center', textAlign: 'center', color: '#94a3b8', fontWeight: 900 }}>
            <div><FileText size={34} style={{ marginBottom: 8 }} /><div>Nenhuma fatura encontrada.</div></div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['', 'Cliente / Fatura', 'Valor', 'Vencimento', 'Status', 'Emissao', 'Acoes'].map((label, index) => (
                    <th key={label} style={{ padding: '14px 18px', textAlign: index === 5 ? 'right' : 'left', color: '#64748b', fontSize: '.7rem', fontWeight: 950, textTransform: 'uppercase' }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(invoice => (
                  <tr key={invoice.id} style={{ borderBottom: '1px solid #eef2f7' }}>
                    <td style={{ padding: '15px 0 15px 18px', width: 44 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedInvoiceIds[invoice.id])}
                        disabled={!isSelectableOverdue(invoice)}
                        onChange={() => toggleInvoiceSelection(invoice)}
                        title={isSelectableOverdue(invoice) ? 'Selecionar fatura vencida' : 'Apenas faturas vencidas do Asaas podem ser selecionadas'}
                        style={{ width: 16, height: 16, cursor: isSelectableOverdue(invoice) ? 'pointer' : 'not-allowed' }}
                      />
                    </td>
                    <td style={{ padding: '15px 18px', minWidth: 260 }}>
                      <strong style={{ display: 'block', fontSize: '.88rem', fontWeight: 950 }}>{invoice.customer}</strong>
                      <span style={{ display: 'block', color: '#64748b', fontSize: '.74rem', fontWeight: 700, marginTop: 3 }}>{invoice.description || invoice.id}</span>
                    </td>
                    <td style={{ padding: '15px 18px', fontWeight: 950 }}>{fmt(invoice.amount)}</td>
                    <td style={{ padding: '15px 18px', color: '#475569', fontWeight: 800 }}>{invoice.dueDate ? formatDateBR(invoice.dueDate) : '-'}</td>
                    <td style={{ padding: '15px 18px' }}>
                      <span style={{ ...statusColors(invoice.status), display: 'inline-flex', padding: '5px 9px', borderRadius: 7, fontSize: '.7rem', fontWeight: 950 }}>{invoice.statusLabel}</span>
                    </td>
                    <td style={{ padding: '15px 18px', color: '#475569', fontWeight: 800 }}>{invoice.createdAt ? formatDateBR(invoice.createdAt) : '-'}</td>
                    <td style={{ padding: '15px 18px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" disabled={!invoice.invoiceUrl} onClick={() => window.open(invoice.invoiceUrl, '_blank', 'noopener,noreferrer')} title={invoice.invoiceUrl ? 'Abrir fatura' : 'Link nao fornecido pelo banco'} style={{ width: 38, height: 38, border: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', background: '#f1f5f9', color: invoice.invoiceUrl ? '#071A45' : '#cbd5e1', cursor: invoice.invoiceUrl ? 'pointer' : 'not-allowed' }}>
                          <ExternalLink size={18} />
                        </button>
                        <button type="button" disabled={!invoice.bankManaged || deletingId === invoice.id} onClick={() => requestDelete(invoice)} title={invoice.bankManaged ? 'Excluir fatura' : 'Exclusao indisponivel ate atualizar a integracao'} style={{ width: 38, height: 38, border: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', background: invoice.bankManaged ? '#fee2e2' : '#f1f5f9', color: invoice.bankManaged ? '#b91c1c' : '#cbd5e1', cursor: invoice.bankManaged ? (deletingId ? 'wait' : 'pointer') : 'not-allowed' }}>
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reconcileOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ width: 'min(760px, 100%)', maxHeight: '88vh', overflow: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(15,23,42,.28)', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.2rem', fontWeight: 950 }}>Verificacao de faturas Asaas</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '.82rem', fontWeight: 700 }}>Usa pagamentos marcados como pagos no sistema como base.</p>
              </div>
              <button onClick={() => setReconcileOpen(false)} style={{ width: 38, height: 38, border: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', background: '#f1f5f9', color: '#071A45', cursor: 'pointer' }} title="Fechar">
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {reconcileLoading ? (
                <SkeletonTable rows={4} columns={3} />
              ) : reconcileResult ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <Metric label="Verificadas" value={reconcileResult.checked} />
                    <Metric label="Conflitos" value={reconcileResult.conflictCount} tone={reconcileResult.conflictCount ? '#b45309' : '#166534'} />
                    <Metric label="Ja corretas" value={reconcileResult.alreadyAlignedCount} />
                    <Metric label="Corrigidas" value={reconcileResult.appliedCount || 0} tone="#166534" />
                  </div>

                  {reconcileResult.conflictCount > 0 ? (
                    <div style={{ border: '1px solid #fed7aa', background: '#fff7ed', color: '#9a3412', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.82rem', fontWeight: 800 }}>
                      Foram encontradas faturas que estao pagas no sistema, mas pendentes no Asaas. Ao aplicar, elas serao marcadas no Asaas como recebidas em dinheiro, sem gerar saldo na conta Asaas.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.82rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle size={18} /> Nenhum conflito pendente encontrado.
                    </div>
                  )}

                  {reconcileResult.conflicts.length > 0 && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                      {reconcileResult.conflicts.map(item => (
                        <div key={item.paymentId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, padding: 12, borderBottom: '1px solid #eef2f7' }}>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ color: '#071A45', fontSize: '.9rem', fontWeight: 950 }}>{item.nome}</strong>
                            <div style={{ color: '#64748b', fontSize: '.76rem', fontWeight: 700, marginTop: 3, overflowWrap: 'anywhere' }}>{item.paymentId}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong style={{ display: 'block', color: '#071A45' }}>{fmt(item.amount)}</strong>
                            <span style={{ color: '#b45309', fontSize: '.72rem', fontWeight: 900 }}>{item.asaasStatusLabel}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {reconcileResult.errors.length > 0 && (
                    <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.8rem', fontWeight: 800 }}>
                      {reconcileResult.errorCount} itens nao puderam ser corrigidos automaticamente.
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => setReconcileOpen(false)} style={{ minHeight: 42, border: '1px solid #cbd5e1', background: '#fff', color: '#071A45', borderRadius: 10, padding: '9px 14px', fontWeight: 900, cursor: 'pointer' }}>Fechar</button>
                    <button onClick={applyAsaasCorrections} disabled={reconcileApplying || reconcileResult.conflictCount === 0} style={{ minHeight: 42, border: 'none', background: reconcileResult.conflictCount ? '#071A45' : '#cbd5e1', color: '#fff', borderRadius: 10, padding: '9px 14px', fontWeight: 900, cursor: reconcileResult.conflictCount ? (reconcileApplying ? 'wait' : 'pointer') : 'not-allowed' }}>
                      {reconcileApplying ? 'Aplicando...' : 'Aplicar correcao'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {reverseOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ width: 'min(860px, 100%)', maxHeight: '88vh', overflow: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(15,23,42,.28)', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.2rem', fontWeight: 950 }}>Pagas no Asaas e pendentes no sistema</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '.82rem', fontWeight: 700 }}>Confirme no sistema e depois envie o card Eu Vou sem fechar esta tela.</p>
              </div>
              <button onClick={() => setReverseOpen(false)} style={{ width: 38, height: 38, border: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', background: '#f1f5f9', color: '#071A45', cursor: 'pointer' }} title="Fechar">
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {reverseLoading ? (
                <SkeletonTable rows={4} columns={4} />
              ) : reverseResult ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <Metric label="Verificadas" value={reverseResult.checked} />
                    <Metric label="Para confirmar" value={reverseResult.conflictCount} tone={reverseResult.conflictCount ? '#166534' : '#071A45'} />
                    <Metric label="Confirmadas" value={Object.keys(confirmedRows).length || reverseResult.confirmedCount || 0} tone="#166534" />
                    <Metric label="Erros" value={reverseResult.errorCount || 0} tone={reverseResult.errorCount ? '#b91c1c' : '#071A45'} />
                  </div>

                  {reverseResult.conflictCount === 0 ? (
                    <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.82rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle size={18} /> Nenhuma fatura paga no Asaas e pendente no sistema.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.82rem', fontWeight: 800 }}>
                      Encontramos pagamentos confirmados no Asaas que ainda estao pendentes no sistema. Voce pode confirmar um por vez ou todos de uma vez.
                    </div>
                  )}

                  {reverseResult.conflicts.length > 0 && (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                      {reverseResult.conflicts.map(item => {
                        const confirmed = confirmedRows[item.registrationId];
                        const cardSent = sentCardRows[item.registrationId];
                        return (
                          <div key={item.registrationId} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, padding: 12, borderBottom: '1px solid #eef2f7', alignItems: 'center' }}>
                            <div style={{ minWidth: 0 }}>
                              <strong style={{ color: '#071A45', fontSize: '.9rem', fontWeight: 950 }}>{item.nome}</strong>
                              <div style={{ color: '#64748b', fontSize: '.76rem', fontWeight: 700, marginTop: 3, overflowWrap: 'anywhere' }}>{item.paymentId}</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
                                <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 7px', borderRadius: 7, fontSize: '.68rem', fontWeight: 950 }}>Asaas: {item.asaasStatusLabel}</span>
                                <span style={{ background: confirmed ? '#dcfce7' : '#fef3c7', color: confirmed ? '#166534' : '#92400e', padding: '4px 7px', borderRadius: 7, fontSize: '.68rem', fontWeight: 950 }}>Sistema: {confirmed ? 'Pago' : item.systemStatus}</span>
                              </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <strong style={{ color: '#071A45', minWidth: 92, textAlign: 'right' }}>{fmt(item.amount)}</strong>
                              {!confirmed ? (
                                <button onClick={() => confirmSystemPayment([item.registrationId])} disabled={confirmingRowId === item.registrationId || reverseConfirmingAll} style={{ minHeight: 38, border: 'none', background: '#071A45', color: '#fff', borderRadius: 9, padding: '8px 10px', fontSize: '.72rem', fontWeight: 900, cursor: confirmingRowId === item.registrationId ? 'wait' : 'pointer' }}>
                                  {confirmingRowId === item.registrationId ? 'Confirmando...' : 'Confirmar pagamento'}
                                </button>
                              ) : (
                                <button onClick={() => sendEuVouCard(item.registrationId)} disabled={!item.hasCard || sendingCardId === item.registrationId || cardSent} title={item.hasCard ? 'Enviar card Eu Vou' : 'Card Eu Vou nao gerado'} style={{ minHeight: 38, border: 'none', background: cardSent ? '#dcfce7' : item.hasCard ? '#16a34a' : '#cbd5e1', color: cardSent ? '#166534' : '#fff', borderRadius: 9, padding: '8px 10px', fontSize: '.72rem', fontWeight: 900, cursor: item.hasCard && !cardSent ? (sendingCardId === item.registrationId ? 'wait' : 'pointer') : 'not-allowed' }}>
                                  {cardSent ? 'Card enviado' : sendingCardId === item.registrationId ? 'Enviando...' : 'Enviar card Eu Vou'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {reverseResult.errors.length > 0 && (
                    <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.8rem', fontWeight: 800 }}>
                      {reverseResult.errorCount} itens nao puderam ser processados automaticamente.
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => setReverseOpen(false)} style={{ minHeight: 42, border: '1px solid #cbd5e1', background: '#fff', color: '#071A45', borderRadius: 10, padding: '9px 14px', fontWeight: 900, cursor: 'pointer' }}>Fechar</button>
                    <button onClick={() => confirmSystemPayment(reverseResult.conflicts.filter(item => !confirmedRows[item.registrationId]).map(item => item.registrationId))} disabled={reverseConfirmingAll || reverseResult.conflictCount === 0 || reverseResult.conflicts.every(item => confirmedRows[item.registrationId])} style={{ minHeight: 42, border: 'none', background: reverseResult.conflictCount ? '#071A45' : '#cbd5e1', color: '#fff', borderRadius: 10, padding: '9px 14px', fontWeight: 900, cursor: reverseResult.conflictCount ? (reverseConfirmingAll ? 'wait' : 'pointer') : 'not-allowed' }}>
                      {reverseConfirmingAll ? 'Confirmando...' : 'Confirmar todas'}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {cleanupOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
          <div style={{ width: 'min(900px, 100%)', maxHeight: '88vh', overflow: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 24px 70px rgba(15,23,42,.28)', border: '1px solid #e2e8f0' }}>
            <div style={{ padding: 20, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
              <div>
                <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.2rem', fontWeight: 950 }}>Limpar cadastros pendentes/vencidos</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '.82rem', fontWeight: 700 }}>Apaga a fatura no Asaas quando existir e tambem apaga a inscricao do sistema.</p>
              </div>
              <button onClick={() => setCleanupOpen(false)} style={{ width: 38, height: 38, border: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', background: '#f1f5f9', color: '#071A45', cursor: 'pointer' }} title="Fechar">
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: 20 }}>
              {cleanupLoading ? (
                <SkeletonTable rows={5} columns={4} />
              ) : cleanupResult ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
                    <Metric label="Verificados" value={cleanupResult.checked} />
                    <Metric label="Selecionaveis" value={cleanupResult.candidateCount} tone={cleanupResult.candidateCount ? '#b91c1c' : '#071A45'} />
                    <Metric label="Ignorados" value={cleanupResult.ignoredCount} />
                    <Metric label="Apagados" value={cleanupResult.deletedCount || 0} tone="#166534" />
                  </div>

                  <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.82rem', fontWeight: 850 }}>
                    Esta acao apaga cadastros do sistema. Use apenas para inscricoes pendentes/vencidas ou com fatura ja apagada no Asaas.
                  </div>

                  {cleanupResult.candidates.length === 0 ? (
                    <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.82rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckCircle size={18} /> Nenhum cadastro pendente/vencido para limpeza.
                    </div>
                  ) : (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                      {cleanupResult.candidates.map(item => (
                        <div key={item.registrationId} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 12, padding: 12, borderBottom: '1px solid #eef2f7', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCleanupIds[item.registrationId])}
                            onChange={() => toggleCleanupCandidate(item.registrationId)}
                            style={{ width: 17, height: 17, cursor: 'pointer' }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ color: '#071A45', fontSize: '.9rem', fontWeight: 950 }}>{item.nome}</strong>
                            <div style={{ color: '#64748b', fontSize: '.76rem', fontWeight: 700, marginTop: 3, overflowWrap: 'anywhere' }}>{item.paymentId}</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 7 }}>
                              <span style={{ background: '#fef3c7', color: '#92400e', padding: '4px 7px', borderRadius: 7, fontSize: '.68rem', fontWeight: 950 }}>Sistema: {item.systemStatus}</span>
                              <span style={{ background: item.invoiceDeleted ? '#f1f5f9' : '#fee2e2', color: item.invoiceDeleted ? '#64748b' : '#b91c1c', padding: '4px 7px', borderRadius: 7, fontSize: '.68rem', fontWeight: 950 }}>
                                Asaas: {item.asaasStatusLabel}
                              </span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong style={{ display: 'block', color: '#071A45' }}>{fmt(item.amount)}</strong>
                            <span style={{ color: item.invoiceDeleted ? '#64748b' : '#b91c1c', fontSize: '.72rem', fontWeight: 900 }}>
                              {item.invoiceDeleted ? 'Fatura ja apagada' : 'Apaga fatura + cadastro'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {cleanupResult.errors.length > 0 && (
                    <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: '.8rem', fontWeight: 800 }}>
                      {cleanupResult.errorCount} itens nao puderam ser apagados.
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={selectAllCleanupCandidates} disabled={cleanupResult.candidates.length === 0} style={{ minHeight: 42, border: '1px solid #cbd5e1', background: '#fff', color: cleanupResult.candidates.length ? '#071A45' : '#cbd5e1', borderRadius: 10, padding: '9px 14px', fontWeight: 900, cursor: cleanupResult.candidates.length ? 'pointer' : 'not-allowed' }}>Selecionar todos</button>
                      <button onClick={() => setSelectedCleanupIds({})} disabled={cleanupSelectedIds.length === 0} style={{ minHeight: 42, border: '1px solid #cbd5e1', background: '#fff', color: cleanupSelectedIds.length ? '#071A45' : '#cbd5e1', borderRadius: 10, padding: '9px 14px', fontWeight: 900, cursor: cleanupSelectedIds.length ? 'pointer' : 'not-allowed' }}>Limpar selecao</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => setCleanupOpen(false)} style={{ minHeight: 42, border: '1px solid #cbd5e1', background: '#fff', color: '#071A45', borderRadius: 10, padding: '9px 14px', fontWeight: 900, cursor: 'pointer' }}>Fechar</button>
                      <button onClick={requestDeleteCleanupCandidates} disabled={cleanupDeleting || cleanupSelectedIds.length === 0} style={{ minHeight: 42, border: 'none', background: cleanupSelectedIds.length ? '#b91c1c' : '#cbd5e1', color: '#fff', borderRadius: 10, padding: '9px 14px', fontWeight: 900, cursor: cleanupSelectedIds.length ? (cleanupDeleting ? 'wait' : 'pointer') : 'not-allowed' }}>
                        {cleanupDeleting ? 'Apagando...' : `Apagar selecionados (${cleanupSelectedIds.length})`}
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, tone = '#071A45' }: { label: string; value: number; tone?: string }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
      <span style={{ display: 'block', color: '#64748b', fontSize: '.68rem', fontWeight: 950, textTransform: 'uppercase', marginBottom: 4 }}>{label}</span>
      <strong style={{ color: tone, fontSize: '1.25rem', fontWeight: 950 }}>{value}</strong>
    </div>
  );
}
