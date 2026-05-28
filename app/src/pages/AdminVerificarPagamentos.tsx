import type React from 'react';
import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Send, SearchCheck, Trash2 } from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';
import { db } from '../firebase';
import { collection, getDocs, query, where, deleteDoc, doc } from 'firebase/firestore';

type AuditItem = {
  registrationId: string;
  nome: string;
  telefone: string;
  provider: 'asaas' | 'cora';
  paymentId: string;
  paymentMethod?: string;
  checkedPayments?: Array<{
    provider: 'asaas' | 'cora';
    paymentId: string;
    paymentMethod?: string;
    bankStatus?: string;
    bankPaid?: boolean;
    rawStatus?: string;
  }>;
  amount: number;
  bankStatus: string;
  bankPaid: boolean;
  bankOk: boolean;
  bankError: string;
  rawStatus: string;
  createdAt: string;
  cpf: string;
  email: string;
};

type AuditResult = {
  success: boolean;
  checkedAt: string;
  totalPending: number;
  totalChecked: number;
  totalPaidPending: number;
  paidPending: AuditItem[];
  results: AuditItem[];
};

const formatMoney = (amountInCents: number) => {
  return (Number(amountInCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const providerLabel = (provider: string) => provider === 'cora' ? 'Cora' : 'Asaas';
const methodLabel = (method?: string) => method === 'credit_card' ? 'Cartão' : 'PIX';

export default function AdminVerificarPagamentos() {
  const { showAlert } = useDialog();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [paidRegistrations, setPaidRegistrations] = useState<any[]>([]);

  const paidPending = useMemo(() => audit?.paidPending || [], [audit]);
  const pendingNotPaid = useMemo(() => (audit?.results || []).filter(item => !item.bankPaid), [audit]);

  const runAudit = async () => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return showAlert('Worker não configurado.', 'error');
    setLoading(true);
    try {
      const paidSnap = await getDocs(query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago')));
      const paidList = paidSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setPaidRegistrations(paidList);

      const res = await fetch(`${workerUrl}/payments/audit-pending`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 300 }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao verificar pagamentos.');
      setAudit(data);
      showAlert(`${data.totalPaidPending} pagamento(s) pago(s) encontrados ainda pendentes no sistema.`, data.totalPaidPending ? 'success' : 'info');
    } catch (error: any) {
      console.error('[AdminVerificarPagamentos] audit failed', error);
      showAlert(error.message || 'Erro ao verificar pagamentos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmAllPaid = async () => {
    if (!paidPending.length) return showAlert('Nenhum pagamento pago para confirmar.', 'warning');
    if (!window.confirm(`Confirmar ${paidPending.length} inscrição(ões) e disparar mensagem de pagamento confirmado`)) return;
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) return showAlert('Worker não configurado.', 'error');
    setConfirming(true);
    try {
      const res = await fetch(`${workerUrl}/payments/confirm-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationIds: paidPending.map(item => item.registrationId) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data.success) throw new Error(data.error || 'Falha ao confirmar pagamentos.');
      const sent = (data.results || []).filter((item: any) => item.notifyResult.success).length;
      showAlert(`${data.count} inscrição(ões) confirmada(s). ${sent} mensagem(ns) enviada(s).`, 'success');
      await runAudit();
    } catch (error: any) {
      console.error('[AdminVerificarPagamentos] confirm failed', error);
      showAlert(error.message || 'Erro ao confirmar pagamentos.', 'error');
    } finally {
      setConfirming(false);
    }
  };

  const findPaidResemblance = (pendingItem: AuditItem) => {
    return paidRegistrations.find(paid => {
      if (pendingItem.cpf && paid.cpf && pendingItem.cpf.replace(/\D/g, '') === paid.cpf.replace(/\D/g, '')) {
        return paid;
      }
      if (pendingItem.email && paid.email && pendingItem.email.trim().toLowerCase() === paid.email.trim().toLowerCase()) {
        return paid;
      }
      const t1 = pendingItem.telefone.replace(/\D/g, '');
      const t2 = paid.telefone.replace(/\D/g, '');
      if (t1 && t2 && (t1 === t2 || t1.endsWith(t2) || t2.endsWith(t1))) {
        return paid;
      }
      if (pendingItem.nome && paid.nome && pendingItem.nome.trim().toLowerCase() === paid.nome.trim().toLowerCase()) {
        return paid;
      }
      return null;
    });
  };

  const handleDiscard = async (id: string, name: string) => {
    if (!window.confirm(`Excluir esta inscrição pendente duplicada de "${name}" Esta ação não pode ser desfeita.`)) return;
    try {
      setDiscardingId(id);
      await deleteDoc(doc(db, 'nightrun_registrations', id));
      showAlert('Inscrição pendente descartada com sucesso.', 'success');
      await runAudit();
    } catch (error: any) {
      console.error('[AdminVerificarPagamentos] discard failed', error);
      showAlert(error.message || 'Erro ao descartar inscrição.', 'error');
    } finally {
      setDiscardingId(null);
    }
  };

  return (
    <div style={{ padding: '24px 30px', color: '#071A45' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0, color: '#071A45' }}>Verificar pagamentos</h1>
          <p style={{ color: '#64748b', fontWeight: 600, margin: '6px 0 0' }}>
            Confere inscrições pendentes no Asaas e na Cora e identifica pagamentos já aprovados no banco.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={runAudit} disabled={loading || confirming} style={primaryButton('#071A45', '#fff')}>
            {loading ? <RefreshCw size={18} className="spin" /> : <SearchCheck size={18} />}
            {loading ? 'Verificando...' : 'Verificar pagamentos'}
          </button>
          <button onClick={confirmAllPaid} disabled={!paidPending.length || loading || confirming} style={primaryButton('#6BFF2A', '#071A45', !paidPending.length || loading || confirming)}>
            {confirming ? <RefreshCw size={18} className="spin" /> : <Send size={18} />}
            {confirming ? 'Confirmando...' : 'Confirmar pagos e enviar mensagens'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 22 }}>
        <Metric label="Pendentes no sistema" value={audit ? audit.totalPending : '-'} />
        <Metric label="Verificados" value={audit ? audit.totalChecked : '-'} />
        <Metric label="Pagos no banco" value={audit ? audit.totalPaidPending : '-'} tone="success" />
        <Metric label="Ainda pendentes no banco" value={audit ? pendingNotPaid.length : '-'} tone="warning" />
      </div>

      {audit && (
        <>
          <Section
            title="Pagos no banco e pendentes no sistema"
            icon={<CheckCircle2 size={20} />}
            empty="Nenhum pagamento aprovado fora do sistema."
            items={paidPending}
            highlight
          />
          <Section
            title="Conferidos sem confirmação no banco"
            icon={<AlertTriangle size={20} />}
            empty="Nenhum outro pagamento pendente encontrado."
            items={pendingNotPaid}
            findPaidResemblance={findPaidResemblance}
            onDiscard={handleDiscard}
            discardingId={discardingId}
          />
        </>
      )}

      {!audit && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 42, textAlign: 'center', color: '#64748b', fontWeight: 700 }}>
          Clique em verificar para consultar todas as inscrições pendentes no banco de pagamento.
        </div>
      )}

      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'success' | 'warning' }) {
  const color = tone === 'success' ? '#16a34a' : tone === 'warning' ? '#d97706' : '#071A45';
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 18 }}>
      <span style={{ display: 'block', color: '#94a3b8', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>{label}</span>
      <strong style={{ color, fontSize: '1.8rem', fontWeight: 950 }}>{value}</strong>
    </div>
  );
}

function Section({ 
  title, 
  icon, 
  empty, 
  items, 
  highlight,
  findPaidResemblance,
  onDiscard,
  discardingId
}: { 
  title: string; 
  icon: React.ReactNode; 
  empty: string; 
  items: AuditItem[]; 
  highlight?: boolean;
  findPaidResemblance?: (pending: AuditItem) => any;
  onDiscard?: (id: string, name: string) => void;
  discardingId?: string | null;
}) {
  return (
    <section style={{ background: '#fff', border: `1px solid ${highlight ? '#86efac' : '#e2e8f0'}`, borderRadius: 18, overflow: 'hidden', marginBottom: 22 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', borderBottom: '1px solid #e2e8f0', color: highlight ? '#15803d' : '#071A45', fontWeight: 900 }}>
        {icon}
        <h2 style={{ margin: 0, fontSize: '1rem', textTransform: 'uppercase' }}>{title}</h2>
        <span style={{ marginLeft: 'auto', background: highlight ? '#dcfce7' : '#f1f5f9', color: highlight ? '#166534' : '#475569', borderRadius: 999, padding: '4px 10px', fontSize: '.75rem', fontWeight: 900 }}>{items.length}</span>
      </header>
      {items.length === 0 ? (
        <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>{empty}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '.72rem', textTransform: 'uppercase' }}>
                <th style={th}>Atleta</th>
                <th style={th}>Banco / forma</th>
                <th style={th}>ID pagamento</th>
                <th style={th}>Valor</th>
                <th style={th}>Status banco</th>
                <th style={th}>Telefone</th>
                {onDiscard && <th style={{ ...th, textAlign: 'right' }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const resemblance = findPaidResemblance ? findPaidResemblance(item) : null;
                const isDiscarding = discardingId === item.registrationId;
                return (
                  <tr key={item.registrationId} style={{ borderTop: '1px solid #f1f5f9', background: resemblance ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong>{item.nome || 'Sem nome'}</strong>
                        {resemblance && (
                          <span style={{ 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            background: '#fee2e2', 
                            color: '#ef4444', 
                            fontSize: '0.65rem', 
                            fontWeight: 800, 
                            padding: '2px 8px', 
                            borderRadius: 6, 
                            border: '1px solid #fca5a5' 
                          }}>
                            ⚠️ Já Pago: {resemblance.nome}
                          </span>
                        )}
                      </div>
                      <small style={small}>#{item.registrationId}</small>
                    </td>
                    <td style={td}>
                      {providerLabel(item.provider)} <small style={{ ...small, display: 'inline', marginLeft: 4 }}>{methodLabel(item.paymentMethod)}</small>
                      {item.checkedPayments && item.checkedPayments.length > 1 && (
                        <small style={small}>
                          Checou {item.checkedPayments.map(check => `${providerLabel(check.provider)} ${methodLabel(check.paymentMethod)}`).join(' + ')}
                        </small>
                      )}
                    </td>
                    <td style={td}><code style={{ fontSize: '.72rem' }}>{item.paymentId || '-'}</code></td>
                    <td style={td}>{formatMoney(item.amount)}</td>
                    <td style={td}>
                      <span style={{ padding: '4px 9px', borderRadius: 999, background: item.bankPaid ? '#dcfce7' : '#fef3c7', color: item.bankPaid ? '#166534' : '#92400e', fontWeight: 900, fontSize: '.72rem' }}>
                        {item.bankPaid ? 'PAGO' : (item.rawStatus || item.bankStatus || 'PENDENTE').toUpperCase()}
                      </span>
                      {item.bankError && <small style={small}>{item.bankError}</small>}
                    </td>
                    <td style={td}>{item.telefone || '-'}</td>
                    {onDiscard && (
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button
                          onClick={() => onDiscard(item.registrationId, item.nome)}
                          disabled={isDiscarding}
                          style={{
                            background: '#fee2e2',
                            color: '#ef4444',
                            border: '1px solid #fca5a5',
                            padding: '6px 12px',
                            borderRadius: 10,
                            fontSize: '0.72rem',
                            fontWeight: 900,
                            cursor: isDiscarding ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            opacity: isDiscarding ? 0.6 : 1,
                            transition: 'all 0.2s'
                          }}
                        >
                          <Trash2 size={13} />
                          {isDiscarding ? 'Descartando...' : 'Descartar'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontWeight: 900 };
const td: React.CSSProperties = { padding: '14px 16px', color: '#071A45', fontWeight: 700, verticalAlign: 'top' };
const small: React.CSSProperties = { display: 'block', color: '#94a3b8', fontSize: '.72rem', fontWeight: 700, marginTop: 4 };

function primaryButton(background: string, color: string, disabled = false): React.CSSProperties {
  return {
    height: 44,
    border: 'none',
    borderRadius: 12,
    padding: '0 16px',
    background,
    color,
    fontWeight: 900,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}
