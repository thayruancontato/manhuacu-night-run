import { useAuth } from '../context/AuthContext';
import { CreditCard, CheckCircle, Clock, ExternalLink, Download } from 'lucide-react';
import { formatDateTimeBR } from '../utils/dateUtils';

export default function AtletaPagamentos() {
  const { atletaData: reg, loading } = useAuth();

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}>Carregando...</div>;
  if (!reg) return <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>Inscricao nao encontrada.</div>;

  const isPago = reg.paymentStatus === 'pago';
  const dataInscricao = formatDateTimeBR(reg.createdAt);
  const comprovanteUrl = reg.comprovanteUrl || reg.receiptUrl || reg.invoiceUrl || '';

  return (
    <div style={{ animation: 'fadeIn .4s ease-out' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#071A45', display: 'flex', alignItems: 'center', gap: 10 }}>
          <CreditCard size={20} /> MEUS PAGAMENTOS
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Historico de transacoes e faturas.</p>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>Status da Inscricao</div>
            <div style={{ 
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 8,
              background: isPago ? '#dcfce7' : '#fef3c7',
              color: isPago ? '#166534' : '#854d0e', fontWeight: 800, fontSize: '0.75rem'
            }}>
              {isPago ? <CheckCircle size={14} /> : <Clock size={14} />}
              {isPago ? 'CONFIRMADO' : 'PENDENTE'}
            </div>
          </div>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Data da Inscricao</span>
            <span style={{ color: '#071A45', fontWeight: 700 }}>{dataInscricao}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Formas de Pagamento</span>
            <span style={{ color: '#071A45', fontWeight: 700 }}>Cartao de Credito / PIX</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0 0 0' }}>
            <span style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>Valor Total</span>
            <span style={{ color: '#071A45', fontWeight: 900, fontSize: '1.2rem' }}>
              R$ {((reg.amount || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {!isPago && reg.invoiceUrl && (
          <div style={{ marginTop: 24 }}>
            <a 
              href={reg.invoiceUrl} 
              target="_blank" 
              style={{ 
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: '#071A45', color: '#fff', padding: '14px', borderRadius: 12,
                textDecoration: 'none', fontWeight: 800, fontSize: '0.9rem', transition: 'all 0.2s'
              }}
            >
              <ExternalLink size={18} /> PAGAR AGORA
            </a>
          </div>
        )}

        {isPago && comprovanteUrl && (
          <div style={{ marginTop: 24 }}>
            <a
              href={comprovanteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: '#071A45', color: '#fff', padding: '14px', borderRadius: 12,
                border: '1px solid #071A45', fontWeight: 800, fontSize: '0.9rem', textDecoration: 'none'
              }}
            >
              <Download size={18} /> BAIXAR COMPROVANTE
            </a>
          </div>
        )}

        {isPago && !comprovanteUrl && (
          <div style={{ marginTop: 24, background: '#f8fafc', color: '#64748b', padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
            COMPROVANTE NAO ANEXADO
          </div>
        )}
      </div>
    </div>
  );
}
