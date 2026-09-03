import React from 'react';
import { ArrowRight } from 'lucide-react';
import { formatDateTimeBR } from '../../utils/dateUtils';

interface AtletaHistoryProps {
  allRegs: any[];
  camisetas: any[];
  KITS: any[];
}

export const AtletaHistory: React.FC<AtletaHistoryProps> = ({ allRegs, camisetas, KITS }) => {
  return (
    <>
      <table className="atleta-det-table">
        <thead>
          <tr>
            <th>DATA</th>
            <th>MODALIDADE</th>
            <th>KIT</th>
            <th>PAGAMENTO</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {allRegs.slice(0, 4).map((r, i) => {
            const rDate = formatDateTimeBR(r.createdAt);
            const rDist = r.categoria.includes('10') ? '10KM' : r.categoria.includes('5') ? '5KM' : r.categoria || '—';
            const rSexo = r.sexo === 'M' ? 'Masc.' : r.sexo === 'F' ? 'Fem.' : '';
            const rKit = KITS.find(k => k.id === r.kit)?.nome || r.kitNome || r.kit || '—';
            const rKitSize = camisetas.find(t => t.id === r.tamanhoCamiseta);
            const rPaid = r.paymentStatus === 'pago';
            const rCancelled = r.paymentStatus === 'cancelado';

            return (
              <tr key={r.id || i}>
                <td className="td-date">{rDate}</td>
                <td className="td-prova">{rDist} · {rSexo}</td>
                <td className="td-kit">{rKit} ({rKitSize ? rKitSize.label.split(' - ')[1] : '—'})</td>
                <td>
                  <span className={`det-badge ${rPaid ? 'paid' : 'pending'}`}>
                    {rPaid ? 'Pago' : 'Pendente'}
                  </span>
                </td>
                <td>
                  <span className={`det-badge ${rPaid ? 'confirmed' : rCancelled ? 'cancelled' : 'pending'}`}>
                    {rPaid ? 'Confirmada' : rCancelled ? 'Cancelada' : 'Pendente'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {allRegs.length > 4 && (
        <div className="atleta-det-link-row">
          <button className="atleta-det-link">
            Ver todas as inscrições <ArrowRight size={14} />
          </button>
        </div>
      )}
    </>
  );
};
