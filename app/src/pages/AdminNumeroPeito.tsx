import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { exportToCSV } from '../utils/exportUtils';
import { formatDateBR } from '../utils/dateUtils';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { useDialog } from '../context/CustomDialogContext';
import { Search, Plus, X, Download, Hash } from 'lucide-react';
import '../styles/admin.css';

type Reg = {
  id: string;
  nome: string;
  cpf: string;
  telefone?: string;
  email?: string;
  responsavelNome?: string;
  responsavelCpf?: string;
  categoria?: string;
  modalidadeId?: string;
  kit?: string;
  tamanhoCamiseta?: string;
  paymentStatus?: string;
  equipe?: string;
  createdAt?: any;
  filaNumeroPeito?: boolean;
};

const onlyDigits = (v: string) => (v || '').toString().replace(/\D/g, '');
const normalize = (v: string) => (v || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const maskCpfDisplay = (v: string) => onlyDigits(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

export default function AdminNumeroPeito() {
  const { showAlert } = useDialog();
  const [regs, setRegs] = useState<Reg[]>([]);
  const [modalidades, setModalidades] = useState<any[]>([]);
  const [kitsCadastrados, setKitsCadastrados] = useState<KitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const modSnap = await getDocs(query(collection(db, 'nightrun_modalidades'), orderBy('nome')));
        setModalidades(modSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setKitsCadastrados(await fetchKits());
      } catch (e) { console.error(e); }
    })();

    const unsub = onSnapshot(
      query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago')),
      snap => {
        setRegs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reg)));
        setLoading(false);
      },
      err => {
        console.error('Erro ao carregar inscritos:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const naLista = useMemo(() => regs
    .filter(r => r.filaNumeroPeito)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [regs]
  );

  const resultadosBusca = useMemo(() => {
    const termo = normalize(search);
    const termoDigits = onlyDigits(search);
    if (termo.length < 2 && termoDigits.length < 3) return [];
    return regs
      .filter(r => !r.filaNumeroPeito)
      .filter(r => {
        const nomeMatch = normalize(r.nome).includes(termo);
        const cpfMatch = termoDigits.length >= 3 && onlyDigits(r.cpf).includes(termoDigits);
        const telMatch = termoDigits.length >= 3 && onlyDigits(r.telefone || '').includes(termoDigits);
        return nomeMatch || cpfMatch || telMatch;
      })
      .slice(0, 20);
  }, [regs, search]);

  const adicionar = async (r: Reg) => {
    try {
      await updateDoc(doc(db, 'nightrun_registrations', r.id), { filaNumeroPeito: true });
      setSearch('');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao adicionar à lista. Tente novamente.', 'error');
    }
  };

  const remover = async (r: Reg) => {
    try {
      await updateDoc(doc(db, 'nightrun_registrations', r.id), { filaNumeroPeito: false });
    } catch (e) {
      console.error(e);
      showAlert('Erro ao remover da lista. Tente novamente.', 'error');
    }
  };

  const exportar = () => {
    if (naLista.length === 0) return showAlert('A lista está vazia.', 'warning');
    exportToCSV(naLista, 'lista_sem_numero_peito', [
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
      { header: 'Data Inscrição', key: 'createdAt', transform: (v) => formatDateBR(v, '') },
    ]);
    showAlert('Exportação CSV iniciada!', 'success');
  };

  if (loading) return <PageContainer><p>Carregando...</p></PageContainer>;

  return (
    <PageContainer>
      <PageTitle title="ATLETAS SEM NÚMERO DE PEITO" subtitle="Monte a lista de quem ainda precisa de número de peito e exporte pra gráfica" />

      <div className="data-card" style={{ padding: 24, marginBottom: 20 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
          Buscar atleta por nome, CPF ou telefone
        </label>
        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Digite ao menos 2 letras ou 3 números..."
            style={{ width: '100%', padding: '13px 14px 13px 42px', borderRadius: 10, border: '2px solid #071A45', fontSize: '0.95rem', boxSizing: 'border-box' }}
          />
        </div>

        {resultadosBusca.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {resultadosBusca.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                background: '#f8fafc', borderRadius: 10, padding: '10px 14px', flexWrap: 'wrap',
              }}>
                <div>
                  <strong style={{ fontSize: '0.88rem', color: '#071A45' }}>{r.nome.toUpperCase()}</strong>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{maskCpfDisplay(r.cpf)}{r.telefone ? ` · ${r.telefone}` : ''}</div>
                </div>
                <button
                  onClick={() => adicionar(r)}
                  style={{
                    background: '#071A45', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px',
                    fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Plus size={13} /> ADICIONAR À LISTA
                </button>
              </div>
            ))}
          </div>
        )}
        {search.trim().length >= 2 && resultadosBusca.length === 0 && (
          <p style={{ color: '#94a3b8', marginTop: 12, fontSize: '0.85rem' }}>Nenhum atleta confirmado encontrado (ou já está na lista).</p>
        )}
      </div>

      <div className="data-card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Hash size={18} color="#071A45" />
            <strong style={{ color: '#071A45' }}>Lista atual ({naLista.length})</strong>
          </div>
          <button
            onClick={exportar}
            disabled={naLista.length === 0}
            style={{
              background: naLista.length === 0 ? '#94a3b8' : '#071A45', color: '#fff', border: 'none', borderRadius: 10,
              padding: '12px 20px', fontWeight: 800, fontSize: '0.82rem', cursor: naLista.length === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <Download size={16} /> EXPORTAR EXCEL (CSV)
          </button>
        </div>

        {naLista.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>Nenhum atleta adicionado ainda. Use a busca acima.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {naLista.map(r => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', flexWrap: 'wrap',
              }}>
                <div>
                  <strong style={{ fontSize: '0.88rem', color: '#071A45' }}>{r.nome.toUpperCase()}</strong>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{maskCpfDisplay(r.cpf)}{r.telefone ? ` · ${r.telefone}` : ''}</div>
                </div>
                <button
                  onClick={() => remover(r)}
                  style={{
                    background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 14px',
                    fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <X size={13} /> REMOVER
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
