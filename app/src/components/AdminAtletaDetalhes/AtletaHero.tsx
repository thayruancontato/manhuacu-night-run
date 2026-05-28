import React from 'react';
import { Mail, Phone, Calendar, MapPin, ClipboardList, CheckCircle } from 'lucide-react';

interface AtletaHeroProps {
  reg: any;
  initials: string;
  statusClass: string;
  isConfirmada: boolean;
  isPendente: boolean;
  numeroPeito: string | number;
  onEditPhoto: () => void;
  onZoomPhoto: () => void;
}

export const AtletaHero: React.FC<AtletaHeroProps> = ({
  reg, initials, statusClass, isConfirmada, isPendente, numeroPeito,
  onEditPhoto, onZoomPhoto
}) => {
  return (
    <div className="atleta-det-hero">
      <div className="atleta-det-hero-bg">
        <img src="/fundo-card-atleta.png" alt="" />
        <div className="atleta-det-hero-overlay" />
      </div>

      <div className="atleta-det-hero-content">
        <div className="atleta-det-hero-left">
          <div className="atleta-det-avatar-wrapper">
            <div className="atleta-det-avatar-ring" onClick={onZoomPhoto} style={{ cursor: 'pointer' }}>
              {reg.fotoUrl ? (
                <img src={reg.fotoUrl} alt={reg.nome} className="atleta-det-avatar-img" />
              ) : (
                <div className="atleta-det-avatar-placeholder">{initials}</div>
              )}
            </div>
            <button className="atleta-det-edit-photo-btn" onClick={(e) => { e.stopPropagation(); onEditPhoto(); }}>
              Editar foto
            </button>
          </div>

          <div className="atleta-det-hero-info">
            <span className="atleta-det-hero-number">#{numeroPeito}</span>
            <h1 className="atleta-det-hero-name">{reg.nome.toUpperCase()}</h1>
            <span className={`atleta-det-status-badge ${statusClass}`}>
              {isConfirmada ? 'ATIVO' : isPendente ? 'PENDENTE' : 'INATIVO'}
            </span>
          </div>
        </div>

        <div className="atleta-det-hero-right">
          <div className="atleta-det-date-info">
            {/* Dates can be passed as props if needed, but keeping simple for now */}
          </div>
        </div>
      </div>
    </div>
  );
};
