import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, updateDoc, writeBatch, getDocs, query, where, serverTimestamp
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db } from '../firebase';
import * as Lucide from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';
import { FormHeader } from '../components/AdminForm';
import { AdminPageSkeleton } from '../components/Skeleton';
import { formatCamisetaLabel } from '../utils/camisetaUtils';
import { formatDateBR } from '../utils/dateUtils';
import { DEFAULT_KIT_ID, type KitRecord } from '../utils/kitsUtils';
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

type KitOption = KitRecord;

interface CamisetaSize {
  id: string;
  label: string;
  estoque: number;
  // Quantidade física que o admin realmente tem em mãos desse tamanho - separado do
  // `estoque` (que só controla se o tamanho ainda aparece disponível no formulário público).
  // Editável e persistido, usado no PDF de resumo pra comparar pedido x tenho x falta/sobra.
  quantidadeTenho?: number;
  ativo: boolean;
  tipo: 'Padrão' | 'Baby Look';
  categoria: 'adulto' | 'infantil' | 'todos';
  ordem: number;
  largura: number;
  altura: number;
}

export default function AdminKits() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: 'itens' | 'camisetas' | 'kits' = searchParams.get('tab') === 'camisetas' ? 'camisetas' : searchParams.get('tab') === 'kits' ? 'kits' : 'itens';
  const setActiveTab = (tab: 'itens' | 'camisetas' | 'kits') => {
    setSearchParams(tab === 'itens' ? {} : { tab }, { replace: false });
  };
  const [items, setItems] = useState<KitItem[]>([]);
  const [kits, setKits] = useState<KitOption[]>([]);
  const [isKitModalOpen, setIsKitModalOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<KitOption | null>(null);
  const [savingKit, setSavingKit] = useState(false);
  const [kitForm, setKitForm] = useState({
    nome: '', descricao: '', itensText: '', precoForcado: false, precoForcadoValor: '',
  });
  const [sizes, setSizes] = useState<CamisetaSize[]>([]);
  const [confirmedSizeCounts, setConfirmedSizeCounts] = useState<Record<string, number>>({});
  const [confirmedKitCounts, setConfirmedKitCounts] = useState<Record<string, number>>({});
  const [confirmedRegsBrief, setConfirmedRegsBrief] = useState<{ tamanhoCamiseta: string; kit: string }[]>([]);
  const [showSummaryKitPicker, setShowSummaryKitPicker] = useState(false);
  const [summaryKitIds, setSummaryKitIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [exportingKitId, setExportingKitId] = useState<string | null>(null);
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

    const unsubKits = onSnapshot(collection(db, 'nightrun_kits'), async (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        nome: d.data().nome || '',
        descricao: d.data().descricao || '',
        itens: Array.isArray(d.data().itens) ? d.data().itens : [],
        ativo: !!d.data().ativo,
        precoForcado: !!d.data().precoForcado,
        precoForcadoValor: Number(d.data().precoForcadoValor || 0),
        isPadrao: !!d.data().isPadrao,
        createdAt: d.data().createdAt,
      } as KitOption));
      // O kit padrão (id fixo 'unico', mesmo valor que já era gravado nas inscrições antes
      // desse sistema de kits existir) precisa sempre existir - se ninguém abriu essa aba
      // ainda, semeamos ele uma única vez aqui, ativo por padrão.
      if (!list.some(k => k.isPadrao)) {
        try {
          await setDoc(doc(db, 'nightrun_kits', DEFAULT_KIT_ID), {
            nome: 'Kit Único',
            descricao: 'Camiseta oficial + Medalha + Número de peito',
            itens: ['Camiseta Oficial', 'Medalha de Participação', 'Número de Peito', 'Chip de Cronometragem'],
            ativo: !list.some(k => k.ativo),
            precoForcado: false,
            precoForcadoValor: 0,
            isPadrao: true,
            createdAt: serverTimestamp(),
          }, { merge: true });
        } catch (e) { console.error('Erro ao semear kit padrão', e); }
        return;
      }
      list.sort((a, b) => (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0) || (b.isPadrao ? 1 : 0) - (a.isPadrao ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
      setKits(list);
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
        const idxA = order.indexOf(String(a.label || '').toUpperCase());
        const idxB = order.indexOf(String(b.label || '').toUpperCase());
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return String(a.label || '').localeCompare(String(b.label || ''));
      });
      setSizes(list);
      setLoading(false);
    });

    const unsubRegistrations = onSnapshot(collection(db, 'nightrun_registrations'), (snap) => {
      const counts: Record<string, number> = {};
      const kitCounts: Record<string, number> = {};
      const brief: { tamanhoCamiseta: string; kit: string }[] = [];
      snap.docs.forEach(item => {
        const data = item.data();
        const confirmed = data.paymentStatus === 'pago' || data.kitConfirmado || data.contractStatus === 'confirmado';
        if (!confirmed) return;
        const kitId = data.kit || DEFAULT_KIT_ID;
        if (data.tamanhoCamiseta) {
          counts[data.tamanhoCamiseta] = (counts[data.tamanhoCamiseta] || 0) + 1;
          brief.push({ tamanhoCamiseta: data.tamanhoCamiseta, kit: kitId });
        }
        kitCounts[kitId] = (kitCounts[kitId] || 0) + 1;
      });
      setConfirmedSizeCounts(counts);
      setConfirmedKitCounts(kitCounts);
      setConfirmedRegsBrief(brief);
    });

    return () => {
      unsubItems();
      unsubKits();
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

  const openNewKitModal = () => {
    setEditingKit(null);
    setKitForm({ nome: '', descricao: '', itensText: '', precoForcado: false, precoForcadoValor: '' });
    setIsKitModalOpen(true);
  };

  const openEditKitModal = (kit: KitOption) => {
    setEditingKit(kit);
    setKitForm({
      nome: kit.nome,
      descricao: kit.descricao,
      itensText: kit.itens.join('\n'),
      precoForcado: kit.precoForcado,
      precoForcadoValor: kit.precoForcadoValor ? (kit.precoForcadoValor / 100).toFixed(2).replace('.', ',') : '',
    });
    setIsKitModalOpen(true);
  };

  const handleSaveKit = async () => {
    if (!kitForm.nome.trim()) return showAlert('Nome do kit é obrigatório', 'warning');
    const valorNumerico = Math.round(parseFloat(kitForm.precoForcadoValor.replace(',', '.')) * 100);
    if (kitForm.precoForcado && (!valorNumerico || valorNumerico <= 0)) {
      return showAlert('Informe um valor válido para o preço forçado.', 'warning');
    }
    setSavingKit(true);
    try {
      const payload = {
        nome: kitForm.nome.trim(),
        descricao: kitForm.descricao.trim(),
        itens: kitForm.itensText.split('\n').map(s => s.trim()).filter(Boolean),
        precoForcado: kitForm.precoForcado,
        precoForcadoValor: kitForm.precoForcado ? valorNumerico : 0,
      };
      if (editingKit) {
        await updateDoc(doc(db, 'nightrun_kits', editingKit.id), payload);
        showAlert('Kit atualizado!', 'success');
      } else {
        await addDoc(collection(db, 'nightrun_kits'), { ...payload, ativo: kits.length === 0, createdAt: serverTimestamp() });
        showAlert('Kit criado!', 'success');
      }
      setIsKitModalOpen(false);
      setEditingKit(null);
    } catch (e) {
      showAlert('Erro ao salvar kit', 'error');
    } finally {
      setSavingKit(false);
    }
  };

  const handleDeleteKit = (kit: KitOption) => {
    if (kit.isPadrao) return showAlert('O kit padrão não pode ser excluído. Você pode renomeá-lo ou editá-lo.', 'warning');
    if (kit.ativo) return showAlert('Não é possível excluir o kit ativo. Ative outro kit antes de excluir este.', 'warning');
    showConfirm(`Remover o kit "${kit.nome}"`, async () => {
      await deleteDoc(doc(db, 'nightrun_kits', kit.id));
      showAlert('Kit removido', 'success');
    });
  };

  // Garante um único kit ativo por vez: zera os demais e ativa o escolhido no mesmo batch.
  const handleActivateKit = async (kit: KitOption) => {
    if (kit.ativo) return;
    try {
      const batch = writeBatch(db);
      kits.forEach(k => {
        if (k.id !== kit.id && k.ativo) batch.update(doc(db, 'nightrun_kits', k.id), { ativo: false });
      });
      batch.update(doc(db, 'nightrun_kits', kit.id), { ativo: true });
      await batch.commit();
      showAlert(`Kit "${kit.nome}" ativado.`, 'success');
    } catch (e) {
      showAlert('Erro ao ativar kit', 'error');
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

  const handleUpdateQuantidadeTenho = async (id: string, current: number) => {
    const newVal = prompt('Quantas você tem desse tamanho:', String(current || 0));
    if (newVal !== null) {
      const num = parseInt(newVal);
      if (!isNaN(num)) {
        await updateDoc(doc(db, 'nightrun_camisetas', id), { quantidadeTenho: num });
        showAlert('Quantidade atualizada', 'success');
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

  // Resumo de camisetas confirmadas por tamanho - mesmo padrão visual e técnico do PDF de
  // confirmados por kit (header.png em todas as páginas via o mesmo alias, título com a fonte
  // Anton em canvas com leve inclinação itálica, texto explicativo em itálico, tabela com
  // quebra de página segura).
  const generateSummaryPdf = async (kitIds: string[]) => {
    setGeneratingSummary(true);
    try {
      const kitIdSet = new Set(kitIds);
      const filteredCounts: Record<string, number> = {};
      confirmedRegsBrief.forEach(r => {
        if (!kitIdSet.has(r.kit)) return;
        filteredCounts[r.tamanhoCamiseta] = (filteredCounts[r.tamanhoCamiseta] || 0) + 1;
      });
      const filteredTotal = Object.values(filteredCounts).reduce((s, n) => s + n, 0);
      const rows = groupedSizeSummary.flatMap(group => group.items.map(size => {
        const confirmados = filteredCounts[size.id] || 0;
        const tenho = size.quantidadeTenho || 0;
        return {
          grupo: group.label,
          tamanho: size.label,
          confirmados,
          tenho,
          diferenca: tenho - confirmados,
        };
      }));
      const kitLabel = kitIds.length === kits.length
        ? 'todos os kits'
        : kits.filter(k => kitIdSet.has(k.id)).map(k => k.nome).join(', ') || 'nenhum kit selecionado';

      const headerBase64: string = await new Promise((resolve, reject) => {
        fetch(`/header.png?v=${Date.now()}`, { cache: 'no-store' })
          .then(res => res.blob())
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Falha ao carregar header.png'));
            reader.readAsDataURL(blob);
          })
          .catch(reject);
      });

      const tituloBase = 'RESUMO DE CAMISETAS';
      const titleFont = new FontFace('Anton', 'url(/fonts/Anton-Regular.ttf)');
      await titleFont.load();
      (document as any).fonts.add(titleFont);
      const titleCanvas = document.createElement('canvas');
      const titleCtx = titleCanvas.getContext('2d')!;
      titleCtx.font = '90px Anton';
      const titleSkew = 0.22;
      const titlePadding = 24;
      const titleTextW = titleCtx.measureText(tituloBase).width;
      titleCanvas.width = titleTextW + titleSkew * 100 + titlePadding * 2;
      titleCanvas.height = 130;
      titleCtx.font = '90px Anton';
      titleCtx.setTransform(1, 0, -titleSkew, 1, titlePadding, 92);
      titleCtx.fillStyle = 'rgb(7, 26, 69)';
      titleCtx.textBaseline = 'alphabetic';
      titleCtx.fillText(tituloBase, 0, 0);
      const titleImgData = titleCanvas.toDataURL('image/png');
      const titleImgAspect = titleCanvas.width / titleCanvas.height;
      const titleImgH = 12;
      const titleImgW = titleImgH * titleImgAspect;

      const docPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = docPdf.internal.pageSize.getWidth();
      const pageH = docPdf.internal.pageSize.getHeight();
      const marginX = 16;
      const marginBottom = 16;
      const headerAspect = 2172 / 724;
      const headerW = pageW;
      const headerH = headerW / headerAspect;
      const NAVY_PDF: [number, number, number] = [7, 26, 69];
      const STRIPE_PDF: [number, number, number] = [241, 245, 249];

      const drawHeader = () => {
        try {
          docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'summary-pdf-header', 'FAST');
        } catch {
          docPdf.setFillColor(...NAVY_PDF);
          docPdf.rect(0, 0, pageW, headerH, 'F');
        }
      };

      const usableW = pageW - marginX * 2;
      const colGrupoW = usableW * 0.22;
      const colTamanhoW = usableW * 0.22;
      const colPedidoW = usableW * 0.19;
      const colTenhoW = usableW * 0.19;
      const rowH = 9;

      let y = headerH + 10;

      const drawTableHeader = () => {
        docPdf.setFillColor(...NAVY_PDF);
        docPdf.rect(marginX, y, usableW, 9, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('GRUPO', marginX + 3, y + 6.2);
        docPdf.text('TAMANHO', marginX + colGrupoW + 3, y + 6.2);
        docPdf.text('PEDIDO', marginX + colGrupoW + colTamanhoW + 3, y + 6.2);
        docPdf.text('TENHO', marginX + colGrupoW + colTamanhoW + colPedidoW + 3, y + 6.2);
        docPdf.text('FALTA/SOBRA', marginX + colGrupoW + colTamanhoW + colPedidoW + colTenhoW + 3, y + 6.2);
        y += 9;
      };

      const newPage = () => {
        docPdf.addPage();
        drawHeader();
        y = headerH + 10;
        drawTableHeader();
      };

      const infoText = `Pedido (confirmados) x Tenho (quantidade cadastrada) por tamanho, agrupados por tipo - kits incluídos: ${kitLabel}. Total pedido: ${filteredTotal} confirmado(s).`;

      drawHeader();
      docPdf.addImage(titleImgData, 'PNG', marginX, y - titleImgH + 3, titleImgW, titleImgH, undefined, 'FAST');
      y += 6;
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(9);
      docPdf.setTextColor(100, 116, 139);
      const infoLines = docPdf.splitTextToSize(infoText, usableW);
      docPdf.text(infoLines, marginX, y);
      y += infoLines.length * 4.6 + 4;
      drawTableHeader();

      if (rows.length === 0) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(10);
        docPdf.setTextColor(100, 116, 139);
        docPdf.text('Nenhum tamanho de camiseta cadastrado ainda.', marginX, y + 6);
      }

      rows.forEach((item, idx) => {
        if (y + rowH > pageH - marginBottom) {
          newPage();
        }

        if (idx % 2 === 1) {
          docPdf.setFillColor(...STRIPE_PDF);
          docPdf.rect(marginX, y, usableW, rowH, 'F');
        }

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(9.5);
        docPdf.setTextColor(...NAVY_PDF);
        docPdf.text(item.grupo, marginX + 3, y + rowH / 2 + 1.6);
        docPdf.text(item.tamanho, marginX + colGrupoW + 3, y + rowH / 2 + 1.6);
        docPdf.text(String(item.confirmados), marginX + colGrupoW + colTamanhoW + 3, y + rowH / 2 + 1.6);
        docPdf.text(String(item.tenho), marginX + colGrupoW + colTamanhoW + colPedidoW + 3, y + rowH / 2 + 1.6);

        // Falta/sobra em destaque: vermelho quando falta camiseta, verde quando sobra.
        const diffX = marginX + colGrupoW + colTamanhoW + colPedidoW + colTenhoW;
        const diffColor: [number, number, number] = item.diferenca < 0 ? [220, 38, 38] : item.diferenca > 0 ? [22, 101, 52] : [100, 116, 139];
        const diffBg: [number, number, number] = item.diferenca < 0 ? [254, 226, 226] : item.diferenca > 0 ? [220, 252, 231] : [241, 245, 249];
        const diffLabel = item.diferenca < 0 ? `FALTA ${Math.abs(item.diferenca)}` : item.diferenca > 0 ? `SOBRA ${item.diferenca}` : 'EXATO';
        docPdf.setFillColor(...diffBg);
        docPdf.roundedRect(diffX, y + 1.3, colTenhoW - 5, rowH - 2.6, 1.5, 1.5, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        docPdf.setTextColor(...diffColor);
        docPdf.text(diffLabel, diffX + (colTenhoW - 5) / 2, y + rowH / 2 + 1.4, { align: 'center' });

        y += rowH;
      });

      docPdf.save(`resumo-camisetas-${new Date().toISOString().slice(0, 10)}.pdf`);
      showAlert('PDF de resumo gerado.', 'success');
      setShowSummaryKitPicker(false);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao gerar o PDF de resumo.', 'error');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const toggleSummaryKitId = (kitId: string) => {
    setSummaryKitIds(prev => prev.includes(kitId) ? prev.filter(id => id !== kitId) : [...prev, kitId]);
  };

  // Gera a lista em PDF de quem está confirmado num kit específico - só nome e modalidade
  // (nada sensível). O header.png é reaproveitado em todas as páginas via o mesmo alias no
  // jsPDF, então os bytes da imagem só são embutidos uma vez no arquivo final.
  const handleExportKitPdf = async (kit: KitOption) => {
    setExportingKitId(kit.id);
    try {
      const [snap, modalidadesSnap] = await Promise.all([
        getDocs(query(collection(db, 'nightrun_registrations'), where('kit', '==', kit.id))),
        getDocs(collection(db, 'nightrun_modalidades')),
      ]);
      // Resolve a modalidade pelo modalidadeId contra a coleção atual, igual à ficha do
      // atleta - o campo modalidadeNome gravado na inscrição fica desatualizado se o admin
      // trocar a modalidade depois pela ficha (só o modalidadeId é atualizado ali).
      const modalidadeNomeById: Record<string, string> = {};
      modalidadesSnap.docs.forEach(m => { modalidadeNomeById[m.id] = String(m.data().nome || ''); });
      const confirmados = snap.docs
        .map(d => d.data())
        .filter(data => data.paymentStatus === 'pago' || data.kitConfirmado || data.contractStatus === 'confirmado')
        .map(data => ({
          nome: String(data.nome || 'Sem nome'),
          modalidade: String(
            (data.modalidadeId && modalidadeNomeById[data.modalidadeId]) ||
            data.modalidadeNome ||
            (data.categoria === 'infantil' ? 'Infantil' : '—')
          ),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      const headerBase64: string = await new Promise((resolve, reject) => {
        fetch(`/header.png?v=${Date.now()}`, { cache: 'no-store' })
          .then(res => res.blob())
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Falha ao carregar header.png'));
            reader.readAsDataURL(blob);
          })
          .catch(reject);
      });

      // Fonte Anton (Google Fonts) para o título, no mesmo estilo bold condensado itálico usado
      // nos outros materiais do evento. Sem suporte a itálico nativo no jsPDF, então o título é
      // renderizado num canvas (com skew manual) e embutido como imagem - mais confiável que
      // tentar simular a inclinação com a matriz de transformação vetorial do PDF.
      const titleFont = new FontFace('Anton', 'url(/fonts/Anton-Regular.ttf)');
      await titleFont.load();
      (document as any).fonts.add(titleFont);
      const titleText = `CONFIRMADOS — ${kit.nome.toUpperCase()}`;
      const titleCanvas = document.createElement('canvas');
      const titleCtx = titleCanvas.getContext('2d')!;
      titleCtx.font = '90px Anton';
      const titleSkew = 0.22;
      const titlePadding = 24;
      const titleTextW = titleCtx.measureText(titleText).width;
      titleCanvas.width = titleTextW + titleSkew * 100 + titlePadding * 2;
      titleCanvas.height = 130;
      titleCtx.font = '90px Anton';
      titleCtx.setTransform(1, 0, -titleSkew, 1, titlePadding, 92);
      titleCtx.fillStyle = `rgb(7, 26, 69)`;
      titleCtx.textBaseline = 'alphabetic';
      titleCtx.fillText(titleText, 0, 0);
      const titleImgData = titleCanvas.toDataURL('image/png');
      const titleImgAspect = titleCanvas.width / titleCanvas.height;
      const titleImgH = 12;
      const titleImgW = titleImgH * titleImgAspect;

      const docPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = docPdf.internal.pageSize.getWidth();
      const pageH = docPdf.internal.pageSize.getHeight();
      const marginX = 16;
      const marginBottom = 16;
      const headerAspect = 2172 / 724;
      const headerW = pageW;
      const headerH = headerW / headerAspect;
      const NAVY: [number, number, number] = [7, 26, 69];
      const STRIPE: [number, number, number] = [241, 245, 249];

      const drawHeader = () => {
        try {
          docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'kit-pdf-header', 'FAST');
        } catch {
          docPdf.setFillColor(...NAVY);
          docPdf.rect(0, 0, pageW, headerH, 'F');
        }
      };

      const usableW = pageW - marginX * 2;
      const colNomeW = usableW * 0.62;
      const rowLineH = 5.4;
      const rowPaddingV = 3.4;

      let y = headerH + 10;

      const drawTableHeader = () => {
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 9, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('NOME', marginX + 3, y + 6.2);
        docPdf.text('MODALIDADE', marginX + colNomeW + 3, y + 6.2);
        y += 9;
      };

      const newPage = () => {
        docPdf.addPage();
        drawHeader();
        y = headerH + 10;
        drawTableHeader();
      };

      // O texto explicativo abaixo do título vem da própria descrição do kit (editável em
      // "Editar Kit" > Descrição) - só cai no texto padrão abaixo se o admin não escreveu nada.
      const kitCreatedAt = formatDateBR(kit.createdAt, '');
      const defaultInfoText = kitCreatedAt
        ? (kit.ativo
            ? `Todos os atletas inscritos do dia ${kitCreatedAt} até agora estão cadastrados nesse kit (kit ativo no sistema).`
            : `Todos os atletas inscritos do dia ${kitCreatedAt} enquanto o kit esteve ativo no sistema estão cadastrados nesse kit (kit atualmente inativo).`)
        : (kit.ativo
            ? 'Todos os atletas inscritos enquanto este kit esteve ativo no sistema estão cadastrados nesse kit (kit ativo no sistema).'
            : 'Todos os atletas inscritos enquanto este kit esteve ativo no sistema estão cadastrados nesse kit (kit atualmente inativo).');
      const infoText = kit.descricao.trim() || defaultInfoText;

      drawHeader();
      docPdf.addImage(titleImgData, 'PNG', marginX, y - titleImgH + 3, titleImgW, titleImgH, undefined, 'FAST');
      y += 6;
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(9);
      docPdf.setTextColor(100, 116, 139);
      const infoLines = docPdf.splitTextToSize(infoText, usableW);
      docPdf.text(infoLines, marginX, y);
      y += infoLines.length * 4.6 + 4;
      drawTableHeader();

      if (confirmados.length === 0) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(10);
        docPdf.setTextColor(100, 116, 139);
        docPdf.text('Nenhum inscrito confirmado neste kit ainda.', marginX, y + 6);
      }

      confirmados.forEach((item, idx) => {
        const nomeLines = docPdf.splitTextToSize(item.nome.toUpperCase(), colNomeW - 6);
        const rowH = Math.max(1, nomeLines.length) * rowLineH + rowPaddingV;

        if (y + rowH > pageH - marginBottom) {
          newPage();
        }

        if (idx % 2 === 1) {
          docPdf.setFillColor(...STRIPE);
          docPdf.rect(marginX, y, usableW, rowH, 'F');
        }

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(9.5);
        docPdf.setTextColor(...NAVY);
        docPdf.text(nomeLines, marginX + 3, y + rowLineH - 0.8);
        docPdf.text(item.modalidade, marginX + colNomeW + 3, y + rowLineH - 0.8);

        y += rowH;
      });

      docPdf.save(`confirmados-${kit.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
      showAlert('PDF gerado com sucesso.', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao gerar o PDF de confirmados.', 'error');
    } finally {
      setExportingKitId(null);
    }
  };

  if (loading) return <AdminPageSkeleton variant="table" />;

  const groupedSizeSummary = [
    { label: 'Infantil - Padrao', color: '#16a34a', items: sizes.filter(size => (size.categoria || 'todos') === 'infantil' && size.tipo !== 'Baby Look') },
    { label: 'Infantil - Baby Look', color: '#0d9488', items: sizes.filter(size => (size.categoria || 'todos') === 'infantil' && size.tipo === 'Baby Look') },
    { label: 'Padrao', color: '#2563eb', items: sizes.filter(size => (size.categoria || 'todos') !== 'infantil' && size.tipo !== 'Baby Look') },
    { label: 'Baby Look', color: '#db2777', items: sizes.filter(size => (size.categoria || 'todos') !== 'infantil' && size.tipo === 'Baby Look') },
  ].filter(group => group.items.length > 0);

  const grandTotalConfirmed = groupedSizeSummary.reduce(
    (sum, group) => sum + group.items.reduce((s, size) => s + (confirmedSizeCounts[size.id] || 0), 0),
    0,
  );

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
          { id: 'kits', label: 'Kits', icon: Lucide.Boxes },
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

      {activeTab === 'kits' ? (
        <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45' }}>Kits disponíveis</h3>
              <p style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, margin: 0 }}>Só um kit fica ativo por vez. O kit ativo é o que os novos inscritos recebem.</p>
            </div>
            <button onClick={openNewKitModal} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lucide.Plus size={18} /> NOVO KIT
            </button>
          </div>

          {kits.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 30, textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
              Nenhum kit cadastrado ainda. Enquanto isso, o formulário usa o kit padrão do sistema (preço definido pelo lote atual).
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
              {kits.map(kit => (
                <div key={kit.id} style={{ background: '#fff', padding: 20, borderRadius: 16, border: kit.ativo ? '2px solid #16a34a' : '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45' }}>{kit.nome}</h4>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {kit.isPadrao && (
                        <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 900, whiteSpace: 'nowrap', background: '#eff6ff', color: '#2563eb' }}>
                          PADRÃO
                        </span>
                      )}
                      <span style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 900, whiteSpace: 'nowrap',
                        background: kit.ativo ? '#dcfce7' : '#f1f5f9', color: kit.ativo ? '#166534' : '#94a3b8',
                      }}>
                        {kit.ativo ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </div>
                  </div>
                  {kit.descricao && <p style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.4, marginBottom: 10 }}>{kit.descricao}</p>}
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10, background: '#ecfdf5', color: '#166534', border: '1px solid #bbf7d0', padding: '5px 10px', borderRadius: 8, fontSize: '.72rem', fontWeight: 950 }}>
                    <Lucide.CheckCircle2 size={14} />
                    {confirmedKitCounts[kit.id] || 0} confirmado(s) neste kit
                  </div>
                  {kit.itens.length > 0 && (
                    <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: '#334155', fontSize: '0.8rem', lineHeight: 1.6 }}>
                      {kit.itens.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  )}
                  <div style={{
                    padding: '8px 12px', borderRadius: 8, marginBottom: 14, fontSize: '0.78rem', fontWeight: 800,
                    background: kit.precoForcado ? '#fef9c3' : '#f1f5f9', color: kit.precoForcado ? '#854d0e' : '#64748b',
                  }}>
                    {kit.precoForcado
                      ? `Preço forçado: ${(kit.precoForcadoValor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (ignora o lote atual)`
                      : 'Sem preço forçado — usa o preço do lote atual'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 12, flexWrap: 'wrap' }}>
                    {!kit.ativo && (
                      <button onClick={() => handleActivateKit(kit)} style={{ background: '#dcfce7', border: 'none', padding: '6px 12px', borderRadius: 6, color: '#166534', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}>
                        ATIVAR
                      </button>
                    )}
                    <button onClick={() => handleExportKitPdf(kit)} disabled={exportingKitId === kit.id} style={{ background: '#eff6ff', border: 'none', padding: '6px 12px', borderRadius: 6, color: '#2563eb', fontWeight: 800, fontSize: '0.7rem', cursor: exportingKitId === kit.id ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Lucide.FileDown size={13} /> {exportingKitId === kit.id ? 'GERANDO...' : 'EXPORTAR PDF'}
                    </button>
                    <button onClick={() => openEditKitModal(kit)} style={{ background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: 6, color: '#475569', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}>
                      EDITAR
                    </button>
                    {!kit.isPadrao && (
                      <button onClick={() => handleDeleteKit(kit)} disabled={kit.ativo} style={{ background: kit.ativo ? '#f1f5f9' : '#fee2e2', border: 'none', padding: '6px 12px', borderRadius: 6, color: kit.ativo ? '#cbd5e1' : '#ef4444', fontWeight: 800, fontSize: '0.7rem', cursor: kit.ativo ? 'not-allowed' : 'pointer' }}>
                        REMOVER
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'itens' ? (
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
              <button onClick={() => { setSummaryKitIds(kits.map(k => k.id)); setShowSummaryKitPicker(true); }} disabled={generatingSummary} style={{ background: '#6BFF2A', color: '#071A45', border: 'none', padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(107,255,42,0.25)' }}>
                <Lucide.FileDown size={18} /> {generatingSummary ? 'GERANDO...' : 'GERAR PDF DE RESUMO'}
              </button>
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
                  <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>Tenho / Falta</th>
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
                      {(() => {
                        const tenho = size.quantidadeTenho || 0;
                        const confirmados = confirmedSizeCounts[size.id] || 0;
                        const diff = tenho - confirmados;
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>{tenho} UN</span>
                            <span style={{
                              display: 'inline-block', width: 'fit-content', padding: '3px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 900,
                              background: diff < 0 ? '#fee2e2' : diff > 0 ? '#dcfce7' : '#f1f5f9',
                              color: diff < 0 ? '#dc2626' : diff > 0 ? '#166534' : '#94a3b8',
                            }}>
                              {diff < 0 ? `FALTA ${Math.abs(diff)}` : diff > 0 ? `SOBRA ${diff}` : 'EXATO'}
                            </span>
                          </div>
                        );
                      })()}
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
                        <button onClick={() => handleUpdateQuantidadeTenho(size.id, size.quantidadeTenho || 0)} style={{ background: '#eafff0', border: 'none', padding: '6px 12px', borderRadius: 8, color: '#16a34a', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer' }}>
                          TENHO
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
      {isKitModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 560, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#071A45' }}>{editingKit ? 'Editar Kit' : 'Novo Kit'}</h3>
              <button onClick={() => setIsKitModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>
            <div style={{ padding: 30 }}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Nome do kit</label>
                <input
                  value={kitForm.nome}
                  onChange={e => setKitForm({ ...kitForm, nome: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                  placeholder="Ex: Kit Premium"
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Descrição</label>
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '-2px 0 8px' }}>
                  Aparece no card do kit e é o texto explicativo usado no PDF de confirmados deste kit. Deixe em branco para usar um texto padrão automático.
                </p>
                <textarea
                  value={kitForm.descricao}
                  onChange={e => setKitForm({ ...kitForm, descricao: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', minHeight: 70 }}
                  placeholder="Detalhes sobre o kit..."
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Itens (um por linha)</label>
                <textarea
                  value={kitForm.itensText}
                  onChange={e => setKitForm({ ...kitForm, itensText: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', minHeight: 90 }}
                  placeholder={'Camiseta Oficial\nMedalha de Participação\nNúmero de Peito'}
                />
              </div>
              <div style={{ marginBottom: 24, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
                <label
                  onClick={() => setKitForm({ ...kitForm, precoForcado: !kitForm.precoForcado })}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}
                >
                  {kitForm.precoForcado ? <Lucide.CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Lucide.Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
                  <div>
                    <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Preço forçado</div>
                    <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                      Quando este kit estiver ativo, ignora o preço do lote atual — toda inscrição paga o valor abaixo (mais a taxa de processamento do Pix/cartão, como de costume).
                    </div>
                  </div>
                </label>
                {kitForm.precoForcado && (
                  <div style={{ marginTop: 14 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Valor (R$)</label>
                    <input
                      value={kitForm.precoForcadoValor}
                      onChange={e => setKitForm({ ...kitForm, precoForcadoValor: e.target.value })}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                      placeholder="Ex: 95,00"
                    />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setIsKitModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontWeight: 800, cursor: 'pointer', color: '#64748b' }}>CANCELAR</button>
                <button onClick={handleSaveKit} disabled={savingKit} style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', background: '#071A45', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>{savingKit ? 'SALVANDO...' : 'SALVAR KIT'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {showSummaryKitPicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 24, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '24px 30px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45' }}>Quais kits incluir?</h3>
              <button onClick={() => setShowSummaryKitPicker(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, marginBottom: 16 }}>
                O resumo de camisetas vai contar só os confirmados dos kits marcados abaixo.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button onClick={() => setSummaryKitIds(kits.map(k => k.id))} style={{ background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: 8, color: '#475569', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}>MARCAR TODOS</button>
                <button onClick={() => setSummaryKitIds([])} style={{ background: '#f1f5f9', border: 'none', padding: '6px 12px', borderRadius: 8, color: '#475569', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}>LIMPAR</button>
              </div>
              <div style={{ display: 'grid', gap: 8, marginBottom: 24, maxHeight: 260, overflowY: 'auto' }}>
                {kits.map(kit => {
                  const checked = summaryKitIds.includes(kit.id);
                  return (
                    <label key={kit.id} onClick={() => toggleSummaryKitId(kit.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: checked ? '1.5px solid #16a34a' : '1px solid #e2e8f0', background: checked ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                      {checked ? <Lucide.CheckSquare size={18} color="#16a34a" /> : <Lucide.Square size={18} color="#cbd5e1" />}
                      <span style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>{kit.nome}</span>
                    </label>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setShowSummaryKitPicker(false)} style={{ flex: 1, padding: '14px', borderRadius: 12, border: '1px solid #e2e8f0', background: 'white', fontWeight: 800, cursor: 'pointer', color: '#64748b' }}>CANCELAR</button>
                <button
                  onClick={() => generateSummaryPdf(summaryKitIds)}
                  disabled={generatingSummary || summaryKitIds.length === 0}
                  style={{ flex: 1.4, padding: '14px', borderRadius: 12, border: 'none', background: summaryKitIds.length === 0 ? '#cbd5e1' : '#071A45', color: '#fff', fontWeight: 800, cursor: summaryKitIds.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  {generatingSummary ? 'GERANDO...' : 'GERAR PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
