import React from 'react';
import { Plus } from 'lucide-react';

interface AtletaObservationsProps {
  observations: string[];
  onAdd: () => void;
}

export const AtletaObservations: React.FC<AtletaObservationsProps> = ({ observations, onAdd }) => {
  return (
    <>
      {observations.length === 0 && (
        <p className="obs-empty">Nenhuma observação registrada.</p>
      )}
      {observations.map((obs, i) => (
        <div key={i} className="obs-item">{obs}</div>
      ))}
      <button className="atleta-det-link" style={{ marginTop: 12 }} onClick={onAdd}>
        <Plus size={14} /> Adicionar observação
      </button>
    </>
  );
};
