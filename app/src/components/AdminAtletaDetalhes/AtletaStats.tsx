import React from 'react';
import { Eye, CheckCircle, XCircle, Trophy, DollarSign } from 'lucide-react';

interface AtletaStatsProps {
  totalInscricoes: number;
  confirmadas: number;
  canceladas: number;
  concluidas: number;
  ticketMedio: number;
}

export const AtletaStats: React.FC<AtletaStatsProps> = ({
  totalInscricoes, confirmadas, canceladas, concluidas, ticketMedio
}) => {
  return (
    <div className="atleta-det-stats-list">
      <div className="stat-row">
        <div className="stat-icon-wrap blue"><Eye size={14} /></div>
        <span className="stat-label">TOTAL DE INSCRIÇÕES</span>
        <span className="stat-value">{totalInscricoes}</span>
      </div>
      <div className="stat-row">
        <div className="stat-icon-wrap green"><CheckCircle size={14} /></div>
        <span className="stat-label">CONFIRMADAS</span>
        <span className="stat-value">{confirmadas}</span>
      </div>
      <div className="stat-row">
        <div className="stat-icon-wrap red"><XCircle size={14} /></div>
        <span className="stat-label">CANCELADAS</span>
        <span className="stat-value">{canceladas}</span>
      </div>
      <div className="stat-row">
        <div className="stat-icon-wrap yellow"><Trophy size={14} /></div>
        <span className="stat-label">CONCLUÍDAS</span>
        <span className="stat-value">{concluidas}</span>
      </div>
      <div className="stat-row">
        <div className="stat-icon-wrap green"><DollarSign size={14} /></div>
        <span className="stat-label">TICKET MÉDIO</span>
        <span className="stat-value">R$ {ticketMedio.toFixed(2).replace('.', ',')}</span>
      </div>
    </div>
  );
};
