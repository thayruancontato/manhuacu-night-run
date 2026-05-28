import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Search, Download, Trash2, 
  CheckCircle, Plus, RotateCcw, ChevronLeft, ChevronRight 
} from 'lucide-react';
import { KITS, type Modalidade } from '../types';
import { useDialog } from '../context/CustomDialogContext';
import { exportToCSV } from '../utils/exportUtils';
import { formatDateBR } from '../utils/dateUtils';
import { SkeletonBlock, SkeletonCard, SkeletonTable } from '../components/Skeleton';
import '../styles/admin.css';

const LIST_STATE_KEY = 'mcu_admin_inscritos_list_state';

const readSavedListState = () => {
  try {
    return JSON.parse(sessionStorage.getItem(LIST_STATE_KEY) || '{}');
  } catch {
    return {};
  }
};

export default function AdminInscritos() {
  const navigate = useNavigate();
  const [regs, setRegs] = useState<any[]>([]);
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => readSavedListState().search || '');
  const [filterStatus, setFilterStatus] = useState(() => readSavedListState().filterStatus || 'todos');
  const [filterCat, setFilterCat] = useState(() => readSavedListState().filterCat || 'todos');
  const [filterMod, setFilterMod] = useState(() => readSavedListState().filterMod || 'todos');
  const [filterKit, setFilterKit] = useState(() => readSavedListState().filterKit || 'todos');
  const [filterSize, setFilterSize] = useState(() => readSavedListState().filterSize || 'todos');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(() => Number(readSavedListState().currentPage || 1));
  const [itemsPerPage] = useState(10);
  const didMountFiltersRef = useRef(false);
  const didRestoreScrollRef = useRef(false);
  
  const { showAlert } = useDialog();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const modSnap = await getDocs(query(collection(db, 'nightrun_modalidades'), orderBy('nome')));
      setModalidades(modSnap.docs.map(d => ({ id: d.id, ...d.data() } as Modalidade)));

      const q = query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setRegs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { 
      console.error(e); 
      showAlert('Erro ao carregar inscrições.', 'error');
    } finally { 
      setLoading(false); 
    }
  };

  const filtered = useMemo(() => {
    return regs.filter(r => {
      const searchable = [
        r.nome,
        r.responsavelNome,
        r.responsavelCpf,
        r.cpf,
        r.email,
        r.telefone,
      ].map(value => String(value || '').toLowerCase());
      const normalizedSearch = search.toLowerCase();
      const matchSearch = !search || 
        searchable.some(value => value.includes(normalizedSearch));
      const matchStatus = filterStatus === 'todos' || r.paymentStatus === filterStatus;
      const matchCat = filterCat === 'todos' || r.categoria === filterCat;
      const matchMod = filterMod === 'todos' || r.modalidadeId === filterMod;
      const matchKit = filterKit === 'todos' || r.kit === filterKit;
      const matchSize = filterSize === 'todos' || r.tamanhoCamiseta === filterSize;
      return matchSearch && matchStatus && matchCat && matchMod && matchKit && matchSize;
    });
  }, [regs, search, filterStatus, filterCat, filterMod, filterKit, filterSize]);

  const persistListState = (overrides: Record<string, any> = {}) => {
    sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify({
      search,
      filterStatus,
      filterCat,
      filterMod,
      filterKit,
      filterSize,
      currentPage,
      scrollY: window.scrollY,
      ...overrides,
    }));
  };

  // Reset page when filters change
  useEffect(() => {
    if (!didMountFiltersRef.current) {
      didMountFiltersRef.current = true;
      return;
    }
    setCurrentPage(1);
  }, [search, filterStatus, filterCat, filterMod, filterKit, filterSize]);

  useEffect(() => {
    if (loading || !didRestoreScrollRef.current) return;
    persistListState();
  }, [search, filterStatus, filterCat, filterMod, filterKit, filterSize, currentPage, loading]);

  // Pagination logic
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  useEffect(() => {
    if (loading || didRestoreScrollRef.current) return;
    didRestoreScrollRef.current = true;
    const savedScrollY = Number(readSavedListState().scrollY || 0);
    if (savedScrollY > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: savedScrollY, behavior: 'auto' }));
    }
  }, [loading]);

  const stats = useMemo(() => {
    const total = regs.length;
    const confirmados = regs.filter(r => r.paymentStatus === 'pago').length;
    const pendentes = regs.filter(r => r.paymentStatus === 'pendente').length;
    const cancelados = regs.filter(r => r.paymentStatus === 'cancelado').length;

    const getPerc = (val: number) => total > 0 ? ((val / total) * 100).toFixed(1) : '0';

    return [
      { label: 'Total de inscritos', value: total, perc: '100%', color: '#a855f7', icon: <Plus size={20} /> },
      { label: 'Confirmados', value: confirmados, perc: `${getPerc(confirmados)}% do total`, color: '#22c55e', icon: <CheckCircle size={20} /> },
      { label: 'Pendentes', value: pendentes, perc: `${getPerc(pendentes)}% do total`, color: '#f59e0b', icon: <RotateCcw size={20} />, path: '/admin/cobranca-pendentes' },
      { label: 'Cancelados', value: cancelados, perc: `${getPerc(cancelados)}% do total`, color: '#ef4444', icon: <Trash2 size={20} /> },
    ];
  }, [regs]);

  const clearFilters = () => {
    setSearch('');
    setFilterStatus('todos');
    setFilterCat('todos');
    setFilterMod('todos');
    setFilterKit('todos');
    setFilterSize('todos');
    setCurrentPage(1);
    sessionStorage.removeItem(LIST_STATE_KEY);
  };

  const handleExport = () => {
    if (filtered.length === 0) return showAlert('Nenhum dado para exportar.', 'warning');
    
    exportToCSV(filtered, 'inscritos_mcu_night_run', [
      { header: 'Nome', key: 'nome' },
      { header: 'CPF', key: 'cpf' },
      { header: 'E-mail', key: 'email' },
      { header: 'Telefone', key: 'telefone' },
      { header: 'Sexo', key: 'sexo', transform: (v) => v === 'M' ? 'Masculino' : 'Feminino' },
      { header: 'Data Nascimento', key: 'dataNascimento' },
      { header: 'Responsável', key: 'responsavelNome' },
      { header: 'CPF Responsável', key: 'responsavelCpf' },
      { header: 'Categoria', key: 'categoria' },
      { header: 'Modalidade', key: 'modalidadeId', transform: (v) => modalidades.find(m => m.id === v)?.nome || 'Nenhuma' },
      { header: 'Kit', key: 'kit', transform: (v) => KITS.find(k => k.id === v)?.nome || v },
      { header: 'Tamanho Camiseta', key: 'tamanhoCamiseta' },
      { header: 'Status Pagamento', key: 'paymentStatus' },
      { header: 'Data Inscrição', key: 'createdAt', transform: (v) => formatDateBR(v, '') }
    ]);
  };

  const getModalidadeNome = (modalidadeId: string, categoria: string) => {
    return modalidades.find(m => m.id === modalidadeId)?.nome || String(categoria || 'Sem modalidade').toUpperCase();
  };

  const openDetails = (id: string) => {
    persistListState({ scrollY: window.scrollY });
    navigate(`/admin/inscritos/${id}`);
  };

  return (
    <div className="admin-inscritos-page" style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Gerenciar Inscritos</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>{filtered.length} atletas encontrados na base de dados</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={handleExport}
            style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#475569', padding: '10px 20px', borderRadius: 12, fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <Download size={18} /> Exportar
          </button>
          <button style={{ background: '#071A45', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <Plus size={18} /> Novo Atleta
          </button>
        </div>
      </div>

      {/* Stats Quick Row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} style={{ flex: 1, minWidth: 200, padding: '16px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <SkeletonBlock width={40} height={40} radius={12} />
              <div style={{ flex: 1 }}>
                <SkeletonBlock width={46} height={20} radius={999} />
                <SkeletonBlock width="70%" height={10} radius={999} style={{ marginTop: 8 }} />
              </div>
            </div>
          </SkeletonCard>
        )) : stats.map((s, i) => (
          <div
            key={i}
            onClick={() => s.path ? navigate(s.path) : undefined}
            title={s.path ? 'Abrir cobrança de pendentes' : undefined}
            style={{ background: '#fff', flex: 1, minWidth: 200, padding: '16px 20px', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16, cursor: s.path ? 'pointer' : 'default' }}
          >
             <div style={{ width: 40, height: 40, borderRadius: 12, background: `${s.color}15`, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
               {s.icon}
             </div>
             <div>
               <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#071A45' }}>{s.value}</div>
               <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>{s.label}</div>
             </div>
          </div>
        ))}
      </div>

      {/* Filters Area */}
      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: '24px', marginBottom: 32, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 250, position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={20} />
            <input 
              type="text" 
              placeholder="Buscar..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '12px 16px 12px 48px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', background: '#f8fafc', fontWeight: 600 }}
            />
          </div>
          
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '12px 16px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 700, outline: 'none' }}>
              <option value="todos">Status</option>
              <option value="pago">Pago</option>
              <option value="pendente">Pendente</option>
            </select>

            <select value={filterMod} onChange={e => setFilterMod(e.target.value)} style={{ padding: '12px 16px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 700, outline: 'none' }}>
              <option value="todos">Modalidade</option>
              {modalidades.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>

            <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ padding: '12px 16px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: '0.8rem', fontWeight: 700, outline: 'none' }}>
              <option value="todos">Categoria</option>
              <option value="adulto">Adulto</option>
              <option value="infantil">Infantil</option>
            </select>

            <button onClick={clearFilters} style={{ background: '#f1f5f9', border: 'none', padding: '12px 16px', borderRadius: 14, color: '#475569', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}>
              LIMPAR
            </button>
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="admin-inscritos-list">
        <div className="admin-inscritos-list-head" aria-hidden="true">
          <span>Atleta</span>
          <span>Modalidade / Kit</span>
          <span>Status</span>
          <span>Inscrição</span>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>
            <SkeletonTable rows={7} columns={4} />
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="admin-inscritos-empty">Nenhum atleta encontrado nos filtros atuais.</div>
        ) : (
          <div className="admin-inscritos-items">
            {paginatedData.map(r => {
              const isPaid = r.paymentStatus === 'pago';
              const ct = r.createdAt?.toDate?.() || new Date();
              const statusLabel = String(r.paymentStatus || 'pendente').toUpperCase();
              return (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  className="admin-inscrito-row"
                  onClick={() => openDetails(r.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') openDetails(r.id);
                  }}
                >
                  <div className="admin-inscrito-athlete">
                    <div className="admin-inscrito-photo">
                      {r.fotoUrl ? (
                        <img src={r.fotoUrl} alt="" />
                      ) : (
                        <span>{String(r.nome || 'AT').slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="admin-inscrito-person">
                      <strong>{r.nome}</strong>
                      <span>{r.email || r.telefone || 'Sem contato'}</span>
                      {r.responsavelNome && <small>Responsável: {r.responsavelNome}</small>}
                    </div>
                  </div>

                  <div className="admin-inscrito-meta">
                    <strong>{getModalidadeNome(r.modalidadeId, r.categoria)}</strong>
                    <span>{KITS.find(k => k.id === r.kit)?.nome || r.kit || 'Sem kit'}</span>
                  </div>

                  <div className="admin-inscrito-status-cell">
                    <span
                      className={`admin-inscrito-status ${isPaid ? 'paid' : r.paymentStatus === 'cancelado' ? 'cancelled' : 'pending'}`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <div className="admin-inscrito-date">
                    <strong>{formatDateBR(ct)}</strong>
                    <span>{ct.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="admin-inscritos-pagination" style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>Página {currentPage} de {totalPages}</span>
             <div style={{ display: 'flex', gap: 8 }}>
               <button 
                 disabled={currentPage === 1}
                 onClick={() => setCurrentPage(prev => prev - 1)}
                 style={{ background: '#fff', border: '1px solid #e2e8f0', padding: 8, borderRadius: 8, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: currentPage === 1 ? '#cbd5e1' : '#475569' }}
               >
                 <ChevronLeft size={18} />
               </button>
               <button 
                 disabled={currentPage === totalPages}
                 onClick={() => setCurrentPage(prev => prev + 1)}
                 style={{ background: '#fff', border: '1px solid #e2e8f0', padding: 8, borderRadius: 8, cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', color: currentPage === totalPages ? '#cbd5e1' : '#475569' }}
               >
                 <ChevronRight size={18} />
               </button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
