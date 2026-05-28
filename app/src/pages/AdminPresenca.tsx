import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Printer, Filter, Search, ChevronDown, Flag, User } from 'lucide-react';
import { type Registration, type Modalidade } from '../types';
import { exportToCSV } from '../utils/exportUtils';
import { AdminPageSkeleton } from '../components/Skeleton';
import { formatDateBR } from '../utils/dateUtils';
import '../styles/admin.css';

export default function AdminPresenca() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterModalidade, setFilterModalidade] = useState('');
  const [filterSexo, setFilterSexo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const modSnap = await getDocs(query(collection(db, 'nightrun_modalidades'), orderBy('nome')));
      setModalidades(modSnap.docs.map(d => ({ id: d.id, ...d.data() } as Modalidade)));

      const regSnap = await getDocs(query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago')));
      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() } as Registration)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (dobStr: string) => {
    if (!dobStr || dobStr.length < 10) return 0;
    // Handle both ISO (yyyy-mm-dd) and BR (dd/mm/yyyy) formats
    let birth: Date;
    if (dobStr.includes('/')) {
      const [d, m, y] = dobStr.split('/').map(Number);
      birth = new Date(y, m - 1, d);
    } else {
      birth = new Date(dobStr);
    }
    
    if (isNaN(birth.getTime())) return 0;
    
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const filtered = registrations.filter(r => {
    const matchesSearch = r.nome.toLowerCase().includes(searchTerm.toLowerCase()) || r.cpf.includes(searchTerm);
    const matchesModalidade = !filterModalidade || r.modalidadeId === filterModalidade;
    const matchesSexo = !filterSexo || r.sexo === filterSexo;
    return matchesSearch && matchesModalidade && matchesSexo;
  }).sort((a, b) => a.nome.localeCompare(b.nome));

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    exportToCSV(filtered, 'lista_presenca_mcu', [
      { header: 'Atleta', key: 'nome' },
      { header: 'CPF', key: 'cpf' },
      { header: 'Idade', key: 'dataNascimento', transform: (v) => calculateAge(v).toString() },
      { header: 'Modalidade', key: 'modalidadeId', transform: (v) => modalidades.find(m => m.id === v)?.nome || 'Outra' },
      { header: 'Gênero', key: 'sexo' }
    ]);
  };

  if (loading) return <AdminPageSkeleton variant="table" />;

  return (
    <div className="admin-presenca-container" style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; color: #000 !important; padding: 0 !important; }
          .admin-presenca-container { padding: 0 !important; background: #fff !important; }
          .print-header { display: block !important; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          table { width: 100% !important; border-collapse: collapse !important; }
          th, td { border: 1px solid #000 !important; padding: 8px !important; font-size: 10px !important; }
          .signature-cell { width: 200px; }
          .check-cell { width: 30px; text-align: center; }
        }
        .print-header { display: none; }
      `}</style>

      {/* Header */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Lista de Presença</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Gere listas para conferência e assinatura no dia do evento.</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={handleExport}
            style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#475569', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <Printer size={18} /> Exportar CSV
          </button>
          <button 
            onClick={handlePrint}
            style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)' }}
          >
            <Printer size={18} />
            Imprimir Lista
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="no-print" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24, background: '#fff', padding: 20, borderRadius: 20, border: '1px solid #e2e8f0' }}>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input 
            type="text" 
            placeholder="Buscar por nome ou CPF..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none' }}
          />
        </div>

        <select 
          value={filterModalidade} 
          onChange={e => setFilterModalidade(e.target.value)}
          style={{ padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
        >
          <option value="">Todas as Modalidades</option>
          {modalidades.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>

        <select 
          value={filterSexo} 
          onChange={e => setFilterSexo(e.target.value)}
          style={{ padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', background: '#fff' }}
        >
          <option value="">Todos os Sexos</option>
          <option value="M">Masculino</option>
          <option value="F">Feminino</option>
        </select>
      </div>

      {/* Print View Content */}
      <div className="print-header">
        <h2 style={{ textAlign: 'center', margin: 0 }}>MCU NIGHT RUN 2026 - LISTA DE PRESENÇA</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: '12px' }}>
          <span><strong>Modalidade:</strong> {modalidades.find(m => m.id === filterModalidade)?.nome || 'Todas'}</span>
          <span><strong>Data:</strong> {formatDateBR(new Date())}</span>
          <span><strong>Total:</strong> {filtered.length} atletas</span>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th className="no-print" style={{ padding: '16px 24px', width: 40 }}>#</th>
              <th className="check-cell" style={{ padding: '16px 12px' }}>[ ]</th>
              <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Atleta</th>
              <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>CPF / Idade</th>
              <th style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Modalidade</th>
              <th className="signature-cell" style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Assinatura</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => (
              <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td className="no-print" style={{ padding: '12px 24px', color: '#94a3b8', fontSize: '0.8rem' }}>{idx + 1}</td>
                <td className="check-cell" style={{ padding: '12px 12px', border: '1px solid #e2e8f0' }}></td>
                <td style={{ padding: '12px 24px' }}>
                  <div style={{ fontWeight: 700, color: '#071A45' }}>{r.nome}</div>
                  <div className="no-print" style={{ fontSize: '0.7rem', color: '#64748b' }}>{r.email}</div>
                </td>
                <td style={{ padding: '12px 24px', fontSize: '0.85rem' }}>
                  {r.cpf}<br/>
                  <span style={{ color: '#64748b' }}>{calculateAge(r.dataNascimento)} anos ({r.sexo})</span>
                </td>
                <td style={{ padding: '12px 24px' }}>
                  <span style={{ padding: '4px 8px', borderRadius: 6, background: '#f1f5f9', fontSize: '0.75rem', fontWeight: 700 }}>
                    {modalidades.find(m => m.id === r.modalidadeId)?.nome || r.categoria}
                  </span>
                </td>
                <td className="signature-cell" style={{ padding: '12px 24px', borderBottom: '1px solid #000' }}></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Nenhum atleta encontrado com os filtros selecionados.</div>
        )}
      </div>
    </div>
  );
}
