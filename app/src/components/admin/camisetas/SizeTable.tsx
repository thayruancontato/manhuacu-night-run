import { useState } from 'react';
import { TAMANHOS_CAMISETA } from '../../../types';
import { Settings2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { formatDateTimeBR } from '../../../utils/dateUtils';

interface SizeTableProps {
  counts: Record<string, number>;
  separated: Record<string, number>;
  stock: Record<string, number>;
  customMeasures: Record<string, { largura: number, altura: number }>;
  onManage: (sizeId: string) => void;
}

type SortField = 'label' | 'solicitado' | 'separado' | 'pendente' | 'disponivel';

export function SizeTable({ counts, separated, stock, customMeasures, onManage }: SizeTableProps) {
  const [sortField, setSortField] = useState<SortField>('label');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const totalSolicitado = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalSeparado = Object.values(separated).reduce((a, b) => a + b, 0);
  const totalPendente = totalSolicitado - totalSeparado;
  const totalDisponivel = Object.values(stock).reduce((a, b) => a + b, 0);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedSizes = [...TAMANHOS_CAMISETA].sort((a, b) => {
    let valA: any, valB: any;
    
    switch (sortField) {
      case 'label': valA = a.label; valB = b.label; break;
      case 'solicitado': valA = counts[a.id] || 0; valB = counts[b.id] || 0; break;
      case 'separado': valA = separated[a.id] || 0; valB = separated[b.id] || 0; break;
      case 'pendente': valA = (counts[a.id] || 0) - (separated[a.id] || 0); valB = (counts[b.id] || 0) - (separated[b.id] || 0); break;
      case 'disponivel': valA = stock[a.id] || 0; valB = stock[b.id] || 0; break;
      default: valA = 0; valB = 0;
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={14} style={{ opacity: 0.3 }} />;
    return sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />;
  };

  return (
    <div className="adm-card" style={{ height: '100%' }}>
      <div className="adm-card-header">
        <div>
          <h3 style={{ margin: 0 }}>Solicitação por tamanho</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--adm-text-dim)' }}>Quantidade de camisetas solicitadas por tamanho</span>
        </div>
      </div>
      <div className="adm-card-body" style={{ padding: 0 }}>
        <div className="adm-table-wrapper">
          <table className="adm-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('label')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>TAMANHO <SortIcon field="label" /></div>
                </th>
                <th onClick={() => handleSort('solicitado')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>SOLICITADO <SortIcon field="solicitado" /></div>
                </th>
                <th onClick={() => handleSort('separado')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>SEPARADO <SortIcon field="separado" /></div>
                </th>
                <th onClick={() => handleSort('pendente')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>PENDENTE <SortIcon field="pendente" /></div>
                </th>
                <th onClick={() => handleSort('disponivel')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>DISPONÍVEL <SortIcon field="disponivel" /></div>
                </th>
                <th>MEDIDAS (cm)</th>
                <th style={{ textAlign: 'right' }}>AÇÕES</th>
              </tr>
            </thead>
            <tbody>
              {sortedSizes.map(t => {
                const solicitado = counts[t.id] || 0;
                const separado = separated[t.id] || 0;
                const pendente = solicitado - separado;
                const disponivel = stock[t.id] || 0;
                const percSolicitado = totalSolicitado > 0 ? ((solicitado / totalSolicitado) * 100).toFixed(1) : 0;
                const percSeparado = solicitado > 0 ? ((separado / solicitado) * 100).toFixed(1) : 0;
                const percPendente = solicitado > 0 ? ((pendente / solicitado) * 100).toFixed(1) : 0;

                return (
                  <tr key={t.id}>
                    <td>
                      <div className="size-badge" style={{ 
                        background: t.tipo === 'Baby Look' ? '#db2777' : '#4f46e5',
                        padding: '4px 10px',
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        width: 'fit-content'
                      }}>
                        {t.label}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700 }}>{solicitado}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--adm-text-dim)' }}>{percSolicitado}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700 }}>{separado}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--adm-text-dim)' }}>{percSeparado}%</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: '#f59e0b' }}>{pendente}</span>
                        <span style={{ fontSize: '0.7rem', color: '#f59e0b', opacity: 0.7 }}>{percPendente}%</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: disponivel > 10 ? '#22c55e' : '#ef4444' }}>{disponivel}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.75rem', color: 'var(--adm-text-dim)', fontWeight: 600 }}>
                        {(customMeasures[t.id] || t.medidas).largura} x {(customMeasures[t.id] || t.medidas).altura}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="adm-action-btn" onClick={() => onManage(t.id)} style={{ padding: '6px 12px', fontSize: '0.75rem', gap: 6 }}>
                        <Settings2 size={14} /> Gerenciar
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: 'rgba(255,255,255,0.02)', fontWeight: 800 }}>
                <td>TOTAL</td>
                <td>{totalSolicitado} <span style={{ fontWeight: 400, fontSize: '0.7rem', opacity: 0.5 }}>100%</span></td>
                <td>{totalSeparado} <span style={{ fontWeight: 400, fontSize: '0.7rem', opacity: 0.5 }}>{totalSolicitado > 0 ? ((totalSeparado / totalSolicitado) * 100).toFixed(1) : 0}%</span></td>
                <td>{totalPendente} <span style={{ fontWeight: 400, fontSize: '0.7rem', opacity: 0.5 }}>{totalSolicitado > 0 ? ((totalPendente / totalSolicitado) * 100).toFixed(1) : 0}%</span></td>
                <td>{totalDisponivel}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ padding: 15, fontSize: '0.75rem', color: 'var(--adm-text-dim)', borderTop: '1px solid var(--adm-border)' }}>
          Última atualização: {formatDateTimeBR(new Date())}
        </div>
      </div>
    </div>
  );
}
