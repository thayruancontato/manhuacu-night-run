import { useState, useEffect, useMemo } from 'react';
import { 
  collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, updateDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import * as Lucide from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';
import { FormHeader } from '../components/AdminForm';
import { AdminPageSkeleton } from '../components/Skeleton';
import { formatCamisetaLabel } from '../utils/camisetaUtils';
import '../App.css';

// Filtra apenas ícones válidos do Lucide (componentes de ícone)
const ALL_LUCIDE_ICONS = Object.keys(Lucide).filter(key => {
  const isIcon = /^[A-Z]/.test(key) && 
    !['LucideReact', 'createLucideIcon', 'Icon', 'LucideIcon', 'LucideProps', 'IconNode', 'default'].includes(key) &&
    ((Lucide as any)[key].render || typeof (Lucide as any)[key] === 'function');
  
  // Evita ícones que sabemos que podem dar erro (internos)
  return isIcon && !(Lucide as any)[key].isInternal; 
}).sort();

interface KitItem {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
}

interface CamisetaSize {
  id: string;
  label: string;
  estoque: number;
  ativo: boolean;
  tipo: 'Padrão' | 'Baby Look';
  categoria: 'adulto' | 'infantil' | 'todos';
  ordem: number;
  largura: number;
  altura: number;
}

export default function AdminKits() {
  const [activeTab, setActiveTab] = useState<'itens' | 'camisetas'>('itens');
  const [items, setItems] = useState<KitItem[]>([]);
  const [sizes, setSizes] = useState<CamisetaSize[]>([]);
  const [confirmedSizeCounts, setConfirmedSizeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const { showAlert, showConfirm } = useDialog();

  const [searchTerm, setSearchTerm] = useState('');

  // Item Modal states
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KitItem | null>(null);
  const [itemForm, setItemForm] = useState<Omit<KitItem, 'id'>>({ 
    nome: '', 
    descricao: '', 
    icone: 'Package' 
  });

  // Size Modal states
  const [isSizeModalOpen, setIsSizeModalOpen] = useState(false);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderSelection, setOrderSelection] = useState<string[]>([]);
  const [editingSize, setEditingSize] = useState<CamisetaSize | null>(null);
  const [sizeForm, setSizeForm] = useState<any>({ 
    label: '', 
    estoque: 0, 
    ativo: true,
    tipo: 'Padrão',
    categoria: 'todos',
    largura: 0,
    altura: 0
  });

  useEffect(() => {
    const unsubItems = onSnapshot(collection(db, 'nightrun_kit_items'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as KitItem));
      setItems(list);
    });

    const unsubSizes = onSnapshot(collection(db, 'nightrun_camisetas'), (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CamisetaSize));
      const order = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'EXGG'];
      list.sort((a, b) => {
        if (typeof a.ordem === 'number' || typeof b.ordem === 'number') {
          return (a.ordem ?? 9999) - (b.ordem ?? 9999);
        }
        const catA = a.categoria || 'todos';
        const catB = b.categoria || 'todos';
        if (catA !== catB) return catA === 'infantil' ? 1 : -1;
        if (a.tipo !== b.tipo) return a.tipo === 'Padrão' ? -1 : 1;
        const idxA = order.indexOf(a.label.toUpperCase());
        const idxB = order.indexOf(b.label.toUpperCase());
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.label.localeCompare(b.label);
      });
      setSizes(list);
      setLoading(false);
    });

    const unsubRegistrations = onSnapshot(collection(db, 'nightrun_registrations'), (snap) => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(item => {
        const data = item.data();
        const confirmed = data.paymentStatus === 'pago' || data.kitConfirmado || data.contractStatus === 'confirmado';
        if (!confirmed || !data.tamanhoCamiseta) return;
        counts[data.tamanhoCamiseta] = (counts[data.tamanhoCamiseta] || 0) + 1;
      });
      setConfirmedSizeCounts(counts);
    });

    return () => {
      unsubItems();
      unsubSizes();
      unsubRegistrations();
    };
  }, []);

  const filteredIcons = useMemo(() => {
    if (!searchTerm) return ALL_LUCIDE_ICONS.slice(0, 1200); // Mostra primeiros 1200 por performance se sem busca
    return ALL_LUCIDE_ICONS.filter(i => i.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 1500);
  }, [searchTerm]);

  const handleSaveItem = async () => {
    if (!itemForm.nome) return showAlert('Nome é obrigatório', 'warning');
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'nightrun_kit_items', editingItem.id), itemForm as any);
        showAlert('Item atualizado!', 'success');
      } else {
        await addDoc(collection(db, 'nightrun_kit_items'), itemForm);
        showAlert('Item adicionado!', 'success');
      }
      setIsItemModalOpen(false);
      setEditingItem(null);
      setItemForm({ nome: '', descricao: '', icone: 'Package' });
    } catch (e) {
      showAlert('Erro ao salvar item', 'error');
    }
  };

  const handleDeleteItem = (id: string) => {
    showConfirm('Remover este item do kit', async () => {
      await deleteDoc(doc(db, 'nightrun_kit_items', id));
      showAlert('Item removido', 'success');
    });
  };

  const handleToggleSize = async (size: CamisetaSize) => {
    try {
      await updateDoc(doc(db, 'nightrun_camisetas', size.id), { ativo: !size.ativo });
    } catch (e) {
      showAlert('Erro ao alterar status', 'error');
    }
  };

  const handleUpdateStock = async (id: string, current: number) => {
    const newVal = prompt('Novo estoque:', current.toString());
    if (newVal !== null) {
      const num = parseInt(newVal);
      if (!isNaN(num)) {
        await updateDoc(doc(db, 'nightrun_camisetas', id), { estoque: num });
        showAlert('Estoque atualizado', 'success');
      }
    }
  };

  const openOrderModal = () => {
    setOrderSelection(sizes.map(size => size.id));
    setIsOrderModalOpen(true);
  };

  const toggleOrderSelection = (id: string) => {
    setOrderSelection(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const saveOrderSelection = async () => {
    const missing = sizes.map(size => size.id).filter(id => !orderSelection.includes(id));
    const orderedIds = [...orderSelection, ...missing];
    const reordered = orderedIds
      .map(id => sizes.find(size => size.id === id))
      .filter(Boolean) as CamisetaSize[];

    setSizes(reordered);
    setIsOrderModalOpen(false);
    try {
      await Promise.all(reordered.map((size, ordem) =>
        updateDoc(doc(db, 'nightrun_camisetas', size.id), { ordem })
      ));
      showAlert('Ordem atualizada!', 'success');
    } catch (e) {
      showAlert('Erro ao atualizar ordem.', 'error');
    }
  };

  const handleSaveSize = async () => {
    if (!sizeForm.label) return showAlert('Rótulo do tamanho é obrigatório (ex: Padrão - M)', 'warning');
    try {
      const payload = {
        ...sizeForm,
        estoque: parseInt(sizeForm.estoque) || 0,
        largura: parseInt(sizeForm.largura) || 0,
        altura: parseInt(sizeForm.altura) || 0,
        categoria: sizeForm.categoria || 'todos',
        ordem: editingSize?.ordem ?? sizes.length
      };

      if (editingSize) {
        await updateDoc(doc(db, 'nightrun_camisetas', editingSize.id), payload);
        showAlert('Tamanho atualizado!', 'success');
      } else {
        const categoryPrefix = sizeForm.categoria === 'infantil' ? 'INF_' : '';
        const typePrefix = sizeForm.tipo === 'Baby Look' ? 'BL_' : '';
        const id = categoryPrefix + typePrefix + sizeForm.label.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
        await setDoc(doc(db, 'nightrun_camisetas', id), payload);
        showAlert('Tamanho adicionado!', 'success');
      }
      setIsSizeModalOpen(false);
      setEditingSize(null);
      setSizeForm({ label: '', estoque: 0, ativo: true, tipo: 'Padrão', categoria: 'todos', largura: 0, altura: 0 });
    } catch (e) {
      showAlert('Erro ao salvar tamanho', 'error');
    }
  };

  const handleDeleteSize = (id: string) => {
    showConfirm('Remover este tamanho da grade Isso pode afetar inscrições existentes.', async () => {
      try {
        await deleteDoc(doc(db, 'nightrun_camisetas', id));
        showAlert('Tamanho removido', 'success');
      } catch (e) {
        showAlert('Erro ao remover tamanho', 'error');
      }
    });
  };

  const renderIcon = (name: string, size = 22) => {
    try {
      const IconComponent = (Lucide as any)[name];
      // Verifica se é um componente válido e não apenas um objeto qualquer
      if (!IconComponent || (typeof IconComponent !== 'function' && !IconComponent.render)) {
        return <Lucide.Package size={size} />;
      }
      // Se chegamos aqui, tentamos renderizar. O LucideIcon deve ter paths/children.
      return <IconComponent size={size} />;
    } catch (e) {
      console.error('Erro ao renderizar ícone:', name, e);
      return <Lucide.Package size={size} />;
    }
  };

  if (loading) return <AdminPageSkeleton variant="table" />;

  const groupedSizeSummary = [
    { label: 'Infantil', color: '#16a34a', items: sizes.filter(size => (size.categoria || 'todos') === 'infantil') },
    { label: 'Padrao', color: '#2563eb', items: sizes.filter(size => (size.categoria || 'todos') !== 'infantil' && size.tipo !== 'Baby Look') },
    { label: 'Baby Look', color: '#db2777', items: sizes.filter(size => (size.categoria || 'todos') !== 'infantil' && size.tipo === 'Baby Look') },
  ].filter(group => group.items.length > 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Configurações de Kits</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Gerencie os itens inclusos e a grade de tamanhos disponível.</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
        {[
          { id: 'itens', label: 'Itens do Kit', icon: Lucide.Package },
          { id: 'camisetas', label: 'Grade de Camisetas', icon: Lucide.Shirt }
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{ 
              padding: '12px 24px', borderRadius: '12px 12px 0 0', border: 'none', 
              background: activeTab === tab.id ? '#fff' : 'transparent',
              color: activeTab === tab.id ? '#071A45' : '#64748b',
              fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: activeTab === tab.id ? '3px solid #6BFF2A' : '3px solid transparent',
              transition: 'all 0.2s'
            }}
          >
            <tab.icon size={18} /> {tab.label.toUpperCase()}
          </button>
        ))}
      </div>

      {activeTab === 'itens' ? (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45' }}>Conteúdo do Kit</h3>
            <button onClick={() => { setIsItemModalOpen(true); setEditingItem(null); setItemForm({ nome: '', descricao: '', icone: 'Package' }); }} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lucide.Plus size={18} /> ADICIONAR ITEM
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {items.map(item => (
              <div key={item.id} style={{ background: '#fff', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#071A45' }}>
                    {renderIcon(item.icone, 24)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#071A45', marginBottom: 4 }}>{item.nome}</h4>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>{item.descricao}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <button onClick={() => { setEditingItem(item); setItemForm({ nome: item.nome, descricao: item.descricao, icone: item.icone }); setIsItemModalOpen(true); }} style={{ background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: 6, color: '#475569', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}>
                    EDITAR
                  </button>
                  <button onClick={() => handleDeleteItem(item.id)} style={{ background: '#fee2e2', border: 'none', padding: '6px 12px', borderRadius: 6, color: '#ef4444', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}>
                    REMOVER
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Controle de Estoque e Tamanhos</h3>
              <p style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>Use o botão de ordenação para clicar nos tamanhos na sequência em que eles devem aparecer.</p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button onClick={openOrderModal} style={{ background: '#fff', color: '#071A45', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lucide.ListOrdered size={18} /> ORDENAR TAMANHOS
              </button>
              <button onClick={() => { setIsSizeModalOpen(true); setEditingSize(null); setSizeForm({ label: '', estoque: 0, ativo: true, tipo: 'Padrão', categoria: 'todos', largura: 0, altura: 0 }); }} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lucide.Plus size={18} /> ADICIONAR TAMANHO
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 18 }}>
            {groupedSizeSummary.map(group => {
              const groupTotal = group.items.reduce((sum, size) => sum + (confirmedSizeCounts[size.id] || 0), 0);
              return (
                <div key={group.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
                    <span style={{ color: group.color, fontSize: '.74rem', fontWeight: 950, textTransform: 'uppercase' }}>{group.label}</span>
                    <strong style={{ color: '#071A45', fontSize: '1rem', fontWeight: 950 }}>{groupTotal} confirmados</strong>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))', gap: 8 }}>
                    {group.items.map(size => (
                      <div key={size.id} style={{ border: '1px solid #eef2f7', borderRadius: 10, padding: '8px 9px', background: '#f8fafc' }}>
                        <strong style={{ display: 'block', color: '#071A45', fontSize: '.9rem', fontWeight: 950 }}>{size.label}</strong>
                        <span style={{ display: 'block', color: '#64748b', fontSize: '.7rem', fontWeight: 850, marginTop: 3 }}>{confirmedSizeCounts[size.id] || 0} usados</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Tamanho</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Estoque</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Dimensões</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Uso</th>
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map(size => (
                  <tr key={size.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: size.ativo ? 1 : 0.6 }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#071A45' }}>{size.label}</span>
                        <span style={{ 
                          fontSize: '0.65rem', fontWeight: 900, padding: '2px 8px', borderRadius: 6,
                          background: size.tipo === 'Baby Look' ? '#fdf2f8' : '#eff6ff',
                          color: size.tipo === 'Baby Look' ? '#db2777' : '#2563eb',
                          textTransform: 'uppercase'
                        }}>
                          {size.tipo}
                        </span>
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 7, background: '#ecfdf5', color: '#166534', border: '1px solid #bbf7d0', padding: '5px 8px', borderRadius: 8, fontSize: '.72rem', fontWeight: 950 }}>
                        <Lucide.CheckCircle2 size={14} />
                        {confirmedSizeCounts[size.id] || 0} confirmados
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.8rem', fontWeight: 800,
                        background: size.estoque <= 0 ? '#fee2e2' : size.estoque < 10 ? '#fef9c3' : '#f1f5f9',
                        color: size.estoque <= 0 ? '#ef4444' : size.estoque < 10 ? '#854d0e' : '#475569'
                      }}>
                        {size.estoque} UN
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                        {size.largura || 0} x {size.altura || 0} cm
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 900,
                        background: (size.categoria || 'todos') === 'infantil' ? '#dcfce7' : '#f1f5f9',
                        color: (size.categoria || 'todos') === 'infantil' ? '#166534' : '#475569',
                        textTransform: 'uppercase'
                      }}>
                        {(size.categoria || 'todos') === 'infantil' ? 'Infantil' : (size.categoria || 'todos') === 'adulto' ? 'Adulto' : 'Todos'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ 
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                        background: size.ativo ? '#dcfce7' : '#f1f5f9',
                        color: size.ativo ? '#166534' : '#94a3b8'
                      }}>
                        {size.ativo ? 'DISPONÍVEL' : 'DESATIVADO'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setEditingSize(size); setSizeForm({ label: size.label, estoque: size.estoque, ativo: size.ativo, tipo: size.tipo, categoria: size.categoria || 'todos', largura: size.largura || 0, altura: size.altura || 0, ordem: size.ordem }); setIsSizeModalOpen(true); }} style={{ background: '#f1f5f9', border: 'none', padding: 8, borderRadius: 8, color: '#071A45', cursor: 'pointer' }}>
                          <Lucide.Edit2 size={16} />
                        </button>
                        <button onClick={() => handleUpdateStock(size.id, size.estoque)} style={{ background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: 8, color: '#475569', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}>
                          ESTOQUE
                        </button>
                        <button onClick={() => handleToggleSize(size)} style={{ background: size.ativo ? '#fee2e2' : '#dcfce7', border: 'none', padding: '6px 12px', borderRadius: 8, color: size.ativo ? '#ef4444' : '#166534', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}>
                          {size.ativo ? 'DESATIVAR' : 'ATIVAR'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals with Clean Layout */}
      {isItemModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 600, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
               <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#071A45' }}>{editingItem ? 'Editar Item' : 'Novo Item do Kit'}</h3>
               <button onClick={() => setIsItemModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>
            <div style={{ padding: 30 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Nome do Item</label>
                <input 
                  value={itemForm.nome} 
                  onChange={e => setItemForm({ ...itemForm, nome: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                  placeholder="Ex: Camiseta Premium"
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Descrição</label>
                <textarea 
                  value={itemForm.descricao} 
                  onChange={e => setItemForm({ ...itemForm, descricao: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', minHeight: 80 }}
                  placeholder="Detalhes sobre o item..."
                />
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                   <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Ícone</label>
                   <input 
                     type="text" placeholder="Buscar ícone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                     style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem', width: 150 }}
                   />
                </div>
                <div style={{ height: 180, overflowY: 'auto', padding: 12, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 8 }}>
                  {filteredIcons.map(iconName => (
                    <button 
                      key={iconName}
                      onClick={() => setItemForm({ ...itemForm, icone: iconName })}
                      style={{ 
                        width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: itemForm.icone === iconName ? '#6BFF2A' : 'white',
                        color: itemForm.icone === iconName ? '#071A45' : '#64748b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}
                    >
                      {renderIcon(iconName, 18)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setIsItemModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontWeight: 800, cursor: 'pointer', color: '#64748b' }}>CANCELAR</button>
                <button onClick={handleSaveItem} style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#071A45', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>SALVAR ITEM</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isOrderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 620, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Ordenar tamanhos</h3>
                <p style={{ color: '#64748b', fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>Clique nos tamanhos na ordem em que devem aparecer no formulário.</p>
              </div>
              <button onClick={() => setIsOrderModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>
            <div style={{ padding: 30 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                {sizes.map(size => {
                  const orderIndex = orderSelection.indexOf(size.id);
                  const selected = orderIndex >= 0;
                  return (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => toggleOrderSelection(size.id)}
                      style={{
                        minHeight: 58,
                        padding: '8px 14px',
                        borderRadius: 12,
                        border: selected ? '2px solid #6BFF2A' : '1px solid #e2e8f0',
                        background: selected ? 'rgba(107,255,42,0.12)' : '#fff',
                        color: '#071A45',
                        fontWeight: 900,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      {selected && <span style={{ minWidth: 24, height: 24, borderRadius: 999, background: '#6BFF2A', color: '#071A45', display: 'grid', placeItems: 'center', fontSize: '0.7rem' }}>{orderIndex + 1}</span>}
                      <span style={{ display: 'grid', gap: 2, textAlign: 'left' }}>
                        <span>{size.label}</span>
                        <small style={{ color: '#64748b', fontSize: '0.62rem', fontWeight: 900, textTransform: 'uppercase' }}>
                          {size.tipo} · {(size.categoria || 'todos') === 'infantil' ? 'Infantil' : (size.categoria || 'todos') === 'adulto' ? 'Adulto' : 'Todos'}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setOrderSelection([])} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontWeight: 800, cursor: 'pointer', color: '#64748b' }}>LIMPAR</button>
                <button onClick={() => setIsOrderModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontWeight: 800, cursor: 'pointer', color: '#64748b' }}>CANCELAR</button>
                <button onClick={saveOrderSelection} style={{ flex: 1.4, padding: '14px', borderRadius: 12, border: 'none', background: '#071A45', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>SALVAR ORDEM</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSizeModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 450, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
               <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#071A45' }}>{editingSize ? 'Editar Tamanho' : 'Novo Tamanho'}</h3>
               <button onClick={() => setIsSizeModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>
            <div style={{ padding: 30 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Tamanho (Ex: P, M, G)</label>
                <input 
                  value={sizeForm.label} 
                  onChange={e => setSizeForm({ ...sizeForm, label: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                  placeholder="Apenas a letra ou número"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Tipo</label>
                  <select 
                    value={sizeForm.tipo} 
                    onChange={e => setSizeForm({ ...sizeForm, tipo: e.target.value as any })}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                  >
                    <option value="Padrão">Padrão</option>
                    <option value="Baby Look">Baby Look</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Uso</label>
                  <select 
                    value={sizeForm.categoria || 'todos'} 
                    onChange={e => setSizeForm({ ...sizeForm, categoria: e.target.value as any })}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                  >
                    <option value="todos">Todos</option>
                    <option value="infantil">Somente infantil</option>
                    <option value="adulto">Somente adulto</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Estoque</label>
                  <input 
                    type="number"
                    value={sizeForm.estoque} 
                    onChange={e => setSizeForm({ ...sizeForm, estoque: e.target.value === '' ? '' : parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Largura (cm)</label>
                  <input 
                    type="number"
                    value={sizeForm.largura} 
                    onChange={e => setSizeForm({ ...sizeForm, largura: e.target.value === '' ? '' : parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Comprimento (cm)</label>
                  <input 
                    type="number"
                    value={sizeForm.altura} 
                    onChange={e => setSizeForm({ ...sizeForm, altura: e.target.value === '' ? '' : parseInt(e.target.value) })}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setIsSizeModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontWeight: 800, cursor: 'pointer', color: '#64748b' }}>CANCELAR</button>
                <button onClick={handleSaveSize} style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#071A45', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>SALVAR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
