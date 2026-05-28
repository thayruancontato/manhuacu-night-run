import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, Plus, Trash2, Edit2, Flag, X, Check } from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';
import { type Modalidade } from '../types';
import { AdminPageSkeleton } from '../components/Skeleton';
import '../styles/admin.css';

const CHILD_RACE_PRESETS = [
  { label: '4 a 6 anos: 100 metros', nome: 'Kids 4 a 6 anos', distancia: '100 metros', idadeMin: 4, idadeMax: 6 },
  { label: '7 a 9 anos: 150 metros', nome: 'Kids 7 a 9 anos', distancia: '150 metros', idadeMin: 7, idadeMax: 9 },
  { label: '10 a 12 anos: 250 metros', nome: 'Kids 10 a 12 anos', distancia: '250 metros', idadeMin: 10, idadeMax: 12 },
  { label: '13 a 14 anos: 500 metros', nome: 'Kids 13 a 14 anos', distancia: '500 metros', idadeMin: 13, idadeMax: 14 },
];

export default function AdminModalidades() {
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Modalidade>>({ nome: '', distancia: '', categoria: 'adulto', anosNascimento: [], ativo: true });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { showAlert, showConfirm } = useDialog();

  useEffect(() => {
    loadModalidades();
  }, []);

  const loadModalidades = async () => {
    try {
      const q = query(collection(db, 'nightrun_modalidades'), orderBy('nome'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Modalidade));
      setModalidades(list);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao carregar modalidades.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (mod?: Modalidade) => {
    if (mod) {
      setEditingId(mod.id!);
      setFormData({ ...mod });
    } else {
      setEditingId(null);
      setFormData({ nome: '', distancia: '', categoria: 'adulto', anosNascimento: [], ativo: true });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome) return showAlert('O nome ? obrigatrio.', 'warning');
    if (formData.categoria === 'infantil' && (typeof formData.idadeMin !== 'number' || typeof formData.idadeMax !== 'number')) {
      return showAlert('Informe a faixa de idade da modalidade infantil.', 'warning');
    }
    if (formData.categoria === 'infantil' && Number(formData.idadeMin) > Number(formData.idadeMax)) {
      return showAlert('A idade inicial no pode ser maior que a idade final.', 'warning');
    }

    const payload = {
      ...formData,
      idadeMin: formData.categoria === 'infantil' ? Number(formData.idadeMin) : undefined,
      idadeMax: formData.categoria === 'infantil' ? Number(formData.idadeMax) : undefined,
      anosNascimento: formData.categoria === 'infantil' ? (formData.anosNascimento || []) : [],
    };

    setLoading(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'nightrun_modalidades', editingId), payload);
        showAlert('Modalidade atualizada!', 'success');
      } else {
        await addDoc(collection(db, 'nightrun_modalidades'), { ...payload, createdAt: new Date() });
        showAlert('Modalidade criada!', 'success');
      }
      setIsModalOpen(false);
      loadModalidades();
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    showConfirm('Tem certeza que deseja excluir esta modalidade Atletas vinculados a ela podem ficar sem categoria.', async () => {
      setLoading(true);
      try {
        await deleteDoc(doc(db, 'nightrun_modalidades', id));
        showAlert('Excluído com sucesso.', 'success');
        loadModalidades();
      } catch (e) {
        console.error(e);
        showAlert('Erro ao excluir.', 'error');
      } finally {
        setLoading(false);
      }
    });
  };

  if (loading && modalidades.length === 0) return <AdminPageSkeleton variant="table" />;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Modalidades</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Gerencie as distâncias e tipos de prova disponíveis.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)' }}
        >
          <Plus size={18} />
          Nova Modalidade
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Modalidade</th>
              <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Distância</th>
              <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Abrangência</th>
              <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Status</th>
              <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', textAlign: 'right' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {modalidades.map((mod) => (
              <tr key={mod.id} style={{ borderBottom: '1px solid #f1f5f9', transition: '0.2s' }}>
                <td style={{ padding: '16px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eff6ff', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Flag size={20} />
                    </div>
                    <span style={{ fontWeight: 700, color: '#071A45' }}>{mod.nome}</span>
                  </div>
                </td>
                <td style={{ padding: '16px 24px', color: '#64748b', fontWeight: 600 }}>{mod.distancia || '-'}</td>
                <td style={{ padding: '16px 24px', color: '#64748b', fontWeight: 600 }}>
                  {mod.categoria === 'infantil'
                    ? (typeof mod.idadeMin === 'number' && typeof mod.idadeMax === 'number'
                      ? `Infantil: ${mod.idadeMin} a ${mod.idadeMax} anos`
                      : `Infantil: ${(mod.anosNascimento || []).join(', ')}`)
                    : 'Adulto / adolescente'}
                </td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{ 
                    padding: '4px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                    background: mod.ativo ? '#dcfce7' : '#fee2e2',
                    color: mod.ativo ? '#15803d' : '#b91c1c'
                  }}>
                    {mod.ativo ? 'ATIVA' : 'INATIVA'}
                  </span>
                </td>
                <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button 
                      onClick={() => handleOpenModal(mod)}
                      style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDelete(mod.id!)}
                      style={{ background: '#fee2e2', border: 'none', width: 36, height: 36, borderRadius: 10, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {modalidades.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                  Nenhuma modalidade cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal for Edit/Create */}
      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 450, padding: 30, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#071A45' }}>{editingId ? 'Editar Modalidade' : 'Nova Modalidade'}</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={24} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Nome da Modalidade</label>
                <input 
                  type="text" 
                  value={formData.nome} 
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Ex: 5km, 10km, Caminhada..."
                  style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 600, outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Distância (opcional)</label>
                <input 
                  type="text" 
                  value={formData.distancia} 
                  onChange={e => setFormData({ ...formData, distancia: e.target.value })}
                  placeholder="Ex: 5.000 metros"
                  style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 600, outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Tipo de modalidade</label>
                <select
                  value={formData.categoria || 'adulto'}
                  onChange={e => setFormData({
                    ...formData,
                    categoria: e.target.value as Modalidade['categoria'],
                    anosNascimento: e.target.value === 'infantil' ? (formData.anosNascimento || []) : [],
                    idadeMin: e.target.value === 'infantil' ? formData.idadeMin : undefined,
                    idadeMax: e.target.value === 'infantil' ? formData.idadeMax : undefined,
                  })}
                  style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 600, outline: 'none' }}
                >
                  <option value="adulto">Adulto / adolescente</option>
                  <option value="infantil">Infantil</option>
                </select>
              </div>

              {formData.categoria === 'infantil' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Provas infantis rápidas</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {CHILD_RACE_PRESETS.map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setFormData({ ...formData, ...preset, categoria: 'infantil' })}
                          style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #dbe3ef', background: '#f8fafc', color: '#071A45', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', textAlign: 'left' }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Idade inicial</label>
                      <input
                        type="number"
                        min={0}
                        value={formData.idadeMin ?? ""}
                        onChange={e => setFormData({ ...formData, idadeMin: e.target.value === '' ? undefined : Number(e.target.value) })}
                        placeholder="Ex: 4"
                        style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 600, outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Idade final</label>
                      <input
                        type="number"
                        min={0}
                        value={formData.idadeMax ?? ""}
                        onChange={e => setFormData({ ...formData, idadeMax: e.target.value === '' ? undefined : Number(e.target.value) })}
                        placeholder="Ex: 6"
                        style={{ width: '100%', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 600, outline: 'none' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setFormData({ ...formData, ativo: !formData.ativo })}>
                <div style={{ width: 24, height: 24, borderRadius: 6, border: '2px solid #071A45', display: 'flex', alignItems: 'center', justifyContent: 'center', background: formData.ativo ? '#071A45' : 'transparent' }}>
                  {formData.ativo && <Check size={16} color="#fff" />}
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#071A45' }}>Modalidade Ativa</span>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 800, cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleSave}
                  style={{ flex: 2, padding: '14px', borderRadius: 12, border: 'none', background: '#071A45', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
                >
                  Salvar Modalidade
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
