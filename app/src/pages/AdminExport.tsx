import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Download, FileText, Table } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { useDialog } from '../context/CustomDialogContext';
import { exportToCSV } from '../utils/exportUtils';
import { formatDateBR } from '../utils/dateUtils';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';

export default function AdminExport() {
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalidades, setModalidades] = useState<any[]>([]);
  const [kitsCadastrados, setKitsCadastrados] = useState<KitRecord[]>([]);
  const { showAlert } = useDialog();

  useEffect(() => {
    (async () => {
      try {
        const modSnap = await getDocs(query(collection(db, 'nightrun_modalidades'), orderBy('nome')));
        setModalidades(modSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setKitsCadastrados(await fetchKits());

        const q = query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setRegs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); } finally { setLoading(false); }
    })();
  }, []);

  const exportCSV = () => {
    if (regs.length === 0) return showAlert('Nenhum dado para exportar.', 'warning');
    
    exportToCSV(regs, 'export_completo_mcu', [
      { header: 'Nome', key: 'nome' },
      { header: 'CPF', key: 'cpf' },
      { header: 'E-mail', key: 'email' },
      { header: 'Telefone', key: 'telefone' },
      { header: 'Responsável', key: 'responsavelNome' },
      { header: 'CPF Responsável', key: 'responsavelCpf' },
      { header: 'Categoria', key: 'categoria' },
      { header: 'Modalidade', key: 'modalidadeId', transform: (v) => modalidades.find(m => m.id === v)?.nome || 'Outra' },
      { header: 'Kit', key: 'kit', transform: (v) => resolveKitNome(kitsCadastrados, v) },
      { header: 'Tamanho Camiseta', key: 'tamanhoCamiseta', transform: (v) => String(v || '').replace('BL_', 'Baby Look ') },
      { header: 'Status Pagamento', key: 'paymentStatus' },
      { header: 'Equipe', key: 'equipe' },
      { header: 'Data Inscrição', key: 'createdAt', transform: (v) => formatDateBR(v, '') }
    ]);
    showAlert('Exportação CSV iniciada!', 'success');
  };

  return (
    <PageContainer>
      <PageTitle title="EXPORTAR DADOS" subtitle="Baixe a lista de inscritos em diferentes formatos" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <div className="data-card" style={{ padding: 30, textAlign: 'center' }}>
          <Table size={48} color="#6BFF2A" style={{ margin: '0 auto 20px' }} />
          <h3 style={{ color: '#071A45', marginBottom: 10 }}>Formato CSV (Excel)</h3>
          <p style={{ color: '#666', marginBottom: 24, fontSize: '.9rem' }}>Ideal para abrir no Excel ou Google Sheets e gerenciar a lista de corredores.</p>
          <button className="btn btn-primary" onClick={exportCSV} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Download size={18} /> Baixar CSV
          </button>
        </div>

        <div className="data-card" style={{ padding: 30, textAlign: 'center', opacity: 0.6 }}>
          <FileText size={48} color="#999" style={{ margin: '0 auto 20px' }} />
          <h3 style={{ color: '#071A45', marginBottom: 10 }}>Relatório PDF</h3>
          <p style={{ color: '#666', marginBottom: 24, fontSize: '.9rem' }}>Relatório formatado para impressão (Em breve).</p>
          <button className="btn btn-outline" disabled style={{ width: '100%' }}>Indisponível</button>
        </div>
      </div>
    </PageContainer>
  );
}
