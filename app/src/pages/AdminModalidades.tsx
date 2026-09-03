import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db } from '../firebase';
import { Plus, Trash2, Edit2, Flag, X, Check, FileText, FileSpreadsheet, ListTree } from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';
import { type Modalidade } from '../types';
import { AdminPageSkeleton } from '../components/Skeleton';
import PlanilhaGeradorTab from '../components/AdminModalidades/PlanilhaGeradorTab';
import { fetchKits, resolveKitNome } from '../utils/kitsUtils';
import '../styles/admin.css';

const CHILD_RACE_PRESETS = [
  { label: '4 a 6 anos: 100 metros', nome: 'Kids 4 a 6 anos', distancia: '100 metros', idadeMin: 4, idadeMax: 6 },
  { label: '7 a 9 anos: 150 metros', nome: 'Kids 7 a 9 anos', distancia: '150 metros', idadeMin: 7, idadeMax: 9 },
  { label: '10 a 12 anos: 250 metros', nome: 'Kids 10 a 12 anos', distancia: '250 metros', idadeMin: 10, idadeMax: 12 },
  { label: '13 a 14 anos: 500 metros', nome: 'Kids 13 a 14 anos', distancia: '500 metros', idadeMin: 13, idadeMax: 14 },
];

export default function AdminModalidades() {
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [regs, setRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Modalidade>>({ nome: '', distancia: '', categoria: 'adulto', anosNascimento: [], ativo: true });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingCategoria, setGeneratingCategoria] = useState<'infantil' | 'adulto' | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: 'modalidades' | 'planilhas' = searchParams.get('tab') === 'planilhas' ? 'planilhas' : 'modalidades';
  const setActiveTab = (tab: 'modalidades' | 'planilhas') => {
    setSearchParams(tab === 'modalidades' ? {} : { tab }, { replace: false });
  };
  const { showAlert, showConfirm } = useDialog();

  useEffect(() => {
    loadModalidades();
    loadRegistrations();
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

  const loadRegistrations = async () => {
    try {
      const snap = await getDocs(collection(db, 'nightrun_registrations'));
      setRegs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  // Nomes confirmados de uma modalidade: sempre em MAIÚSCULO e em ordem alfabética.
  const getConfirmedNamesSorted = (mod: Modalidade) => regs
    .filter(r => r.modalidadeId === mod.id && r.paymentStatus === 'pago')
    .map(r => String(r.nome || '').trim().toUpperCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  // Modalidades infantis usam categoria === 'infantil'; as demais (adulto/adolescente) entram em "adulto".
  const getGroupsForCategoria = (categoria: 'infantil' | 'adulto') => modalidades
    .filter(mod => (categoria === 'infantil' ? mod.categoria === 'infantil' : mod.categoria !== 'infantil'))
    .map(mod => ({ mod, nomes: getConfirmedNamesSorted(mod) }));

  const infantilGroups = getGroupsForCategoria('infantil');
  const adultoGroups = getGroupsForCategoria('adulto');

  // Gera a lista em PDF de quem está confirmado numa modalidade específica - mesmo padrão
  // visual e técnico do PDF de confirmados por kit (AdminKits): header.png em todas as
  // páginas via o mesmo alias no jsPDF (bytes embutidos uma única vez), título com a fonte
  // Anton renderizado em canvas com leve inclinação itálica, texto explicativo em itálico, e
  // tabela com quebra de página segura (altura calculada antes de desenhar, nunca corta nome).
  const generateModalidadePdf = async (mod: Modalidade) => {
    setGeneratingId(mod.id!);
    try {
      const kits = await fetchKits();
      // Busca as inscrições direto do Firestore no momento de gerar (não usa o array `regs`
      // carregado uma vez ao abrir a página) - mesma regra do PDF de kit: se o admin editou o
      // kit ou a modalidade de alguém pela ficha, o PDF sempre reflete o estado atual, não o
      // que estava em memória quando a página de Modalidades foi aberta.
      const snap = await getDocs(query(collection(db, 'nightrun_registrations'), where('modalidadeId', '==', mod.id)));
      const confirmados = snap.docs
        .map(d => d.data())
        .filter(r => r.paymentStatus === 'pago' || r.kitConfirmado || r.contractStatus === 'confirmado')
        .map(r => ({
          nome: String(r.nome || 'Sem nome'),
          kit: resolveKitNome(kits, r.kit, 'Kit Único'),
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

      const titleFont = new FontFace('Anton', 'url(/fonts/Anton-Regular.ttf)');
      await titleFont.load();
      (document as any).fonts.add(titleFont);
      const titleText = `CONFIRMADOS — ${mod.nome.toUpperCase()}`;
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
      titleCtx.fillStyle = 'rgb(7, 26, 69)';
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
      const NAVY_PDF: [number, number, number] = [7, 26, 69];
      const STRIPE_PDF: [number, number, number] = [241, 245, 249];

      const drawHeader = () => {
        try {
          docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'modalidade-pdf-header', 'FAST');
        } catch {
          docPdf.setFillColor(...NAVY_PDF);
          docPdf.rect(0, 0, pageW, headerH, 'F');
        }
      };

      const usableW = pageW - marginX * 2;
      const colNomeW = usableW * 0.62;
      const rowLineH = 5.4;
      const rowPaddingV = 3.4;

      let y = headerH + 10;

      const drawTableHeader = () => {
        docPdf.setFillColor(...NAVY_PDF);
        docPdf.rect(marginX, y, usableW, 9, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('NOME', marginX + 3, y + 6.2);
        docPdf.text('KIT', marginX + colNomeW + 3, y + 6.2);
        y += 9;
      };

      const newPage = () => {
        docPdf.addPage();
        drawHeader();
        y = headerH + 10;
        drawTableHeader();
      };

      const infoText = `Todos os atletas confirmados na modalidade ${mod.nome}${mod.distancia ? ` (${mod.distancia})` : ''} estão listados abaixo.`;

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
        docPdf.text('Nenhum inscrito confirmado nesta modalidade ainda.', marginX, y + 6);
      }

      confirmados.forEach((item, idx) => {
        const nomeLines = docPdf.splitTextToSize(item.nome.toUpperCase(), colNomeW - 6);
        const rowH = Math.max(1, nomeLines.length) * rowLineH + rowPaddingV;

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
        docPdf.text(nomeLines, marginX + 3, y + rowLineH - 0.8);
        docPdf.text(item.kit, marginX + colNomeW + 3, y + rowLineH - 0.8);

        y += rowH;
      });

      const safeName = String(mod.nome || 'modalidade').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      docPdf.save(`confirmados-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
      showAlert('PDF gerado com sucesso.', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao gerar o PDF de confirmados.', 'error');
    } finally {
      setGeneratingId(null);
    }
  };

  // Resumo consolidado de todas as modalidades de uma categoria - mesmo padrão visual e
  // técnico do PDF de confirmados por kit/modalidade individual (header.png em todas as
  // páginas via alias, título com a fonte Anton em canvas com leve inclinação itálica, texto
  // explicativo em itálico, tabela com quebra de página segura).
  const generateCategoriaPdf = async (categoria: 'infantil' | 'adulto') => {
    const groups = categoria === 'infantil' ? infantilGroups : adultoGroups;
    if (groups.length === 0) return showAlert(`Nenhuma modalidade ${categoria === 'infantil' ? 'infantil' : 'adulto'} cadastrada.`, 'warning');
    setGeneratingCategoria(categoria);
    try {
      const kits = await fetchKits();
      const modalidadeNomeById: Record<string, string> = {};
      groups.forEach(({ mod }) => { modalidadeNomeById[mod.id] = mod.nome; });
      // Busca as inscrições direto do Firestore no momento de gerar (mesma regra do PDF de
      // kit) - nunca usa o array `regs` carregado uma vez ao abrir a página, que pode estar
      // desatualizado se o admin editou kit/modalidade de alguém pela ficha nesse meio tempo.
      const modalidadeIds = groups.map(({ mod }) => mod.id).filter(Boolean) as string[];
      const snap = await getDocs(query(collection(db, 'nightrun_registrations'), where('modalidadeId', 'in', modalidadeIds)));
      const confirmados = snap.docs
        .map(d => d.data())
        .filter(r => r.paymentStatus === 'pago' || r.kitConfirmado || r.contractStatus === 'confirmado')
        .map(r => ({ nome: String(r.nome || 'Sem nome'), modalidade: modalidadeNomeById[r.modalidadeId] || '', kit: resolveKitNome(kits, r.kit, 'Kit Único') }))
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

      const tituloBase = categoria === 'infantil' ? 'RESUMO MODALIDADES INFANTIS' : 'RESUMO MODALIDADES ADULTO';

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
          docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'categoria-pdf-header', 'FAST');
        } catch {
          docPdf.setFillColor(...NAVY_PDF);
          docPdf.rect(0, 0, pageW, headerH, 'F');
        }
      };

      const usableW = pageW - marginX * 2;
      const colNomeW = usableW * 0.5;
      const colModalidadeW = usableW * 0.27;
      const rowLineH = 5.4;
      const rowPaddingV = 3.4;

      let y = headerH + 10;

      const drawTableHeader = () => {
        docPdf.setFillColor(...NAVY_PDF);
        docPdf.rect(marginX, y, usableW, 9, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('NOME', marginX + 3, y + 6.2);
        docPdf.text('MODALIDADE', marginX + colNomeW + 3, y + 6.2);
        docPdf.text('KIT', marginX + colNomeW + colModalidadeW + 3, y + 6.2);
        y += 9;
      };

      const newPage = () => {
        docPdf.addPage();
        drawHeader();
        y = headerH + 10;
        drawTableHeader();
      };

      const infoText = `Todos os atletas confirmados nas modalidades ${categoria === 'infantil' ? 'infantis' : 'de adulto/adolescente'} estão listados abaixo.`;

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
        docPdf.text('Nenhum inscrito confirmado nessas modalidades ainda.', marginX, y + 6);
      }

      confirmados.forEach((item, idx) => {
        const nomeLines = docPdf.splitTextToSize(item.nome.toUpperCase(), colNomeW - 6);
        const rowH = Math.max(1, nomeLines.length) * rowLineH + rowPaddingV;

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
        docPdf.text(nomeLines, marginX + 3, y + rowLineH - 0.8);
        docPdf.text(item.modalidade, marginX + colNomeW + 3, y + rowLineH - 0.8);
        docPdf.text(item.kit, marginX + colNomeW + colModalidadeW + 3, y + rowLineH - 0.8);

        y += rowH;
      });

      docPdf.save(`resumo-modalidades-${categoria}-${new Date().toISOString().slice(0, 10)}.pdf`);
      showAlert('PDF de resumo gerado.', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao gerar o PDF de resumo.', 'error');
    } finally {
      setGeneratingCategoria(null);
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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => generateCategoriaPdf('adulto')}
            disabled={generatingCategoria === 'adulto'}
            style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <FileText size={18} />
            {generatingCategoria === 'adulto' ? 'GERANDO...' : 'RESUMO MODALIDADES ADULTO (PDF)'}
          </button>
          <button
            onClick={() => generateCategoriaPdf('infantil')}
            disabled={generatingCategoria === 'infantil'}
            style={{ background: '#6BFF2A', color: '#071A45', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(107,255,42,0.25)' }}
          >
            <FileText size={18} />
            {generatingCategoria === 'infantil' ? 'GERANDO...' : 'RESUMO MODALIDADES INFANTIS (PDF)'}
          </button>
          <button
            onClick={() => handleOpenModal()}
            style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)' }}
          >
            <Plus size={18} />
            Nova Modalidade
          </button>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: '#e2e8f0', padding: 5, borderRadius: 12, width: 'fit-content' }}>
        <button
          onClick={() => setActiveTab('modalidades')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 9, border: 'none',
            fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
            background: activeTab === 'modalidades' ? '#fff' : 'transparent',
            color: activeTab === 'modalidades' ? '#071A45' : '#64748b',
            boxShadow: activeTab === 'modalidades' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <ListTree size={16} /> Modalidades
        </button>
        <button
          onClick={() => setActiveTab('planilhas')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 9, border: 'none',
            fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
            background: activeTab === 'planilhas' ? '#fff' : 'transparent',
            color: activeTab === 'planilhas' ? '#071A45' : '#64748b',
            boxShadow: activeTab === 'planilhas' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
        >
          <FileSpreadsheet size={16} /> Gerar Planilhas
        </button>
      </div>

      {activeTab === 'planilhas' && <PlanilhaGeradorTab modalidades={modalidades} regs={regs} />}

      {activeTab === 'modalidades' && (
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
                      onClick={() => generateModalidadePdf(mod)}
                      disabled={generatingId === mod.id}
                      title="Gerar PDF resumo"
                      style={{ background: '#eafff0', border: 'none', width: 36, height: 36, borderRadius: 10, color: '#16a34a', cursor: generatingId === mod.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: generatingId === mod.id ? 0.6 : 1 }}
                    >
                      <FileText size={16} />
                    </button>
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
      )}

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
