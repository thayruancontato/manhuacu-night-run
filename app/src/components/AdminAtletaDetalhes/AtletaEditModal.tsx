import React from 'react';
import { FileEdit } from 'lucide-react';
import { formatCamisetaLabel, getCamisetaShortLabel, getCamisetaType } from '../../utils/camisetaUtils';

interface AtletaEditModalProps {
  show: boolean;
  onClose: () => void;
  form: any;
  setForm: (f: any) => void;
  onSave: () => void;
  saving: boolean;
  CATEGORIAS: any[];
  KITS: any[];
  camisetas: any[];
  modalidades: any[];
  camisetaCounts: Record<string, number>;
}

export const AtletaEditModal: React.FC<AtletaEditModalProps> = ({
  show, onClose, form, setForm, onSave, saving, CATEGORIAS, KITS, camisetas, modalidades, camisetaCounts
}) => {
  if (!show) return null;

  const sizeOrder = ['PP', 'P', 'M', 'G', 'GG', 'EXGG', 'XG', '10', '12', '2', '4', '6', '8'];
  const sizeShort = (item: any) => getCamisetaShortLabel(item.id, item);
  const sizeType = (item: any) => getCamisetaType(item.id, item);
  const sortSizes = (a: any, b: any) => {
    const orderA = sizeOrder.indexOf(sizeShort(a));
    const orderB = sizeOrder.indexOf(sizeShort(b));
    return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB) || formatCamisetaLabel(a.id, a).localeCompare(formatCamisetaLabel(b.id, b), 'pt-BR');
  };
  const camisetaGroups = [
    { title: 'Padrao', items: camisetas.filter(t => sizeType(t) === 'Padrao').sort(sortSizes) },
    { title: 'Baby Look', items: camisetas.filter(t => sizeType(t) === 'Baby Look').sort(sortSizes) },
  ].filter(group => group.items.length > 0);

  return (
    <div className="atleta-det-modal-overlay" onClick={onClose}>
      <div className="atleta-det-modal" onClick={e => e.stopPropagation()}>
        <div className="atleta-det-modal-header">
          <h3><FileEdit size={18} /> Alterar dados da inscrição</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="atleta-det-modal-body">
          <div className="modal-field">
            <label>Nome completo</label>
            <input type="text" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
          </div>
          <div className="modal-row">
            <div className="modal-field">
              <label>E-mail</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div className="modal-field">
              <label>Telefone</label>
              <input type="text" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} />
            </div>
            <div className="modal-field">
              <label>Condição de Saúde</label>
              <select value={form.condicaoSaude} onChange={e => setForm({...form, condicaoSaude: e.target.value})}>
                <option value="">Selecione</option>
                <option value="excelente">Excelente</option>
                <option value="boa">Boa</option>
                <option value="regular">Regular</option>
              </select>
            </div>
          </div>
          <div className="modal-row">
            <div className="modal-field">
              <label>Data de Nascimento</label>
              <input type="text" value={form.dataNascimento} onChange={e => setForm({...form, dataNascimento: e.target.value})} />
            </div>
            <div className="modal-field">
              <label>Responsável</label>
              <input type="text" value={form.responsavelNome} onChange={e => setForm({...form, responsavelNome: e.target.value})} />
            </div>
            <div className="modal-field">
              <label>CPF do Responsável</label>
              <input type="text" value={form.responsavelCpf} onChange={e => setForm({...form, responsavelCpf: e.target.value})} />
            </div>
            <div className="modal-field">
              <label>Sexo</label>
              <select value={form.sexo} onChange={e => setForm({...form, sexo: e.target.value})}>
                <option value="">Selecione</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </div>
          </div>
          <div className="modal-row">
            <div className="modal-field">
              <label>Categoria</label>
              <select value={form.categoria} onChange={e => setForm({...form, categoria: e.target.value})}>
                {CATEGORIAS.map(cat => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}
              </select>
            </div>
            <div className="modal-field">
              <label>Modalidade</label>
              <select value={form.modalidadeId} onChange={e => setForm({...form, modalidadeId: e.target.value})}>
                <option value="">Nenhuma / Infantil</option>
                {modalidades.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-row">
            <div className="modal-field">
              <label>Kit</label>
              <select value={form.kit} onChange={e => setForm({...form, kit: e.target.value})}>
                {KITS.map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}
              </select>
            </div>
            <div className="modal-field">
              <label>Tamanho da camiseta</label>
              <div style={{ display: 'grid', gap: 12 }}>
                {camisetaGroups.map(group => (
                  <div key={group.title} style={{ border: '1px solid rgba(226,232,240,0.16)', borderRadius: 12, padding: 10, background: 'rgba(255,255,255,0.03)' }}>
                    <div style={{ color: '#94a3b8', fontSize: '.68rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>{group.title}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 }}>
                      {group.items.map(t => {
                        const selected = form.tamanhoCamiseta === t.id;
                        const count = camisetaCounts[t.id] || 0;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setForm({ ...form, tamanhoCamiseta: t.id })}
                            style={{
                              border: selected ? '2px solid #6BFF2A' : '1px solid rgba(148,163,184,0.28)',
                              background: selected ? 'rgba(107,255,42,0.12)' : 'rgba(15,23,42,0.62)',
                              color: selected ? '#fff' : '#e2e8f0',
                              borderRadius: 10,
                              padding: '10px 8px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              minHeight: 62,
                              boxShadow: selected ? '0 0 0 2px rgba(107,255,42,0.10)' : 'none'
                            }}
                          >
                            <strong style={{ display: 'block', fontSize: '.95rem', fontWeight: 950, lineHeight: 1 }}>{sizeShort(t)}</strong>
                            <span style={{ display: 'block', marginTop: 6, color: selected ? '#baff9e' : '#94a3b8', fontSize: '.68rem', fontWeight: 850 }}>
                              {count} confirmados
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="atleta-det-modal-footer">
          <button className="atleta-det-btn-back" onClick={onClose}>Cancelar</button>
          <button className="atleta-det-btn-edit" onClick={onSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};
