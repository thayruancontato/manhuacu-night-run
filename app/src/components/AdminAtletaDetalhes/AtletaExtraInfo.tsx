import React from 'react';

interface AtletaExtraInfoProps {
  codigoInterno: string;
  numeroPeito: string | number;
}

export const AtletaExtraInfo: React.FC<AtletaExtraInfoProps> = ({ codigoInterno, numeroPeito }) => {
  return (
    <div className="extras-grid">
      <div className="extras-item">
        <span className="extras-label">CÓDIGO INTERNO</span>
        <span className="extras-value">{codigoInterno}</span>
      </div>
      <div className="extras-item">
        <span className="extras-label">FONTE</span>
        <span className="extras-value">Site Oficial</span>
      </div>
      <div className="extras-item">
        <span className="extras-label">INDICAÇÃO</span>
        <span className="extras-value">Orgânico</span>
      </div>
      <div className="extras-item">
        <span className="extras-label">NÚMERO PEITO</span>
        <span className="extras-value peito-badge">{numeroPeito}</span>
      </div>
    </div>
  );
};
