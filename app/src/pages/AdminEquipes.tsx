import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import {
  UsersRound, Search, Plus, ArrowRight, Trophy, Wallet,
  ShieldCheck, Sparkles, Wand2, X as XIcon, GitMerge, CheckSquare, Square, ArrowUpDown, FileText,
} from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { AdminPageSkeleton } from '../components/Skeleton';
import EquipeDetalheModal from '../components/AdminEquipes/EquipeDetalheModal';
import type { EquipeGroup, EquipeOficial } from '../components/AdminEquipes/equipesTypes';
import { normalizeEquipeNome, findEquipeMergeSuggestions, type EquipeMergeSuggestion } from '../utils/equipeMatching';
import '../styles/admin.css';

const DISMISSED_STORAGE_KEY = 'mcu_admin_equipes_fusoes_ignoradas';
const pairId = (a: string, b: string) => [a, b].sort().join('::');

const mostCommonRawName = (membros: any[]) => {
  const counts = new Map<string, number>();
  membros.forEach(m => {
    const raw = String(m.equipeNome || '').trim();
    if (!raw) return;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  });
  let best = '', bestCount = 0;
  counts.forEach((count, name) => { if (count > bestCount) { bestCount = count; best = name; } });
  return best;
};

const formatMoneyBR = (valueInCents: number) => (Number(valueInCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AdminEquipes() {
  const navigate = useNavigate();
  const [regs, setRegs] = useState<any[]>([]);
  const [equipesOficiais, setEquipesOficiais] = useState<EquipeOficial[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todas' | 'oficiais' | 'nao-cadastradas'>('todas');
  const [sortBy, setSortBy] = useState<'membros-desc' | 'membros-asc' | 'nome-asc' | 'nome-desc' | 'arrecadado-desc' | 'status'>('membros-desc');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newObs, setNewObs] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [showMergeSelected, setShowMergeSelected] = useState(false);
  const [mergeSelectedTarget, setMergeSelectedTarget] = useState('');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const { showAlert, showConfirm } = useDialog();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [regsSnap, equipesSnap] = await Promise.all([
        getDocs(collection(db, 'nightrun_registrations')),
        getDocs(query(collection(db, 'nightrun_equipes'), orderBy('nome'))),
      ]);
      setRegs(regsSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      setEquipesOficiais(equipesSnap.docs.map(item => ({ id: item.id, ...item.data() } as EquipeOficial)));
    } catch (error) {
      console.error('[AdminEquipes] load', error);
      showAlert('Erro ao carregar equipes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Agrupa inscrições por equipe (normalizando nome livre) e cruza com os registros oficiais.
  // Conta apenas inscritos CONFIRMADOS (pago) - pendente/cancelado nem entram na equipe.
  const groups: EquipeGroup[] = useMemo(() => {
    const map = new Map<string, any[]>();
    regs.forEach(r => {
      if (r.integranteEquipe !== 'sim') return;
      if (r.paymentStatus !== 'pago') return;
      const raw = String(r.equipeNome || '').trim();
      if (!raw) return;
      const key = normalizeEquipeNome(raw);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });

    const oficiaisByKey = new Map(equipesOficiais.map(item => [item.normalizedNome, item]));
    const result: EquipeGroup[] = [];

    map.forEach((membros, key) => {
      const oficial = oficiaisByKey.get(key) || null;
      const nome = oficial?.nome || mostCommonRawName(membros) || membros[0]?.equipeNome || 'Equipe sem nome';
      result.push({ key, nome, oficial, membros });
    });

    // Equipes cadastradas na mão que ainda não têm nenhum inscrito.
    equipesOficiais.forEach(eq => {
      if (!map.has(eq.normalizedNome)) {
        result.push({ key: eq.normalizedNome, nome: eq.nome, oficial: eq, membros: [] });
      }
    });

    return result.sort((a, b) => b.membros.length - a.membros.length || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [regs, equipesOficiais]);

  // Como o grupo só contém inscritos confirmados, "total" já é o total de confirmados.
  const statsFor = (group: EquipeGroup) => {
    const arrecadado = group.membros.reduce((sum, m) => sum + Number(m.amount || 0), 0);
    return { total: group.membros.length, arrecadado };
  };

  const globalStats = useMemo(() => {
    const totalEquipes = groups.length;
    const totalOficiais = groups.filter(g => g.oficial).length;
    let totalMembros = 0, totalArrecadado = 0;
    groups.forEach(g => {
      const s = statsFor(g);
      totalMembros += s.total;
      totalArrecadado += s.arrecadado;
    });
    return { totalEquipes, totalOficiais, totalMembros, totalArrecadado };
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = groups.filter(g => {
      if (term && !g.nome.toLowerCase().includes(term)) return false;
      if (filter === 'oficiais' && !g.oficial) return false;
      if (filter === 'nao-cadastradas' && g.oficial) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case 'membros-desc':
        sorted.sort((a, b) => b.membros.length - a.membros.length || a.nome.localeCompare(b.nome, 'pt-BR'));
        break;
      case 'membros-asc':
        sorted.sort((a, b) => a.membros.length - b.membros.length || a.nome.localeCompare(b.nome, 'pt-BR'));
        break;
      case 'nome-asc':
        sorted.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        break;
      case 'nome-desc':
        sorted.sort((a, b) => b.nome.localeCompare(a.nome, 'pt-BR'));
        break;
      case 'arrecadado-desc':
        sorted.sort((a, b) => statsFor(b).arrecadado - statsFor(a).arrecadado);
        break;
      case 'status':
        // Cadastradas oficialmente primeiro, depois por quantidade de membros.
        sorted.sort((a, b) => (Number(!!b.oficial) - Number(!!a.oficial)) || (b.membros.length - a.membros.length));
        break;
    }
    return sorted;
  }, [groups, search, filter, sortBy]);

  const selectedGroup = groups.find(g => g.key === selectedKey) || null;

  // IA de similaridade: roda todas as equipes par a par e sugere fusões (nomes "quase iguais").
  // Nunca funde sozinha - sempre exige confirmação manual do admin.
  const allSuggestions = useMemo(() => findEquipeMergeSuggestions(groups), [groups]);
  const visibleSuggestions = useMemo(
    () => allSuggestions.filter(s => !dismissed.has(pairId(s.aKey, s.bKey))),
    [allSuggestions, dismissed],
  );

  const persistDismissed = (next: Set<string>) => {
    setDismissed(next);
    try { localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...next])); } catch { /* ignora se storage indisponível */ }
  };

  const dismissSuggestion = (s: EquipeMergeSuggestion) => {
    persistDismissed(new Set([...dismissed, pairId(s.aKey, s.bKey)]));
  };

  const acceptSuggestion = (s: EquipeMergeSuggestion) => {
    const origem = groups.find(g => g.key === s.aKey);
    const destino = groups.find(g => g.key === s.bKey);
    if (!origem || !destino) return;
    // Fundir sempre no grupo com mais membros (menos gente pra propagar) e manter o nome dele.
    const [maior, menor] = origem.membros.length >= destino.membros.length ? [origem, destino] : [destino, origem];
    showConfirm(
      `Fundir "${menor.nome}" (${menor.membros.length} membro(s)) dentro de "${maior.nome}" (${maior.membros.length} membro(s))? Essa ação não pode ser desfeita automaticamente.`,
      async () => {
        await handleMesclar(menor, maior);
        dismissSuggestion(s);
      },
    );
  };

  const handleCreateEquipe = async () => {
    const nome = newNome.trim();
    if (nome.length < 2) return showAlert('Informe o nome da equipe.', 'warning');
    const key = normalizeEquipeNome(nome);
    if (equipesOficiais.some(eq => eq.normalizedNome === key)) {
      return showAlert('Já existe uma equipe cadastrada com esse nome.', 'warning');
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'nightrun_equipes'), {
        nome,
        normalizedNome: key,
        observacoes: newObs.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showAlert('Equipe cadastrada.', 'success');
      setShowCreate(false);
      setNewNome('');
      setNewObs('');
      await loadAll();
    } catch (error) {
      console.error('[AdminEquipes] create', error);
      showAlert('Erro ao cadastrar a equipe.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Formaliza um grupo auto-detectado (sem registro oficial) como equipe cadastrada.
  const handleOficializar = async (group: EquipeGroup) => {
    setSaving(true);
    try {
      await addDoc(collection(db, 'nightrun_equipes'), {
        nome: group.nome,
        normalizedNome: group.key,
        observacoes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      showAlert('Equipe cadastrada oficialmente.', 'success');
      await loadAll();
    } catch (error) {
      console.error('[AdminEquipes] oficializar', error);
      showAlert('Erro ao cadastrar a equipe.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Renomeia a equipe: atualiza (ou cria) o registro oficial e propaga o novo nome para
  // todos os inscritos do grupo, em lotes de 450 (limite do Firestore batch é 500).
  const handleRenomear = async (group: EquipeGroup, novoNome: string) => {
    const nome = novoNome.trim();
    if (nome.length < 2) return showAlert('Informe um nome válido.', 'warning');
    const newKey = normalizeEquipeNome(nome);
    setSaving(true);
    try {
      if (group.oficial) {
        await updateDoc(doc(db, 'nightrun_equipes', group.oficial.id), { nome, normalizedNome: newKey, updatedAt: serverTimestamp() });
      } else {
        await addDoc(collection(db, 'nightrun_equipes'), { nome, normalizedNome: newKey, observacoes: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      }
      await propagarNomeParaMembros(group.membros, nome);
      showAlert('Equipe renomeada.', 'success');
      setSelectedKey(newKey);
      await loadAll();
    } catch (error) {
      console.error('[AdminEquipes] renomear', error);
      showAlert('Erro ao renomear a equipe.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const propagarNomeParaMembros = async (membros: any[], nome: string) => {
    for (let i = 0; i < membros.length; i += 450) {
      const chunk = membros.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach(m => batch.update(doc(db, 'nightrun_registrations', m.id), { equipeNome: nome, updatedAt: serverTimestamp() }));
      await batch.commit();
    }
  };

  // Mescla uma ou mais equipes de origem dentro de uma equipe de destino: move todos os
  // inscritos das origens para o nome canônico do destino e remove os registros oficiais
  // das origens (se houver). Uma única atualização de lista no final, mesmo com várias origens.
  const mesclarGrupos = async (origens: EquipeGroup[], destino: EquipeGroup, successMessage?: string) => {
    setSaving(true);
    try {
      for (const origem of origens) {
        if (origem.key === destino.key) continue;
        await propagarNomeParaMembros(origem.membros, destino.nome);
        if (origem.oficial) {
          await deleteDoc(doc(db, 'nightrun_equipes', origem.oficial.id));
        }
      }
      showAlert(successMessage || `Equipe(s) mesclada(s) em "${destino.nome}".`, 'success');
      setSelectedKey(destino.key);
      await loadAll();
    } catch (error) {
      console.error('[AdminEquipes] mesclar', error);
      showAlert('Erro ao mesclar as equipes.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMesclar = (origem: EquipeGroup, destino: EquipeGroup) =>
    mesclarGrupos([origem], destino, `"${origem.nome}" foi mesclada em "${destino.nome}".`);

  // --- Seleção múltipla na lista principal (mesclagem manual, sem passar pelo painel de IA) ---
  const toggleSelectionMode = () => {
    setSelectionMode(v => !v);
    setSelectedForMerge(new Set());
  };

  const toggleCardSelected = (key: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectedGroupsForMerge = groups.filter(g => selectedForMerge.has(g.key));

  const openMergeSelectedModal = () => {
    if (selectedForMerge.size < 2) return showAlert('Selecione pelo menos 2 equipes para mesclar.', 'warning');
    // Sugere como destino a equipe com mais membros (menos gente pra propagar).
    const maior = [...selectedGroupsForMerge].sort((a, b) => b.membros.length - a.membros.length)[0];
    setMergeSelectedTarget(maior?.key || '');
    setShowMergeSelected(true);
  };

  const confirmMergeSelected = () => {
    const destino = groups.find(g => g.key === mergeSelectedTarget);
    if (!destino) return showAlert('Selecione a equipe que vai ficar com o nome final.', 'warning');
    const origens = selectedGroupsForMerge.filter(g => g.key !== destino.key);
    const totalMembros = origens.reduce((sum, g) => sum + g.membros.length, 0);
    showConfirm(
      `Mesclar ${origens.length} equipe(s) (${totalMembros} membro(s) no total) dentro de "${destino.nome}"? Essa ação não pode ser desfeita automaticamente.`,
      async () => {
        await mesclarGrupos(origens, destino, `${origens.length} equipe(s) mesclada(s) em "${destino.nome}".`);
        setShowMergeSelected(false);
        setSelectionMode(false);
        setSelectedForMerge(new Set());
      },
    );
  };

  // Carrega a logo do sistema uma única vez e reaproveita (imagem HTML, sem custo de rede a mais).
  const loadLogoImage = () => new Promise<HTMLImageElement | null>(resolve => {
    if (logoImageRef.current) return resolve(logoImageRef.current);
    const img = new Image();
    img.onload = () => { logoImageRef.current = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = '/LOGO NIGHT RUN SEM FUNDO (em amarelo).png';
  });

  // Resumo de TODAS as equipes em PDF: mesmo motor de paginação já validado no PDF de
  // modalidades (nunca corta uma linha de nome nem deixa um cabeçalho de seção órfão),
  // agora com a logo real do sistema. Exporta na mesma ordem/filtro exibidos na tela.
  const generateEquipesPdf = async () => {
    if (filteredGroups.length === 0) return showAlert('Nenhuma equipe para exportar com os filtros atuais.', 'warning');
    setGeneratingPdf(true);
    try {
      const logo = await loadLogoImage();
      const logoRatio = logo ? logo.naturalWidth / logo.naturalHeight : 1.695;

      const NAVY: [number, number, number] = [7, 26, 69];
      const GREEN: [number, number, number] = [22, 163, 74];
      const GRAY: [number, number, number] = [100, 116, 139];
      const STRIPE: [number, number, number] = [241, 245, 249];
      const LIGHT_BLUE: [number, number, number] = [219, 234, 254];

      const docPdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = docPdf.internal.pageSize.getWidth();
      const pageH = docPdf.internal.pageSize.getHeight();
      const marginX = 16;
      const marginTop = 24;
      const marginBottom = 16;
      const HEADER_BAND_H = 18;
      const SECTION_HEADER_H = 10;
      const ROW_H = 6;

      let y = marginTop;
      let pageNum = 1;

      const drawHeaderBand = () => {
        docPdf.setFillColor(...NAVY);
        docPdf.rect(0, 0, pageW, HEADER_BAND_H, 'F');
        if (logo) {
          const logoH = 10;
          const logoW = logoH * logoRatio;
          docPdf.addImage(logo, 'PNG', marginX, (HEADER_BAND_H - logoH) / 2, logoW, logoH, 'mcu-logo', 'FAST');
        } else {
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(9);
          docPdf.setTextColor(...GREEN);
          docPdf.text('MCU NIGHT RUN 2026', marginX, HEADER_BAND_H / 2 + 3);
        }
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(12);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('RESUMO DE EQUIPES', pageW - marginX, HEADER_BAND_H / 2 + 3, { align: 'right' });
      };

      const drawFooter = () => {
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8);
        docPdf.setTextColor(...GRAY);
        docPdf.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, marginX, pageH - 8);
        docPdf.text(`Página ${pageNum}`, pageW - marginX, pageH - 8, { align: 'right' });
      };

      const newPage = () => {
        drawFooter();
        docPdf.addPage();
        pageNum += 1;
        drawHeaderBand();
        y = marginTop;
      };

      const ensureSpace = (neededHeight: number) => {
        if (y + neededHeight > pageH - marginBottom) newPage();
      };

      drawHeaderBand();

      // Bloco de totais gerais em destaque.
      const totalMembros = filteredGroups.reduce((sum, g) => sum + g.membros.length, 0);
      const totalArrecadado = filteredGroups.reduce((sum, g) => sum + statsFor(g).arrecadado, 0);
      const totalOficiais = filteredGroups.filter(g => g.oficial).length;

      docPdf.setFillColor(...LIGHT_BLUE);
      docPdf.roundedRect(marginX, y, pageW - marginX * 2, 20, 2, 2, 'F');
      const colW = (pageW - marginX * 2) / 4;
      const totalsRow: [string, string][] = [
        [String(filteredGroups.length), 'EQUIPES'],
        [String(totalOficiais), 'CADASTRADAS'],
        [String(totalMembros), 'CONFIRMADOS'],
        [(totalArrecadado / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 'ARRECADADO'],
      ];
      totalsRow.forEach(([value, label], index) => {
        const cx = marginX + colW * index + colW / 2;
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(13);
        docPdf.setTextColor(...NAVY);
        docPdf.text(value, cx, y + 10, { align: 'center' });
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(6.5);
        docPdf.setTextColor(37, 99, 235);
        docPdf.text(label, cx, y + 15.5, { align: 'center' });
      });
      y += 28;

      filteredGroups.forEach(group => {
        const stats = statsFor(group);
        const nomes = [...group.membros]
          .map(m => String(m.nome || '').trim().toUpperCase())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'));

        // Cabeçalho da seção só é desenhado se houver espaço para ele + ao menos 1 linha depois.
        ensureSpace(SECTION_HEADER_H + ROW_H);

        docPdf.setFillColor(...LIGHT_BLUE);
        docPdf.rect(marginX, y, pageW - marginX * 2, SECTION_HEADER_H, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(10.5);
        docPdf.setTextColor(...NAVY);
        const tag = group.oficial ? ' [CADASTRADA]' : '';
        docPdf.text(`${group.nome}${tag}`, marginX + 3, y + 6.8);
        docPdf.text(
          `${stats.total} confirmado${stats.total === 1 ? '' : 's'}  ·  ${(stats.arrecadado / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
          pageW - marginX - 3, y + 6.8, { align: 'right' },
        );
        y += SECTION_HEADER_H + 3;

        if (nomes.length === 0) {
          docPdf.setFont('helvetica', 'italic');
          docPdf.setFontSize(9);
          docPdf.setTextColor(...GRAY);
          docPdf.text('Nenhum inscrito confirmado ainda.', marginX + 3, y + 3);
          y += ROW_H + 4;
          return;
        }

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(9);
        nomes.forEach((nome, index) => {
          ensureSpace(ROW_H);
          if (index % 2 === 0) {
            docPdf.setFillColor(...STRIPE);
            docPdf.rect(marginX, y, pageW - marginX * 2, ROW_H, 'F');
          }
          docPdf.setFont('helvetica', 'bold');
          docPdf.setTextColor(...GREEN);
          docPdf.text(`${String(index + 1).padStart(2, '0')}.`, marginX + 3, y + 4.2);
          docPdf.setFont('helvetica', 'normal');
          docPdf.setTextColor(...NAVY);
          docPdf.text(nome, marginX + 15, y + 4.2);
          y += ROW_H;
        });
        y += 6;
      });

      drawFooter();
      docPdf.save(`resumo-equipes-${new Date().toISOString().slice(0, 10)}.pdf`);
      showAlert('PDF de resumo gerado.', 'success');
    } catch (error) {
      console.error('[AdminEquipes] gerar PDF', error);
      showAlert('Erro ao gerar o PDF de resumo.', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Remove apenas o registro oficial (curadoria). Os inscritos mantêm o nome da equipe
  // no cadastro deles; a equipe volta a aparecer como "não cadastrada" se ainda tiver membros.
  const handleExcluirOficial = (group: EquipeGroup) => {
    if (!group.oficial) return;
    showConfirm(
      `Remover o cadastro oficial de "${group.nome}"? Os inscritos NÃO serão alterados - a equipe some da lista apenas se não tiver mais membros.`,
      async () => {
        try {
          await deleteDoc(doc(db, 'nightrun_equipes', group.oficial!.id));
          showAlert('Cadastro oficial removido.', 'success');
          setSelectedKey(null);
          await loadAll();
        } catch (error) {
          console.error('[AdminEquipes] excluir oficial', error);
          showAlert('Erro ao remover o cadastro oficial.', 'error');
        }
      },
    );
  };

  if (loading && regs.length === 0) return <AdminPageSkeleton variant="table" />;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Equipes</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Veja e gerencie as equipes formadas pelos inscritos confirmados: renomeie, mescle duplicadas e acompanhe cada uma.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowSuggestions(v => !v)}
            style={{
              background: visibleSuggestions.length > 0 ? '#f5f3ff' : '#f1f5f9',
              color: visibleSuggestions.length > 0 ? '#7c3aed' : '#94a3b8',
              border: `1px solid ${visibleSuggestions.length > 0 ? '#ddd6fe' : '#e2e8f0'}`,
              padding: '12px 20px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', position: 'relative',
            }}
          >
            <Wand2 size={18} /> Sugestões de fusão (IA)
            {visibleSuggestions.length > 0 && (
              <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 999, minWidth: 20, height: 20, padding: '0 6px', fontSize: '.68rem', fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                {visibleSuggestions.length}
              </span>
            )}
          </button>
          <button
            onClick={toggleSelectionMode}
            style={{
              background: selectionMode ? '#071A45' : '#f1f5f9', color: selectionMode ? '#fff' : '#475569',
              border: 'none', padding: '12px 20px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem',
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            }}
          >
            <CheckSquare size={18} /> {selectionMode ? 'Cancelar seleção' : 'Selecionar equipes'}
          </button>
          <button
            onClick={generateEquipesPdf}
            disabled={generatingPdf}
            style={{ background: '#fff', color: '#071A45', border: '1px solid #e2e8f0', padding: '12px 20px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          >
            <FileText size={18} /> {generatingPdf ? 'Gerando...' : 'PDF de resumo'}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)' }}
          >
            <Plus size={18} /> Nova equipe
          </button>
        </div>
      </div>

      {/* Barra de ação da seleção múltipla */}
      {selectionMode && (
        <div style={{ position: 'sticky', top: 12, zIndex: 50, background: '#071A45', borderRadius: 16, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', boxShadow: '0 8px 20px rgba(7,26,69,.25)' }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '.88rem' }}>
            {selectedForMerge.size === 0 ? 'Clique nas equipes que deseja mesclar' : `${selectedForMerge.size} equipe(s) selecionada(s)`}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setSelectedForMerge(new Set())} disabled={selectedForMerge.size === 0} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 800, fontSize: '.78rem', cursor: selectedForMerge.size === 0 ? 'default' : 'pointer', opacity: selectedForMerge.size === 0 ? .5 : 1 }}>
              Limpar
            </button>
            <button
              onClick={openMergeSelectedModal}
              disabled={selectedForMerge.size < 2}
              style={{ background: '#6BFF2A', color: '#071A45', border: 'none', borderRadius: 10, padding: '9px 18px', fontWeight: 900, fontSize: '.78rem', cursor: selectedForMerge.size < 2 ? 'default' : 'pointer', opacity: selectedForMerge.size < 2 ? .5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <GitMerge size={15} /> Mesclar selecionadas
            </button>
          </div>
        </div>
      )}

      {/* Painel de sugestões de fusão (IA de similaridade de nomes) */}
      {showSuggestions && (
        <div style={{ background: '#fff', border: '1px solid #ddd6fe', borderRadius: 20, padding: 20, marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
              <Wand2 size={18} />
            </div>
            <h3 style={{ margin: 0, color: '#071A45', fontSize: '1rem', fontWeight: 950 }}>Sugestões de fusão</h3>
          </div>
          <p style={{ color: '#64748b', fontSize: '.82rem', marginBottom: 16, lineHeight: 1.5 }}>
            Analisa o nome de todas as equipes (digitação, abreviação, palavra a mais) e aponta pares que provavelmente são a mesma equipe.
            Nada é fundido automaticamente - você confirma cada sugestão.
          </p>
          {visibleSuggestions.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>
              Nenhuma equipe parecida encontrada no momento.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleSuggestions.map(s => {
                const a = groups.find(g => g.key === s.aKey);
                const b = groups.find(g => g.key === s.bKey);
                if (!a || !b) return null;
                const pct = Math.round(s.score * 100);
                return (
                  <div key={pairId(s.aKey, s.bKey)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#faf9ff', border: '1px solid #ede9fe', borderRadius: 14, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
                      <strong style={{ color: '#071A45', fontSize: '.88rem' }}>{a.nome}</strong>
                      <span style={{ color: '#94a3b8', fontSize: '.72rem', fontWeight: 800 }}>({a.membros.length})</span>
                      <GitMerge size={15} color="#a78bfa" />
                      <strong style={{ color: '#071A45', fontSize: '.88rem' }}>{b.nome}</strong>
                      <span style={{ color: '#94a3b8', fontSize: '.72rem', fontWeight: 800 }}>({b.membros.length})</span>
                    </div>
                    <span style={{ background: pct >= 80 ? '#dcfce7' : '#fef3c7', color: pct >= 80 ? '#166534' : '#92400e', borderRadius: 999, padding: '4px 10px', fontSize: '.68rem', fontWeight: 900 }}>
                      {pct}% parecido
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => acceptSuggestion(s)} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 14px', fontWeight: 900, fontSize: '.74rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <GitMerge size={13} /> Fundir
                      </button>
                      <button onClick={() => dismissSuggestion(s)} title="Ignorar esta sugestão" style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 9, width: 32, height: 32, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                        <XIcon size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Stats gerais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 22 }}>
        <StatCard icon={<UsersRound size={20} />} label="Equipes" value={String(globalStats.totalEquipes)} tone="#071A45" />
        <StatCard icon={<ShieldCheck size={20} />} label="Cadastradas oficialmente" value={String(globalStats.totalOficiais)} tone="#2563eb" />
        <StatCard icon={<Trophy size={20} />} label="Membros confirmados" value={String(globalStats.totalMembros)} tone="#7c3aed" />
        <StatCard icon={<Wallet size={20} />} label="Arrecadado" value={formatMoneyBR(globalStats.totalArrecadado)} tone="#16a34a" />
      </div>

      {/* Filtros */}
      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 18, marginBottom: 20, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 240, position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} size={18} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar equipe por nome..."
            style={{ width: '100%', height: 44, padding: '0 14px 0 42px', borderRadius: 12, border: '1px solid #e2e8f0', fontWeight: 700, color: '#071A45', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {([
            ['todas', 'Todas'],
            ['oficiais', 'Cadastradas'],
            ['nao-cadastradas', 'Não cadastradas'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              style={{
                border: 'none', borderRadius: 10, padding: '10px 16px', fontWeight: 800, fontSize: '0.76rem', cursor: 'pointer',
                background: filter === id ? '#071A45' : '#f1f5f9', color: filter === id ? '#fff' : '#64748b',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ArrowUpDown size={16} color="#94a3b8" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            style={{ height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 800, fontSize: '.8rem', color: '#071A45', background: '#fff', cursor: 'pointer' }}
          >
            <option value="membros-desc">Mais membros</option>
            <option value="membros-asc">Menos membros</option>
            <option value="nome-asc">Nome (A-Z)</option>
            <option value="nome-desc">Nome (Z-A)</option>
            <option value="arrecadado-desc">Mais arrecadado</option>
            <option value="status">Cadastradas primeiro</option>
          </select>
        </div>
      </div>

      {/* Lista de equipes */}
      {filteredGroups.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 20, border: '1px dashed #cbd5e1', padding: 70, textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>
          <UsersRound size={34} color="#cbd5e1" />
          <p style={{ marginTop: 12 }}>Nenhuma equipe encontrada com esses filtros.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {filteredGroups.map(group => {
            const s = statsFor(group);
            const isSelected = selectedForMerge.has(group.key);
            return (
              <button
                key={group.key}
                onClick={() => selectionMode ? toggleCardSelected(group.key) : setSelectedKey(group.key)}
                style={{
                  textAlign: 'left', background: isSelected ? '#f5f3ff' : '#fff',
                  border: isSelected ? '2px solid #7c3aed' : '1px solid #e2e8f0', borderRadius: 18,
                  padding: isSelected ? 19 : 20, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 14, transition: 'box-shadow .15s ease, transform .15s ease',
                }}
                onMouseEnter={e => { if (!selectionMode) { e.currentTarget.style.boxShadow = '0 8px 20px rgba(15,23,42,.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {selectionMode ? (
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: isSelected ? '#7c3aed' : '#f1f5f9', color: isSelected ? '#fff' : '#94a3b8', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                      </div>
                    ) : (
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: group.oficial ? '#eff6ff' : '#f1f5f9', color: group.oficial ? '#2563eb' : '#94a3b8', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        <UsersRound size={20} />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', color: '#071A45', fontSize: '0.98rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.nome}</strong>
                      <span style={{ color: group.oficial ? '#2563eb' : '#94a3b8', fontSize: '.68rem', fontWeight: 900, textTransform: 'uppercase' }}>
                        {group.oficial ? 'Cadastrada' : 'Não cadastrada'}
                      </span>
                    </div>
                  </div>
                  {!selectionMode && <ArrowRight size={18} color="#cbd5e1" style={{ flexShrink: 0, marginTop: 8 }} />}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Badge tone="#166534" bg="#dcfce7">{s.total} confirmado{s.total === 1 ? '' : 's'}</Badge>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <span style={{ color: '#94a3b8', fontSize: '.72rem', fontWeight: 800, textTransform: 'uppercase' }}>Arrecadado</span>
                  <strong style={{ color: '#071A45', fontSize: '.95rem', fontWeight: 900 }}>{formatMoneyBR(s.arrecadado)}</strong>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Modal: nova equipe */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1500 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 440, borderRadius: 20, padding: 26, boxShadow: '0 24px 60px rgba(15,23,42,.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                <Sparkles size={19} />
              </div>
              <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.05rem', fontWeight: 950 }}>Nova equipe</h2>
            </div>
            <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 900, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Nome da equipe</label>
            <input
              value={newNome}
              onChange={e => setNewNome(e.target.value)}
              placeholder="Ex: Correndo Juntos"
              style={{ width: '100%', height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid #e2e8f0', fontWeight: 700, color: '#071A45', outline: 'none', marginBottom: 16 }}
            />
            <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 900, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Observações (opcional)</label>
            <textarea
              value={newObs}
              onChange={e => setNewObs(e.target.value)}
              placeholder="Anotações internas sobre a equipe..."
              style={{ width: '100%', minHeight: 80, padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', fontWeight: 600, color: '#071A45', outline: 'none', resize: 'vertical', marginBottom: 20, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 12, padding: 13, color: '#64748b', fontWeight: 900, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleCreateEquipe} disabled={saving} style={{ flex: 1.4, border: 'none', background: '#071A45', color: '#fff', borderRadius: 12, padding: 13, fontWeight: 900, cursor: 'pointer' }}>
                {saving ? 'Salvando...' : 'Cadastrar equipe'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: mesclar equipes selecionadas na lista */}
      {showMergeSelected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1500 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 480, borderRadius: 20, padding: 26, boxShadow: '0 24px 60px rgba(15,23,42,.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
                <GitMerge size={19} />
              </div>
              <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.05rem', fontWeight: 950 }}>Mesclar {selectedGroupsForMerge.length} equipes</h2>
            </div>
            <p style={{ color: '#64748b', fontSize: '.82rem', margin: '4px 0 18px', lineHeight: 1.5 }}>
              Escolha qual delas vai dar nome ao grupo final. As demais serão fundidas dentro dela.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {selectedGroupsForMerge.map(g => (
                <label
                  key={g.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    border: mergeSelectedTarget === g.key ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                    background: mergeSelectedTarget === g.key ? '#faf9ff' : '#fff',
                  }}
                >
                  <input type="radio" name="merge-target" checked={mergeSelectedTarget === g.key} onChange={() => setMergeSelectedTarget(g.key)} style={{ accentColor: '#7c3aed', width: 16, height: 16 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: 'block', color: '#071A45', fontSize: '.88rem' }}>{g.nome}</strong>
                    <small style={{ color: '#94a3b8', fontWeight: 700 }}>{g.membros.length} membro{g.membros.length === 1 ? '' : 's'}{g.oficial ? ' · cadastrada' : ''}</small>
                  </div>
                  {mergeSelectedTarget === g.key && <span style={{ background: '#7c3aed', color: '#fff', borderRadius: 999, padding: '3px 10px', fontSize: '.65rem', fontWeight: 900 }}>NOME FINAL</span>}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowMergeSelected(false)} style={{ flex: 1, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 12, padding: 13, color: '#64748b', fontWeight: 900, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmMergeSelected} disabled={saving || !mergeSelectedTarget} style={{ flex: 1.4, border: 'none', background: '#7c3aed', color: '#fff', borderRadius: 12, padding: 13, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <GitMerge size={16} /> {saving ? 'Mesclando...' : 'Confirmar mescla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedGroup && (
        <EquipeDetalheModal
          group={selectedGroup}
          allGroups={groups}
          stats={statsFor(selectedGroup)}
          onClose={() => setSelectedKey(null)}
          onOficializar={() => handleOficializar(selectedGroup)}
          onRenomear={(novoNome) => handleRenomear(selectedGroup, novoNome)}
          onMesclarEm={(destinoKey) => {
            const destino = groups.find(g => g.key === destinoKey);
            if (destino) handleMesclar(selectedGroup, destino);
          }}
          onExcluirOficial={() => handleExcluirOficial(selectedGroup)}
          onOpenFicha={(id) => navigate(`/admin/inscritos/${id}`)}
          saving={saving}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${tone}15`, color: tone, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#071A45', fontSize: '1.1rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
        <div style={{ color: '#94a3b8', fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
      </div>
    </div>
  );
}

function Badge({ children, tone, bg }: { children: React.ReactNode; tone: string; bg: string }) {
  return (
    <span style={{ background: bg, color: tone, borderRadius: 999, padding: '4px 10px', fontSize: '.68rem', fontWeight: 900 }}>
      {children}
    </span>
  );
}
