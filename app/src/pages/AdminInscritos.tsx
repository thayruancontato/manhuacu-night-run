import { useState, useEffect, useMemo, useRef } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { arrayUnion, collection, doc, getCountFromServer, getDoc, getDocs, increment, limit as firestoreLimit, orderBy, query, startAfter, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import {
  Search, Download, Trash2,
  CheckCircle, Plus, RotateCcw, ChevronLeft, ChevronRight, Gift, Send, Repeat, Ghost
} from 'lucide-react';
import { type Modalidade } from '../types';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { useDialog } from '../context/CustomDialogContext';
import { useAuth } from '../context/AuthContext';
import { exportToCSV } from '../utils/exportUtils';
import { formatDateBR } from '../utils/dateUtils';
import { groupLinkedRegistrations } from '../utils/linkedRegistrationsUtils';
import SendCardChoiceModal from '../components/SendCardChoiceModal';
import { SkeletonBlock, SkeletonCard } from '../components/Skeleton';
import '../styles/admin.css';

const LIST_STATE_KEY = 'mcu_admin_inscritos_list_state';

const PENDING_CHARGE_SETTINGS_REF = doc(db, 'system_settings', 'nightrun_pending_charge');
const PAYMENT_PAGE_BASE_URL = 'https://mcunightrun.com.br/inscricao/pagamento';
const DEFAULT_PENDING_CHARGE_TEMPLATE =
  'Olá {nome}! Tudo bem\n\n' +
  'Seu pagamento da inscrição na MCU Night Run 2026 ainda não foi registrado no sistema.\n\n' +
  'Aceitamos pagamento via Pix e cartão de débito/crédito.\n\n' +
  'Para garantir sua vaga, acesse o link de pagamento:\n{link_pagamento}\n\n' +
  'Se você já pagou, basta nos enviar o comprovante por este WhatsApp para conferirmos e garantir sua vaga.';

const fillPendingChargeTemplate = (template: string, registration: any) => template
  .replaceAll('{nome}', String(registration.nome || 'Atleta').split(' ')[0] || 'Atleta')
  .replaceAll('{nome_completo}', registration.nome || 'Atleta')
  .replaceAll('{link_pagamento}', registration.id ? `${PAYMENT_PAGE_BASE_URL}/${registration.id}` : 'Link de pagamento não disponível')
  .replaceAll('{valor}', ((Number(registration.amount || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })));

const buildEuVouWhatsAppText = (registration: any, modalidadeNome: string) => {
  const modalidade = String(modalidadeNome || registration.modalidadeNome || registration.modalidade || '').trim() || 'MCU Night Run';
  return `Pagamento confirmado!\n\n` +
    `Ola ${registration.nome || 'Atleta'}! Sua inscricao na Manhuacu Night Run 2026 esta garantida.\n\n` +
    `Data: 12/09\n` +
    `Local: Estadio JK\n` +
    `Modalidade: ${modalidade}\n\n` +
    `Entre no grupo exclusivo de participantes no WhatsApp para ficar por dentro de todos os detalhes da corrida:\nhttps://chat.whatsapp.com/LdM79ltwcWpHRdgfSlm8tz\n\n` +
    `Nos acompanhe pelas redes sociais:\nInstagram: https://www.instagram.com/nightrunmcu\n\n` +
    `Compartilhe seu card #EUVOU em todas as redes sociais!`;
};

const copyEuVouCardImage = async (cardUrl: string) => {
  if (!navigator.clipboard || !('ClipboardItem' in window)) return false;
  try {
    const response = await fetch(cardUrl);
    const sourceBlob = await response.blob();
    const bitmap = await createImageBitmap(sourceBlob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(bitmap, 0, 0);
    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!pngBlob) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    return true;
  } catch (error) {
    console.warn('[AdminInscritos] Falha ao copiar card para clipboard', error);
    return false;
  }
};

const readSavedListState = () => {
  try {
    return JSON.parse(sessionStorage.getItem(LIST_STATE_KEY) || '{}');
  } catch {
    return {};
  }
};

export default function AdminInscritos() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [regs, setRegs] = useState<any[]>([]);
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [kitsCadastrados, setKitsCadastrados] = useState<KitRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendChoiceFor, setSendChoiceFor] = useState<any | null>(null);
  const [statsCounts, setStatsCounts] = useState({ total: 0, confirmados: 0, pendentes: 0, cancelados: 0, gratuitos: 0 });
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [pageCursors, setPageCursors] = useState<any[]>([]);
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
  const requestSeqRef = useRef(0);
  
  const { showAlert } = useDialog();

  useEffect(() => { loadInitial(); }, []);
  useEffect(() => { fetchKits().then(setKitsCadastrados).catch(e => console.error('Erro ao carregar kits', e)); }, []);

  useEffect(() => {
    if (!didMountFiltersRef.current) return;
    loadPage(1, []);
  }, [search, filterStatus, filterCat, filterMod, filterKit, filterSize]);

  // O filtro "gratuito" usa o campo booleano `gratuito` (inscrições com cupom 100%).
  // Como essas inscrições têm paymentStatus 'pago', filtramos por igualdade sem orderBy
  // para não exigir índice composto, e ordenamos no cliente.
  const isGratuitoFilter = filterStatus === 'gratuito';
  // "Pendência fantasma": inscrições cujo pagamento pendente ficou preso por falha no
  // webhook e foi confirmado via auditoria/reconciliação bancária. Mesmo padrão do
  // filtro "gratuito" (igualdade sem orderBy, sem exigir índice composto).
  const isFantasmaFilter = filterStatus === 'fantasma';
  const isClientBooleanFilter = isGratuitoFilter || isFantasmaFilter;

  const buildServerConstraints = () => {
    const constraints: any[] = [];
    if (isGratuitoFilter) constraints.push(where('gratuito', '==', true));
    else if (isFantasmaFilter) constraints.push(where('pendenciaFantasma', '==', true));
    else if (filterStatus !== 'todos') constraints.push(where('paymentStatus', '==', filterStatus));
    if (filterCat !== 'todos') constraints.push(where('categoria', '==', filterCat));
    if (filterMod !== 'todos') constraints.push(where('modalidadeId', '==', filterMod));
    if (filterKit !== 'todos') constraints.push(where('kit', '==', filterKit));
    if (filterSize !== 'todos') constraints.push(where('tamanhoCamiseta', '==', filterSize));
    if (!isClientBooleanFilter) constraints.push(orderBy('createdAt', 'desc'));
    return constraints;
  };

  const loadInitial = async () => {
    try {
      setLoading(true);
      const modSnap = await getDocs(query(collection(db, 'nightrun_modalidades'), orderBy('nome')));
      setModalidades(modSnap.docs.map(d => ({ id: d.id, ...d.data() } as Modalidade)));
      await Promise.all([loadStats(), loadPage(1, [])]);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao carregar inscricoes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    const base = collection(db, 'nightrun_registrations');
    const [totalSnap, pagosSnap, pendentesSnap, canceladosSnap, gratuitosSnap] = await Promise.all([
      getCountFromServer(base),
      getCountFromServer(query(base, where('paymentStatus', '==', 'pago'))),
      getCountFromServer(query(base, where('paymentStatus', '==', 'pendente'))),
      getCountFromServer(query(base, where('paymentStatus', '==', 'cancelado'))),
      getCountFromServer(query(base, where('gratuito', '==', true))),
    ]);
    setStatsCounts({
      total: totalSnap.data().count,
      confirmados: pagosSnap.data().count,
      pendentes: pendentesSnap.data().count,
      cancelados: canceladosSnap.data().count,
      gratuitos: gratuitosSnap.data().count,
    });
  };

  const loadPage = async (page: number, cursors = pageCursors) => {
    const seq = ++requestSeqRef.current;
    const normalizedPage = Math.max(1, page);
    const hasTextSearch = Boolean(search.trim());
    // Busca textual e filtros booleanos (gratuito/fantasma) carregam todos os resultados de uma vez (sem paginação no servidor).
    const fetchAll = hasTextSearch || isClientBooleanFilter;

    try {
      setLoadingPage(true);
      const base = collection(db, 'nightrun_registrations');
      const serverConstraints = buildServerConstraints();

      if (fetchAll) {
        const snap = await getDocs(query(base, ...serverConstraints));
        if (seq !== requestSeqRef.current) return;
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Ordena no cliente por data (filtros booleanos não usam orderBy no servidor).
        docs.sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setRegs(docs);
        setFilteredTotal(snap.size);
        setHasNextPage(false);
        setPageCursors([]);
        setCurrentPage(1);
        return;
      }

      const pageConstraints = [...serverConstraints];
      const startCursor = cursors[normalizedPage - 2];
      if (normalizedPage > 1 && startCursor) pageConstraints.push(startAfter(startCursor));
      pageConstraints.push(firestoreLimit(itemsPerPage + 1));

      const [snap, countSnap] = await Promise.all([
        getDocs(query(base, ...pageConstraints)),
        getCountFromServer(query(base, ...serverConstraints)),
      ]);
      if (seq !== requestSeqRef.current) return;

      const docs = snap.docs.slice(0, itemsPerPage);
      setRegs(docs.map(d => ({ id: d.id, ...d.data() })));
      setFilteredTotal(countSnap.data().count);
      setHasNextPage(snap.docs.length > itemsPerPage);
      setCurrentPage(normalizedPage);

      setPageCursors(prev => {
        const next = normalizedPage === 1 ? [] : [...prev];
        if (docs.length) next[normalizedPage - 1] = docs[docs.length - 1];
        return next;
      });
    } catch (e) {
      console.error(e);
      showAlert('Erro ao carregar pagina de inscritos.', 'error');
    } finally {
      if (seq === requestSeqRef.current) setLoadingPage(false);
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
      const matchStatus = filterStatus === 'todos'
        || (isGratuitoFilter ? Boolean(r.gratuito)
          : isFantasmaFilter ? Boolean(r.pendenciaFantasma)
          : r.paymentStatus === filterStatus);
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
    setPageCursors([]);
  }, [search, filterStatus, filterCat, filterMod, filterKit, filterSize]);

  useEffect(() => {
    if (loading || !didRestoreScrollRef.current) return;
    persistListState();
  }, [search, filterStatus, filterCat, filterMod, filterKit, filterSize, currentPage, loading]);

  // Pagination logic
  // No modo cliente (busca textual ou filtro booleano) todos os dados já estão carregados,
  // então paginamos localmente; caso contrário usamos a paginação por cursor no servidor.
  const clientMode = Boolean(search.trim()) || isClientBooleanFilter;
  const totalItems = clientMode ? filtered.length : filteredTotal;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const paginatedData = useMemo(() => {
    if (!clientMode) return filtered;
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage, itemsPerPage, clientMode]);

  // Cada inscrição vira seu próprio card na lista (ninguém fica escondido dentro da citação
  // "Vinculados" de outro atleta) - mas ainda calculamos, pra cada uma, quem mais está
  // vinculado a ela (mesma lógica do dashboard do atleta) só pra mostrar a citação de apoio
  // dentro do card. Só enxerga vínculos dentro da página atual carregada.
  const linkedByRegId = useMemo(() => {
    const map = new Map<string, any[]>();
    groupLinkedRegistrations(paginatedData).forEach(({ main, linked }) => {
      const group = [main, ...linked];
      group.forEach(member => map.set(member.id, group.filter(other => other.id !== member.id)));
    });
    return map;
  }, [paginatedData]);

  useEffect(() => {
    if (loading || didRestoreScrollRef.current) return;
    didRestoreScrollRef.current = true;
    const savedScrollY = Number(readSavedListState().scrollY || 0);
    if (savedScrollY > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: savedScrollY, behavior: 'auto' }));
    }
  }, [loading]);

  const stats = useMemo(() => {
    const total = statsCounts.total;
    const confirmados = statsCounts.confirmados;
    const pendentes = statsCounts.pendentes;
    const cancelados = statsCounts.cancelados;
    const gratuitos = statsCounts.gratuitos;

    const getPerc = (val: number) => total > 0 ? ((val / total) * 100).toFixed(1) : '0';

    return [
      { label: 'Total de inscritos', value: total, perc: '100%', color: '#a855f7', icon: <Plus size={20} /> },
      { label: 'Confirmados', value: confirmados, perc: `${getPerc(confirmados)}% do total`, color: '#22c55e', icon: <CheckCircle size={20} /> },
      { label: 'Pendentes', value: pendentes, perc: `${getPerc(pendentes)}% do total`, color: '#f59e0b', icon: <RotateCcw size={20} />, path: '/admin/cobranca-pendentes' },
      { label: 'Cancelados', value: cancelados, perc: `${getPerc(cancelados)}% do total`, color: '#ef4444', icon: <Trash2 size={20} /> },
      { label: 'Gratuitos', value: gratuitos, perc: `${getPerc(gratuitos)}% do total`, color: '#7c3aed', icon: <Gift size={20} />, filter: 'gratuito' },
    ];
  }, [statsCounts]);

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

  const loadAllForExport = async () => {
    const base = collection(db, 'nightrun_registrations');
    const snap = await getDocs(query(base, ...buildServerConstraints()));
    const all: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!search.trim()) return all;
    const normalizedSearch = search.toLowerCase();
    return all.filter(r => [r.nome, r.responsavelNome, r.responsavelCpf, r.cpf, r.email, r.telefone]
      .map(value => String(value || '').toLowerCase())
      .some(value => value.includes(normalizedSearch)));
  };

  const handleExport = async () => {
    const exportRows = await loadAllForExport();
    if (exportRows.length === 0) return showAlert('Nenhum dado para exportar.', 'warning');
    
    exportToCSV(exportRows, 'inscritos_mcu_night_run', [
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
      { header: 'Kit', key: 'kit', transform: (v) => resolveKitNome(kitsCadastrados, v) },
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

  const logEuVouCardSend = async (registration: any, method: 'whatsapp_manual' | 'whatsapp_auto') => {
    const clickedAt = new Date();
    try {
      await updateDoc(doc(db, 'nightrun_registrations', registration.id), {
        euVouCardLastSendClickAt: clickedAt,
        euVouCardSendClickCount: increment(1),
        euVouCardSendHistory: arrayUnion({ at: clickedAt.toISOString(), by: user?.email || 'admin', cardUrl: registration.euVouCardUrl, method }),
        updatedAt: clickedAt,
      });
      setRegs(prev => prev.map(item => item.id === registration.id
        ? { ...item, euVouCardLastSendClickAt: clickedAt, euVouCardSendClickCount: Number(item.euVouCardSendClickCount || 0) + 1 }
        : item));
    } catch (error) {
      console.error('[AdminInscritos] falha ao registrar envio do card', error);
    }
  };

  const buildChargeText = async (registration: any) => {
    let template = DEFAULT_PENDING_CHARGE_TEMPLATE;
    try {
      const settingsSnap = await getDoc(PENDING_CHARGE_SETTINGS_REF);
      if (settingsSnap.exists() && settingsSnap.data().template) template = settingsSnap.data().template;
    } catch (error) {
      console.error('[AdminInscritos] template de cobrança falhou', error);
    }
    return fillPendingChargeTemplate(template, registration);
  };

  // Envio manual (wa.me + imagem copiada): pago -> card #EUVOU; demais -> cobrança de pagamento.
  const sendManual = async (registration: any) => {
    const cleanPhone = String(registration.telefone || '').replace(/\D/g, '');
    if (!cleanPhone) return showAlert('Telefone não encontrado para este atleta.', 'warning');
    const phone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const isPaid = registration.paymentStatus === 'pago';

    setSendingId(registration.id);
    try {
      if (isPaid && registration.euVouCardUrl) {
        const copied = await copyEuVouCardImage(registration.euVouCardUrl);
        const text = buildEuVouWhatsAppText(registration, getModalidadeNome(registration.modalidadeId, registration.categoria));
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
        await logEuVouCardSend(registration, 'whatsapp_manual');
        showAlert(
          copied
            ? 'WhatsApp aberto. A imagem #EUVOU foi copiada, cole na conversa antes de enviar.'
            : 'WhatsApp aberto com a mensagem pronta. Anexe a imagem #EUVOU manualmente.',
          copied ? 'success' : 'warning'
        );
      } else {
        const text = await buildChargeText(registration);
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
        showAlert('WhatsApp aberto com a mensagem de cobrança.', 'success');
      }
    } finally {
      setSendingId(null);
    }
  };

  const openSendChoice = async (registration: any, event: React.MouseEvent) => {
    event.stopPropagation();
    const cleanPhone = String(registration.telefone || '').replace(/\D/g, '');
    if (!cleanPhone) return showAlert('Telefone não encontrado para este atleta.', 'warning');
    const isPaid = registration.paymentStatus === 'pago';
    const text = isPaid && registration.euVouCardUrl
      ? buildEuVouWhatsAppText(registration, getModalidadeNome(registration.modalidadeId, registration.categoria))
      : await buildChargeText(registration);
    setSendChoiceFor({ registration, text, cardUrl: isPaid ? (registration.euVouCardUrl || '') : '' });
  };

  return (
    <div className="admin-inscritos-page" style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Gerenciar Inscritos</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>{totalItems} atletas encontrados na base de dados</p>
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
            onClick={() => s.filter ? setFilterStatus(s.filter) : s.path ? navigate(s.path) : undefined}
            title={s.filter ? 'Filtrar inscrições gratuitas' : s.path ? 'Abrir cobrança de pendentes' : undefined}
            style={{ background: '#fff', flex: 1, minWidth: 200, padding: '16px 20px', borderRadius: 16, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16, cursor: (s.filter || s.path) ? 'pointer' : 'default' }}
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
              <option value="cancelado">Cancelado</option>
              <option value="gratuito">Gratuito</option>
              <option value="fantasma">Pendência fantasma</option>
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

      {/* Cards Area (mesmo estilo dos cards #EUVOU, com a imagem em destaque) */}
      <div className="admin-inscritos-list admin-inscritos-list--cards">
        {loading || loadingPage ? (
          <div className="admin-card-euvou-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <SkeletonCard key={index} style={{ minHeight: 320 }}>
                <div />
              </SkeletonCard>
            ))}
          </div>
        ) : paginatedData.length === 0 ? (
          <div className="admin-inscritos-empty">Nenhum atleta encontrado nos filtros atuais.</div>
        ) : (
          <div className="admin-card-euvou-grid">
            {paginatedData.map(r => {
              const linked = linkedByRegId.get(r.id) || [];
              const isFree = Boolean(r.gratuito);
              const isPaid = r.paymentStatus === 'pago';
              const isFantasma = Boolean(r.pendenciaFantasma);
              const titularidadeTransferida = Boolean(r.titularidadeTransferida);
              const titularidadeRecebida = Boolean(r.titularidadeRecebida);
              const ct = r.createdAt?.toDate?.() || new Date();
              const statusLabel = isFree ? 'GRATUITO' : String(r.paymentStatus || 'pendente').toUpperCase();
              const statusClass = isFree ? 'free' : isPaid ? 'paid' : r.paymentStatus === 'cancelado' ? 'cancelled' : 'pending';
              const imageUrl = r.euVouCardUrl || r.fotoUrl || '';
              return (
                <article
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  className={`admin-inscrito-card ${isFree ? 'is-free' : ''}`}
                  onClick={() => openDetails(r.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') openDetails(r.id);
                  }}
                >
                  <div className="admin-inscrito-card-image">
                    {imageUrl ? (
                      <img src={imageUrl} alt={`Inscrição de ${r.nome || 'atleta'}`} loading="lazy" />
                    ) : (
                      <span className="admin-inscrito-card-placeholder">{String(r.nome || 'AT').slice(0, 2).toUpperCase()}</span>
                    )}
                    <span className={`admin-inscrito-card-badge ${statusClass}`}>{statusLabel}</span>
                    {(isFree || titularidadeRecebida || titularidadeTransferida || isFantasma) && (
                      <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                        {isFree && <span className="admin-inscrito-card-free" style={{ position: 'static' }}><Gift size={12} /> Gratuito</span>}
                        {titularidadeRecebida && <span className="admin-inscrito-card-free" style={{ position: 'static', background: 'rgba(37,99,235,0.92)' }}><Repeat size={12} /> Titularidade recebida</span>}
                        {titularidadeTransferida && <span className="admin-inscrito-card-free" style={{ position: 'static', background: 'rgba(220,38,38,0.92)' }}><Repeat size={12} /> Titularidade transferida</span>}
                        {isFantasma && <span className="admin-inscrito-card-free" style={{ position: 'static', background: 'rgba(107,33,168,0.92)' }} title="Pagamento ficou preso por falha no webhook e foi confirmado via auditoria bancária"><Ghost size={12} /> Pendência fantasma</span>}
                      </div>
                    )}
                  </div>
                  <div className="admin-inscrito-card-info">
                    <strong>{r.nome}</strong>
                    <span>{getModalidadeNome(r.modalidadeId, r.categoria)} · {resolveKitNome(kitsCadastrados, r.kit, r.kitNome) || 'Sem kit'}</span>
                    <small>{r.email || r.telefone || 'Sem contato'}</small>
                    <div className="admin-inscrito-card-foot">
                      <span>{formatDateBR(ct)}</span>
                      <span>{ct.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <button
                      type="button"
                      className={`admin-inscrito-card-send ${isPaid ? 'euvou' : 'cobrar'}`}
                      onClick={(event) => openSendChoice(r, event)}
                      disabled={sendingId === r.id}
                    >
                      <Send size={15} />
                      {sendingId === r.id ? 'Abrindo...' : isPaid ? 'Enviar card #EUVOU' : 'Cobrar no WhatsApp'}
                    </button>

                    {linked.length > 0 && (
                      <div
                        onClick={(event) => event.stopPropagation()}
                        style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6 }}
                      >
                        <span style={{ fontSize: '.62rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .4 }}>
                          Vinculados ({linked.length})
                        </span>
                        {linked.map(item => {
                          const itemIsPaid = item.paymentStatus === 'pago';
                          return (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '6px 8px' }}>
                              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => openDetails(item.id)}>
                                <strong style={{ display: 'block', fontSize: '.72rem', color: '#071A45', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome || 'Atleta sem nome'}</strong>
                                <span style={{ display: 'block', fontSize: '.62rem', color: itemIsPaid ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                                  {itemIsPaid ? 'Pago' : String(item.paymentStatus || 'pendente').toUpperCase()}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(event) => openSendChoice(item, event)}
                                disabled={sendingId === item.id}
                                title={itemIsPaid ? 'Enviar card #EUVOU' : 'Cobrar no WhatsApp'}
                                style={{ border: 'none', background: '#071A45', color: '#fff', width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: sendingId === item.id ? 'wait' : 'pointer', flexShrink: 0 }}
                              >
                                <Send size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </article>
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
                 disabled={currentPage === 1 || loadingPage}
                 onClick={() => clientMode ? setCurrentPage(prev => prev - 1) : loadPage(currentPage - 1)}
                 style={{ background: '#fff', border: '1px solid #e2e8f0', padding: 8, borderRadius: 8, cursor: currentPage === 1 ? 'not-allowed' : 'pointer', color: currentPage === 1 ? '#cbd5e1' : '#475569' }}
               >
                 <ChevronLeft size={18} />
               </button>
               <button
                 disabled={loadingPage || (clientMode ? currentPage === totalPages : !hasNextPage)}
                 onClick={() => clientMode ? setCurrentPage(prev => prev + 1) : loadPage(currentPage + 1)}
                 style={{ background: '#fff', border: '1px solid #e2e8f0', padding: 8, borderRadius: 8, cursor: (clientMode ? currentPage === totalPages : !hasNextPage) ? 'not-allowed' : 'pointer', color: (clientMode ? currentPage === totalPages : !hasNextPage) ? '#cbd5e1' : '#475569' }}
               >
                 <ChevronRight size={18} />
               </button>
             </div>
          </div>
        )}
      </div>

      {sendChoiceFor && (
        <SendCardChoiceModal
          phone={sendChoiceFor.registration.telefone}
          cardUrl={sendChoiceFor.cardUrl}
          text={sendChoiceFor.text}
          onClose={() => setSendChoiceFor(null)}
          onManualSend={() => sendManual(sendChoiceFor.registration)}
          onAutoSent={() => sendChoiceFor.cardUrl ? logEuVouCardSend(sendChoiceFor.registration, 'whatsapp_auto') : Promise.resolve()}
        />
      )}
    </div>
  );
}
