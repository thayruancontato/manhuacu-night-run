import React from 'react';
import { DollarSign, CheckCircle } from 'lucide-react';
import { formatDateTimeBR } from '../../utils/dateUtils';

interface AtletaPaymentModalProps {
  show: boolean;
  onClose: () => void;
  allRegs: any[];
  KITS: any[];
  isConfirmada: boolean;
  onMarkAsPaid: () => void;
}

const getProviderInfo = (registration: any) => {
  if (!registration.invoiceUrl && !registration.paymentProvider) return null;
  const provider = registration.creditCardAsaasPaymentId ? 'asaas' : registration.paymentProvider === 'cora' ? 'cora' : 'asaas';
  const method = registration.creditCardAsaasPaymentId || registration.paymentMethod === 'credit_card' ? 'Cartão' : 'PIX';
  return {
    name: provider === 'cora' ? 'Cora' : 'Asaas',
    logo: provider === 'cora' ? '/cora-logo.svg' : '/asaas-logo.svg',
    method,
  };
};

export const AtletaPaymentModal: React.FC<AtletaPaymentModalProps> = ({
  show, onClose, allRegs, KITS, isConfirmada, onMarkAsPaid
}) => {
  if (!show) return null;

  return (
    <div className="atleta-det-modal-overlay" onClick={onClose}>
      <div className="atleta-det-modal" onClick={e => e.stopPropagation()}>
        <div className="atleta-det-modal-header">
          <h3><DollarSign size={18} /> Histórico de pagamentos</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="atleta-det-modal-body">
          <table className="atleta-det-table">
            <thead>
              <tr>
                <th>DATA</th>
                <th>DESCRIÇÃO</th>
                <th>VALOR</th>
                <th>STATUS</th>
                <th>MÉTODO</th>
              </tr>
            </thead>
            <tbody>
              {allRegs.map((r, i) => {
                const rDate = formatDateTimeBR(r.createdAt);
                const rKit = KITS.find(k => k.id === r.kit);
                const rPaid = r.paymentStatus === 'pago';
                const rCancelled = r.paymentStatus === 'cancelado';
                const provider = getProviderInfo(r);
                return (
                  <tr key={r.id || i}>
                    <td className="td-date">{rDate}</td>
                    <td>{rKit.nome || r.kit} — Inscrição</td>
                    <td style={{ fontWeight: 700 }}>R$ {((rKit.preco || 0) / 100).toFixed(2).replace('.', ',')}</td>
                    <td>
                      <span className={`det-badge ${rPaid ? 'paid' : rCancelled ? 'cancelled' : 'pending'}`}>
                        {rPaid ? 'Pago' : rCancelled ? 'Cancelado' : 'Pendente'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--adm-text-muted)' }}>
                      {provider ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <img src={provider.logo} alt={provider.name} style={{ height: 18, maxWidth: 70, objectFit: 'contain', background: '#fff', borderRadius: 5, padding: '3px 5px' }} />
                          {provider.method}
                        </span>
                      ) : 'Manual'}
                    </td>
                  </tr>
                );
              })}
              {allRegs.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--adm-text-dim)' }}>Nenhum pagamento registrado.</td></tr>
              )}
            </tbody>
          </table>
          {!isConfirmada && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
              <button className="atleta-det-btn-edit" onClick={() => { onClose(); onMarkAsPaid(); }}>
                <CheckCircle size={16} /> Marcar como pago manualmente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
