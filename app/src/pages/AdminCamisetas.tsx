import { useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Download, RefreshCw } from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';
import { TAMANHOS_CAMISETA } from '../types';

// Sub-components
import { StatCards } from '../components/admin/camisetas/StatCards';
import { SizeTable } from '../components/admin/camisetas/SizeTable';
import { DistributionChart } from '../components/admin/camisetas/DistributionChart';
import { AdminPageSkeleton } from '../components/Skeleton';

export default function AdminCamisetas() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [separated, setSeparated] = useState<Record<string, number>>({});
  const [stock, setStock] = useState<Record<string, number>>({});
  const [customMeasures, setCustomMeasures] = useState<Record<string, { largura: number, altura: number }>>({});
  const [loading, setLoading] = useState(true);
  const { showAlert } = useDialog();

  const [editingSize, setEditingSize] = useState<any>(null);
  const [modalData, setModalData] = useState<any>({ stock: 0, largura: 0, altura: 0 });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'nightrun_registrations'));
      const newCounts: Record<string, number> = {};
      const newSeparated: Record<string, number> = {};
      
      TAMANHOS_CAMISETA.forEach(s => {
        newCounts[s.id] = 0;
        newSeparated[s.id] = 0;
      });

      snap.docs.forEach(d => {
        const data = d.data();
        const sizeId = data.tamanhoCamiseta;
        if (sizeId && newCounts[sizeId] !== undefined) {
          newCounts[sizeId]++;
          if (data.camisaSeparada) newSeparated[sizeId]++;
        }
      });

      const stockDoc = await getDoc(doc(db, 'nightrun_settings', 'estoque_camisetas'));
      if (stockDoc.exists()) setStock(stockDoc.data().valores || {});
      else {
        const defaultStock: Record<string, number> = {};
        TAMANHOS_CAMISETA.forEach(s => defaultStock[s.id] = 50);
        setStock(defaultStock);
      }

      const measuresDoc = await getDoc(doc(db, 'nightrun_settings', 'medidas_camisetas'));
      if (measuresDoc.exists()) setCustomMeasures(measuresDoc.data().valores || {});

      setCounts(newCounts);
      setSeparated(newSeparated);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao carregar dados.', 'error');
    } finally { setLoading(false); }
  };

  const handleManage = (sizeId: string) => {
    const t = TAMANHOS_CAMISETA.find(x => x.id === sizeId);
    if (!t) return;
    const m = customMeasures[sizeId] || t.medidas || { largura: 0, altura: 0 };
    setEditingSize(t);
    setModalData({
      stock: stock[sizeId] || 0,
      largura: m.largura,
      altura: m.altura
    });
  };

  const saveChanges = async () => {
    if (!editingSize) return;
    const sizeId = editingSize.id;
    
    try {
      const newStock = { ...stock, [sizeId]: parseInt(modalData.stock as string) || 0 };
      const newMeasures = { ...customMeasures, [sizeId]: { largura: parseInt(modalData.largura as string) || 0, altura: parseInt(modalData.altura as string) || 0 } };
      
      await setDoc(doc(db, 'nightrun_settings', 'estoque_camisetas'), { valores: newStock });
      await setDoc(doc(db, 'nightrun_settings', 'medidas_camisetas'), { valores: newMeasures });
      
      setStock(newStock);
      setCustomMeasures(newMeasures);
      setEditingSize(null);
      showAlert('Alterações salvas!', 'success');
    } catch (e) {
      showAlert('Erro ao salvar.', 'error');
    }
  };

  const totalSolicitado = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalSeparado = Object.values(separated).reduce((a, b) => a + b, 0);
  const totalPendente = totalSolicitado - totalSeparado;
  const semEstoque = TAMANHOS_CAMISETA.filter(t => (stock[t.id] || 0) <= 0).length;

  if (loading) return <AdminPageSkeleton variant="dashboard" />;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Gestão de Camisetas</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Acompanhe e gerencie os tamanhos solicitados pelos atletas.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '10px 20px', borderRadius: 12, color: '#475569', fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Download size={18} /> Exportar relatório
          </button>
          <button onClick={loadData} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <RefreshCw size={18} /> Atualizar estoque
          </button>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <StatCards total={totalSolicitado} separadas={totalSeparado} pendentes={totalPendente} semEstoque={semEstoque} />

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginTop: 24, alignItems: 'stretch' }}>
          <SizeTable counts={counts} separated={separated} stock={stock} customMeasures={customMeasures} onManage={handleManage} />
          <DistributionChart counts={counts} total={totalSolicitado} />
        </div>
      </div>

      {/* Modal de Edição */}
      {editingSize && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 450, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'modalIn 0.3s ease-out' }}>
            <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#071A45', margin: 0 }}>Editar Tamanho</h2>
              <button onClick={() => setEditingSize(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4 }}>
                <RefreshCw size={20} style={{ transform: 'rotate(45deg)' }} />
              </button>
            </div>
            
            <div style={{ padding: '30px' }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Tamanho Selecionado</label>
                <input type="text" value={editingSize.label} disabled style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, outline: 'none' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, marginBottom: 24 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Estoque Disponível</label>
                  <input 
                    type="number" 
                    value={modalData.stock} 
                    onChange={e => setModalData((p: any) => ({ ...p, stock: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none' }} 
                  />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Largura (cm)</label>
                    <input 
                      type="number" 
                      value={modalData.largura} 
                      onChange={e => setModalData((p: any) => ({ ...p, largura: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none' }} 
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Comprimento (cm)</label>
                    <input 
                      type="number" 
                      value={modalData.altura} 
                      onChange={e => setModalData((p: any) => ({ ...p, altura: e.target.value === '' ? '' : parseInt(e.target.value) }))}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none' }} 
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16 }}>
                <button onClick={() => setEditingSize(null)} style={{ padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>CANCELAR</button>
                <button onClick={saveChanges} style={{ padding: '14px', borderRadius: 12, border: 'none', background: '#071A45', color: '#fff', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)' }}>SALVAR</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
