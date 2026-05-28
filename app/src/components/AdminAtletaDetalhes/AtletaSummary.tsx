import React from 'react';
import { Activity, Shirt, CreditCard, ClipboardList } from 'lucide-react';

interface AtletaSummaryProps {
  categoriaLabel: string;
  sexoLabel: string;
  kitNome: string;
  tamanhoShort: string;
  tamanhoCamisetaTipo: string;
  pagamentoLabel: string;
  statusLabel: string;
  statusClass: string;
  isConfirmada: boolean;
  formattedCreatedAt: string;
}

export const AtletaSummary: React.FC<AtletaSummaryProps> = ({
  categoriaLabel, sexoLabel, kitNome, tamanhoShort, tamanhoCamisetaTipo,
  pagamentoLabel, statusLabel, statusClass, isConfirmada, formattedCreatedAt
}) => {
  return (
    <div className="atleta-det-summary-bar">
      <div className="summary-item">
        <div className="summary-icon accent"><Activity size={20} /></div>
        <div className="summary-info">
          <span className="summary-label">MODALIDADE</span>
          <span className="summary-value">{categoriaLabel}</span>
          <span className="summary-sub">{sexoLabel}</span>
        </div>
      </div>
      <div className="summary-item">
        <div className="summary-icon blue"><Shirt size={20} /></div>
        <div className="summary-info">
          <span className="summary-label">KIT / TAMANHO</span>
          <span className="summary-value">{kitNome}</span>
          <span className="summary-sub">{tamanhoShort} {tamanhoCamisetaTipo ? `(${tamanhoCamisetaTipo})` : ''}</span>
        </div>
      </div>
      <div className="summary-item">
        <div className="summary-icon green"><CreditCard size={20} /></div>
        <div className="summary-info">
          <span className="summary-label">PAGAMENTO</span>
          <span className={`summary-value payment-${statusClass}`}>{pagamentoLabel}</span>
          <span className="summary-sub">{formattedCreatedAt}</span>
        </div>
      </div>
      <div className="summary-item">
        <div className="summary-icon yellow"><ClipboardList size={20} /></div>
        <div className="summary-info">
          <span className="summary-label">STATUS</span>
          <span className={`summary-value status-${statusClass}`}>{statusLabel}</span>
          <span className="summary-sub">{isConfirmada ? 'Inscrição Ativa' : 'Inscrição Inativa'}</span>
        </div>
      </div>
    </div>
  );
};
