import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { collection, deleteField, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { getCamisetaShortLabel } from '../utils/camisetaUtils';
import { formatDateBR } from '../utils/dateUtils';
import { Search, CheckCircle2, PackageCheck, Users, X, AlertTriangle, LogOut, User as UserIcon, History, ExternalLink, Mail, Phone, MapPin, Flag, Package, HeartPulse, FileDown, Printer, FileText } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

type Reg = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  numeroInscricao?: string;
  kit?: string;
  tamanhoCamiseta?: string;
  modalidadeNome?: string;
  categoria?: string;
  fotoUrl?: string;
  endereco?: { cidade?: string; uf?: string };
  kitRetiradoEm?: any;
  kitRetiradoPor?: string;
  kitRetiradoTerceiro?: boolean;
  kitSeparadoPara?: string;
  kitSeparadoParaCpf?: string;
  kitSeparadoEm?: any;
};

// Mesma programação oficial usada na ficha de impressão em massa (AdminImprimirFichas.tsx) -
// duplicada aqui pra imprimir a ficha de um atleta direto deste painel, sem sair da página.
const PROGRAMACAO = [
  { hora: '13H ÀS 14:30', titulo: 'ABERTURA DO PLAYGROUND', sub: 'Para as crianças e show com Marcela Reis - só para baixinhos!' },
  { hora: '14:30 ÀS 16:30', titulo: 'CORRIDA KIDS', sub: '' },
  { hora: '16:30', titulo: 'DJ DUO HORSE', sub: 'Música e animação na arena!' },
  { hora: '17:30', titulo: 'ATIVAÇÃO + AULÃO', sub: 'Aquecimento e preparação para a largada' },
  { hora: '18:30', titulo: 'LARGADA OFICIAL', sub: 'Caminhada · Corrida 5 km · Corrida 10 km' },
  { hora: '19:30', titulo: 'SHOW COM BREDINHO', sub: '' },
  { hora: '21:00', titulo: 'SHOW COM TATI MEIRA', sub: '' },
];

const MENSAGEM_MOTIVACIONAL =
  'Chegou a hora! O grande dia finalmente chegou - sábado, dia 12, Manhuaçu vai parar pra ver ' +
  'você brilhar. Guarde seu kit com carinho e venha viver uma noite histórica!';

const escapeHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const onlyDigits = (v: string) => (v || '').toString().replace(/\D/g, '');
const normalize = (v: string) => (v || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const maskCpfDisplay = (v: string) => onlyDigits(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

// Painel exclusivo pra retirada de kits no dia do evento - separado do painel admin completo
// de propósito: uma única tela grande, busca no topo, sem menus/abas, pra qualquer voluntário
// conseguir usar sem treinamento. Login normal de admin (a sessão do Firebase Auth já persiste
// no navegador por padrão, então quem logar uma vez no tablet/computador da mesa continua
// logado nas próximas aberturas deste link, sem precisar digitar senha de novo).
export default function AdminRetiradaKits() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [regs, setRegs] = useState<Reg[]>([]);
  const [kits, setKits] = useState<KitRecord[]>([]);
  const [camisetas, setCamisetas] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [modo, setModo] = useState<'propria' | 'unica_terceiro' | 'multipla_terceiro' | 'separar' | 'historico' | 'relatorio'>('propria');
  const [terceiroNome, setTerceiroNome] = useState('');
  const [selecionadosMultipla, setSelecionadosMultipla] = useState<Record<string, Reg>>({});
  const [separarNome, setSepararNome] = useState('');
  const [selecionadosSeparar, setSelecionadosSeparar] = useState<Record<string, Reg>>({});
  const [processingSeparar, setProcessingSeparar] = useState(false);
  const [editandoGrupo, setEditandoGrupo] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingMultipla, setProcessingMultipla] = useState(false);
  const [confirmarDuplicado, setConfirmarDuplicado] = useState<{ reg: Reg; nome: string; terceiro: boolean } | null>(null);
  const [detalhesReg, setDetalhesReg] = useState<Reg | null>(null);
  const [desfazerAlvo, setDesfazerAlvo] = useState<Reg | null>(null);
  const [mostrarSeletorKit, setMostrarSeletorKit] = useState(false);
  const [trocandoKit, setTrocandoKit] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'propria' | 'terceiro'>('todos');
  const [filtroKitId, setFiltroKitId] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Relatório diário oculto - só aparece com Ctrl+' (nenhum botão visível normalmente),
  // pensado pra organização checar o dia sem expor esse controle pros voluntários que usam
  // este painel no dia a dia.
  const [relatorioOcultoVisivel, setRelatorioOcultoVisivel] = useState(false);
  const [mostrarModalRelatorioDiario, setMostrarModalRelatorioDiario] = useState(false);
  const [dataRelatorioDiario, setDataRelatorioDiario] = useState(() => new Date().toISOString().slice(0, 10));
  const [gerandoRelatorioDiario, setGerandoRelatorioDiario] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || role !== 'admin' && role !== 'staff_kits')) navigate('/admin/login');
  }, [user, role, authLoading, navigate]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "'") {
        e.preventDefault();
        setRelatorioOcultoVisivel(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    fetchKits().then(setKits).catch(() => {});
    getDocs(collection(db, 'nightrun_camisetas')).then(snap => setCamisetas(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(() => {});
    const unsub = onSnapshot(
      query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago')),
      snap => setRegs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reg))),
      error => console.error('Erro ao acompanhar inscrições confirmadas:', error)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  const results = useMemo(() => {
    const term = normalize(search);
    const termDigits = onlyDigits(search);
    if (term.length < 2 && termDigits.length < 2) return [];
    return regs
      .filter(r => {
        if (term.length >= 2 && normalize(r.nome).includes(term)) return true;
        if (termDigits.length >= 2 && onlyDigits(r.cpf).includes(termDigits)) return true;
        if (termDigits.length >= 2 && onlyDigits(r.telefone).includes(termDigits)) return true;
        if (termDigits.length >= 2 && onlyDigits(r.numeroInscricao || '').includes(termDigits)) return true;
        return false;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 40);
  }, [search, regs]);

  const toMillis = (v: any) => v?.toDate ? v.toDate().getTime() : (v ? new Date(v).getTime() : 0);

  // Histórico ao vivo de retiradas - deriva do mesmo onSnapshot dos confirmados (sem custo
  // extra de leitura), sempre atualizado assim que qualquer mesa registra uma retirada.
  const historico = useMemo(() => {
    const term = normalize(search);
    const termDigits = onlyDigits(search);
    return regs
      .filter(r => Boolean(r.kitRetiradoEm))
      .filter(r => {
        if (filtroTipo === 'propria' && r.kitRetiradoTerceiro) return false;
        if (filtroTipo === 'terceiro' && !r.kitRetiradoTerceiro) return false;
        if (filtroKitId && (r.kit || 'unico') !== filtroKitId) return false;
        return true;
      })
      .filter(r => {
        if (!term && !termDigits) return true;
        if (term.length >= 2 && (normalize(r.nome).includes(term) || normalize(r.kitRetiradoPor || '').includes(term))) return true;
        if (termDigits.length >= 2 && onlyDigits(r.cpf).includes(termDigits)) return true;
        if (termDigits.length >= 2 && onlyDigits(r.telefone).includes(termDigits)) return true;
        if (termDigits.length >= 2 && onlyDigits(r.numeroInscricao || '').includes(termDigits)) return true;
        return false;
      })
      .sort((a, b) => toMillis(b.kitRetiradoEm) - toMillis(a.kitRetiradoEm));
  }, [search, regs, filtroTipo, filtroKitId]);

  const kitNomeDe = (r: Reg) => resolveKitNome(kits, r.kit, 'Kit Único');

  // Mostra o tamanho sempre que a inscrição tem um tamanho registrado, independente do
  // kit - a pessoa pode ter escolhido tamanho antes de trocar de kit, ou o kit atual pode
  // não listar "CAMISETA" mas ainda assim ter um tamanho salvo. O tipo (Normal/Baby
  // Look/Infantil) vem do cadastro do tamanho em si, não do texto do tamanho.
  const camisetaInfoDe = (r: Reg): { tamanho: string; tipo: string } | null => {
    if (!r.tamanhoCamiseta) return null;
    const item = camisetas.find(c => c.id === r.tamanhoCamiseta);
    const tamanho = getCamisetaShortLabel(r.tamanhoCamiseta, item);
    if (!tamanho) return null;
    const tipo = item?.categoria === 'infantil' ? 'Infantil' : (item?.tipo === 'Baby Look' ? 'Baby Look' : 'Normal');
    return { tamanho, tipo };
  };

  const CAMISETA_TIPO_COLORS: Record<string, [string, string]> = {
    Normal: ['#eff6ff', '#2563eb'],
    'Baby Look': ['#fdf2f8', '#db2777'],
    Infantil: ['#f0fdf4', '#16a34a'],
  };

  const CamisetaBadge = ({ r }: { r: Reg }) => {
    const info = camisetaInfoDe(r);
    if (!info) return null;
    const [bg, fg] = CAMISETA_TIPO_COLORS[info.tipo] || CAMISETA_TIPO_COLORS.Normal;
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, background: bg, color: fg,
        fontWeight: 900, fontSize: '0.75rem', padding: '4px 10px', borderRadius: 8, marginTop: 4,
      }}>
        {info.tamanho} · {info.tipo}
      </span>
    );
  };

  const VerDetalhesLink = ({ r }: { r: Reg }) => (
    <button
      type="button"
      onClick={() => { setDetalhesReg(r); setMostrarSeletorKit(false); }}
      title="Ver detalhes do atleta"
      style={{
        background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10,
        padding: '10px 12px', display: 'inline-flex', alignItems: 'center', gap: 6,
        fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <ExternalLink size={14} /> DETALHES
    </button>
  );

  // Abre direto o assistente de impressão nativo do navegador com a ficha desse atleta -
  // sem navegar pra outra página/aba e sem baixar arquivo nenhum. Monta a ficha num iframe
  // escondido (com os mesmos dados já carregados neste painel) e chama print() nele; o
  // iframe some sozinho assim que a impressão é fechada.
  const imprimirFicha = (r: Reg) => {
    const d = r as any;
    const kitDoc = kits.find(k => k.id === r.kit);
    const kitNome = kitNomeDe(r);
    const temCamiseta = Boolean(kitDoc?.itens?.some((item: string) => item.toUpperCase().includes('CAMISETA')));
    const camisetaInfo = camisetaInfoDe(r);
    const primeiroNome = (r.nome || 'ATLETA').trim().split(/\s+/)[0];
    const NAVY = '#071A45';
    const STRIPE = '#f1f5f9';

    const dadosRaw: [string, string][] = [
      ['Número da inscrição', r.numeroInscricao || ''],
      ['CPF', r.cpf || ''],
      ['Data de nascimento', d.dataNascimento ? formatDateBR(d.dataNascimento) : ''],
      ['Sexo', d.sexo === 'M' ? 'Masculino' : d.sexo === 'F' ? 'Feminino' : ''],
      ['WhatsApp', r.telefone || ''],
      ['E-mail', d.email || ''],
      ['Modalidade', r.modalidadeNome || ''],
      ['Categoria', r.categoria === 'infantil' ? 'Infantil' : 'Adulto / adolescente'],
      ['Equipe', d.integranteEquipe === 'sim' ? (d.equipeNome || 'Sim') : 'Não'],
      ['Kit', kitNome],
      ['Tamanho da camiseta', temCamiseta && camisetaInfo ? `${camisetaInfo.tamanho} (${camisetaInfo.tipo})` : ''],
    ];
    const dados = dadosRaw.filter(([, v]) => v.trim() !== '');

    const dadosRowsHtml = Array.from({ length: Math.ceil(dados.length / 2) }).map((_, rowIdx) => {
      const left = dados[rowIdx * 2];
      const right = dados[rowIdx * 2 + 1];
      const bg = rowIdx % 2 === 1 ? STRIPE : 'transparent';
      const cell = (label: string, value: string) => `
        <div>
          <div style="font-size:0.65rem;font-weight:700;color:#64748b;text-transform:uppercase;">${escapeHtml(label)}</div>
          <div style="font-size:0.85rem;font-weight:600;">${escapeHtml(value)}</div>
        </div>`;
      return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;background:${bg};padding:6px 12px;">
        ${cell(left[0], left[1])}${right ? cell(right[0], right[1]) : ''}
      </div>`;
    }).join('');

    const programacaoHtml = PROGRAMACAO.map((item, idx) => `
      <div style="display:flex;gap:10px;padding:6px 12px;background:${idx % 2 === 1 ? STRIPE : 'transparent'};border-bottom:1px solid #e2e8f0;">
        <div style="width:80px;flex-shrink:0;font-weight:800;font-size:0.75rem;">${escapeHtml(item.hora)}</div>
        <div>
          <div style="font-weight:700;font-size:0.78rem;">${escapeHtml(item.titulo)}</div>
          ${item.sub ? `<div style="font-size:0.68rem;color:#64748b;">${escapeHtml(item.sub)}</div>` : ''}
        </div>
      </div>`).join('');

    const fotoHtml = r.fotoUrl
      ? `<img src="${escapeHtml(r.fotoUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
      : '';

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Ficha - ${escapeHtml(r.nome)}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: ${NAVY}; }
      </style>
      </head><body>
        <div style="font-weight:900;font-size:1.6rem;text-transform:uppercase;margin-bottom:10px;">
          ${escapeHtml(primeiroNome)}, seu kit chegou!
        </div>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
          <div style="width:90px;height:90px;flex-shrink:0;border:2px solid ${NAVY};overflow:hidden;background:#eff6ff;display:flex;align-items:center;justify-content:center;">
            ${fotoHtml}
          </div>
          <strong style="font-size:1.4rem;line-height:1.2;">${escapeHtml(r.nome.toUpperCase())}</strong>
        </div>
        <div style="background:${NAVY};color:#fff;font-weight:800;font-size:0.85rem;padding:8px 12px;">SEUS DADOS E DA PROVA</div>
        ${dadosRowsHtml}
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;margin-top:14px;font-size:0.82rem;font-style:italic;">
          ${escapeHtml(MENSAGEM_MOTIVACIONAL)}
        </div>
        <div style="background:${NAVY};color:#fff;font-weight:800;font-size:0.85rem;padding:8px 12px;margin-top:14px;">PROGRAMAÇÃO DO DIA 12/09 (SÁBADO)</div>
        ${programacaoHtml}
        <div style="margin-top:14px;font-size:0.65rem;font-style:italic;color:#94a3b8;">Documento gerado automaticamente pelo sistema MCU Night Run.</div>
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const cleanup = () => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Erro ao abrir impressão:', e);
      }
      setTimeout(cleanup, 1000);
    };

    iframe.onload = () => {
      const img = iframe.contentDocument?.querySelector('img');
      if (img && !(img as HTMLImageElement).complete) {
        (img as HTMLImageElement).onload = doPrint;
        (img as HTMLImageElement).onerror = doPrint;
        setTimeout(doPrint, 1500);
      } else {
        setTimeout(doPrint, 150);
      }
    };

    const doc2 = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc2) {
      doc2.open();
      doc2.write(html);
      doc2.close();
    }
  };

  const ImprimirFichaLink = ({ r }: { r: Reg }) => (
    <button
      type="button"
      onClick={() => imprimirFicha(r)}
      title="Imprimir ficha deste atleta"
      style={{
        background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 10,
        padding: '10px 12px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <Printer size={14} /> IMPRIMIR
    </button>
  );

  const registrarRetirada = async (r: Reg, nomeRetirante: string, terceiro: boolean) => {
    setProcessingId(r.id);
    try {
      await updateDoc(doc(db, 'nightrun_registrations', r.id), {
        kitRetiradoEm: serverTimestamp(),
        kitRetiradoPor: nomeRetirante,
        kitRetiradoTerceiro: terceiro,
      });
      setFeedback({ text: `Kit de ${r.nome.toUpperCase()} registrado como retirado${terceiro ? ` por ${nomeRetirante.toUpperCase()}` : ''}.`, type: 'success' });
      setConfirmarDuplicado(null);
      setSearch('');
      if (modo === 'unica_terceiro') setTerceiroNome('');
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao registrar retirada. Tente novamente.', type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const desfazerRetirada = async (r: Reg) => {
    setDesfazendo(true);
    try {
      await updateDoc(doc(db, 'nightrun_registrations', r.id), {
        kitRetiradoEm: deleteField(),
        kitRetiradoPor: deleteField(),
        kitRetiradoTerceiro: deleteField(),
      });
      setFeedback({ text: `Retirada de ${r.nome.toUpperCase()} desfeita.`, type: 'success' });
      setDesfazerAlvo(null);
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao desfazer a retirada. Tente novamente.', type: 'error' });
    } finally {
      setDesfazendo(false);
    }
  };

  const [gerandoPdfHistorico, setGerandoPdfHistorico] = useState(false);

  // PDF do histórico de retiradas - mesmo padrão visual dos PDFs de kit/modalidade
  // (header.png, título em Anton skewed, tabela navy/stripe com quebra de página segura).
  // "Inteligente" = agrupado por quem retirou (o próprio atleta primeiro, depois cada
  // terceiro com os kits que ele levou), em vez de só uma lista corrida por horário.
  const generateHistoricoPdf = async () => {
    if (historico.length === 0) return setFeedback({ text: 'Nenhuma retirada pra gerar PDF ainda.', type: 'error' });
    setGerandoPdfHistorico(true);
    try {
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
      const titleText = 'HISTÓRICO DE RETIRADA DE KITS';
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
      const NAVY: [number, number, number] = [7, 26, 69];
      const STRIPE: [number, number, number] = [241, 245, 249];

      const drawHeader = () => {
        try {
          docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'historico-pdf-header', 'FAST');
        } catch {
          docPdf.setFillColor(...NAVY);
          docPdf.rect(0, 0, pageW, headerH, 'F');
        }
      };

      const usableW = pageW - marginX * 2;
      const colHoraW = usableW * 0.12;
      const colNomeW = usableW * 0.36;
      const colKitW = usableW * 0.28;
      const colHoraX = marginX;
      const colNomeX = colHoraX + colHoraW;
      const colKitX = colNomeX + colNomeW;
      const colPorX = colKitX + colKitW;
      const rowLineH = 5.2;
      const rowPaddingV = 3.2;

      let y = headerH + 10;

      const drawTableHeader = () => {
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 9, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('HORA', colHoraX + 3, y + 6.2);
        docPdf.text('ATLETA', colNomeX + 3, y + 6.2);
        docPdf.text('KIT', colKitX + 3, y + 6.2);
        docPdf.text('RETIRADO POR', colPorX + 3, y + 6.2);
        y += 9;
      };

      const newPage = () => {
        docPdf.addPage();
        drawHeader();
        y = headerH + 10;
        drawTableHeader();
      };

      // Agrupa por quem retirou: primeiro os que retiraram o próprio kit, depois cada
      // terceiro (ordenado alfabeticamente) com a lista de kits que ele levou - assim o
      // organizador consegue conferir rapidinho "quem levou quantos kits" sem contar linha
      // por linha, além do horário de cada retirada.
      type Item = { data: Date; reg: Reg };
      const ordenado: Item[] = historico.map(r => ({
        data: r.kitRetiradoEm?.toDate ? r.kitRetiradoEm.toDate() : new Date(r.kitRetiradoEm),
        reg: r,
      })).sort((a, b) => a.data.getTime() - b.data.getTime());

      const proprios = ordenado.filter(i => !i.reg.kitRetiradoTerceiro);
      const porTerceiro = new Map<string, Item[]>();
      ordenado.filter(i => i.reg.kitRetiradoTerceiro).forEach(i => {
        const chave = (i.reg.kitRetiradoPor || 'Não identificado').trim();
        if (!porTerceiro.has(chave)) porTerceiro.set(chave, []);
        porTerceiro.get(chave)!.push(i);
      });
      const gruposTerceiro = Array.from(porTerceiro.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));

      const infoText = `${historico.length} kit(s) retirado(s) - ${proprios.length} pelo próprio atleta e ${historico.length - proprios.length} por terceiros, em ${gruposTerceiro.length} grupo(s).`;

      drawHeader();
      docPdf.addImage(titleImgData, 'PNG', marginX, y - titleImgH + 3, titleImgW, titleImgH, undefined, 'FAST');
      y += 6;
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(9);
      docPdf.setTextColor(100, 116, 139);
      const infoLines = docPdf.splitTextToSize(infoText, usableW);
      docPdf.text(infoLines, marginX, y);
      y += infoLines.length * 4.6 + 4;

      const drawSectionTitle = (texto: string) => {
        if (y + 12 > pageH - marginBottom) newPage();
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(10);
        docPdf.setTextColor(...NAVY);
        docPdf.text(texto, marginX, y + 5);
        y += 9;
        drawTableHeader();
      };

      let rowIdx = 0;
      const drawRow = (item: Item) => {
        const nomeLines = docPdf.splitTextToSize(item.reg.nome.toUpperCase(), colNomeW - 6);
        const kitLabel = kitNomeDe(item.reg);
        const kitLines = docPdf.splitTextToSize(kitLabel, colKitW - 6);
        const porLabel = (item.reg.kitRetiradoPor || item.reg.nome).toUpperCase();
        const porLines = docPdf.splitTextToSize(porLabel, usableW - (colPorX - marginX) - 3);
        const lineCount = Math.max(nomeLines.length, kitLines.length, porLines.length, 1);
        const rowH = lineCount * rowLineH + rowPaddingV;

        if (y + rowH > pageH - marginBottom) newPage();

        if (rowIdx % 2 === 1) {
          docPdf.setFillColor(...STRIPE);
          docPdf.rect(marginX, y, usableW, rowH, 'F');
        }
        rowIdx++;

        const hora = Number.isNaN(item.data.getTime()) ? '--:--' : item.data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(9);
        docPdf.setTextColor(...NAVY);
        docPdf.text(hora, colHoraX + 3, y + rowLineH - 0.8);
        docPdf.text(nomeLines, colNomeX + 3, y + rowLineH - 0.8);
        docPdf.text(kitLines, colKitX + 3, y + rowLineH - 0.8);
        docPdf.text(porLines, colPorX + 3, y + rowLineH - 0.8);

        y += rowH;
      };

      if (proprios.length > 0) {
        drawSectionTitle(`RETIRADA PRÓPRIA (${proprios.length})`);
        proprios.forEach(drawRow);
        y += 4;
      }

      gruposTerceiro.forEach(([nomeTerceiro, itens]) => {
        drawSectionTitle(`${nomeTerceiro.toUpperCase()} (${itens.length} kit(s))`);
        itens.forEach(drawRow);
        y += 4;
      });

      docPdf.save(`historico-retirada-kits-${new Date().toISOString().slice(0, 10)}.pdf`);
      setFeedback({ text: 'PDF do histórico gerado.', type: 'success' });
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao gerar o PDF do histórico.', type: 'error' });
    } finally {
      setGerandoPdfHistorico(false);
    }
  };

  const handleConfirmarLinha = (r: Reg) => {
    const terceiro = modo === 'unica_terceiro';
    if (terceiro && !terceiroNome.trim()) {
      setFeedback({ text: 'Informe o nome de quem está retirando o kit.', type: 'error' });
      return;
    }
    const nome = terceiro ? terceiroNome.trim() : r.nome;
    if (r.kitRetiradoEm) {
      setConfirmarDuplicado({ reg: r, nome, terceiro });
      return;
    }
    registrarRetirada(r, nome, terceiro);
  };

  const toggleMultipla = (r: Reg) => {
    setSelecionadosMultipla(prev => {
      const next = { ...prev };
      if (next[r.id]) delete next[r.id];
      else next[r.id] = r;
      return next;
    });
  };

  const confirmarRetiradaMultipla = async () => {
    const nome = terceiroNome.trim();
    const ids = Object.keys(selecionadosMultipla);
    if (!nome) return setFeedback({ text: 'Informe o nome de quem está retirando os kits.', type: 'error' });
    if (ids.length === 0) return setFeedback({ text: 'Selecione ao menos um kit pra retirar.', type: 'error' });
    setProcessingMultipla(true);
    try {
      await Promise.all(ids.map(id => updateDoc(doc(db, 'nightrun_registrations', id), {
        kitRetiradoEm: serverTimestamp(),
        kitRetiradoPor: nome,
        kitRetiradoTerceiro: true,
      })));
      setFeedback({ text: `${ids.length} kit(s) registrado(s) como retirado(s) por ${nome}.`, type: 'success' });
      setSelecionadosMultipla({});
      setTerceiroNome('');
      setSearch('');
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao registrar as retiradas. Tente novamente.', type: 'error' });
    } finally {
      setProcessingMultipla(false);
    }
  };

  // Mesmo agrupamento em 4 tipos usado no resumo impresso de pendentes (Normal/Baby Look/
  // Infantil/Baby Look Infantil) - duplicado aqui porque o relatório diário oculto monta o
  // PDF inteiro nesta função, sem depender do componente RelatorioPendentesBlock.
  const tipoDetalhadoDe = (r: Reg): string | null => {
    if (!r.tamanhoCamiseta) return null;
    const item = camisetas.find(c => c.id === r.tamanhoCamiseta);
    if (!item) return null;
    const isBabyLook = item.tipo === 'Baby Look';
    const isInfantil = item.categoria === 'infantil';
    if (isInfantil && isBabyLook) return 'Baby Look Infantil';
    if (isInfantil) return 'Infantil';
    if (isBabyLook) return 'Baby Look';
    return 'Normal';
  };

  const ORDEM_TIPO_CAMISETA = ['Normal', 'Baby Look', 'Infantil', 'Baby Look Infantil'];

  // Relatório diário oculto (Ctrl+') - PDF completo com retiradas do dia escolhido, gráfico
  // por horário, top 3 de quem mais retirou de uma vez, resumo de pendentes e (se
  // configurado) o total de leituras do Firestore no dia via worker (usado como aproximação
  // de acessos ao site, já que o projeto não tem analytics próprio).
  const gerarRelatorioDiarioPdf = async (dataStr: string) => {
    setGerandoRelatorioDiario(true);
    try {
      const [ano, mes, diaNum] = dataStr.split('-').map(Number);
      const inicioDia = new Date(ano, mes - 1, diaNum, 0, 0, 0, 0).getTime();
      const fimDia = new Date(ano, mes - 1, diaNum, 23, 59, 59, 999).getTime();
      const dataLabel = `${String(diaNum).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;

      const retiradasDoDia = regs
        .filter(r => r.kitRetiradoEm)
        .filter(r => {
          const t = toMillis(r.kitRetiradoEm);
          return t >= inicioDia && t <= fimDia;
        })
        .sort((a, b) => toMillis(a.kitRetiradoEm) - toMillis(b.kitRetiradoEm));

      const pendentesAtuais = regs.filter(r => !r.kitRetiradoEm);

      // Gráfico por horário (0-23h)
      const porHora = new Array(24).fill(0);
      retiradasDoDia.forEach(r => {
        const h = new Date(toMillis(r.kitRetiradoEm)).getHours();
        porHora[h] += 1;
      });
      const picoQtd = Math.max(0, ...porHora);

      // Top 3 pessoas que mais retiraram kits de uma vez só (mesmo instante de retirada em
      // lote = mesma pessoa, mesmo "kitRetiradoPor"/nome, contado pra esse dia).
      const porPessoa = new Map<string, number>();
      retiradasDoDia.forEach(r => {
        const chave = (r.kitRetiradoPor || r.nome).trim().toUpperCase();
        porPessoa.set(chave, (porPessoa.get(chave) || 0) + 1);
      });
      const top3 = Array.from(porPessoa.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      // Resumo de kits pendentes (extra x master, master por tipo/tamanho)
      const temCamisetaDe = (r: Reg) => {
        const kitDoc = kits.find(k => k.id === r.kit);
        return Boolean(kitDoc?.itens?.some(item => item.toUpperCase().includes('CAMISETA')));
      };
      const masterPendentes = pendentesAtuais.filter(temCamisetaDe);
      const extraPendentes = pendentesAtuais.filter(r => !temCamisetaDe(r));
      const gruposTamanho = new Map<string, { tipo: string; tamanho: string; qtd: number }>();
      masterPendentes.forEach(r => {
        const tipo = tipoDetalhadoDe(r);
        const info = camisetaInfoDe(r);
        if (!tipo || !info) return;
        const key = `${tipo}|${info.tamanho}`;
        const atual = gruposTamanho.get(key);
        if (atual) atual.qtd += 1;
        else gruposTamanho.set(key, { tipo, tamanho: info.tamanho, qtd: 1 });
      });
      const linhasTamanho = Array.from(gruposTamanho.values()).sort((a, b) => {
        const ta = ORDEM_TIPO_CAMISETA.indexOf(a.tipo);
        const tb = ORDEM_TIPO_CAMISETA.indexOf(b.tipo);
        if (ta !== tb) return ta - tb;
        return a.tamanho.localeCompare(b.tamanho, 'pt-BR', { numeric: true });
      });

      // Acessos ao site (aproximado pelas leituras do Firestore no dia) - opcional, some
      // silenciosamente se o worker não tiver a credencial do Google Cloud configurada.
      let acessosSite: number | null = null;
      try {
        const workerUrl = import.meta.env.VITE_WORKER_URL;
        const res = await fetch(`${workerUrl}/analytics/site-visits?date=${dataStr}`);
        const body = await res.json().catch(() => ({}));
        if (typeof body.count === 'number') acessosSite = body.count;
      } catch (e) {
        console.error('Erro ao buscar acessos ao site:', e);
      }

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
      const titleText = `RELATÓRIO DIÁRIO — ${dataLabel}`;
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
      const titleImgH = 11;
      const titleImgW = titleImgH * titleImgAspect;

      const docPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = docPdf.internal.pageSize.getWidth();
      const pageH = docPdf.internal.pageSize.getHeight();
      const marginX = 15;
      const marginBottom = 15;
      const headerAspect = 2172 / 724;
      const headerW = pageW;
      const headerH = headerW / headerAspect;
      const usableW = pageW - marginX * 2;
      const NAVY: [number, number, number] = [7, 26, 69];
      const GREEN: [number, number, number] = [107, 255, 42];
      const STRIPE: [number, number, number] = [241, 245, 249];

      const drawHeader = () => {
        try {
          docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'relatorio-diario-pdf-header', 'FAST');
        } catch {
          docPdf.setFillColor(...NAVY);
          docPdf.rect(0, 0, pageW, headerH, 'F');
        }
      };

      let y = 0;
      const newPage = () => {
        docPdf.addPage();
        drawHeader();
        y = headerH + 10;
      };
      const ensureSpace = (needed: number) => {
        if (y + needed > pageH - marginBottom) newPage();
      };

      const drawSectionTitle = (text: string) => {
        ensureSpace(9);
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 7, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text(text, marginX + 3, y + 5);
        y += 10;
      };

      drawHeader();
      y = headerH + 10;
      docPdf.addImage(titleImgData, 'PNG', marginX, y - titleImgH + 3, titleImgW, titleImgH, undefined, 'FAST');
      y += 8;

      // KPIs
      const kpis = [
        { label: 'RETIRADAS NO DIA', valor: String(retiradasDoDia.length) },
        { label: 'PENDENTES NO MOMENTO', valor: String(pendentesAtuais.length) },
        { label: 'ACESSOS AO SITE', valor: acessosSite === null ? 'INDISPONÍVEL' : String(acessosSite) },
      ];
      const kpiW = (usableW - 12) / 3;
      kpis.forEach((kpi, idx) => {
        const kpiX = marginX + idx * (kpiW + 6);
        docPdf.setFillColor(...STRIPE);
        docPdf.roundedRect(kpiX, y, kpiW, 20, 2, 2, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(16);
        docPdf.setTextColor(...NAVY);
        docPdf.text(kpi.valor, kpiX + kpiW / 2, y + 10, { align: 'center' });
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(6.5);
        docPdf.setTextColor(100, 116, 139);
        docPdf.text(kpi.label, kpiX + kpiW / 2, y + 16, { align: 'center' });
      });
      y += 26;

      // Gráfico de retiradas por horário
      drawSectionTitle('RETIRADAS POR HORÁRIO (PICOS EM DESTAQUE)');
      const chartH = 42;
      ensureSpace(chartH + 10);
      const chartY = y;
      const barGap = 1.2;
      const barW = (usableW - barGap * 23) / 24;
      const maxBarH = chartH - 8;
      docPdf.setDrawColor(226, 232, 240);
      docPdf.setLineWidth(0.2);
      docPdf.line(marginX, chartY + maxBarH, marginX + usableW, chartY + maxBarH);
      porHora.forEach((qtd, hora) => {
        const barH = picoQtd > 0 ? (qtd / picoQtd) * maxBarH : 0;
        const barX = marginX + hora * (barW + barGap);
        const isPico = qtd === picoQtd && qtd > 0;
        docPdf.setFillColor(...(isPico ? GREEN : NAVY));
        if (barH > 0) docPdf.rect(barX, chartY + maxBarH - barH, barW, barH, 'F');
        if (hora % 2 === 0) {
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(5.5);
          docPdf.setTextColor(100, 116, 139);
          docPdf.text(`${hora}h`, barX + barW / 2, chartY + maxBarH + 4, { align: 'center' });
        }
      });
      y = chartY + chartH + 4;

      // Top 3 pessoas
      drawSectionTitle('TOP 3 - QUEM MAIS RETIROU KITS DE UMA VEZ NESTE DIA');
      if (top3.length === 0) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(9);
        docPdf.setTextColor(100, 116, 139);
        ensureSpace(8);
        docPdf.text('Nenhuma retirada registrada neste dia.', marginX, y + 5);
        y += 10;
      } else {
        top3.forEach(([nomePessoa, qtd], idx) => {
          ensureSpace(9);
          if (idx % 2 === 1) {
            docPdf.setFillColor(...STRIPE);
            docPdf.rect(marginX, y, usableW, 8, 'F');
          }
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(9);
          docPdf.setTextColor(...NAVY);
          docPdf.text(`${idx + 1}º`, marginX + 3, y + 5.5);
          docPdf.text(nomePessoa, marginX + 14, y + 5.5);
          docPdf.setTextColor(22, 101, 52);
          docPdf.text(`${qtd} kit(s)`, marginX + usableW - 3, y + 5.5, { align: 'right' });
          y += 8;
        });
        y += 3;
      }

      // Resumo de pendentes
      drawSectionTitle(`RESUMO DE KITS PENDENTES (EXTRA: ${extraPendentes.length} · MASTER: ${masterPendentes.length})`);
      if (linhasTamanho.length === 0) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(9);
        docPdf.setTextColor(100, 116, 139);
        ensureSpace(8);
        docPdf.text('Nenhum kit master pendente com tamanho cadastrado.', marginX, y + 5);
        y += 10;
      } else {
        ensureSpace(8);
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 7, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(7.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('TIPO', marginX + 3, y + 5);
        docPdf.text('TAMANHO', marginX + usableW * 0.45, y + 5);
        docPdf.text('QTD.', marginX + usableW - 3, y + 5, { align: 'right' });
        y += 7;
        linhasTamanho.forEach((linha, idx) => {
          ensureSpace(7.5);
          if (idx % 2 === 1) {
            docPdf.setFillColor(...STRIPE);
            docPdf.rect(marginX, y, usableW, 7.5, 'F');
          }
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(8.5);
          docPdf.setTextColor(...NAVY);
          docPdf.text(linha.tipo, marginX + 3, y + 5.2);
          docPdf.text(linha.tamanho, marginX + usableW * 0.45, y + 5.2);
          docPdf.setFont('helvetica', 'bold');
          docPdf.text(String(linha.qtd), marginX + usableW - 3, y + 5.2, { align: 'right' });
          y += 7.5;
        });
      }
      y += 4;

      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(6.5);
      docPdf.setTextColor(148, 163, 184);
      ensureSpace(6);
      docPdf.text('Documento gerado automaticamente pelo sistema MCU Night Run.', marginX, y + 3);

      docPdf.save(`relatorio-diario-${dataStr}.pdf`);
      setFeedback({ text: 'Relatório diário gerado.', type: 'success' });
      setMostrarModalRelatorioDiario(false);
    } catch (e) {
      console.error('Erro ao gerar relatório diário:', e);
      setFeedback({ text: 'Erro ao gerar o relatório. Tente novamente.', type: 'error' });
    } finally {
      setGerandoRelatorioDiario(false);
    }
  };

  const toggleSeparar = (r: Reg) => {
    setSelecionadosSeparar(prev => {
      const next = { ...prev };
      if (next[r.id]) delete next[r.id];
      else next[r.id] = r;
      return next;
    });
  };

  // Grupos de kits deixados separados pra alguém buscar depois - ainda não é uma retirada de
  // verdade (não mexe em kitRetiradoEm), só marca o kit como reservado sob um nome, pra
  // agilizar quando a pessoa chegar. Derivado do mesmo onSnapshot dos confirmados.
  const separacoesPendentes = useMemo(() => {
    const map = new Map<string, Reg[]>();
    regs.filter(r => r.kitSeparadoPara && !r.kitRetiradoEm).forEach(r => {
      const chave = r.kitSeparadoPara!.trim();
      if (!map.has(chave)) map.set(chave, []);
      map.get(chave)!.push(r);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [regs]);

  const editarGrupoSeparacao = (nome: string, itens: Reg[]) => {
    setSepararNome(nome);
    setSelecionadosSeparar(Object.fromEntries(itens.map(r => [r.id, r])));
    setEditandoGrupo(nome);
    setSearch('');
  };

  const cancelarEdicaoSeparacao = () => {
    setEditandoGrupo(null);
    setSepararNome('');
    setSelecionadosSeparar({});
  };

  const confirmarSeparacao = async () => {
    const nome = separarNome.trim();
    const idsNovos = Object.keys(selecionadosSeparar);
    if (!nome) return setFeedback({ text: 'Informe o nome de quem vai buscar os kits.', type: 'error' });
    if (idsNovos.length === 0) return setFeedback({ text: 'Selecione ao menos um kit pra separar.', type: 'error' });
    setProcessingSeparar(true);
    try {
      // Editando um grupo já existente: quem foi desmarcado da seleção sai da separação
      // (volta a ficar livre), e o restante é gravado com o nome atual (que pode ter mudado).
      if (editandoGrupo) {
        const idsAntigos = regs.filter(r => r.kitSeparadoPara?.trim() === editandoGrupo).map(r => r.id);
        const removidos = idsAntigos.filter(id => !idsNovos.includes(id));
        await Promise.all(removidos.map(id => updateDoc(doc(db, 'nightrun_registrations', id), {
          kitSeparadoPara: deleteField(),
          kitSeparadoEm: deleteField(),
        })));
      }
      await Promise.all(idsNovos.map(id => updateDoc(doc(db, 'nightrun_registrations', id), {
        kitSeparadoPara: nome,
        kitSeparadoEm: serverTimestamp(),
      })));
      setFeedback({ text: `${idsNovos.length} kit(s) separado(s) para ${nome.toUpperCase()}.`, type: 'success' });
      setSelecionadosSeparar({});
      setSepararNome('');
      setEditandoGrupo(null);
      setSearch('');
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao separar os kits. Tente novamente.', type: 'error' });
    } finally {
      setProcessingSeparar(false);
    }
  };

  const apagarSeparacao = async (itens: Reg[]) => {
    setProcessingSeparar(true);
    try {
      await Promise.all(itens.map(r => updateDoc(doc(db, 'nightrun_registrations', r.id), {
        kitSeparadoPara: deleteField(),
        kitSeparadoEm: deleteField(),
      })));
      setFeedback({ text: 'Separação apagada.', type: 'success' });
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao apagar a separação.', type: 'error' });
    } finally {
      setProcessingSeparar(false);
    }
  };

  const marcarSeparacaoComoPego = async (nome: string, itens: Reg[]) => {
    setProcessingSeparar(true);
    try {
      await Promise.all(itens.map(r => updateDoc(doc(db, 'nightrun_registrations', r.id), {
        kitRetiradoEm: serverTimestamp(),
        kitRetiradoPor: nome,
        kitRetiradoTerceiro: true,
      })));
      setFeedback({ text: `${itens.length} kit(s) de ${nome.toUpperCase()} confirmado(s) como retirado(s).`, type: 'success' });
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao confirmar a retirada do grupo.', type: 'error' });
    } finally {
      setProcessingSeparar(false);
    }
  };

  // Upgrade de kit na hora da retirada (ex: pessoa quer levar um kit melhor do que o que
  // escolheu na inscrição) - só troca o campo `kit`, sem mexer em pagamento/valor.
  const trocarKit = async (reg: Reg, novoKitId: string) => {
    setTrocandoKit(true);
    try {
      await updateDoc(doc(db, 'nightrun_registrations', reg.id), { kit: novoKitId });
      setFeedback({ text: `Kit de ${reg.nome.toUpperCase()} alterado para ${resolveKitNome(kits, novoKitId, 'Kit Único').toUpperCase()}.`, type: 'success' });
      setMostrarSeletorKit(false);
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao trocar o kit. Tente novamente.', type: 'error' });
    } finally {
      setTrocandoKit(false);
    }
  };

  const handleLogout = () => {
    signOut(auth).catch(() => {});
    localStorage.removeItem('nightrun_admin_auth');
    localStorage.removeItem('nightrun_staff_kits_auth');
    navigate('/admin/login');
  };

  if (authLoading || !user || role !== 'admin' && role !== 'staff_kits') return null;

  const selecionadosArr = Object.values(selecionadosMultipla);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45' }}>
      <header style={{
        background: 'linear-gradient(135deg, #071A45, #123068)', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PackageCheck size={28} color="#6BFF2A" />
          <div>
            <h1 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>RETIRADA DE KITS</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', margin: 0 }}>MCU Night Run 2026</p>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={16} /> Sair
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 100px' }}>
        <div style={{ display: 'flex', gap: 6, background: '#e2e8f0', padding: 5, borderRadius: 14, marginBottom: 20, flexWrap: 'wrap' }}>
          {([
            { key: 'propria', label: 'Retirada própria', icon: null },
            { key: 'unica_terceiro', label: 'Única (terceiro)', icon: UserIcon },
            { key: 'multipla_terceiro', label: 'Múltipla (terceiro)', icon: Users },
            { key: 'separar', label: 'Separar Kits', icon: Package },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => { setModo(tab.key); setSelecionadosMultipla({}); if (tab.key !== 'separar') cancelarEdicaoSeparacao(); }}
              style={{
                flex: '1 1 140px', padding: '14px 10px', borderRadius: 10, border: 'none', fontWeight: 900, fontSize: '0.82rem', cursor: 'pointer',
                background: modo === tab.key ? '#fff' : 'transparent', color: modo === tab.key ? '#071A45' : '#64748b',
                boxShadow: modo === tab.key ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {tab.icon && <tab.icon size={16} />} {tab.label}
            </button>
          ))}
          <button
            onClick={() => setModo('historico')}
            style={{
              flex: '1 1 140px', padding: '14px 10px', borderRadius: 10, border: 'none', fontWeight: 900, fontSize: '0.82rem', cursor: 'pointer',
              background: modo === 'historico' ? '#fff' : 'transparent', color: modo === 'historico' ? '#071A45' : '#64748b',
              boxShadow: modo === 'historico' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <History size={16} /> Histórico ({regs.filter(r => r.kitRetiradoEm).length})
          </button>
          <button
            onClick={() => setModo('relatorio')}
            style={{
              flex: '1 1 140px', padding: '14px 10px', borderRadius: 10, border: 'none', fontWeight: 900, fontSize: '0.82rem', cursor: 'pointer',
              background: modo === 'relatorio' ? '#fff' : 'transparent', color: modo === 'relatorio' ? '#071A45' : '#64748b',
              boxShadow: modo === 'relatorio' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <FileText size={16} /> Faltam entregar ({regs.filter(r => !r.kitRetiradoEm).length})
          </button>
        </div>

        {(modo === 'unica_terceiro' || modo === 'multipla_terceiro') && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, border: '2px solid #071A45' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Nome de quem está retirando {modo === 'multipla_terceiro' ? 'os kits' : 'o kit'}
            </label>
            <input
              value={terceiroNome}
              onChange={e => setTerceiroNome(e.target.value)}
              placeholder="Nome completo da pessoa"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '1rem', marginBottom: modo === 'multipla_terceiro' ? 12 : 0 }}
            />
            {modo === 'multipla_terceiro' && (
              <>
                {selecionadosArr.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                    {selecionadosArr.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, overflow: 'hidden', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {r.fotoUrl ? <img src={r.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={18} color="#16a34a" />}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ fontSize: '0.85rem', color: '#071A45' }}>{r.nome.toUpperCase()}</strong>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              {r.modalidadeNome ? `${r.modalidadeNome} · ` : ''}{kitNomeDe(r)}{r.numeroInscricao ? ` · Nº ${r.numeroInscricao}` : ''}
                              {camisetaInfoDe(r) ? ` · ${camisetaInfoDe(r)!.tamanho} (${camisetaInfoDe(r)!.tipo})` : ''}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => toggleMultipla(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={confirmarRetiradaMultipla}
                  disabled={processingMultipla || selecionadosArr.length === 0}
                  style={{
                    width: '100%', background: selecionadosArr.length === 0 ? '#cbd5e1' : '#6BFF2A',
                    color: '#071A45', border: 'none', borderRadius: 12, padding: '16px', fontWeight: 900, fontSize: '1rem',
                    cursor: selecionadosArr.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <CheckCircle2 size={20} />
                  CONFIRMAR RETIRADA DE {selecionadosArr.length} KIT(S)
                </button>
              </>
            )}
          </div>
        )}

        {modo === 'separar' && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, border: '2px solid #7c3aed' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>
                {editandoGrupo ? `Editando separação de ${editandoGrupo.toUpperCase()}` : 'Nome de quem vai buscar os kits'}
              </label>
              {editandoGrupo && (
                <button onClick={cancelarEdicaoSeparacao} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 800 }}>
                  CANCELAR EDIÇÃO
                </button>
              )}
            </div>
            <input
              value={separarNome}
              onChange={e => setSepararNome(e.target.value)}
              placeholder="Nome completo da pessoa"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '1rem', marginBottom: 12 }}
            />
            {Object.values(selecionadosSeparar).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {Object.values(selecionadosSeparar).map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, overflow: 'hidden', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {r.fotoUrl ? <img src={r.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={18} color="#7c3aed" />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: '0.85rem', color: '#071A45' }}>{r.nome.toUpperCase()}</strong>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {r.modalidadeNome ? `${r.modalidadeNome} · ` : ''}{kitNomeDe(r)}{r.numeroInscricao ? ` · Nº ${r.numeroInscricao}` : ''}
                          {camisetaInfoDe(r) ? ` · ${camisetaInfoDe(r)!.tamanho} (${camisetaInfoDe(r)!.tipo})` : ''}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => toggleSeparar(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={confirmarSeparacao}
              disabled={processingSeparar || Object.keys(selecionadosSeparar).length === 0}
              style={{
                width: '100%', background: Object.keys(selecionadosSeparar).length === 0 ? '#cbd5e1' : '#7c3aed',
                color: '#fff', border: 'none', borderRadius: 12, padding: '16px', fontWeight: 900, fontSize: '1rem',
                cursor: Object.keys(selecionadosSeparar).length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Package size={20} />
              {editandoGrupo ? 'SALVAR ALTERAÇÕES' : `SEPARAR ${Object.keys(selecionadosSeparar).length} KIT(S)`}
            </button>

            {separacoesPendentes.length > 0 && (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 900, color: '#7c3aed', textTransform: 'uppercase', marginBottom: 10 }}>
                  Separações pendentes ({separacoesPendentes.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {separacoesPendentes.map(([nome, itens]) => {
                    const cpfTerceiro = itens.find(r => r.kitSeparadoParaCpf)?.kitSeparadoParaCpf;
                    return (
                    <div key={nome} style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12, padding: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <strong style={{ fontSize: '0.9rem', color: '#071A45' }}>{nome.toUpperCase()}</strong>
                          {cpfTerceiro && <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700 }}>CPF: {maskCpfDisplay(cpfTerceiro)}</div>}
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#7c3aed' }}>{itens.length} kit(s)</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                        {itens.map(r => (
                          <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{r.nome.toUpperCase()}</span>
                            <button
                              type="button"
                              onClick={() => imprimirFicha(r)}
                              title="Imprimir ficha deste atleta"
                              style={{
                                background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 7,
                                padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontWeight: 800, fontSize: '0.65rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                              }}
                            >
                              <Printer size={11} /> IMPRIMIR
                            </button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => marcarSeparacaoComoPego(nome, itens)}
                          disabled={processingSeparar}
                          style={{ background: '#071A45', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}
                        >
                          MARCAR COMO PEGO
                        </button>
                        <button
                          onClick={() => editarGrupoSeparacao(nome, itens)}
                          style={{ background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}
                        >
                          EDITAR
                        </button>
                        <button
                          onClick={() => apagarSeparacao(itens)}
                          disabled={processingSeparar}
                          style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer' }}
                        >
                          APAGAR
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {modo !== 'relatorio' && (
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <Search size={20} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={modo === 'historico' ? 'Filtrar histórico por nome, CPF, telefone, nº ou quem retirou...' : 'Buscar por nome, CPF, telefone ou número de inscrição...'}
              autoFocus
              style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: 14, border: '2px solid #071A45', fontSize: '1rem', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {feedback && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontWeight: 800, fontSize: '0.85rem',
            background: feedback.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: feedback.type === 'success' ? '#166534' : '#b91c1c',
          }}>
            {feedback.text}
          </div>
        )}

        {modo === 'relatorio' ? (
          <RelatorioPendentesBlock
            regs={regs}
            kits={kits}
            camisetas={camisetas}
            kitNomeDe={kitNomeDe}
            camisetaInfoDe={camisetaInfoDe}
          />
        ) : modo === 'historico' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              {([
                { key: 'todos', label: 'Todos' },
                { key: 'propria', label: 'Retirada própria' },
                { key: 'terceiro', label: 'Por terceiro' },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setFiltroTipo(opt.key)}
                  style={{
                    background: filtroTipo === opt.key ? '#071A45' : '#fff', color: filtroTipo === opt.key ? '#fff' : '#334155',
                    border: '1px solid #cbd5e1', borderRadius: 20, padding: '8px 14px', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <select
                value={filtroKitId}
                onChange={e => setFiltroKitId(e.target.value)}
                style={{ border: '1px solid #cbd5e1', borderRadius: 20, padding: '8px 14px', fontWeight: 800, fontSize: '0.75rem', color: '#334155', background: '#fff', cursor: 'pointer' }}
              >
                <option value="">Todos os kits</option>
                {kits.map(k => <option key={k.id} value={k.id}>{k.nome}</option>)}
              </select>
            </div>
            <button
              onClick={generateHistoricoPdf}
              disabled={gerandoPdfHistorico || historico.length === 0}
              style={{
                alignSelf: 'flex-end', background: historico.length === 0 ? '#cbd5e1' : '#071A45', color: '#fff',
                border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 800, fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', gap: 8, cursor: historico.length === 0 ? 'not-allowed' : 'pointer', marginBottom: 4,
              }}
            >
              <FileDown size={16} /> {gerandoPdfHistorico ? 'GERANDO PDF...' : 'GERAR PDF DO HISTÓRICO'}
            </button>
            {historico.length === 0 && (
              <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>Nenhuma retirada registrada ainda.</p>
            )}
            {historico.map(r => {
              const data = r.kitRetiradoEm?.toDate ? r.kitRetiradoEm.toDate() : new Date(r.kitRetiradoEm);
              const hora = Number.isNaN(data.getTime()) ? '--:--' : data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={r.id} style={{ background: '#fff', borderRadius: 14, padding: 16, border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#dcfce7', color: '#16a34a', overflow: 'hidden' }}>
                    {r.fotoUrl ? <img src={r.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <CheckCircle2 size={22} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <strong style={{ fontSize: '0.95rem', color: '#071A45' }}>{r.nome.toUpperCase()}</strong>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      {r.modalidadeNome ? `${r.modalidadeNome} · ` : ''}{kitNomeDe(r)}{r.numeroInscricao ? ` · Nº ${r.numeroInscricao}` : ''}
                      {r.endereco?.cidade ? ` · ${r.endereco.cidade}${r.endereco.uf ? `/${r.endereco.uf}` : ''}` : ''}
                    </div>
                    <div><CamisetaBadge r={r} /></div>
                    <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, marginTop: 4 }}>
                      Retirado por {(r.kitRetiradoPor || r.nome).toUpperCase()}{r.kitRetiradoTerceiro ? ' (terceiro)' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ fontWeight: 900, color: '#071A45', fontSize: '1rem', whiteSpace: 'nowrap' }}>{hora}</div>
                    <VerDetalhesLink r={r} />
                    <ImprimirFichaLink r={r} />
                    <button
                      onClick={() => setDesfazerAlvo(r)}
                      style={{
                        background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 10,
                        padding: '10px 12px', display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      <X size={14} /> DESFAZER
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <>
        {search.trim().length >= 2 && results.length === 0 && (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>Nenhum confirmado encontrado.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map(r => {
            const jaRetirado = Boolean(r.kitRetiradoEm);
            const selecionado = Boolean(selecionadosMultipla[r.id]);
            const separadoSelecionado = Boolean(selecionadosSeparar[r.id]);
            const jaSeparado = Boolean(r.kitSeparadoPara) && !jaRetirado;
            return (
              <div key={r.id} style={{
                background: '#fff', borderRadius: 14, padding: 16,
                border: (selecionado || separadoSelecionado) ? '2px solid #071A45' : jaRetirado ? '1px solid #bbf7d0' : jaSeparado ? '1px solid #e9d5ff' : '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: jaRetirado ? '#dcfce7' : '#eff6ff', color: jaRetirado ? '#16a34a' : '#2563eb', overflow: 'hidden',
                }}>
                  {r.fotoUrl ? (
                    <img src={r.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : jaRetirado ? <CheckCircle2 size={22} /> : <UserIcon size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <strong style={{ fontSize: '0.95rem', color: '#071A45' }}>{r.nome.toUpperCase()}</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                    {r.modalidadeNome ? `${r.modalidadeNome} · ` : ''}{kitNomeDe(r)}{r.numeroInscricao ? ` · Nº ${r.numeroInscricao}` : ''}
                    {r.endereco?.cidade ? ` · ${r.endereco.cidade}${r.endereco.uf ? `/${r.endereco.uf}` : ''}` : ''}
                  </div>
                  <div><CamisetaBadge r={r} /></div>
                  {jaRetirado && (
                    <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, marginTop: 4 }}>
                      Retirado por {(r.kitRetiradoPor || r.nome).toUpperCase()}{r.kitRetiradoTerceiro ? ' (terceiro)' : ''}
                    </div>
                  )}
                  {jaSeparado && (
                    <div style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 700, marginTop: 4 }}>
                      Separado para {r.kitSeparadoPara!.toUpperCase()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                  {modo === 'multipla_terceiro' ? (
                    <label style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      background: selecionado ? '#071A45' : '#f1f5f9', color: selecionado ? '#fff' : '#334155',
                      borderRadius: 10, padding: '12px 18px', fontWeight: 800, fontSize: '0.8rem', whiteSpace: 'nowrap',
                    }}>
                      <input
                        type="checkbox"
                        checked={selecionado}
                        onChange={() => toggleMultipla(r)}
                        style={{ display: 'inline-block', width: 18, height: 18, cursor: 'pointer' }}
                      />
                      {selecionado ? 'SELECIONADO' : 'MARCAR'}
                    </label>
                  ) : modo === 'separar' ? (
                    <label style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
                      background: separadoSelecionado ? '#7c3aed' : '#f1f5f9', color: separadoSelecionado ? '#fff' : '#334155',
                      borderRadius: 10, padding: '12px 18px', fontWeight: 800, fontSize: '0.8rem', whiteSpace: 'nowrap',
                    }}>
                      <input
                        type="checkbox"
                        checked={separadoSelecionado}
                        onChange={() => toggleSeparar(r)}
                        style={{ display: 'inline-block', width: 18, height: 18, cursor: 'pointer' }}
                      />
                      {separadoSelecionado ? 'SELECIONADO' : 'MARCAR'}
                    </label>
                  ) : (
                    <button
                      onClick={() => handleConfirmarLinha(r)}
                      disabled={processingId === r.id}
                      style={{
                        background: jaRetirado ? '#f1f5f9' : '#071A45', color: jaRetirado ? '#64748b' : '#fff',
                        border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 800, fontSize: '0.8rem',
                        cursor: processingId === r.id ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {jaRetirado ? 'JÁ RETIRADO' : 'CONFIRMAR RETIRADA'}
                    </button>
                  )}
                  <VerDetalhesLink r={r} />
                  <ImprimirFichaLink r={r} />
                </div>
              </div>
            );
          })}
        </div>
        </>
        )}
      </div>

      {confirmarDuplicado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 380, width: '100%', padding: 28, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <AlertTriangle size={28} color="#d97706" />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#071A45', marginBottom: 8 }}>Este kit já foi retirado</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20 }}>
              O kit de <strong>{confirmarDuplicado.reg.nome.toUpperCase()}</strong> já consta como retirado por{' '}
              <strong>{(confirmarDuplicado.reg.kitRetiradoPor || confirmarDuplicado.reg.nome).toUpperCase()}</strong>. Confirmar mesmo assim?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmarDuplicado(null)} style={{ flex: 1, padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => registrarRetirada(confirmarDuplicado.reg, confirmarDuplicado.nome, confirmarDuplicado.terceiro)}
                style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: '#d97706', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                Confirmar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {desfazerAlvo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 380, width: '100%', padding: 28, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <AlertTriangle size={28} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#071A45', marginBottom: 8 }}>Desfazer esta retirada</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20 }}>
              O kit de <strong>{desfazerAlvo.nome.toUpperCase()}</strong> vai voltar a aparecer como pendente. Tem certeza?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDesfazerAlvo(null)} style={{ flex: 1, padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => desfazerRetirada(desfazerAlvo)}
                disabled={desfazendo}
                style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 800, cursor: desfazendo ? 'wait' : 'pointer' }}
              >
                {desfazendo ? 'Desfazendo...' : 'Desfazer retirada'}
              </button>
            </div>
          </div>
        </div>
      )}

      {relatorioOcultoVisivel && !mostrarModalRelatorioDiario && (
        <button
          onClick={() => setMostrarModalRelatorioDiario(true)}
          title="Relatório diário (Ctrl+' pra esconder de novo)"
          style={{
            position: 'fixed', bottom: 16, left: 16, zIndex: 999, background: '#071A45', color: '#fff',
            border: 'none', borderRadius: 12, padding: '10px 16px', fontWeight: 800, fontSize: '0.72rem',
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <FileText size={14} /> RELATÓRIO DIÁRIO
        </button>
      )}

      {mostrarModalRelatorioDiario && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 380, width: '100%', padding: 28 }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Relatório diário</h3>
            <p style={{ color: '#64748b', fontSize: '0.82rem', marginBottom: 18 }}>
              Escolha o dia. O PDF sai no mesmo padrão visual dos outros relatórios do evento.
            </p>
            <label style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Data
            </label>
            <input
              type="date"
              value={dataRelatorioDiario}
              onChange={e => setDataRelatorioDiario(e.target.value)}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '2px solid #071A45', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: 20 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setMostrarModalRelatorioDiario(false)}
                style={{ flex: 1, padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={() => gerarRelatorioDiarioPdf(dataRelatorioDiario)}
                disabled={gerandoRelatorioDiario || !dataRelatorioDiario}
                style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: '#071A45', color: '#fff', fontWeight: 800, cursor: gerandoRelatorioDiario ? 'wait' : 'pointer' }}
              >
                {gerandoRelatorioDiario ? 'Gerando...' : 'Gerar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalhesReg && (() => {
        // `regs` vem do onSnapshot com o documento completo (Firestore não filtra campos na
        // leitura) - o tipo Reg só declara o subconjunto usado nos cards, mas os outros campos
        // (email, sexo, endereço completo, saúde, etc.) já estão em memória, sem custo extra.
        // Busca a versão mais recente do reg em `regs` (atualizado ao vivo pelo onSnapshot)
        // em vez de usar o objeto congelado de quando o modal abriu - assim, depois de trocar
        // o kit por exemplo, o modal já reflete a mudança na hora.
        const liveReg = regs.find(r => r.id === detalhesReg.id) || detalhesReg;
        const d = liveReg as any;
        const InfoRow = ({ icon: Icon, label, value }: { icon: any; label: string; value: any }) => {
          if (!value) return null;
          return (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
              <Icon size={15} color="#94a3b8" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontSize: '0.88rem', color: '#071A45', fontWeight: 600 }}>{value}</div>
              </div>
            </div>
          );
        };
        const camisetaInfo = camisetaInfoDe(liveReg);
        const endereco = d.endereco?.rua
          ? `${d.endereco.rua}${d.endereco.numero ? `, ${d.endereco.numero}` : ''} - ${d.endereco.bairro || ''}, ${d.endereco.cidade || ''}/${d.endereco.uf || ''}`
          : (d.endereco?.cidade ? `${d.endereco.cidade}/${d.endereco.uf || ''}` : '');

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
            <div style={{ background: '#fff', borderRadius: 20, maxWidth: 480, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)' }}>
              <div style={{
                padding: '20px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 14,
                position: 'sticky', top: 0, background: '#fff', zIndex: 1,
              }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, flexShrink: 0, overflow: 'hidden', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {d.fotoUrl ? <img src={d.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={26} color="#2563eb" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#071A45', margin: 0 }}>{d.nome?.toUpperCase()}</h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {d.paymentStatus === 'pago' ? 'Pagamento confirmado' : 'Aguardando pagamento'}
                    {d.numeroInscricao ? ` · Nº ${d.numeroInscricao}` : ''}
                  </div>
                </div>
                <button onClick={() => setDetalhesReg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}>
                  <X size={22} />
                </button>
              </div>

              <div style={{ padding: '4px 24px 24px' }}>
                <InfoRow icon={UserIcon} label="CPF" value={d.cpf} />
                <InfoRow icon={Phone} label="WhatsApp" value={d.telefone} />
                <InfoRow icon={Mail} label="E-mail" value={d.email} />
                <InfoRow icon={UserIcon} label="Data de nascimento" value={d.dataNascimento ? formatDateBR(d.dataNascimento) : ''} />
                <InfoRow icon={Flag} label="Modalidade" value={d.modalidadeNome || (d.categoria === 'infantil' ? 'Infantil' : '')} />
                <InfoRow icon={Package} label="Kit" value={`${kitNomeDe(liveReg)}${camisetaInfo ? ` · ${camisetaInfo.tamanho} (${camisetaInfo.tipo})` : ''}`} />
                <div style={{ padding: '4px 0 12px 25px' }}>
                  {!mostrarSeletorKit ? (
                    <button
                      type="button"
                      onClick={() => setMostrarSeletorKit(true)}
                      style={{
                        background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 8,
                        padding: '8px 14px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Package size={13} /> FAZER UPGRADE DE KIT
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>
                        Escolher novo kit
                      </span>
                      {kits.map(k => (
                        <button
                          key={k.id}
                          type="button"
                          onClick={() => trocarKit(liveReg, k.id)}
                          disabled={trocandoKit || k.id === liveReg.kit}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left',
                            background: k.id === liveReg.kit ? '#f0fdf4' : '#f8fafc',
                            border: k.id === liveReg.kit ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                            borderRadius: 8, padding: '8px 12px', cursor: k.id === liveReg.kit ? 'default' : 'pointer',
                            fontSize: '0.8rem', fontWeight: 700, color: '#071A45',
                          }}
                        >
                          {k.nome}
                          {k.id === liveReg.kit && <CheckCircle2 size={14} color="#16a34a" />}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setMostrarSeletorKit(false)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', textAlign: 'left', marginTop: 2 }}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
                <InfoRow icon={MapPin} label="Endereço" value={endereco} />
                {d.responsavelNome && <InfoRow icon={UserIcon} label="Responsável" value={`${d.responsavelNome}${d.responsavelCpf ? ` · CPF ${d.responsavelCpf}` : ''}`} />}
                {(d.saude?.tipoSanguineo || d.saude?.condicaoSaude || d.saude?.alergiaDesc) && (
                  <InfoRow
                    icon={HeartPulse}
                    label="Saúde"
                    value={[
                      d.saude?.tipoSanguineo ? `Tipo sanguíneo: ${d.saude.tipoSanguineo}` : '',
                      d.saude?.condicaoSaude ? `Condição: ${d.saude.condicaoSaude}` : '',
                      d.saude?.alergiaDesc ? `Alergias: ${d.saude.alergiaDesc}` : '',
                    ].filter(Boolean).join(' · ')}
                  />
                )}
                {d.contatoEmergencia?.nome && (
                  <InfoRow icon={Phone} label="Contato de emergência" value={`${d.contatoEmergencia.nome}${d.contatoEmergencia.telefone ? ` · ${d.contatoEmergencia.telefone}` : ''}`} />
                )}
                {d.kitRetiradoEm && (
                  <div style={{ marginTop: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, fontSize: '0.8rem', color: '#166534', fontWeight: 700 }}>
                    Kit retirado por {(d.kitRetiradoPor || d.nome).toUpperCase()}{d.kitRetiradoTerceiro ? ' (terceiro)' : ''}
                  </div>
                )}
                {role === 'admin' && (
                  <a
                    href={`/admin/inscritos/${detalhesReg.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18,
                      background: '#071A45', color: '#fff', borderRadius: 10, padding: '12px', fontWeight: 800,
                      fontSize: '0.8rem', textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={15} /> ABRIR FICHA COMPLETA (EDITAR)
                  </a>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Relatorio de quem ainda nao retirou o kit - lista compacta na tela (mesmas colunas da
// tabela) e PDF no mesmo padrao visual navy/stripe/header.png dos outros relatorios do
// evento (ex: handleExportKitPdf em AdminKits.tsx), so que aqui filtrado por pendencia em
// vez de por kit. Camiseta so aparece pra quem esta num kit que inclui camiseta (Kit
// Master) - os demais kits nao tem esse item, entao a coluna fica em branco pra eles.
function RelatorioPendentesBlock({ regs, kits, camisetas, kitNomeDe, camisetaInfoDe }: {
  regs: Reg[];
  kits: KitRecord[];
  camisetas: any[];
  kitNomeDe: (r: Reg) => string;
  camisetaInfoDe: (r: Reg) => { tamanho: string; tipo: string } | null;
}) {
  const [gerando, setGerando] = useState(false);

  const pendentes = useMemo(() => regs
    .filter(r => !r.kitRetiradoEm)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [regs]
  );

  const temCamisetaDe = (r: Reg) => {
    const kitDoc = kits.find(k => k.id === r.kit);
    return Boolean(kitDoc?.itens?.some(item => item.toUpperCase().includes('CAMISETA')));
  };

  const tamanhoDe = (r: Reg) => {
    if (!temCamisetaDe(r)) return '';
    const info = camisetaInfoDe(r);
    if (!info) return '';
    return `${info.tamanho} (${info.tipo})`;
  };

  // Tipo detalhado em 4 grupos (o resumo impresso pede essa granularidade, diferente do
  // badge/coluna normal que colapsa tudo que e infantil em "Infantil" mesmo sendo baby look).
  const tipoDetalhadoDe = (r: Reg): string | null => {
    if (!r.tamanhoCamiseta) return null;
    const item = camisetas.find(c => c.id === r.tamanhoCamiseta);
    if (!item) return null;
    const isBabyLook = item.tipo === 'Baby Look';
    const isInfantil = item.categoria === 'infantil';
    if (isInfantil && isBabyLook) return 'Baby Look Infantil';
    if (isInfantil) return 'Infantil';
    if (isBabyLook) return 'Baby Look';
    return 'Normal';
  };

  const ORDEM_TIPO = ['Normal', 'Baby Look', 'Infantil', 'Baby Look Infantil'];

  const resumo = useMemo(() => {
    const masterPendentes = pendentes.filter(temCamisetaDe);
    const extraPendentes = pendentes.filter(r => !temCamisetaDe(r));
    const grupos = new Map<string, { tipo: string; tamanho: string; qtd: number }>();
    masterPendentes.forEach(r => {
      const tipo = tipoDetalhadoDe(r);
      const info = camisetaInfoDe(r);
      if (!tipo || !info) return;
      const key = `${tipo}|${info.tamanho}`;
      const atual = grupos.get(key);
      if (atual) atual.qtd += 1;
      else grupos.set(key, { tipo, tamanho: info.tamanho, qtd: 1 });
    });
    const linhas = Array.from(grupos.values()).sort((a, b) => {
      const ta = ORDEM_TIPO.indexOf(a.tipo);
      const tb = ORDEM_TIPO.indexOf(b.tipo);
      if (ta !== tb) return ta - tb;
      return a.tamanho.localeCompare(b.tamanho, 'pt-BR', { numeric: true });
    });
    return {
      total: pendentes.length,
      extra: extraPendentes.length,
      master: masterPendentes.length,
      masterSemTamanho: masterPendentes.length - linhas.reduce((s, l) => s + l.qtd, 0),
      linhas,
    };
  }, [pendentes, camisetas, kits]);

  // Folha unica de resumo (nao a lista de nomes) - abre direto o dialogo de impressao do
  // navegador via iframe escondido, mesmo padrao usado no botao IMPRIMIR das fichas.
  const imprimirResumo = () => {
    const NAVY = '#071A45';
    const linhasHtml = resumo.linhas.map(l => `
      <tr>
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(l.tipo)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(l.tamanho)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:800;">${l.qtd}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Kits pendentes</title>
      <style>
        @page { size: A4 portrait; margin: 14mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: ${NAVY}; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; background: ${NAVY}; color: #fff; padding: 8px 10px; font-size: 0.8rem; }
      </style>
      </head><body>
        <h1 style="font-size:1.4rem;margin-bottom:4px;">KITS PENDENTES DE ENTREGA</h1>
        <p style="color:#64748b;font-size:0.85rem;margin-top:0;">Gerado em ${escapeHtml(new Date().toLocaleString('pt-BR'))}</p>
        <div style="display:flex;gap:12px;margin:16px 0;">
          <div style="flex:1;background:#f1f5f9;border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:1.8rem;font-weight:900;">${resumo.total}</div>
            <div style="font-size:0.75rem;color:#64748b;font-weight:700;">TOTAL PENDENTE</div>
          </div>
          <div style="flex:1;background:#eff6ff;border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:1.8rem;font-weight:900;color:#2563eb;">${resumo.extra}</div>
            <div style="font-size:0.75rem;color:#64748b;font-weight:700;">EXTRA (SEM CAMISETA)</div>
          </div>
          <div style="flex:1;background:#f0fdf4;border-radius:10px;padding:14px;text-align:center;">
            <div style="font-size:1.8rem;font-weight:900;color:#16a34a;">${resumo.master}</div>
            <div style="font-size:0.75rem;color:#64748b;font-weight:700;">MASTER (COM CAMISETA)</div>
          </div>
        </div>
        <h2 style="font-size:1rem;margin-bottom:8px;">Kit Master por tamanho</h2>
        <table>
          <thead><tr><th>TIPO</th><th>TAMANHO</th><th style="text-align:right;">QTD.</th></tr></thead>
          <tbody>${linhasHtml || '<tr><td colspan="3" style="padding:10px;color:#94a3b8;">Nenhum kit master pendente.</td></tr>'}</tbody>
        </table>
        ${resumo.masterSemTamanho > 0 ? `<p style="margin-top:10px;font-size:0.78rem;color:#b45309;">${resumo.masterSemTamanho} kit(s) master pendente(s) sem tamanho de camiseta cadastrado.</p>` : ''}
      </body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
    iframe.onload = () => setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error('Erro ao abrir impressão do resumo:', e);
      }
      setTimeout(cleanup, 1000);
    }, 150);
    const doc2 = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc2) {
      doc2.open();
      doc2.write(html);
      doc2.close();
    }
  };

  const gerarPdf = async () => {
    setGerando(true);
    try {
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
      const titleText = 'FALTAM ENTREGAR';
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
      const titleImgH = 11;
      const titleImgW = titleImgH * titleImgAspect;

      const docPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = docPdf.internal.pageSize.getWidth();
      const pageH = docPdf.internal.pageSize.getHeight();
      const marginX = 14;
      const marginBottom = 14;
      const headerAspect = 2172 / 724;
      const headerW = pageW;
      const headerH = headerW / headerAspect;
      const NAVY: [number, number, number] = [7, 26, 69];
      const STRIPE: [number, number, number] = [241, 245, 249];

      const drawHeader = () => {
        try {
          docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'relatorio-pendentes-pdf-header', 'FAST');
        } catch {
          docPdf.setFillColor(...NAVY);
          docPdf.rect(0, 0, pageW, headerH, 'F');
        }
      };

      const usableW = pageW - marginX * 2;
      const colNomeW = usableW * 0.30;
      const colCpfW = usableW * 0.16;
      const colModalidadeW = usableW * 0.20;
      const colKitW = usableW * 0.15;
      const colTamanhoW = usableW * 0.19;
      const colCpfX = marginX + colNomeW;
      const colModalidadeX = colCpfX + colCpfW;
      const colKitX = colModalidadeX + colModalidadeW;
      const colTamanhoX = colKitX + colKitW;
      const rowH = 6.4;

      let y = 0;

      const drawTableHeader = () => {
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 7.5, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(7.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('NOME', marginX + 2.5, y + 5.2);
        docPdf.text('CPF', colCpfX + 2.5, y + 5.2);
        docPdf.text('MODALIDADE', colModalidadeX + 2.5, y + 5.2);
        docPdf.text('KIT', colKitX + 2.5, y + 5.2);
        docPdf.text('TAM.', colTamanhoX + 2.5, y + 5.2);
        y += 7.5;
      };

      const newPage = () => {
        docPdf.addPage();
        drawHeader();
        y = headerH + 8;
        drawTableHeader();
      };

      drawHeader();
      y = headerH + 8;
      docPdf.addImage(titleImgData, 'PNG', marginX, y - titleImgH + 3, titleImgW, titleImgH, undefined, 'FAST');
      y += 5;
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(8.5);
      docPdf.setTextColor(100, 116, 139);
      docPdf.text(`${pendentes.length} kit(s) ainda não retirado(s).`, marginX, y);
      y += 5;
      drawTableHeader();

      if (pendentes.length === 0) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(9);
        docPdf.setTextColor(100, 116, 139);
        docPdf.text('Todos os kits já foram retirados.', marginX, y + 6);
      }

      pendentes.forEach((r, idx) => {
        if (y + rowH > pageH - marginBottom) newPage();

        if (idx % 2 === 1) {
          docPdf.setFillColor(...STRIPE);
          docPdf.rect(marginX, y, usableW, rowH, 'F');
        }

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(7.4);
        docPdf.setTextColor(...NAVY);
        const nomeLine = docPdf.splitTextToSize(r.nome.toUpperCase(), colNomeW - 3)[0];
        const modalidadeLine = docPdf.splitTextToSize(r.modalidadeNome || '-', colModalidadeW - 3)[0];
        const kitLine = docPdf.splitTextToSize(kitNomeDe(r), colKitW - 3)[0];
        const tamanhoLine = docPdf.splitTextToSize(tamanhoDe(r) || '-', colTamanhoW - 3)[0];
        docPdf.text(nomeLine, marginX + 2.5, y + rowH / 2 + 1.2);
        docPdf.text(maskCpfDisplay(r.cpf), colCpfX + 2.5, y + rowH / 2 + 1.2);
        docPdf.text(modalidadeLine, colModalidadeX + 2.5, y + rowH / 2 + 1.2);
        docPdf.text(kitLine, colKitX + 2.5, y + rowH / 2 + 1.2);
        docPdf.text(tamanhoLine, colTamanhoX + 2.5, y + rowH / 2 + 1.2);
        y += rowH;
      });

      docPdf.save(`faltam-entregar-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error('Erro ao gerar relatorio de pendentes:', e);
    } finally {
      setGerando(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#64748b' }}>{pendentes.length} kit(s) ainda não retirado(s)</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={imprimirResumo}
            disabled={pendentes.length === 0}
            style={{
              background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 10,
              padding: '10px 16px', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Printer size={14} /> IMPRIMIR RESUMO
          </button>
          <button
            onClick={gerarPdf}
            disabled={gerando || pendentes.length === 0}
            style={{
              background: gerando ? '#94a3b8' : '#071A45', color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 16px', fontWeight: 800, fontSize: '0.78rem', cursor: gerando ? 'wait' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <FileDown size={14} /> {gerando ? 'GERANDO...' : 'GERAR PDF'}
          </button>
        </div>
      </div>

      {pendentes.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>Todos os kits já foram retirados.</p>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ background: '#071A45', color: '#fff' }}>
                <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 800 }}>NOME</th>
                <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 800 }}>CPF</th>
                <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 800 }}>MODALIDADE</th>
                <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 800 }}>KIT</th>
                <th style={{ textAlign: 'left', padding: '7px 8px', fontWeight: 800 }}>TAM.</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map((r, idx) => (
                <tr key={r.id} style={{ background: idx % 2 === 1 ? '#f1f5f9' : 'transparent' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: '#071A45', whiteSpace: 'nowrap' }}>{r.nome.toUpperCase()}</td>
                  <td style={{ padding: '6px 8px', color: '#475569', whiteSpace: 'nowrap' }}>{maskCpfDisplay(r.cpf)}</td>
                  <td style={{ padding: '6px 8px', color: '#475569', whiteSpace: 'nowrap' }}>{r.modalidadeNome || '-'}</td>
                  <td style={{ padding: '6px 8px', color: '#475569', whiteSpace: 'nowrap' }}>{kitNomeDe(r)}</td>
                  <td style={{ padding: '6px 8px', color: '#475569', whiteSpace: 'nowrap' }}>{tamanhoDe(r) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
