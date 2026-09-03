import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, getDoc, addDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import {
  CheckSquare, Square, FileSpreadsheet, Download, Filter, Rows3, LayoutGrid,
  Columns3, SlidersHorizontal, Users2, Bookmark, Plus, Trash2, X, CalendarDays, Type, Landmark, Package,
} from 'lucide-react';
import { db } from '../../firebase';
import { type Modalidade } from '../../types';
import { formatDateBR, formatDateTimeBR, toDateValue } from '../../utils/dateUtils';
import { formatCamisetaLabel, getCamisetaShortLabel } from '../../utils/camisetaUtils';
import { fetchKits, resolveKitNome, type KitRecord } from '../../utils/kitsUtils';
import { useDialog } from '../../context/CustomDialogContext';

type ColumnDef = { id: string; label: string; group: string; always?: boolean };

const COLUMN_DEFS: ColumnDef[] = [
  { id: 'nome', label: 'Nome completo', group: 'Identificação', always: true },
  { id: 'cpf', label: 'CPF', group: 'Identificação' },
  { id: 'dataNascimento', label: 'Data de nascimento', group: 'Identificação' },
  { id: 'idade', label: 'Idade', group: 'Identificação' },
  { id: 'sexo', label: 'Gênero', group: 'Identificação' },
  { id: 'responsavel', label: 'Responsável (menor de idade)', group: 'Identificação' },
  { id: 'email', label: 'E-mail', group: 'Contato' },
  { id: 'telefone', label: 'WhatsApp', group: 'Contato' },
  { id: 'modalidade', label: 'Modalidade', group: 'Prova & Equipe' },
  { id: 'distancia', label: 'Distância', group: 'Prova & Equipe' },
  { id: 'categoria', label: 'Categoria', group: 'Prova & Equipe' },
  { id: 'equipe', label: 'Equipe / Time', group: 'Prova & Equipe' },
  { id: 'kit', label: 'Kit', group: 'Prova & Equipe' },
  { id: 'camiseta', label: 'Tamanho da camiseta', group: 'Prova & Equipe' },
  { id: 'statusPagamento', label: 'Status do pagamento', group: 'Financeiro' },
  { id: 'formaPagamento', label: 'Forma de pagamento (Pix/Cartão)', group: 'Financeiro' },
  { id: 'valorPago', label: 'Valor da inscrição (R$)', group: 'Financeiro' },
  { id: 'dataInscricao', label: 'Data da inscrição', group: 'Financeiro' },
  { id: 'linkComprovante', label: 'Comprovante de pagamento (link)', group: 'Financeiro' },
  { id: 'saude', label: 'Alergias / medicamentos', group: 'Saúde' },
  { id: 'contatoEmergencia', label: 'Contato de emergência', group: 'Saúde' },
  { id: 'foto', label: 'Foto do atleta (imagem, antes do nome)', group: 'Mídia' },
  { id: 'linkEuVou', label: 'Card #EUVOU (link)', group: 'Mídia' },
];

const DEFAULT_ON = new Set(COLUMN_DEFS.map(c => c.id));

const STATUS_OPTIONS = [
  { id: 'pago', label: 'Confirmado (pago)', color: '#16a34a' },
  { id: 'pendente', label: 'Pendente', color: '#ca8a04' },
  { id: 'vencido', label: 'Vencido', color: '#dc2626' },
  { id: 'cancelado', label: 'Cancelado', color: '#64748b' },
];

const STATUS_LABEL: Record<string, string> = {
  pago: 'Confirmado', pendente: 'Pendente', vencido: 'Vencido', cancelado: 'Cancelado',
};

const RESUMO_FIELD_DEFS = [
  { id: 'dataGeracao', label: 'Data/hora de geração' },
  { id: 'totalGeral', label: 'Total geral de inscrições' },
  { id: 'porStatus', label: 'Total por status de pagamento' },
  { id: 'porModalidade', label: 'Total por modalidade' },
  { id: 'arrecadado', label: 'Valor total arrecadado' },
];

const NAVY = 'FF071A45';
const HEADER_TEXT = 'FFFFFFFF';
const STRIPE = 'FFF1F5F9';
const LINK_BLUE = 'FF2563EB';
const LOGO_RATIO = 2000 / 1180;
// Fonte única em toda a planilha, pedida pra dar cara de planilha de tesouraria de verdade.
const FONT_FAMILY = 'Open Sans';

// Borda fina cinza-clara usada em toda célula de tabela - dá aquele visual "grade" de
// planilha de verdade em vez de dados soltos sem contorno.
const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
};

// "Selo" colorido pro status de pagamento em cada linha - mesmo espírito de badge
// verde/vermelho de planilhas de fluxo de caixa. Também dá pra usar o "Filtrar por cor"
// nativo do Excel em cima disso, já que cada status vira uma cor de fundo sólida.
const STATUS_PILL_COLORS: Record<string, { bg: string; fg: string }> = {
  pago: { bg: 'FFDCFCE7', fg: 'FF166534' },
  pendente: { bg: 'FFFEF9C3', fg: 'FF854D0E' },
  vencido: { bg: 'FFFEE2E2', fg: 'FFB91C1C' },
  cancelado: { bg: 'FFF1F5F9', fg: 'FF475569' },
};

// Quantidade de inscritos por tamanho de camiseta, do maior para o menor. Tamanho numérico
// (4, 6, 8, 10, 12...) é sempre Infantil, seja lá o que estiver marcado no cadastro de Kits e
// Camisetas - é a convenção do evento. Todo o resto é sempre "Adolescente / Adulto" - a
// categoria nunca aparece como "Todos" no resumo, só uma das duas opções.
const getCamisetaCounts = (list: any[], camisetaMap: Record<string, any>) => {
  const counts = new Map<string, number>();
  list.forEach(r => {
    if (!r.tamanhoCamiseta) return;
    counts.set(r.tamanhoCamiseta, (counts.get(r.tamanhoCamiseta) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([sizeId, count]) => {
      const camiseta = camisetaMap[sizeId];
      const shortLabel = getCamisetaShortLabel(sizeId, camiseta);
      const isNumerico = /^\d+$/.test(shortLabel);
      const isInfantil = isNumerico || camiseta?.categoria === 'infantil';
      // Tamanho infantil (numérico) mostra só o número, sem o prefixo "Padrao -".
      const label = isNumerico ? shortLabel : (formatCamisetaLabel(sizeId, camiseta) || sizeId);
      return {
        sizeId,
        label,
        count,
        categoria: isInfantil ? 'infantil' : 'adulto',
        categoriaLabel: isInfantil ? 'Infantil' : 'Adolescente / Adulto',
        isInfantil,
      };
    })
    .sort((a, b) => b.count - a.count);
};

// yyyy-mm-dd em fuso local (não usar toISOString, que converte pra UTC e pode voltar um dia).
const toInputDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Saldo atual dos dois bancos (Cora + Asaas), no momento exato da geração da planilha.
// Reaproveita o mesmo endpoint do worker usado no painel Financeiro.
async function fetchBankBalances(workerUrl: string | undefined) {
  if (!workerUrl) {
    const erro = { ok: false, error: 'VITE_WORKER_URL não configurado.' };
    return { asaas: erro, cora: erro };
  }
  try {
    const res = await fetch(`${workerUrl}/bank-balances`);
    return await res.json();
  } catch (e) {
    const erro = { ok: false, error: e instanceof Error ? e.message : 'Falha ao consultar saldo dos bancos.' };
    return { asaas: erro, cora: erro };
  }
}

// Extrato (entrada/saída) dos dois bancos num período. A Cora exige consultar CREDIT e DEBIT
// separadamente; o Asaas devolve tudo junto e o tipo é inferido por sinal/texto - o worker já
// trata essa diferença e devolve os dois no mesmo formato (type: 'entrada' | 'saida').
async function fetchBankMovements(workerUrl: string | undefined, start: string, end: string) {
  if (!workerUrl) {
    const erro = { ok: false, error: 'VITE_WORKER_URL não configurado.', items: [] as any[] };
    return { asaas: erro, cora: erro };
  }
  try {
    const url = new URL(`${workerUrl}/bank-movements`);
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    const res = await fetch(url.toString());
    return await res.json();
  } catch (e) {
    const erro = { ok: false, error: e instanceof Error ? e.message : 'Falha ao consultar extrato bancário.', items: [] as any[] };
    return { asaas: erro, cora: erro };
  }
}

const calcIdade = (dataNascimento: any): number | null => {
  const d = toDateValue(dataNascimento);
  if (!d) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - d.getFullYear();
  const m = hoje.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < d.getDate())) idade--;
  return idade;
};

const sanitizeSheetName = (name: string, used: Set<string>) => {
  let base = String(name || 'Modalidade').replace(/[:\\/?*[\]]/g, '').trim().slice(0, 28) || 'Modalidade';
  let finalName = base;
  let i = 2;
  while (used.has(finalName.toLowerCase())) {
    finalName = `${base} ${i}`.slice(0, 31);
    i++;
  }
  used.add(finalName.toLowerCase());
  return finalName;
};

const FOTO_CELL_PX = 34;

type FotoImagem = { base64: string; extension: 'png' | 'jpeg' };

// Cache de imagens em base64, em memória, compartilhado entre a planilha .xlsx e o PDF e
// entre gerações sucessivas na mesma sessão (ex: usuário ajusta um filtro e gera de novo) -
// logo, imagem de transição e fotos de atletas só são baixadas uma vez cada. Só sucessos
// entram no cache - uma falha (CORS, URL quebrada, rede instável) não fica "presa" e tenta
// de novo na próxima geração.
const imageBase64Cache = new Map<string, FotoImagem>();

// Baixa a foto e converte para base64 para embutir de verdade na célula (não um link).
// Falha silenciosa por foto (ex: CORS, URL quebrada) - o resto da planilha segue normalmente.
async function fetchImagemBase64(url: string): Promise<FotoImagem | null> {
  const cached = imageBase64Cache.get(url);
  if (cached) return cached;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const extension: 'png' | 'jpeg' = blob.type.includes('png') ? 'png' : 'jpeg';
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Falha ao ler imagem'));
      reader.readAsDataURL(blob);
    });
    if (!base64) return null;
    const resultado: FotoImagem = { base64, extension };
    imageBase64Cache.set(url, resultado);
    return resultado;
  } catch (e) {
    console.warn('[PlanilhaGeradorTab] Falha ao baixar foto para a planilha:', url, e);
    return null;
  }
}

// Busca várias fotos em paralelo com um limite de concorrência (evita travar o navegador
// com centenas de requisições simultâneas) e reporta progresso via callback. URLs já em
// cache entram na resposta na hora, sem contar pra concorrência nem pro tempo de espera.
async function fetchImagensEmLote(urls: string[], onProgress: (feitas: number, total: number) => void): Promise<Map<string, FotoImagem | null>> {
  const cache = new Map<string, FotoImagem | null>();
  const CONCURRENCY = 6;
  let feitas = 0;
  const faltando: string[] = [];
  urls.forEach(url => {
    const cached = imageBase64Cache.get(url);
    if (cached) { cache.set(url, cached); feitas++; } else { faltando.push(url); }
  });
  onProgress(feitas, urls.length);
  for (let i = 0; i < faltando.length; i += CONCURRENCY) {
    const lote = faltando.slice(i, i + CONCURRENCY);
    const resultados = await Promise.all(lote.map(url => fetchImagemBase64(url)));
    lote.forEach((url, idx) => cache.set(url, resultados[idx]));
    feitas += lote.length;
    onProgress(Math.min(feitas, urls.length), urls.length);
  }
  return cache;
}

// Redimensiona uma imagem já em base64 via canvas, reduzindo para o tamanho máximo em pixels
// e recomprimindo como JPEG. Usado só para as fotos de perfil embutidas no PDF (impressas bem
// pequenas ali) - a foto original em alta resolução baixada do storage não é alterada em nada,
// só essa cópia reduzida que entra no PDF.
async function resizeImageBase64(base64: string, maxDim: number, quality: number): Promise<FotoImagem> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width <= 0 || height <= 0) { reject(new Error('Imagem inválida')); return; }
      if (width > height) {
        if (width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
      } else if (height > maxDim) {
        width = Math.round(width * (maxDim / height)); height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas indisponível')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      resolve({ base64: canvas.toDataURL('image/jpeg', quality), extension: 'jpeg' });
    };
    img.onerror = () => reject(new Error('Falha ao carregar imagem para redimensionar'));
    img.src = base64;
  });
}

// Cache separado (chave = URL da foto) só para as versões reduzidas usadas no PDF - fica
// pequeno o bastante pra não pesar o arquivo final, sem tocar no cache em alta resolução
// usado pela planilha .xlsx.
const pdfPhotoCache = new Map<string, FotoImagem | null>();
const PDF_PHOTO_MAX_DIM = 130;
const PDF_PHOTO_QUALITY = 0.6;

async function fetchFotoParaPdf(url: string): Promise<FotoImagem | null> {
  if (pdfPhotoCache.has(url)) return pdfPhotoCache.get(url)!;
  const original = await fetchImagemBase64(url);
  if (!original) { pdfPhotoCache.set(url, null); return null; }
  try {
    const reduzida = await resizeImageBase64(original.base64, PDF_PHOTO_MAX_DIM, PDF_PHOTO_QUALITY);
    pdfPhotoCache.set(url, reduzida);
    return reduzida;
  } catch {
    pdfPhotoCache.set(url, original);
    return original;
  }
}

async function fetchFotosParaPdfEmLote(urls: string[], onProgress: (feitas: number, total: number) => void): Promise<Map<string, FotoImagem | null>> {
  const cache = new Map<string, FotoImagem | null>();
  const CONCURRENCY = 6;
  let feitas = 0;
  const faltando: string[] = [];
  urls.forEach(url => {
    if (pdfPhotoCache.has(url)) { cache.set(url, pdfPhotoCache.get(url)!); feitas++; } else { faltando.push(url); }
  });
  onProgress(feitas, urls.length);
  for (let i = 0; i < faltando.length; i += CONCURRENCY) {
    const lote = faltando.slice(i, i + CONCURRENCY);
    const resultados = await Promise.all(lote.map(url => fetchFotoParaPdf(url)));
    lote.forEach((url, idx) => cache.set(url, resultados[idx]));
    feitas += lote.length;
    onProgress(Math.min(feitas, urls.length), urls.length);
  }
  return cache;
}

type ResolvedCell = { value: any; link?: string; numFmt?: string };

function resolveValue(colId: string, r: any, modalidadeMap: Record<string, Modalidade>, camisetaMap: Record<string, any>, kits: KitRecord[]): ResolvedCell {
  switch (colId) {
    case 'nome': return { value: r.nome || '' };
    case 'cpf': return { value: r.cpf || '' };
    case 'dataNascimento': return { value: formatDateBR(r.dataNascimento, '') };
    case 'idade': { const idade = calcIdade(r.dataNascimento); return { value: idade ?? '' }; }
    case 'sexo': return { value: r.sexo === 'M' ? 'Masculino' : r.sexo === 'F' ? 'Feminino' : '' };
    case 'responsavel': return { value: r.responsavelNome || '' };
    case 'email': return { value: r.email || '' };
    case 'telefone': return { value: r.telefone || '' };
    case 'modalidade': return { value: modalidadeMap[r.modalidadeId]?.nome || 'Outra' };
    case 'distancia': return { value: modalidadeMap[r.modalidadeId]?.distancia || '' };
    case 'categoria': return { value: r.categoria === 'infantil' ? 'Infantil' : 'Adulto/Adolescente' };
    case 'equipe': return { value: r.integranteEquipe === 'sim' ? (r.equipeNome || 'Sim') : 'Não' };
    case 'kit': return { value: resolveKitNome(kits, r.kit, r.kitNome) };
    case 'camiseta': return { value: formatCamisetaLabel(r.tamanhoCamiseta, camisetaMap[r.tamanhoCamiseta]) || r.tamanhoCamiseta || '' };
    case 'statusPagamento': return { value: STATUS_LABEL[r.paymentStatus] || r.paymentStatus || '' };
    // Cartão sempre passa pelo Asaas (só ele processa cartão neste sistema); PIX pode vir de
    // qualquer um dos dois, mas na prática hoje é sempre a Cora - por isso a rotulagem simples.
    case 'formaPagamento': return { value: (r.creditCardAsaasPaymentId || r.paymentMethod === 'credit_card') ? 'Cartão (Asaas)' : 'Pix (Cora)' };
    case 'valorPago': return { value: Number(r.amount || 0) / 100, numFmt: '"R$" #,##0.00' };
    case 'dataInscricao': return { value: formatDateBR(r.createdAt, '') };
    case 'linkComprovante': {
      const url = r.comprovanteUrl || r.receiptUrl || r.invoiceUrl || '';
      return url ? { value: 'Ver comprovante', link: url } : { value: '' };
    }
    case 'saude': {
      const partes: string[] = [];
      if (r.saude?.temAlergia) partes.push(`Alergia: ${r.saude.alergiaDesc || 'sim'}`);
      if (r.saude?.tomaMedicamento) partes.push(`Medicamento: ${r.saude.medicamentoDesc || 'sim'}`);
      return { value: partes.join(' | ') || 'Nenhuma' };
    }
    case 'contatoEmergencia': return { value: r.contatoEmergencia?.nome ? `${r.contatoEmergencia.nome} - ${r.contatoEmergencia.telefone || ''}` : '' };
    // 'foto' não usa texto: a imagem em si é embutida na célula à parte (ver writeRows).
    case 'foto': return { value: '' };
    case 'linkEuVou': return r.euVouCardUrl ? { value: 'Ver card #EUVOU', link: r.euVouCardUrl } : { value: '' };
    default: return { value: '' };
  }
}

const Card = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <section style={{ background: '#fff', borderRadius: 16, padding: 22, border: '1px solid #e2e8f0' }}>
    <h3 style={{ fontSize: '0.8rem', fontWeight: 900, color: '#071A45', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {icon}{title}
    </h3>
    {children}
  </section>
);

const miniBtnStyle: React.CSSProperties = {
  background: '#f1f5f9', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8,
  padding: '6px 12px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer',
};

export default function PlanilhaGeradorTab({ modalidades, regs }: { modalidades: Modalidade[]; regs: any[] }) {
  const { showAlert, showConfirm } = useDialog();
  const [camisetaMap, setCamisetaMap] = useState<Record<string, any>>({});
  const [kitsCadastrados, setKitsCadastrados] = useState<KitRecord[]>([]);
  const [selectedModalidadeIds, setSelectedModalidadeIds] = useState<Set<string>>(new Set());
  const [statusSelecionados, setStatusSelecionados] = useState<Set<string>>(new Set(['pago', 'pendente', 'vencido', 'cancelado']));
  const [idadeMin, setIdadeMin] = useState('');
  const [idadeMax, setIdadeMax] = useState('');
  const [complexidade, setComplexidade] = useState<'simples' | 'organizada'>('organizada');
  const [ordenarPor, setOrdenarPor] = useState<'nome' | 'modalidade' | 'dataInscricao' | 'status'>('nome');
  const [colunas, setColunas] = useState<Record<string, boolean>>(() => Object.fromEntries(COLUMN_DEFS.map(c => [c.id, DEFAULT_ON.has(c.id)])));
  const [incluirResumo, setIncluirResumo] = useState(true);
  const [resumoCampos, setResumoCampos] = useState<Record<string, boolean>>(() => Object.fromEntries(RESUMO_FIELD_DEFS.map(f => [f.id, true])));
  const [incluirResumoCamisetas, setIncluirResumoCamisetas] = useState(false);
  const [incluirListaPorDia, setIncluirListaPorDia] = useState(false);
  const [dataInicioLista, setDataInicioLista] = useState('');
  const [dataFimLista, setDataFimLista] = useState('');
  const [tituloPersonalizado, setTituloPersonalizado] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [incluirSaldoBancos, setIncluirSaldoBancos] = useState(false);
  const [incluirExtratoCora, setIncluirExtratoCora] = useState(false);
  const [incluirExtratoAsaas, setIncluirExtratoAsaas] = useState(false);
  const [extratoDataInicio, setExtratoDataInicio] = useState('');
  const [extratoDataFim, setExtratoDataFim] = useState('');
  const [incluirEquipes, setIncluirEquipes] = useState(false);
  const [incluirKitsInfo, setIncluirKitsInfo] = useState(false);
  const [incluirCupons, setIncluirCupons] = useState(false);
  const [formatoSaida, setFormatoSaida] = useState<'planilha' | 'pdf'>('planilha');
  const [gerando, setGerando] = useState(false);
  const [progressoLabel, setProgressoLabel] = useState('');
  const [modelos, setModelos] = useState<any[]>([]);
  const [loadingModelos, setLoadingModelos] = useState(true);
  const [showSalvarModelo, setShowSalvarModelo] = useState(false);
  const [novoModeloNome, setNovoModeloNome] = useState('');
  const [salvandoModelo, setSalvandoModelo] = useState(false);

  useEffect(() => {
    setSelectedModalidadeIds(new Set(modalidades.map(m => m.id)));
  }, [modalidades.map(m => m.id).join(',')]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'nightrun_camisetas'));
        const map: Record<string, any> = {};
        snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
        setCamisetaMap(map);
      } catch (e) { console.error(e); }
    })();
  }, []);

  useEffect(() => {
    fetchKits().then(setKitsCadastrados).catch(e => console.error('Erro ao carregar kits', e));
  }, []);

  // Data da inscrição mais antiga - usada como início padrão do "período completo".
  const primeiraDataInscricao = useMemo(() => {
    let min: Date | null = null;
    regs.forEach(r => {
      const d = toDateValue(r.createdAt);
      if (d && (!min || d < min)) min = d;
    });
    return min;
  }, [regs]);

  const usarPeriodoCompleto = () => {
    setDataInicioLista(primeiraDataInscricao ? toInputDate(primeiraDataInscricao) : toInputDate(new Date()));
    setDataFimLista(toInputDate(new Date()));
  };

  // Pré-preenche o período (só na primeira vez que os dados chegam, sem sobrescrever
  // uma seleção manual do usuário).
  useEffect(() => {
    if (!dataInicioLista && primeiraDataInscricao) setDataInicioLista(toInputDate(primeiraDataInscricao));
    if (!dataFimLista) setDataFimLista(toInputDate(new Date()));
  }, [primeiraDataInscricao]);

  const usarUltimos90Dias = () => {
    const inicio = new Date();
    inicio.setDate(inicio.getDate() - 90);
    setExtratoDataInicio(toInputDate(inicio));
    setExtratoDataFim(toInputDate(new Date()));
  };

  // Pré-preenche o período do extrato bancário com os últimos 90 dias (mesmo padrão já usado
  // no painel Financeiro), só na primeira vez.
  useEffect(() => {
    if (!extratoDataInicio || !extratoDataFim) usarUltimos90Dias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadModelos = async () => {
    setLoadingModelos(true);
    try {
      const snap = await getDocs(query(collection(db, 'nightrun_planilha_modelos'), orderBy('nome')));
      setModelos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingModelos(false);
    }
  };

  useEffect(() => { loadModelos(); }, []);

  const toggleModalidade = (id: string) => {
    setSelectedModalidadeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selecionarModalidades = (filtro: 'todas' | 'nenhuma' | 'adulto' | 'infantil') => {
    if (filtro === 'todas') return setSelectedModalidadeIds(new Set(modalidades.map(m => m.id)));
    if (filtro === 'nenhuma') return setSelectedModalidadeIds(new Set());
    setSelectedModalidadeIds(new Set(modalidades.filter(m => m.categoria === filtro).map(m => m.id)));
  };

  const toggleStatus = (id: string) => {
    setStatusSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleColuna = (id: string) => {
    if (id === 'nome') return; // sempre incluída
    setColunas(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleGrupoColunas = (cols: ColumnDef[], marcarTudo: boolean) => {
    setColunas(prev => {
      const next = { ...prev };
      cols.forEach(c => { if (!c.always) next[c.id] = marcarTudo; });
      return next;
    });
  };

  const toggleResumoCampo = (id: string) => {
    setResumoCampos(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const aplicarPresetColunas = (preset: 'essenciais' | 'completo' | 'limpar') => {
    if (preset === 'completo') return setColunas(Object.fromEntries(COLUMN_DEFS.map(c => [c.id, true])));
    if (preset === 'limpar') return setColunas(Object.fromEntries(COLUMN_DEFS.map(c => [c.id, c.id === 'nome'])));
    setColunas(Object.fromEntries(COLUMN_DEFS.map(c => [c.id, DEFAULT_ON.has(c.id)])));
  };

  // Modelos salvos: guardam a configuração inteira (modalidades, status, colunas, resumo etc.)
  // com um nome, para reaplicar depois sem precisar remontar tudo manualmente.
  const salvarModeloAtual = async () => {
    const nome = novoModeloNome.trim();
    if (!nome) return showAlert('Dê um nome para o modelo.', 'warning');
    setSalvandoModelo(true);
    try {
      await addDoc(collection(db, 'nightrun_planilha_modelos'), {
        nome,
        modalidadeIds: Array.from(selectedModalidadeIds),
        status: Array.from(statusSelecionados),
        idadeMin,
        idadeMax,
        complexidade,
        ordenarPor,
        colunas: COLUMN_DEFS.filter(c => colunas[c.id]).map(c => c.id),
        incluirResumo,
        resumoCampos: RESUMO_FIELD_DEFS.filter(f => resumoCampos[f.id]).map(f => f.id),
        incluirResumoCamisetas,
        incluirListaPorDia,
        incluirSaldoBancos,
        incluirExtratoCora,
        incluirExtratoAsaas,
        incluirEquipes,
        incluirKitsInfo,
        incluirCupons,
        tituloPersonalizado,
        nomeArquivo,
        createdAt: serverTimestamp(),
      });
      showAlert('Modelo salvo.', 'success');
      setNovoModeloNome('');
      setShowSalvarModelo(false);
      loadModelos();
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar o modelo.', 'error');
    } finally {
      setSalvandoModelo(false);
    }
  };

  const aplicarModelo = (modelo: any) => {
    const idsValidos = (modelo.modalidadeIds || []).filter((id: string) => modalidadeMap[id]);
    setSelectedModalidadeIds(new Set(idsValidos.length > 0 ? idsValidos : modalidades.map(m => m.id)));
    setStatusSelecionados(new Set(modelo.status && modelo.status.length > 0 ? modelo.status : ['pago', 'pendente', 'vencido', 'cancelado']));
    setIdadeMin(modelo.idadeMin || '');
    setIdadeMax(modelo.idadeMax || '');
    setComplexidade(modelo.complexidade === 'simples' ? 'simples' : 'organizada');
    setOrdenarPor(['nome', 'modalidade', 'dataInscricao', 'status'].includes(modelo.ordenarPor) ? modelo.ordenarPor : 'nome');
    const colunasSalvas: string[] = modelo.colunas || [];
    setColunas(Object.fromEntries(COLUMN_DEFS.map(c => [c.id, c.always || colunasSalvas.includes(c.id)])));
    setIncluirResumo(modelo.incluirResumo !== false);
    const resumoSalvo: string[] = modelo.resumoCampos || RESUMO_FIELD_DEFS.map(f => f.id);
    setResumoCampos(Object.fromEntries(RESUMO_FIELD_DEFS.map(f => [f.id, resumoSalvo.includes(f.id)])));
    setIncluirResumoCamisetas(!!modelo.incluirResumoCamisetas);
    // O período da lista por dia não é salvo no modelo (ficaria desatualizado com o tempo) -
    // só a opção de incluí-la; o período usa a seleção atual na tela ou o padrão automático.
    setIncluirListaPorDia(!!modelo.incluirListaPorDia);
    // Mesma lógica: só a opção de incluir é salva, o período do extrato usa o padrão atual
    // (últimos 90 dias) ou o que já estiver selecionado na tela.
    setIncluirSaldoBancos(!!modelo.incluirSaldoBancos);
    setIncluirExtratoCora(!!modelo.incluirExtratoCora);
    setIncluirExtratoAsaas(!!modelo.incluirExtratoAsaas);
    setIncluirEquipes(!!modelo.incluirEquipes);
    setIncluirKitsInfo(!!modelo.incluirKitsInfo);
    setIncluirCupons(!!modelo.incluirCupons);
    setTituloPersonalizado(modelo.tituloPersonalizado || '');
    setNomeArquivo(modelo.nomeArquivo || '');
    showAlert(`Modelo "${modelo.nome}" aplicado.`, 'success');
  };

  const excluirModelo = (modelo: any) => {
    showConfirm(`Excluir o modelo "${modelo.nome}"?`, async () => {
      try {
        await deleteDoc(doc(db, 'nightrun_planilha_modelos', modelo.id));
        setModelos(prev => prev.filter(m => m.id !== modelo.id));
        showAlert('Modelo excluído.', 'success');
      } catch (e) {
        console.error(e);
        showAlert('Erro ao excluir o modelo.', 'error');
      }
    });
  };

  const modalidadeMap = useMemo(() => Object.fromEntries(modalidades.map(m => [m.id, m])), [modalidades]);

  // Pool de inscrições após modalidade + idade (antes do status) - usado para mostrar quantos
  // registros cada status tem dentro do recorte atual, e como base para o filtro final.
  const regsPorModalidadeEIdade = useMemo(() => regs.filter(r => {
    if (!selectedModalidadeIds.has(r.modalidadeId)) return false;
    if (idadeMin !== '' || idadeMax !== '') {
      const idade = calcIdade(r.dataNascimento);
      if (idade === null) return false;
      if (idadeMin !== '' && idade < Number(idadeMin)) return false;
      if (idadeMax !== '' && idade > Number(idadeMax)) return false;
    }
    return true;
  }), [regs, selectedModalidadeIds, idadeMin, idadeMax]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { pago: 0, pendente: 0, vencido: 0, cancelado: 0 };
    regsPorModalidadeEIdade.forEach(r => {
      if (counts[r.paymentStatus] !== undefined) counts[r.paymentStatus]++;
    });
    return counts;
  }, [regsPorModalidadeEIdade]);

  const filteredRegs = useMemo(
    () => regsPorModalidadeEIdade.filter(r => statusSelecionados.has(r.paymentStatus)),
    [regsPorModalidadeEIdade, statusSelecionados],
  );

  const sortedRegs = useMemo(() => {
    const arr = [...filteredRegs];
    arr.sort((a, b) => {
      switch (ordenarPor) {
        case 'modalidade': {
          const ma = modalidadeMap[a.modalidadeId]?.nome || '';
          const mb = modalidadeMap[b.modalidadeId]?.nome || '';
          return ma.localeCompare(mb, 'pt-BR') || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
        }
        case 'dataInscricao': {
          const da = toDateValue(a.createdAt)?.getTime() || 0;
          const dbb = toDateValue(b.createdAt)?.getTime() || 0;
          return da - dbb;
        }
        case 'status':
          return String(a.paymentStatus || '').localeCompare(String(b.paymentStatus || '')) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
        default:
          return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
      }
    });
    return arr;
  }, [filteredRegs, ordenarPor, modalidadeMap]);

  const groupedByModalidade = useMemo(() => {
    const map = new Map<string, any[]>();
    sortedRegs.forEach(r => {
      if (!map.has(r.modalidadeId)) map.set(r.modalidadeId, []);
      map.get(r.modalidadeId)!.push(r);
    });
    return modalidades
      .filter(m => selectedModalidadeIds.has(m.id))
      .map(m => ({ modalidade: m, itens: map.get(m.id) || [] }));
  }, [sortedRegs, modalidades, selectedModalidadeIds]);

  // Cruza os cupons cadastrados (nightrun_discount_coupons) com as inscrições do relatório
  // atual - maxUses/usedCount vêm do cupom (contagem real, de sempre); "usos no relatório"
  // e "desconto gerado" só contam quem está no recorte de filtros da tela. Usado tanto pela
  // aba Cupons da planilha .xlsx quanto pela seção equivalente no PDF.
  const buildCuponsResumo = async () => {
    const snap = await getDocs(collection(db, 'nightrun_discount_coupons'));
    const cupons = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    const porCodigo = new Map<string, { descontoTotal: number; usos: number }>();
    sortedRegs.forEach((r: any) => {
      if (!r.couponCode) return;
      const key = String(r.couponCode).toUpperCase();
      const cur = porCodigo.get(key) || { descontoTotal: 0, usos: 0 };
      cur.descontoTotal += Number(r.couponDiscountAmount || 0);
      cur.usos += 1;
      porCodigo.set(key, cur);
    });
    return cupons
      .map(c => {
        const key = String(c.code || c.id).toUpperCase();
        const uso = porCodigo.get(key) || { descontoTotal: 0, usos: 0 };
        return {
          codigo: key,
          tipo: c.type === 'fixed' ? 'Valor fixo' : 'Percentual',
          valorLabel: c.type === 'fixed' ? `${(Number(c.value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : `${Number(c.value || 0)}%`,
          ativo: c.active !== false,
          maxUses: Number(c.maxUses || 0),
          usedCount: Number(c.usedCount || 0),
          usosNoRelatorio: uso.usos,
          descontoNoRelatorio: uso.descontoTotal,
        };
      })
      .sort((a, b) => b.usosNoRelatorio - a.usosNoRelatorio || a.codigo.localeCompare(b.codigo));
  };

  const buildWorkbook = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MCU Night Run 2026';
    wb.created = new Date();

    // Título que aparece dentro da planilha (faixa de cabeçalho de toda aba) - usa o texto
    // personalizado quando definido, senão o padrão do sistema.
    const tituloBase = tituloPersonalizado.trim() || 'MCU NIGHT RUN 2026';

    // A foto (quando marcada) sempre vira a 1ª coluna, antes do nome - o resto segue a
    // ordem normal de COLUMN_DEFS.
    const activeColumns = [
      ...(colunas.foto ? [COLUMN_DEFS.find(c => c.id === 'foto')!] : []),
      ...COLUMN_DEFS.filter(c => c.id !== 'foto' && colunas[c.id]),
    ];
    const fotoColIndex = colunas.foto ? 0 : -1;

    // Baixa as fotos ANTES de montar as abas (uma vez só por foto única, mesmo que a
    // planilha tenha várias abas), com progresso mostrado no botão de gerar.
    let fotoCache: Map<string, FotoImagem | null> = new Map();
    if (colunas.foto) {
      const todasRegs = complexidade === 'simples' ? sortedRegs : groupedByModalidade.flatMap(g => g.itens);
      const urls = Array.from(new Set(todasRegs.map(r => r.fotoUrl).filter(Boolean)));
      if (urls.length > 0) {
        fotoCache = await fetchImagensEmLote(urls, (feitas, total) => {
          setProgressoLabel(`BAIXANDO FOTOS ${feitas}/${total}...`);
        });
      }
      setProgressoLabel('MONTANDO PLANILHA...');
    }

    // Logo do sistema, baixada uma única vez e reaproveitada no cabeçalho de toda aba.
    setProgressoLabel('CARREGANDO LOGO...');
    const logoImagem = await fetchImagemBase64('/LOGO NIGHT RUN SEM FUNDO (em amarelo).png');
    setProgressoLabel('MONTANDO PLANILHA...');

    // Saldo dos bancos: precisa consultar mesmo que só o extrato do Asaas esteja marcado,
    // porque os pagamentos "ainda vão cair na conta" vêm junto da consulta de saldo.
    const workerUrl = import.meta.env.VITE_WORKER_URL as string | undefined;
    let saldoBancos: any = null;
    if (incluirSaldoBancos || incluirExtratoAsaas) {
      setProgressoLabel('CONSULTANDO SALDO DOS BANCOS...');
      saldoBancos = await fetchBankBalances(workerUrl);
    }
    let movimentosBancos: any = null;
    if (incluirExtratoCora || incluirExtratoAsaas) {
      setProgressoLabel('CONSULTANDO EXTRATO BANCÁRIO...');
      movimentosBancos = await fetchBankMovements(workerUrl, extratoDataInicio, extratoDataFim);
    }
    setProgressoLabel('MONTANDO PLANILHA...');

    const applyHeaderStyle = (row: ExcelJS.Row) => {
      row.font = { name: FONT_FAMILY,bold: true, color: { argb: HEADER_TEXT }, size: 11 };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      row.alignment = { vertical: 'middle' };
      row.height = 20;
      row.eachCell(cell => { cell.border = THIN_BORDER; });
    };

    // Faixa azul-marinho no topo de toda aba, com a logo real do sistema à esquerda e o
    // título da aba à direita - mesmo padrão visual usado nos PDFs gerados pelo sistema.
    const addHeaderBand = (ws: ExcelJS.Worksheet, lastColIndex: number, titulo: string) => {
      const lastColLetter = ws.getColumn(Math.max(lastColIndex, 1)).letter;
      ws.mergeCells(`A1:${lastColLetter}1`);
      const cell = ws.getCell('A1');
      cell.value = titulo;
      // Fonte menor para títulos longos (ex: título personalizado + sufixo da aba) - senão o
      // texto invade a logo e fica tudo embolado. Título curto continua bem grande.
      const tituloFontSize = titulo.length > 70 ? 12 : titulo.length > 55 ? 14 : titulo.length > 40 ? 16 : 20;
      cell.font = { name: FONT_FAMILY,bold: true, size: tituloFontSize, color: { argb: HEADER_TEXT } };
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      ws.getRow(1).height = 60;
      if (logoImagem) {
        const imageId = wb.addImage({ base64: logoImagem.base64, extension: logoImagem.extension });
        ws.addImage(imageId, {
          tl: { col: 0.15, row: 0.1 },
          ext: { width: 48 * LOGO_RATIO, height: 48 },
          editAs: 'oneCell',
        });
      }
    };

    // Cartões coloridos de KPI lado a lado (estilo "ENTRADAS/SAÍDAS/SALDO" de planilha de
    // fluxo de caixa) - rótulo em cima, número grande embaixo, cada cartão com sua cor.
    // Retorna a próxima linha livre depois dos cartões.
    const writeKpiCards = (ws: ExcelJS.Worksheet, startRow: number, cards: { label: string; value: any; numFmt?: string; bg: string; fg: string }[]) => {
      const cardWidth = 2;
      const gap = 1;
      let col = 1;
      cards.forEach(card => {
        const fromColLetter = ws.getColumn(col).letter;
        const toColLetter = ws.getColumn(col + cardWidth - 1).letter;
        ws.mergeCells(`${fromColLetter}${startRow}:${toColLetter}${startRow}`);
        ws.mergeCells(`${fromColLetter}${startRow + 1}:${toColLetter}${startRow + 1}`);
        const labelCell = ws.getCell(`${fromColLetter}${startRow}`);
        labelCell.value = card.label.toUpperCase();
        labelCell.font = { name: FONT_FAMILY,bold: true, size: 10, color: { argb: card.fg } };
        labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
        const valueCell = ws.getCell(`${fromColLetter}${startRow + 1}`);
        valueCell.value = card.value;
        if (card.numFmt) valueCell.numFmt = card.numFmt;
        valueCell.font = { name: FONT_FAMILY,bold: true, size: 20, color: { argb: card.fg } };
        valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
        [labelCell, valueCell].forEach(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: card.bg } };
          cell.border = {
            top: { style: 'medium', color: { argb: card.fg } },
            left: { style: 'medium', color: { argb: card.fg } },
            bottom: { style: 'medium', color: { argb: card.fg } },
            right: { style: 'medium', color: { argb: card.fg } },
          };
        });
        col += cardWidth + gap;
      });
      ws.getRow(startRow).height = 18;
      ws.getRow(startRow + 1).height = 32;
      return startRow + 3;
    };

    // Bloco "saldo dos bancos" em texto (rótulo + valor) - usado no modo simples, onde não há
    // espaço horizontal pros cartões de KPI. Mostra "Indisponível" em vermelho se a consulta
    // ao banco falhar, em vez de travar a geração da planilha inteira.
    const writeSaldoBancosBlock = (ws: ExcelJS.Worksheet) => {
      ws.addRow([]);
      const tituloRow = ws.addRow(['SALDO DOS BANCOS (no momento da geração)']);
      tituloRow.font = { name: FONT_FAMILY, bold: true, size: 18, color: { argb: 'FF071A45' } };
      tituloRow.height = 30;
      tituloRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

      const addLinha = (label: string, ok: boolean, valor: number, erro?: string) => {
        const row = ws.addRow([label, ok ? valor : (erro || 'Indisponível')]);
        row.height = 20;
        row.getCell(1).font = { name: FONT_FAMILY, bold: true, size: 13, color: { argb: 'FF071A45' } };
        row.getCell(2).font = { name: FONT_FAMILY, bold: true, size: 13, color: { argb: ok ? 'FF071A45' : 'FFDC2626' } };
        if (ok) row.getCell(2).numFmt = '"R$" #,##0.00';
      };
      addLinha('Saldo Cora', !!saldoBancos?.cora?.ok, (saldoBancos?.cora?.balanceCents || 0) / 100, saldoBancos?.cora?.error);
      addLinha('Saldo Asaas', !!saldoBancos?.asaas?.ok, (saldoBancos?.asaas?.balanceCents || 0) / 100, saldoBancos?.asaas?.error);
    };

    // Responsável pelo pagamento de uma entrada de extrato: vem direto do banco (nome do
    // pagador/sacado retornado pela própria Cora/Asaas), não do sistema - é quem efetivamente
    // pagou, que pode divergir do inscrito cadastrado.
    const inscritoDoMovimento = (item: any): string => {
      if (item.type !== 'entrada') return '';
      return item.payerName || '';
    };

    // Aba de extrato de um banco: cartões de entradas/saídas/saldo do período + tabela
    // cronológica. No Asaas, quando há pagamentos de cartão confirmados mas ainda não
    // creditados, entra uma segunda tabela "A RECEBER" com a previsão de quando caem.
    const writeExtratoSheet = (sheetName: string, titulo: string, bankData: any, pendingCredit?: any) => {
      const ws = wb.addWorksheet(sheetName);
      addHeaderBand(ws, 5, titulo);

      if (!bankData || bankData.ok === false) {
        ws.getCell('A3').value = `Não foi possível consultar o extrato: ${bankData?.error || 'erro desconhecido'}`;
        ws.getCell('A3').font = { name: FONT_FAMILY, italic: true, size: 12, color: { argb: 'FFDC2626' } };
        ws.getColumn(1).width = 60;
        return;
      }

      ws.getCell('A2').value = `Período: ${formatDateBR(extratoDataInicio, '')} a ${formatDateBR(extratoDataFim, '')}`;
      ws.getCell('A2').font = { name: FONT_FAMILY, italic: true, size: 11, color: { argb: 'FF64748B' } };

      const items = [...(bankData.items || [])].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const totalEntradas = items.filter((i: any) => i.type === 'entrada').reduce((s: number, i: any) => s + i.amount, 0);
      const totalSaidas = items.filter((i: any) => i.type === 'saida').reduce((s: number, i: any) => s + i.amount, 0);

      const kpiCardsExtrato: { label: string; value: any; numFmt?: string; bg: string; fg: string }[] = [
        { label: 'Entradas', value: totalEntradas / 100, numFmt: '"R$" #,##0.00', bg: 'FFDCFCE7', fg: 'FF166534' },
        { label: 'Saídas', value: totalSaidas / 100, numFmt: '"R$" #,##0.00', bg: 'FFFEE2E2', fg: 'FFB91C1C' },
        { label: 'Saldo do período', value: (totalEntradas - totalSaidas) / 100, numFmt: '"R$" #,##0.00', bg: 'FFDBEAFE', fg: 'FF071A45' },
      ];
      if (pendingCredit?.ok && (pendingCredit.amountCents || 0) > 0) {
        kpiCardsExtrato.push({ label: 'Total a receber', value: pendingCredit.amountCents / 100, numFmt: '"R$" #,##0.00', bg: 'FFFEF3C7', fg: 'FF92400E' });
      }
      let linha = writeKpiCards(ws, 4, kpiCardsExtrato);
      linha += 1;

      const headers = ['Data', 'Tipo', 'Descrição', 'Valor', 'Responsável pelo pagamento'];
      headers.forEach((h, i) => { ws.getCell(linha, i + 1).value = h; });
      const headerRow = ws.getRow(linha);
      headerRow.font = { name: FONT_FAMILY, bold: true, size: 12, color: { argb: HEADER_TEXT } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      headerRow.height = 24;
      headerRow.eachCell(cell => { cell.border = THIN_BORDER; });
      const tabelaHeaderLinha = linha;
      linha++;

      items.forEach((item: any, idx: number) => {
        const row = ws.addRow([
          formatDateBR(item.date, ''),
          item.type === 'entrada' ? 'Entrada' : 'Saída',
          item.description || item.title || '',
          item.amount / 100,
          inscritoDoMovimento(item) || (item.type === 'entrada' ? 'Não identificado' : ''),
        ]);
        row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
        row.getCell(4).numFmt = '"R$" #,##0.00';
        const cores = item.type === 'entrada' ? { bg: 'FFDCFCE7', fg: 'FF166534' } : { bg: 'FFFEE2E2', fg: 'FFB91C1C' };
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cores.bg } };
        row.getCell(2).font = { name: FONT_FAMILY, bold: true, size: 11, color: { argb: cores.fg } };
        row.getCell(2).alignment = { horizontal: 'center' };
        row.eachCell((cell, colNum) => {
          if (idx % 2 === 1 && colNum !== 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
          cell.border = THIN_BORDER;
        });
        linha++;
      });

      if (items.length > 0) {
        ws.autoFilter = { from: { row: tabelaHeaderLinha, column: 1 }, to: { row: tabelaHeaderLinha + items.length, column: 5 } };
      } else {
        ws.getCell(`A${linha}`).value = 'Nenhuma movimentação no período selecionado.';
        ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, italic: true, size: 11, color: { argb: 'FF94A3B8' } };
        linha++;
      }

      ws.getColumn(1).width = 16;
      ws.getColumn(2).width = 12;
      ws.getColumn(3).width = 54;
      ws.getColumn(4).width = 18;
      ws.getColumn(5).width = 30;
      ws.getColumn(7).width = 14;
      ws.getColumn(8).width = 14;
      ws.getColumn(10).width = 14;
      ws.getColumn(11).width = 14;
      ws.views = [{ state: 'frozen', ySplit: tabelaHeaderLinha }];

      if (pendingCredit?.ok && pendingCredit.items?.length > 0) {
        linha += 2;
        ws.getCell(`A${linha}`).value = 'A RECEBER (cartão de crédito confirmado, ainda não creditado)';
        ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, bold: true, size: 15, color: { argb: 'FF071A45' } };
        ws.getRow(linha).height = 26;
        linha++;

        const headers2 = ['Cliente', 'Valor bruto', 'Valor líquido', 'Status', 'Previsão de crédito'];
        headers2.forEach((h, i) => { ws.getCell(linha, i + 1).value = h; });
        const headerRow2 = ws.getRow(linha);
        headerRow2.font = { name: FONT_FAMILY, bold: true, size: 11, color: { argb: HEADER_TEXT } };
        headerRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        headerRow2.eachCell(cell => { cell.border = THIN_BORDER; });
        linha++;

        pendingCredit.items.forEach((pi: any, idx: number) => {
          const row = ws.addRow([
            pi.customer || 'Cliente Asaas',
            pi.valueCents / 100,
            pi.netValueCents / 100,
            pi.status || '',
            pi.estimatedCreditDate ? formatDateBR(pi.estimatedCreditDate, '') : 'Não informado',
          ]);
          row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
          row.getCell(2).numFmt = '"R$" #,##0.00';
          row.getCell(3).numFmt = '"R$" #,##0.00';
          row.eachCell(cell => {
            if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
            cell.border = THIN_BORDER;
          });
        });
        ws.getColumn(5).width = 20;
      }
    };

    // Aba "Equipes": mesma regra de agrupamento do painel Equipes do admin - só entra quem
    // marcou "faz parte de equipe" E está com pagamento confirmado (senão o time contaria
    // gente que nem pagou). Usa a lista completa de inscritos, independente dos filtros do
    // relatório, porque equipe é um recorte à parte.
    const writeEquipesSheet = () => {
      const grupos = new Map<string, any[]>();
      regs.forEach((r: any) => {
        if (r.integranteEquipe !== 'sim') return;
        if (r.paymentStatus !== 'pago') return;
        const nomeEquipe = String(r.equipeNome || '').trim();
        if (!nomeEquipe) return;
        const key = nomeEquipe.toLowerCase();
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key)!.push(r);
      });

      const listaEquipes = Array.from(grupos.values())
        .map(membros => ({
          nome: membros[0]?.equipeNome || 'Equipe sem nome',
          membros,
          arrecadado: membros.reduce((s: number, m: any) => s + Number(m.amount || 0), 0),
        }))
        .sort((a, b) => b.membros.length - a.membros.length || a.nome.localeCompare(b.nome, 'pt-BR'));

      const ws = wb.addWorksheet('Equipes');
      addHeaderBand(ws, 5, `${tituloBase} — EQUIPES`);

      const totalEquipes = listaEquipes.length;
      const totalIntegrantes = listaEquipes.reduce((s, e) => s + e.membros.length, 0);
      const totalArrecadado = listaEquipes.reduce((s, e) => s + e.arrecadado, 0);

      let linha = writeKpiCards(ws, 3, [
        { label: 'Equipes', value: totalEquipes, bg: 'FFDBEAFE', fg: 'FF071A45' },
        { label: 'Integrantes', value: totalIntegrantes, bg: 'FFDCFCE7', fg: 'FF166534' },
        { label: 'Arrecadado', value: totalArrecadado / 100, numFmt: '"R$" #,##0.00', bg: 'FFFEF3C7', fg: 'FF92400E' },
      ]);
      linha += 1;

      if (listaEquipes.length === 0) {
        ws.getCell(`A${linha}`).value = 'Nenhuma equipe com inscritos confirmados no momento.';
        ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, italic: true, size: 11, color: { argb: 'FF94A3B8' } };
        ws.getColumn(1).width = 50;
        return;
      }

      const headers = ['Equipe', 'Integrantes', 'Arrecadado (R$)'];
      headers.forEach((h, i) => { ws.getCell(linha, i + 1).value = h; });
      const headerRow = ws.getRow(linha);
      headerRow.font = { name: FONT_FAMILY, bold: true, size: 12, color: { argb: HEADER_TEXT } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      headerRow.height = 24;
      headerRow.eachCell(cell => { cell.border = THIN_BORDER; });
      const tabelaHeaderLinha = linha;
      linha++;

      listaEquipes.forEach((equipe, idx) => {
        const row = ws.addRow([equipe.nome, equipe.membros.length, equipe.arrecadado / 100]);
        row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
        row.getCell(3).numFmt = '"R$" #,##0.00';
        row.eachCell(cell => {
          if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
          cell.border = THIN_BORDER;
        });
        linha++;
      });
      ws.getColumn(1).width = 40;
      ws.getColumn(2).width = 16;
      ws.getColumn(3).width = 20;
      ws.views = [{ state: 'frozen', ySplit: tabelaHeaderLinha }];

      linha += 2;
      ws.getCell(`A${linha}`).value = 'DETALHE POR INTEGRANTE';
      ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, bold: true, size: 15, color: { argb: 'FF071A45' } };
      ws.getRow(linha).height = 26;
      linha++;

      const headers2 = ['Equipe', 'Nome', 'Modalidade', 'Status', 'Valor (R$)'];
      headers2.forEach((h, i) => { ws.getCell(linha, i + 1).value = h; });
      const headerRow2 = ws.getRow(linha);
      headerRow2.font = { name: FONT_FAMILY, bold: true, size: 11, color: { argb: HEADER_TEXT } };
      headerRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      headerRow2.eachCell(cell => { cell.border = THIN_BORDER; });
      const tabelaHeader2Linha = linha;
      linha++;

      let detalheIdx = 0;
      listaEquipes.forEach(equipe => {
        equipe.membros.forEach((m: any) => {
          const modalidade = modalidades.find(mm => mm.id === m.modalidadeId);
          const row = ws.addRow([
            equipe.nome,
            m.nome || '',
            modalidade?.nome || '',
            STATUS_LABEL[m.paymentStatus] || m.paymentStatus || '',
            Number(m.amount || 0) / 100,
          ]);
          row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
          row.getCell(5).numFmt = '"R$" #,##0.00';
          row.eachCell(cell => {
            if (detalheIdx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
            cell.border = THIN_BORDER;
          });
          detalheIdx++;
        });
      });
      // O Excel só permite um autoFilter por aba - fica na tabela de detalhe (mais linhas,
      // mais útil filtrar por modalidade/status ali do que no resumo por equipe acima).
      ws.autoFilter = { from: { row: tabelaHeader2Linha, column: 1 }, to: { row: tabelaHeader2Linha + detalheIdx, column: 5 } };
    };

    // Aba "Kits": mostra cada kit cadastrado (ativo ou não, com/sem preço forçado), quantos
    // inscritos cada um tem e quanto arrecadou, além da tabela de lotes vigente (preço que
    // vale hoje pra quem NÃO está num kit de preço forçado) e o detalhe de quem tem cada kit.
    const writeKitsSheet = async () => {
      const ws = wb.addWorksheet('Kits');
      addHeaderBand(ws, 5, `${tituloBase} — KITS`);

      const kitsOrdenados = [...kitsCadastrados].sort((a, b) => (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0) || (b.isPadrao ? 1 : 0) - (a.isPadrao ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
      const kitAtivo = kitsOrdenados.find(k => k.ativo);
      const totalComKit = regs.filter((r: any) => r.kit).length;

      let linha = writeKpiCards(ws, 4, [
        { label: 'Kits cadastrados', value: kitsOrdenados.length, bg: 'FFDBEAFE', fg: 'FF071A45' },
        { label: 'Kit ativo', value: kitAtivo?.nome || 'Nenhum', bg: 'FFDCFCE7', fg: 'FF166534' },
        { label: 'Inscritos com kit', value: totalComKit, bg: 'FFFEF3C7', fg: 'FF92400E' },
      ]);
      linha += 1;

      const headers = ['Kit', 'Status', 'Preço', 'Inscritos', 'Confirmados', 'Arrecadado (R$)'];
      headers.forEach((h, i) => { ws.getCell(linha, i + 1).value = h; });
      const headerRow = ws.getRow(linha);
      headerRow.font = { name: FONT_FAMILY, bold: true, size: 12, color: { argb: HEADER_TEXT } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      headerRow.height = 24;
      headerRow.eachCell(cell => { cell.border = THIN_BORDER; });
      const tabelaHeaderLinha = linha;
      linha++;

      kitsOrdenados.forEach((kit, idx) => {
        const membros = regs.filter((r: any) => (r.kit || kitsOrdenados.find(k => k.isPadrao)?.id) === kit.id);
        const confirmados = membros.filter((m: any) => m.paymentStatus === 'pago');
        const arrecadado = confirmados.reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
        const row = ws.addRow([
          kit.nome + (kit.isPadrao ? ' (padrão)' : ''),
          kit.ativo ? 'Ativo' : 'Inativo',
          kit.precoForcado ? `${(kit.precoForcadoValor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (forçado)` : 'Segue o lote atual',
          membros.length,
          confirmados.length,
          arrecadado / 100,
        ]);
        row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
        row.getCell(6).numFmt = '"R$" #,##0.00';
        const cores = kit.ativo ? { bg: 'FFDCFCE7', fg: 'FF166534' } : { bg: 'FFF1F5F9', fg: 'FF64748B' };
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cores.bg } };
        row.getCell(2).font = { name: FONT_FAMILY, bold: true, size: 11, color: { argb: cores.fg } };
        row.getCell(2).alignment = { horizontal: 'center' };
        row.eachCell((cell, colNum) => {
          if (idx % 2 === 1 && colNum !== 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
          cell.border = THIN_BORDER;
        });
        linha++;
      });
      ws.getColumn(1).width = 30;
      ws.getColumn(2).width = 14;
      ws.getColumn(3).width = 26;
      ws.getColumn(4).width = 14;
      ws.getColumn(5).width = 14;
      ws.getColumn(6).width = 18;
      ws.views = [{ state: 'frozen', ySplit: tabelaHeaderLinha }];

      // Tabela de lotes vigente - o preço que vale hoje pra quem está num kit sem preço
      // forçado (ou fora de qualquer kit).
      linha += 2;
      ws.getCell(`A${linha}`).value = 'LOTES VIGENTES (preço-base pra quem não está em kit com preço forçado)';
      ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, bold: true, size: 15, color: { argb: 'FF071A45' } };
      ws.getRow(linha).height = 26;
      linha++;

      try {
        const lotesSnap = await getDoc(doc(db, 'nightrun_settings', 'lotes'));
        const lotesData: any = lotesSnap.exists() ? lotesSnap.data() : null;
        const adultLots: any[] = Array.isArray(lotesData?.adulto) && lotesData.adulto.length > 0 ? lotesData.adulto : [];
        const infantil = lotesData?.infantil;

        const headersL = ['Categoria', 'Até quantas inscrições', 'Preço (R$)', 'Desconto do lote'];
        headersL.forEach((h, i) => { ws.getCell(linha, i + 1).value = h; });
        const headerRowL = ws.getRow(linha);
        headerRowL.font = { name: FONT_FAMILY, bold: true, size: 11, color: { argb: HEADER_TEXT } };
        headerRowL.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        headerRowL.eachCell(cell => { cell.border = THIN_BORDER; });
        linha++;

        const describeDiscount = (discount: any) => discount?.enabled && discount?.value > 0
          ? (discount.type === 'fixed' ? `${(Number(discount.value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} off` : `${Number(discount.value)}% off`)
          : '—';

        let idxL = 0;
        adultLots.forEach((lote: any) => {
          const row = ws.addRow(['Adulto / Adolescente', lote.max ?? '—', Number(lote.price || 0) / 100, describeDiscount(lote.discount)]);
          row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
          row.getCell(3).numFmt = '"R$" #,##0.00';
          row.eachCell(cell => {
            if (idxL % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
            cell.border = THIN_BORDER;
          });
          idxL++;
          linha++;
        });
        if (infantil) {
          const row = ws.addRow(['Infantil', '—', Number(infantil.price || 0) / 100, describeDiscount(infantil.discount)]);
          row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
          row.getCell(3).numFmt = '"R$" #,##0.00';
          row.eachCell(cell => { cell.border = THIN_BORDER; });
          linha++;
        }
        if (adultLots.length === 0 && !infantil) {
          ws.getCell(`A${linha}`).value = 'Nenhuma configuração de lote encontrada.';
          ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, italic: true, size: 11, color: { argb: 'FF94A3B8' } };
          linha++;
        }
      } catch (e) {
        ws.getCell(`A${linha}`).value = 'Não foi possível consultar os lotes.';
        ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, italic: true, size: 11, color: { argb: 'FFDC2626' } };
        linha++;
      }

      // Detalhe: quem tem cada kit.
      linha += 2;
      ws.getCell(`A${linha}`).value = 'QUEM TEM CADA KIT';
      ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, bold: true, size: 15, color: { argb: 'FF071A45' } };
      ws.getRow(linha).height = 26;
      linha++;

      const headers2 = ['Nome', 'Kit', 'Modalidade', 'Status', 'Valor (R$)'];
      headers2.forEach((h, i) => { ws.getCell(linha, i + 1).value = h; });
      const headerRow2 = ws.getRow(linha);
      headerRow2.font = { name: FONT_FAMILY, bold: true, size: 11, color: { argb: HEADER_TEXT } };
      headerRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      headerRow2.eachCell(cell => { cell.border = THIN_BORDER; });
      const tabelaHeader2Linha = linha;
      linha++;

      const regsOrdenados = [...regs].sort((a: any, b: any) => resolveKitNome(kitsCadastrados, a.kit, a.kitNome).localeCompare(resolveKitNome(kitsCadastrados, b.kit, b.kitNome), 'pt-BR') || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
      regsOrdenados.forEach((r: any, idx: number) => {
        const modalidade = modalidades.find(mm => mm.id === r.modalidadeId);
        const row = ws.addRow([
          r.nome || '',
          resolveKitNome(kitsCadastrados, r.kit, r.kitNome),
          modalidade?.nome || '',
          STATUS_LABEL[r.paymentStatus] || r.paymentStatus || '',
          Number(r.amount || 0) / 100,
        ]);
        row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
        row.getCell(5).numFmt = '"R$" #,##0.00';
        row.eachCell(cell => {
          if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
          cell.border = THIN_BORDER;
        });
      });
      ws.autoFilter = { from: { row: tabelaHeader2Linha, column: 1 }, to: { row: tabelaHeader2Linha + regsOrdenados.length, column: 5 } };
    };

    // Aba "Cupons": cada cupom cadastrado, uso real (de sempre, vindo do próprio cupom) e
    // quanto desconto ele gerou dentro do recorte atual do relatório.
    const writeCuponsSheet = async () => {
      const linhas = await buildCuponsResumo();
      const ws = wb.addWorksheet('Cupons');
      addHeaderBand(ws, 5, `${tituloBase} — CUPONS`);

      const totalDescontoRelatorio = linhas.reduce((s, l) => s + l.descontoNoRelatorio, 0);
      const totalUsosRelatorio = linhas.reduce((s, l) => s + l.usosNoRelatorio, 0);

      let linha = writeKpiCards(ws, 3, [
        { label: 'Cupons cadastrados', value: linhas.length, bg: 'FFDBEAFE', fg: 'FF071A45' },
        { label: 'Usos no relatório', value: totalUsosRelatorio, bg: 'FFDCFCE7', fg: 'FF166534' },
        { label: 'Desconto gerado', value: totalDescontoRelatorio / 100, numFmt: '"R$" #,##0.00', bg: 'FFFEF3C7', fg: 'FF92400E' },
      ]);
      linha += 1;

      if (linhas.length === 0) {
        ws.getCell(`A${linha}`).value = 'Nenhum cupom cadastrado.';
        ws.getCell(`A${linha}`).font = { name: FONT_FAMILY, italic: true, size: 11, color: { argb: 'FF94A3B8' } };
        ws.getColumn(1).width = 50;
        return;
      }

      const headers = ['Código', 'Tipo', 'Valor', 'Status', 'Usos (total)', 'Usos neste relatório', 'Desconto gerado (R$)'];
      headers.forEach((h, i) => { ws.getCell(linha, i + 1).value = h; });
      const headerRow = ws.getRow(linha);
      headerRow.font = { name: FONT_FAMILY, bold: true, size: 12, color: { argb: HEADER_TEXT } };
      headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      headerRow.height = 24;
      headerRow.eachCell(cell => { cell.border = THIN_BORDER; });
      const tabelaHeaderLinha = linha;
      linha++;

      linhas.forEach((c, idx) => {
        const row = ws.addRow([
          c.codigo,
          c.tipo,
          c.valorLabel,
          c.ativo ? 'Ativo' : 'Inativo',
          `${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ''}`,
          c.usosNoRelatorio,
          c.descontoNoRelatorio / 100,
        ]);
        row.font = { name: FONT_FAMILY, size: 11, color: { argb: 'FF334155' } };
        row.getCell(7).numFmt = '"R$" #,##0.00';
        const cores = c.ativo ? { bg: 'FFDCFCE7', fg: 'FF166534' } : { bg: 'FFF1F5F9', fg: 'FF64748B' };
        row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cores.bg } };
        row.getCell(4).font = { name: FONT_FAMILY, bold: true, size: 11, color: { argb: cores.fg } };
        row.getCell(4).alignment = { horizontal: 'center' };
        row.eachCell((cell, colNum) => {
          if (idx % 2 === 1 && colNum !== 4) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
          cell.border = THIN_BORDER;
        });
        linha++;
      });
      ws.getColumn(1).width = 20;
      ws.getColumn(2).width = 16;
      ws.getColumn(3).width = 16;
      ws.getColumn(4).width = 14;
      ws.getColumn(5).width = 16;
      ws.getColumn(6).width = 20;
      ws.getColumn(7).width = 20;
      ws.views = [{ state: 'frozen', ySplit: tabelaHeaderLinha }];
      ws.autoFilter = { from: { row: tabelaHeaderLinha, column: 1 }, to: { row: tabelaHeaderLinha + linhas.length, column: 7 } };
    };

    const setColumnWidths = (ws: ExcelJS.Worksheet, columnCount: number) => {
      for (let i = 1; i <= columnCount; i++) {
        if (fotoColIndex === i - 1) { ws.getColumn(i).width = 7; continue; }
        let maxLen = String(activeColumns[i - 1]?.label || '').length;
        ws.eachRow({ includeEmpty: false }, row => {
          if (row.number === 1) return; // faixa do cabeçalho com a logo - não conta pra largura
          const cell = row.getCell(i);
          const raw = cell.value as any;
          const text = raw && typeof raw === 'object' && 'text' in raw ? raw.text : raw;
          maxLen = Math.max(maxLen, String(text ?? '').length);
        });
        ws.getColumn(i).width = Math.min(Math.max(maxLen + 2, 10), 46);
      }
    };

    // Cria uma aba de dados já com a faixa de cabeçalho (logo + título) na linha 1 e o
    // cabeçalho das colunas logo abaixo - os dados começam na linha seguinte. `antesDaTabela`
    // permite inserir conteúdo (ex: resumo de camisetas) entre a faixa e a tabela em si,
    // retornando em qual linha a tabela deve começar.
    const createDataSheet = (
      sheetName: string,
      titulo: string,
      list: any[],
      zebra: boolean,
      antesDaTabela?: (ws: ExcelJS.Worksheet) => number,
    ) => {
      const ws = wb.addWorksheet(sheetName);
      ws.columns = activeColumns.map(c => ({ key: c.id }));
      addHeaderBand(ws, activeColumns.length, titulo);
      const headerRowIndex = antesDaTabela ? antesDaTabela(ws) : 2;
      const headerRow = ws.getRow(headerRowIndex);
      activeColumns.forEach((c, i) => { headerRow.getCell(i + 1).value = c.label; });
      applyHeaderStyle(headerRow);
      writeRows(ws, list, zebra);
      setColumnWidths(ws, activeColumns.length);
      // Autofiltro no cabeçalho: clicando na setinha de qualquer coluna dá pra ordenar ou
      // filtrar por ela direto no Excel.
      if (list.length > 0) {
        ws.autoFilter = {
          from: { row: headerRowIndex, column: 1 },
          to: { row: headerRowIndex + list.length, column: activeColumns.length },
        };
      }
      // Quando há um bloco extra antes da tabela (ex: resumo de camisetas), NÃO congela ele
      // junto com a faixa do topo - senão ele fica grudado na tela sem rolar. Congela só a
      // faixa de logo/título (linha 1); o resumo de camisetas rola como o resto do conteúdo.
      // Sem bloco extra, mantém o comportamento de sempre: faixa + cabeçalho da tabela fixos.
      ws.views = [{ state: 'frozen', ySplit: antesDaTabela ? 1 : headerRowIndex }];
      return ws;
    };

    const statusColIndex = activeColumns.findIndex(c => c.id === 'statusPagamento');

    const writeRows = (ws: ExcelJS.Worksheet, list: any[], zebra: boolean) => {
      list.forEach((r, idx) => {
        const resolved = activeColumns.map(col => resolveValue(col.id, r, modalidadeMap, camisetaMap, kitsCadastrados));
        const row = ws.addRow(resolved.map(rv => (rv.link ? { text: rv.value, hyperlink: rv.link } : rv.value)));
        resolved.forEach((rv, colIdx) => {
          const cell = row.getCell(colIdx + 1);
          if (rv.numFmt) cell.numFmt = rv.numFmt;
          if (rv.link) cell.font = { name: FONT_FAMILY,color: { argb: LINK_BLUE }, underline: true };
        });
        if (fotoColIndex >= 0) {
          row.height = 28;
          const imagem = r.fotoUrl ? fotoCache.get(r.fotoUrl) : null;
          if (imagem) {
            const imageId = wb.addImage({ base64: imagem.base64, extension: imagem.extension });
            ws.addImage(imageId, {
              tl: { col: fotoColIndex, row: row.number - 1 },
              ext: { width: FOTO_CELL_PX, height: FOTO_CELL_PX },
              editAs: 'oneCell',
            });
          }
        }
        if (zebra && idx % 2 === 1) {
          row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } }; });
        }
        // Selo colorido de status (verde/amarelo/vermelho/cinza) - dá pra usar "Filtrar por
        // cor" do Excel em cima dele, igual planilha de fluxo de caixa.
        if (statusColIndex >= 0) {
          const cores = STATUS_PILL_COLORS[r.paymentStatus] || STATUS_PILL_COLORS.cancelado;
          const cell = row.getCell(statusColIndex + 1);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cores.bg } };
          cell.font = { name: FONT_FAMILY,bold: true, color: { argb: cores.fg } };
          cell.alignment = { horizontal: 'center' };
        }
        row.eachCell(cell => { cell.border = THIN_BORDER; });
      });
    };

    // Bloco de resumo textual (rótulo + valor em 2 colunas) - usado abaixo dos nomes no modo
    // simples. Fontes grandes de propósito para ficar fácil de ler dentro da planilha.
    // As linhas exibidas respeitam os campos marcados em `resumoCampos`.
    const writeResumoBlock = (ws: ExcelJS.Worksheet, baseRegs: any[]) => {
      ws.addRow([]);
      const tituloRow = ws.addRow(['RESUMO']);
      tituloRow.font = { name: FONT_FAMILY,bold: true, size: 18, color: { argb: 'FF071A45' } };
      tituloRow.height = 30;
      tituloRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

      const addLinha = (label: string, valor: any, numFmt?: string, indent = false) => {
        const row = ws.addRow([indent ? `     ${label}` : label, valor]);
        row.height = 20;
        row.getCell(1).font = { name: FONT_FAMILY,bold: !indent, color: { argb: 'FF334155' }, size: indent ? 12 : 13 };
        row.getCell(2).font = { name: FONT_FAMILY,bold: !indent, color: { argb: 'FF071A45' }, size: indent ? 12 : 13 };
        if (numFmt) row.getCell(2).numFmt = numFmt;
        return row;
      };

      if (resumoCampos.dataGeracao) addLinha('Gerado em', new Date().toLocaleString('pt-BR'));
      if (resumoCampos.totalGeral) addLinha('Total geral de inscrições', baseRegs.length);
      if (resumoCampos.arrecadado) {
        const total = baseRegs.reduce((s, r) => s + Number(r.amount || 0), 0) / 100;
        addLinha('Valor total arrecadado', total, '"R$" #,##0.00');
      }
      if (resumoCampos.porStatus) {
        addLinha('Por status de pagamento:', '');
        STATUS_OPTIONS.filter(s => statusSelecionados.has(s.id)).forEach(s => {
          addLinha(s.label, baseRegs.filter(r => r.paymentStatus === s.id).length, undefined, true);
        });
      }
      if (resumoCampos.porModalidade) {
        addLinha('Por modalidade:', '');
        groupedByModalidade.filter(g => g.itens.length > 0).forEach(({ modalidade, itens }) => {
          addLinha(modalidade.nome, itens.length, undefined, true);
        });
      }
    };

    // Bloco "quantos por tamanho de camiseta" no TOPO da aba, logo após a faixa de cabeçalho e
    // ANTES da lista de inscritos em si - com fontes bem maiores pra saltar aos olhos antes de
    // qualquer outra coisa. Retorna em qual linha a tabela de inscritos deve começar.
    const writeCamisetasBlockTop = (ws: ExcelJS.Worksheet, baseRegs: any[]): number => {
      const counts = getCamisetaCounts(baseRegs, camisetaMap);
      const tituloRow = ws.addRow(['RESUMO DE CAMISETAS']);
      tituloRow.font = { name: FONT_FAMILY,bold: true, size: 22, color: { argb: 'FF071A45' } };
      tituloRow.height = 36;
      tituloRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

      if (counts.length === 0) {
        const row = ws.addRow(['Nenhum tamanho de camiseta registrado nos filtros atuais.']);
        row.getCell(1).font = { name: FONT_FAMILY,italic: true, size: 14, color: { argb: 'FF94A3B8' } };
      } else {
        const headerRow = ws.addRow(['Tamanho', 'Quantidade', 'Categoria']);
        headerRow.height = 30;
        headerRow.font = { name: FONT_FAMILY,bold: true, size: 16, color: { argb: HEADER_TEXT } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
        headerRow.eachCell(cell => { cell.border = THIN_BORDER; });

        counts.forEach((c, idx) => {
          const row = ws.addRow([c.label, c.count, c.categoriaLabel]);
          row.height = 26;
          row.font = { name: FONT_FAMILY,size: 16, color: { argb: 'FF334155' } };
          row.getCell(1).font = { name: FONT_FAMILY,bold: true, size: 16, color: { argb: 'FF071A45' } };
          row.getCell(3).font = { name: FONT_FAMILY,bold: c.isInfantil, size: 16, color: { argb: c.isInfantil ? 'FF166534' : 'FF334155' } };
          const fillColor = c.isInfantil ? 'FFDCFCE7' : (idx % 2 === 1 ? STRIPE : null);
          row.eachCell(cell => {
            if (fillColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
            cell.border = THIN_BORDER;
          });
        });

        const totalRow = ws.addRow(['TOTAL', counts.reduce((s, c) => s + c.count, 0)]);
        totalRow.height = 28;
        totalRow.font = { name: FONT_FAMILY,bold: true, size: 16, color: { argb: 'FF071A45' } };
        totalRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; cell.border = THIN_BORDER; });
      }

      ws.addRow([]); // respiro entre o resumo de camisetas e a tabela de inscritos
      return ws.rowCount + 1;
    };

    if (complexidade === 'simples') {
      const ws = createDataSheet(
        'Inscritos', `${tituloBase} — LISTA DE INSCRITOS`, sortedRegs, true,
        incluirResumoCamisetas ? (sheet) => writeCamisetasBlockTop(sheet, sortedRegs) : undefined,
      );
      if (incluirResumo) writeResumoBlock(ws, sortedRegs);
      if (incluirSaldoBancos) writeSaldoBancosBlock(ws);
      const colunasExtras = incluirResumoCamisetas ? 3 : (incluirResumo || incluirSaldoBancos ? 2 : 0);
      setColumnWidths(ws, Math.max(activeColumns.length, colunasExtras));
      if (incluirResumo || incluirSaldoBancos) ws.getColumn(1).width = Math.max(ws.getColumn(1).width || 10, 34);
    } else if (!incluirResumo && !incluirResumoCamisetas && !incluirSaldoBancos) {
      const usedNames = new Set<string>();
      groupedByModalidade.filter(g => g.itens.length > 0).forEach(({ modalidade, itens }) => {
        const sheetName = sanitizeSheetName(modalidade.nome, usedNames);
        createDataSheet(sheetName, `${tituloBase} — ${modalidade.nome.toUpperCase()}`, itens, true);
      });
    } else {
      const resumoWs = wb.addWorksheet('Resumo');
      // 9 colunas cobre a tabela por modalidade mais larga (com Vencidos/Cancelados/Arrecadado)
      // e os cartões de KPI, pra faixa do cabeçalho nunca ficar mais estreita que o conteúdo.
      addHeaderBand(resumoWs, 9, `${tituloBase} — RESUMO DE INSCRITOS`);
      if (incluirResumo && resumoCampos.dataGeracao) {
        resumoWs.getCell('A2').value = `Gerado em ${new Date().toLocaleString('pt-BR')}`;
        resumoWs.getCell('A2').font = { name: FONT_FAMILY,italic: true, color: { argb: 'FF64748B' }, size: 11 };
      }

      // Cartões de KPI logo abaixo do cabeçalho - visão rápida de confirmados, pendentes e
      // arrecadado antes de qualquer tabela. Só entra cada cartão se o campo correspondente
      // estiver marcado no menu "Resumo na planilha" - nada de mostrar dado que não foi pedido.
      const kpiCards: { label: string; value: any; numFmt?: string; bg: string; fg: string }[] = [];
      if (incluirResumo && resumoCampos.porStatus) {
        kpiCards.push(
          { label: 'Confirmados', value: sortedRegs.filter(r => r.paymentStatus === 'pago').length, bg: 'FFDCFCE7', fg: 'FF166534' },
          { label: 'Pendentes', value: sortedRegs.filter(r => r.paymentStatus === 'pendente').length, bg: 'FFFEF9C3', fg: 'FF854D0E' },
        );
      }
      if (incluirResumo && resumoCampos.arrecadado) {
        const arrecadadoTotalGeral = sortedRegs.reduce((s, r) => s + Number(r.amount || 0), 0) / 100;
        kpiCards.push({ label: 'Arrecadado', value: arrecadadoTotalGeral, numFmt: '"R$" #,##0.00', bg: 'FFDBEAFE', fg: 'FF071A45' });
      }
      if (incluirSaldoBancos) {
        if (saldoBancos?.cora?.ok) kpiCards.push({ label: 'Saldo Cora', value: (saldoBancos.cora.balanceCents || 0) / 100, numFmt: '"R$" #,##0.00', bg: 'FFE0E7FF', fg: 'FF3730A3' });
        if (saldoBancos?.asaas?.ok) kpiCards.push({ label: 'Saldo Asaas', value: (saldoBancos.asaas.balanceCents || 0) / 100, numFmt: '"R$" #,##0.00', bg: 'FFFCE7F3', fg: 'FF9D174D' });
      }
      let linha = kpiCards.length > 0 ? writeKpiCards(resumoWs, 4, kpiCards) : 4;
      let larguraMinimaColA = 30;

      if (incluirSaldoBancos && !saldoBancos?.cora?.ok && !saldoBancos?.asaas?.ok) {
        resumoWs.getCell(`A${linha}`).value = `Não foi possível consultar o saldo dos bancos: ${saldoBancos?.cora?.error || saldoBancos?.asaas?.error || 'erro desconhecido'}`;
        resumoWs.getCell(`A${linha}`).font = { name: FONT_FAMILY, italic: true, size: 11, color: { argb: 'FFDC2626' } };
        linha += 2;
      }

      // Resumo de camisetas vem ANTES da tabela por modalidade, bem maior que o resto -
      // é a primeira coisa que aparece na aba depois do cabeçalho.
      if (incluirResumoCamisetas) {
        const counts = getCamisetaCounts(sortedRegs, camisetaMap);
        resumoWs.getCell(`A${linha}`).value = 'CAMISETAS';
        resumoWs.getCell(`A${linha}`).font = { name: FONT_FAMILY,bold: true, size: 20, color: { argb: 'FF071A45' } };
        resumoWs.getRow(linha).height = 34;
        linha++;

        if (counts.length === 0) {
          resumoWs.getCell(`A${linha}`).value = 'Nenhum tamanho de camiseta registrado nos filtros atuais.';
          resumoWs.getCell(`A${linha}`).font = { name: FONT_FAMILY,italic: true, size: 13, color: { argb: 'FF94A3B8' } };
          linha++;
        } else {
          resumoWs.getCell(`A${linha}`).value = 'Tamanho';
          resumoWs.getCell(`B${linha}`).value = 'Quantidade';
          resumoWs.getCell(`C${linha}`).value = 'Categoria';
          resumoWs.getRow(linha).font = { name: FONT_FAMILY,bold: true, size: 15, color: { argb: HEADER_TEXT } };
          resumoWs.getRow(linha).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
          resumoWs.getRow(linha).height = 30;
          resumoWs.getRow(linha).eachCell(cell => { cell.border = THIN_BORDER; });
          linha++;
          counts.forEach((c, idx) => {
            const row = resumoWs.getRow(linha);
            resumoWs.getCell(`A${linha}`).value = c.label;
            resumoWs.getCell(`B${linha}`).value = c.count;
            resumoWs.getCell(`C${linha}`).value = c.categoriaLabel;
            row.font = { name: FONT_FAMILY,size: 15, color: { argb: 'FF334155' } };
            row.getCell(1).font = { name: FONT_FAMILY,bold: true, size: 15, color: { argb: 'FF071A45' } };
            row.getCell(3).font = { name: FONT_FAMILY,bold: c.isInfantil, size: 15, color: { argb: c.isInfantil ? 'FF166534' : 'FF334155' } };
            row.height = 26;
            const fillColor = c.isInfantil ? 'FFDCFCE7' : (idx % 2 === 1 ? STRIPE : null);
            row.eachCell(cell => {
              if (fillColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
              cell.border = THIN_BORDER;
            });
            larguraMinimaColA = Math.max(larguraMinimaColA, c.label.length + 6);
            linha++;
          });
          const totalRow = resumoWs.getRow(linha);
          resumoWs.getCell(`A${linha}`).value = 'TOTAL';
          resumoWs.getCell(`B${linha}`).value = counts.reduce((s, c) => s + c.count, 0);
          totalRow.font = { name: FONT_FAMILY,bold: true, size: 16, color: { argb: 'FF071A45' } };
          totalRow.height = 28;
          totalRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; cell.border = THIN_BORDER; });
          resumoWs.getColumn(2).width = Math.max(resumoWs.getColumn(2).width || 0, 20);
          resumoWs.getColumn(3).width = Math.max(resumoWs.getColumn(3).width || 0, 16);
          linha++;
        }
        linha += 2;
      }

      if (incluirResumo) {
        if (resumoCampos.totalGeral) {
          resumoWs.getCell(`A${linha}`).value = 'Total geral de inscrições';
          resumoWs.getCell(`A${linha}`).font = { name: FONT_FAMILY,bold: true, size: 13, color: { argb: 'FF071A45' } };
          resumoWs.getCell(`B${linha}`).value = sortedRegs.length;
          resumoWs.getCell(`B${linha}`).font = { name: FONT_FAMILY,bold: true, size: 13, color: { argb: 'FF071A45' } };
          resumoWs.getRow(linha).height = 20;
          linha += 2;
        }

        const mostrarPorModalidade = resumoCampos.porModalidade;
        const mostrarPorStatusExtra = resumoCampos.porStatus;
        const mostrarArrecadado = resumoCampos.arrecadado;

        if (mostrarPorModalidade) {
          // "Confirmados/Pendentes/Vencidos/Cancelados" só aparecem se "Total por status de
          // pagamento" estiver marcado no menu - senão a tabela fica só com Modalidade/Total
          // (+ Arrecadado, se esse também estiver marcado).
          const headers = ['Modalidade', 'Categoria', 'Distância', 'Total'];
          if (mostrarPorStatusExtra) headers.push('Confirmados', 'Pendentes', 'Vencidos', 'Cancelados');
          if (mostrarArrecadado) headers.push('Arrecadado');
          const tabelaModalidadeHeaderLinha = linha;
          headers.forEach((h, i) => { resumoWs.getCell(linha, i + 1).value = h; });
          resumoWs.getRow(linha).font = { name: FONT_FAMILY,bold: true, size: 13, color: { argb: HEADER_TEXT } };
          resumoWs.getRow(linha).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
          resumoWs.getRow(linha).height = 26;
          resumoWs.getRow(linha).eachCell(cell => { cell.border = THIN_BORDER; });
          linha++;

          let totalGeral = 0, confGeral = 0, pendGeral = 0, vencGeral = 0, cancGeral = 0, arrecadadoGeral = 0;
          // Modalidade que mais arrecadou primeiro.
          const gruposPorArrecadacao = [...groupedByModalidade].sort((a, b) => {
            const arrecA = a.itens.reduce((s, i) => s + Number(i.amount || 0), 0);
            const arrecB = b.itens.reduce((s, i) => s + Number(i.amount || 0), 0);
            return arrecB - arrecA;
          });
          gruposPorArrecadacao.forEach(({ modalidade, itens }, idx) => {
            const total = itens.length;
            const confirmados = itens.filter(i => i.paymentStatus === 'pago').length;
            const pendentes = itens.filter(i => i.paymentStatus === 'pendente').length;
            const vencidos = itens.filter(i => i.paymentStatus === 'vencido').length;
            const cancelados = itens.filter(i => i.paymentStatus === 'cancelado').length;
            const arrecadado = itens.reduce((s, i) => s + Number(i.amount || 0), 0) / 100;
            totalGeral += total; confGeral += confirmados; pendGeral += pendentes; vencGeral += vencidos; cancGeral += cancelados; arrecadadoGeral += arrecadado;
            const values: any[] = [modalidade.nome, modalidade.categoria === 'infantil' ? 'Infantil' : 'Adulto', modalidade.distancia || '', total];
            if (mostrarPorStatusExtra) values.push(confirmados, pendentes, vencidos, cancelados);
            if (mostrarArrecadado) values.push(arrecadado);
            const row = resumoWs.addRow(values);
            row.font = { name: FONT_FAMILY,size: 12, color: { argb: 'FF334155' } };
            row.height = 22;
            if (mostrarArrecadado) row.getCell(headers.length).numFmt = '"R$" #,##0.00';
            row.eachCell(cell => {
              if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
              cell.border = THIN_BORDER;
            });
          });
          // Autofiltro: clicar em qualquer subtítulo (Modalidade, Total, Arrecadado...) ordena
          // por ele. Só cobre as linhas de dado - a linha "TOTAL GERAL" fica de fora do filtro.
          if (gruposPorArrecadacao.length > 0) {
            resumoWs.autoFilter = {
              from: { row: tabelaModalidadeHeaderLinha, column: 1 },
              to: { row: tabelaModalidadeHeaderLinha + gruposPorArrecadacao.length, column: headers.length },
            };
          }
          const totalValues: any[] = ['TOTAL GERAL', '', '', totalGeral];
          if (mostrarPorStatusExtra) totalValues.push(confGeral, pendGeral, vencGeral, cancGeral);
          if (mostrarArrecadado) totalValues.push(arrecadadoGeral);
          const totalRow = resumoWs.addRow(totalValues);
          totalRow.font = { name: FONT_FAMILY,bold: true, size: 12.5 };
          totalRow.height = 24;
          totalRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; cell.border = THIN_BORDER; });
          if (mostrarArrecadado) totalRow.getCell(headers.length).numFmt = '"R$" #,##0.00';

          for (let i = 1; i <= headers.length; i++) {
            resumoWs.getColumn(i).width = Math.max((headers[i - 1] || '').length + 6, 20);
          }
        } else if (mostrarArrecadado || mostrarPorStatusExtra) {
          // Sem a tabela por modalidade: ainda assim mostra os totais gerais pedidos.
          if (mostrarPorStatusExtra) {
            STATUS_OPTIONS.filter(s => statusSelecionados.has(s.id)).forEach(s => {
              const row = resumoWs.getRow(linha);
              resumoWs.getCell(`A${linha}`).value = s.label;
              resumoWs.getCell(`B${linha}`).value = sortedRegs.filter(r => r.paymentStatus === s.id).length;
              row.font = { name: FONT_FAMILY,size: 12.5, color: { argb: 'FF334155' } };
              row.height = 22;
              linha++;
            });
          }
          if (mostrarArrecadado) {
            const totalArrecadado = sortedRegs.reduce((s, r) => s + Number(r.amount || 0), 0) / 100;
            const row = resumoWs.getRow(linha);
            resumoWs.getCell(`A${linha}`).value = 'Valor total arrecadado';
            resumoWs.getCell(`B${linha}`).value = totalArrecadado;
            resumoWs.getCell(`B${linha}`).numFmt = '"R$" #,##0.00';
            row.font = { name: FONT_FAMILY,bold: true, size: 12.5, color: { argb: 'FF071A45' } };
            row.height = 22;
            linha++;
          }
          resumoWs.getColumn(2).width = 20;
        }
        linha += 2;
      }

      resumoWs.getColumn(1).width = Math.max(resumoWs.getColumn(1).width || 0, larguraMinimaColA);

      const usedNames = new Set<string>(['resumo']);
      groupedByModalidade.filter(g => g.itens.length > 0).forEach(({ modalidade, itens }) => {
        const sheetName = sanitizeSheetName(modalidade.nome, usedNames);
        createDataSheet(sheetName, `${tituloBase} — ${modalidade.nome.toUpperCase()}`, itens, true);
      });
    }

    // Abas de extrato bancário - independentes do modo simples/organizada. A Cora e o Asaas
    // já chegam aqui normalizados no mesmo formato pelo worker, mas cada um trata entrada/saída
    // de um jeito bem diferente por trás: a Cora exige duas consultas (uma de créditos, outra
    // de débitos); o Asaas devolve tudo numa lista só e o sentido é inferido por sinal/texto.
    if (incluirExtratoCora) {
      writeExtratoSheet('Extrato Cora', `${tituloBase} — EXTRATO CORA`, movimentosBancos?.cora);
    }
    if (incluirExtratoAsaas) {
      writeExtratoSheet('Extrato Asaas', `${tituloBase} — EXTRATO ASAAS`, movimentosBancos?.asaas, saldoBancos?.asaas?.pendingCredit);
    }

    if (incluirEquipes) {
      writeEquipesSheet();
    }

    if (incluirKitsInfo) {
      setProgressoLabel('MONTANDO ABA DE KITS...');
      await writeKitsSheet();
    }

    if (incluirCupons) {
      setProgressoLabel('MONTANDO ABA DE CUPONS...');
      await writeCuponsSheet();
    }

    // Aba "Por Dia": uma aba extra e independente do modo (simples/organizada), sempre que
    // marcada. Cobre TODO dia dentro do período escolhido - inclusive dias sem nenhuma
    // inscrição, que aparecem explicitamente como "Nenhuma inscrição neste dia".
    if (incluirListaPorDia && dataInicioLista && dataFimLista) {
      const inicio = new Date(`${dataInicioLista}T00:00:00`);
      const fim = new Date(`${dataFimLista}T23:59:59`);
      if (!Number.isNaN(inicio.getTime()) && !Number.isNaN(fim.getTime()) && inicio <= fim) {
        const porDia = new Map<string, any[]>();
        filteredRegs.forEach(r => {
          const d = toDateValue(r.createdAt);
          if (!d || d < inicio || d > fim) return;
          const key = toInputDate(d);
          if (!porDia.has(key)) porDia.set(key, []);
          porDia.get(key)!.push(r);
        });

        const diaWs = wb.addWorksheet('Por Dia');
        addHeaderBand(diaWs, 4, `${tituloBase} — INSCRIÇÕES POR DIA`);
        let linha = 3;
        let maiorNome = 24;
        const cursor = new Date(inicio);

        while (cursor <= fim) {
          const chave = toInputDate(cursor);
          const itensDoDia = (porDia.get(chave) || []).slice()
            .sort((a, b) => (toDateValue(a.createdAt)?.getTime() || 0) - (toDateValue(b.createdAt)?.getTime() || 0));

          diaWs.mergeCells(`A${linha}:C${linha}`);
          const diaLabelBruto = cursor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
          diaWs.getCell(`A${linha}`).value = diaLabelBruto.charAt(0).toUpperCase() + diaLabelBruto.slice(1);
          diaWs.getCell(`D${linha}`).value = `${itensDoDia.length} inscrição(ões)`;
          const diaHeaderRow = diaWs.getRow(linha);
          diaHeaderRow.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; });
          diaHeaderRow.getCell(1).font = { name: FONT_FAMILY,bold: true, size: 14, color: { argb: 'FF071A45' } };
          diaHeaderRow.getCell(4).font = { name: FONT_FAMILY,bold: true, size: 12, color: { argb: itensDoDia.length > 0 ? 'FF16A34A' : 'FF94A3B8' } };
          diaHeaderRow.height = 24;
          linha++;

          if (itensDoDia.length === 0) {
            diaWs.getCell(`A${linha}`).value = 'Nenhuma inscrição neste dia.';
            diaWs.getCell(`A${linha}`).font = { name: FONT_FAMILY,italic: true, size: 11, color: { argb: 'FF94A3B8' } };
            diaWs.getRow(linha).height = 20;
            linha++;
          } else {
            const subHeaderRow = diaWs.getRow(linha);
            diaWs.getCell(`A${linha}`).value = 'Nome';
            diaWs.getCell(`B${linha}`).value = 'Horário exato';
            diaWs.getCell(`C${linha}`).value = 'Modalidade';
            diaWs.getCell(`D${linha}`).value = 'Status';
            subHeaderRow.font = { name: FONT_FAMILY,bold: true, size: 11, color: { argb: HEADER_TEXT } };
            subHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
            subHeaderRow.height = 20;
            linha++;

            itensDoDia.forEach((r, idx) => {
              const row = diaWs.getRow(linha);
              diaWs.getCell(`A${linha}`).value = r.nome || '';
              diaWs.getCell(`B${linha}`).value = formatDateTimeBR(r.createdAt, '');
              diaWs.getCell(`C${linha}`).value = modalidadeMap[r.modalidadeId]?.nome || 'Outra';
              diaWs.getCell(`D${linha}`).value = STATUS_LABEL[r.paymentStatus] || r.paymentStatus || '';
              row.font = { name: FONT_FAMILY,size: 11, color: { argb: 'FF334155' } };
              row.getCell(1).font = { name: FONT_FAMILY,bold: true, size: 11, color: { argb: 'FF071A45' } };
              row.height = 18;
              if (idx % 2 === 1) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } }; });
              maiorNome = Math.max(maiorNome, String(r.nome || '').length + 2);
              linha++;
            });
          }
          linha += 1;
          cursor.setDate(cursor.getDate() + 1);
        }

        diaWs.getColumn(1).width = Math.min(Math.max(maiorNome, 24), 46);
        diaWs.getColumn(2).width = 20;
        diaWs.getColumn(3).width = 26;
        diaWs.getColumn(4).width = 18;
        // Só a faixa do topo (linha 1) fica fixa - cada dia tem seu próprio bloco de título,
        // então congelar uma linha fixa a mais prenderia o título de um dia específico na tela.
        diaWs.views = [{ state: 'frozen', ySplit: 1 }];
      }
    }

    return wb.xlsx.writeBuffer();
  };

  // PDF pra impressão em A4 paisagem (mais colunas cabem legíveis do que em retrato).
  // Cada linha só é desenhada se couber inteira na página atual - senão pula pra próxima
  // ANTES de desenhar, então nenhuma linha ou cabeçalho de seção fica cortado ao meio.
  const PDF_NAVY: [number, number, number] = [7, 26, 69];
  const PDF_GREEN: [number, number, number] = [22, 163, 74];
  const PDF_GRAY: [number, number, number] = [100, 116, 139];
  const PDF_STRIPE: [number, number, number] = [241, 245, 249];
  const PDF_LIGHT_BLUE: [number, number, number] = [219, 234, 254];

  // Pesos relativos de largura por coluna - texto tipicamente longo (nome, e-mail, endereço)
  // ganha mais espaço que texto curto (idade, sexo, status), pra evitar corte/truncamento.
  const PDF_COL_WEIGHT: Record<string, number> = {
    nome: 2.6, email: 2.4, telefone: 1.3, cpf: 1.3, dataNascimento: 1.3, idade: 0.7,
    sexo: 0.9, responsavel: 2.0, modalidade: 1.8, distancia: 1.1, categoria: 1.4,
    equipe: 1.6, kit: 1.6, camiseta: 1.4, statusPagamento: 1.2, formaPagamento: 1.5,
    valorPago: 1.1, dataInscricao: 1.3, linkComprovante: 1.8, saude: 2.2,
    contatoEmergencia: 2.0, linkEuVou: 1.6,
  };

  // Nome de pessoa no PDF sempre em maiúsculas - inscrito, responsável e contato de
  // emergência. Não mexe em e-mail, endereço ou outros textos livres.
  const PDF_NAME_COLS = new Set(['nome', 'responsavel', 'contatoEmergencia']);
  const pdfUpperIfName = (colId: string, val: string) => (PDF_NAME_COLS.has(colId) ? val.toUpperCase() : val);

  const buildPdf = async () => {
    const tituloBase = tituloPersonalizado.trim() || 'MCU NIGHT RUN 2026';
    const logoImagem = await fetchImagemBase64('/LOGO NIGHT RUN SEM FUNDO (em amarelo).png');
    const transitionImagem = await fetchImagemBase64('/page-transition.png');

    // Fotos dos inscritos (só se a coluna "Foto" estiver marcada) - baixadas uma vez e
    // reaproveitadas tanto no layout de fichas quanto na tabela normal.
    const incluirFotoPdf = !!colunas.foto;
    let fotoCache: Map<string, FotoImagem | null> = new Map();
    if (incluirFotoPdf && sortedRegs.length > 0) {
      const urls = Array.from(new Set(sortedRegs.map(r => r.fotoUrl).filter(Boolean)));
      if (urls.length > 0) {
        setProgressoLabel('BAIXANDO FOTOS...');
        fotoCache = await fetchFotosParaPdfEmLote(urls, (feitas, total) => setProgressoLabel(`BAIXANDO FOTOS ${feitas}/${total}...`));
        setProgressoLabel('MONTANDO PDF...');
      }
    }

    const docPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const pageW = docPdf.internal.pageSize.getWidth();
    const pageH = docPdf.internal.pageSize.getHeight();
    const marginX = 12;
    const usableW = pageW - marginX * 2;
    const HEADER_BAND_H = 16;
    const SECTION_BAR_H = 7;
    const marginTop = HEADER_BAND_H + 8;
    // Reserva espaço no fim da página pra faixa de seção + linha de rodapé.
    const marginBottom = SECTION_BAR_H + 13;
    let y = marginTop;
    // Começa em 0 porque a capa (sem número visível) não conta - a 1ª página de conteúdo de
    // verdade é que vira "Página 1".
    let pageNum = 0;
    // Nome da seção atual, sempre visível na faixa cinza no FIM de toda página - é o que
    // permite saber em que parte do relatório você está mesmo abrindo o PDF direto numa
    // página do meio, sem precisar voltar pro início.
    let currentSectionLabel = 'VISÃO GERAL';
    // Callback da seção em andamento pra repetir o cabeçalho de tabela na página nova -
    // cada seção (kits, equipes, extrato, tabela principal...) registra a própria antes de
    // desenhar suas linhas, e desliga ao terminar.
    let repeatSectionHeader: (() => void) | null = null;
    // Na página de capa de seção o título gigante já anuncia a seção - repetir a faixa
    // "SEÇÃO: X" embaixo fica redundante (e visualmente ela nem encosta no painel navy).
    let isDividerPage = false;

    const drawHeaderBand = () => {
      docPdf.setFillColor(...PDF_NAVY);
      docPdf.rect(0, 0, pageW, HEADER_BAND_H, 'F');
      if (logoImagem) {
        const logoH = 9;
        const logoW = logoH * LOGO_RATIO;
        docPdf.addImage(logoImagem.base64, logoImagem.extension.toUpperCase(), marginX, (HEADER_BAND_H - logoH) / 2, logoW, logoH, 'mcu-logo-pdf', 'FAST');
      } else {
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(...PDF_GREEN);
        docPdf.text('MCU NIGHT RUN 2026', marginX, HEADER_BAND_H / 2 + 3);
      }
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(10);
      docPdf.setTextColor(255, 255, 255);
      docPdf.text(tituloBase, pageW - marginX, HEADER_BAND_H / 2 + 3, { align: 'right' });
    };

    // Faixa de seção - fica no FIM de toda página, mostra em qual parte do relatório você
    // está mesmo abrindo o PDF direto numa página do meio, sem precisar voltar pro início.
    const drawSectionBar = () => {
      const barY = pageH - SECTION_BAR_H - 9;
      docPdf.setFillColor(...PDF_STRIPE);
      docPdf.rect(0, barY, pageW, SECTION_BAR_H, 'F');
      docPdf.setFillColor(...PDF_GREEN);
      docPdf.rect(0, barY, 2.4, SECTION_BAR_H, 'F');
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(8);
      docPdf.setTextColor(...PDF_NAVY);
      docPdf.text(`SEÇÃO: ${currentSectionLabel.toUpperCase()}`, marginX, barY + SECTION_BAR_H - 2.3);
    };

    // Página de transição (capa + divisórias de módulo) não tem cabeçalho nem rodapé - é a
    // imagem cheia, do jeito que foi pedido, sem nenhuma faixa navy ou linha de texto por cima.
    const drawFooter = () => {
      if (isDividerPage) return;
      drawSectionBar();
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(7.5);
      docPdf.setTextColor(...PDF_GRAY);
      docPdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, marginX, pageH - 6);
      docPdf.text(`Página ${pageNum}`, pageW - marginX, pageH - 6, { align: 'right' });
    };

    const newPage = (opts?: { skipHeader?: boolean }) => {
      drawFooter();
      docPdf.addPage();
      pageNum += 1;
      if (!opts?.skipHeader) drawHeaderBand();
      y = marginTop;
      if (repeatSectionHeader) repeatSectionHeader();
    };

    const ensureSpace = (neededHeight: number) => {
      if (y + neededHeight > pageH - marginBottom) newPage();
    };

    const drawSectionTitle = (text: string, total?: string) => {
      repeatSectionHeader = null;
      ensureSpace(13);
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(12.5);
      docPdf.setTextColor(...PDF_NAVY);
      docPdf.text(text, marginX, y + 5);
      if (total) {
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8.5);
        docPdf.setTextColor(...PDF_GRAY);
        docPdf.text(total, pageW - marginX, y + 5, { align: 'right' });
      }
      y += 7;
      docPdf.setDrawColor(...PDF_GREEN);
      docPdf.setLineWidth(0.6);
      docPdf.line(marginX, y, marginX + usableW, y);
      docPdf.setLineWidth(0.2);
      y += 5;
    };

    // Página "capa de seção" - um painel navy cheio (não uma caixinha perdida no branco),
    // com faixa verde de destaque, título grande e um círculo decorativo de contorno ao
    // fundo. Toda vez que o relatório muda de módulo (kits, cupons, equipes, bancos, lista
    // por dia, inscritos) passa por uma página dessas antes do conteúdo em si começar numa
    // página limpa - fica óbvio ao folhear onde termina um bloco e começa o outro.
    let sectionIndex = 0;
    const drawSectionDivider = (title: string, subtitle?: string) => {
      // newPage() ANTES de trocar o rótulo - assim a página que está sendo deixada pra trás
      // fecha com o rodapé e a faixa de seção correta (a seção anterior). skipHeader tira a
      // faixa navy do topo dessa página nova - ela é só a imagem, sem cabeçalho nem rodapé.
      newPage({ skipHeader: true });
      currentSectionLabel = title;
      repeatSectionHeader = null;
      isDividerPage = true;
      sectionIndex += 1;

      const areaTop = 0;
      const areaBottom = pageH;
      const areaH = areaBottom - areaTop;

      if (transitionImagem) {
        try { docPdf.addImage(transitionImagem.base64, transitionImagem.extension.toUpperCase(), 0, areaTop, pageW, areaH, 'page-transition-bg', 'FAST'); } catch { docPdf.setFillColor(...PDF_NAVY); docPdf.rect(0, areaTop, pageW, areaH, 'F'); }
      } else {
        docPdf.setFillColor(...PDF_NAVY);
        docPdf.rect(0, areaTop, pageW, areaH, 'F');
      }
      docPdf.setFillColor(...PDF_GREEN);
      docPdf.rect(0, areaTop, 6, areaH, 'F');

      // Numeral gigante e discreto no canto - textura de fundo, sem competir com o título.
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(95);
      docPdf.setTextColor(24, 38, 68);
      docPdf.text(String(sectionIndex).padStart(2, '0'), 12, areaBottom - 4);

      const titleX = 48;
      const centerY = areaTop + areaH * 0.4;

      // Duplo chevron (»») verde à esquerda do título, como um ícone de "avançar".
      docPdf.setFillColor(...PDF_GREEN);
      docPdf.triangle(22, centerY - 7, 22, centerY + 7, 30, centerY, 'F');
      docPdf.setFillColor(140, 230, 140);
      docPdf.triangle(31, centerY - 7, 31, centerY + 7, 39, centerY, 'F');

      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(9);
      docPdf.setTextColor(...PDF_GREEN);
      docPdf.text(`MÓDULO ${String(sectionIndex).padStart(2, '0')}`, titleX, centerY - 14);

      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(32);
      docPdf.setTextColor(255, 255, 255);
      docPdf.text(title.toUpperCase(), titleX, centerY + 8);

      docPdf.setDrawColor(...PDF_GREEN);
      docPdf.setLineWidth(1.1);
      docPdf.line(titleX, centerY + 16, titleX + 60, centerY + 16);
      docPdf.setLineWidth(0.2);

      if (subtitle) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(11);
        docPdf.setTextColor(210, 219, 236);
        docPdf.text(subtitle, titleX, centerY + 26);
      }

      newPage();
      isDividerPage = false;
    };

    // Cartões de KPI genéricos - qualquer seção usa (resumo geral, kits, equipes, cupons,
    // extratos), largura dividida igualmente entre quantos cards forem passados.
    const drawKpiRow = (cards: { label: string; value: string }[]) => {
      repeatSectionHeader = null;
      const cardsH = 16;
      ensureSpace(cardsH + 6);
      docPdf.setFillColor(...PDF_LIGHT_BLUE);
      docPdf.roundedRect(marginX, y, usableW, cardsH, 2, 2, 'F');
      const colW = usableW / cards.length;
      cards.forEach((card, index) => {
        const cx = marginX + colW * index + colW / 2;
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(11);
        docPdf.setTextColor(...PDF_NAVY);
        docPdf.text(card.value, cx, y + 9, { align: 'center' });
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(6.5);
        docPdf.setTextColor(...PDF_GRAY);
        docPdf.text(card.label.toUpperCase(), cx, y + 13.5, { align: 'center', maxWidth: colW - 4 });
      });
      y += cardsH + 6;
    };

    // Tabela genérica com quebra de texto (nunca corta palavra pra caber) - altura da linha
    // se adapta ao maior número de linhas entre as células daquela linha, e o cabeçalho se
    // repete sozinho em toda página nova enquanto essa tabela estiver sendo desenhada. Fonte
    // é sempre reafirmada DEPOIS do ensureSpace de cada linha - se ele disparar uma quebra de
    // página, drawHeaderRow desenha o cabeçalho em negrito e, sem essa reafirmação, a linha
    // seguinte "herdava" esse negrito sem querer (o bug do "fica em negrito do nada").
    const drawWrappedTable = (
      headers: string[],
      rows: (string | number)[][],
      weights?: number[],
      opts?: {
        photos?: (FotoImagem | null)[];
        pillCol?: { index: number; colorFn: (value: string) => { bg: [number, number, number]; fg: [number, number, number] } };
        cellLinks?: (string | undefined)[][];
      },
    ) => {
      const PAD = 1.6;
      const LINE_H = 3.4;
      const HEADER_H = 6.2;
      const PHOTO_W = opts?.photos ? 14 : 0;
      const tableW = usableW - PHOTO_W;
      const w = weights || headers.map(() => 1);
      const totalW = w.reduce((s, v) => s + v, 0);
      const widths = w.map(v => (v / totalW) * tableW);

      const drawHeaderRow = () => {
        docPdf.setFillColor(...PDF_NAVY);
        docPdf.rect(marginX, y, usableW, HEADER_H, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(7);
        docPdf.setTextColor(255, 255, 255);
        let cx = marginX + PHOTO_W + PAD;
        headers.forEach((h, i) => {
          docPdf.text(h.toUpperCase(), cx, y + HEADER_H - 2.2, { maxWidth: widths[i] - PAD * 2 });
          cx += widths[i];
        });
        y += HEADER_H;
      };

      repeatSectionHeader = drawHeaderRow;
      ensureSpace(HEADER_H);
      drawHeaderRow();

      rows.forEach((row, idx) => {
        const wrapped = row.map((cell, i) => docPdf.splitTextToSize(String(cell ?? '') || '-', widths[i] - PAD * 2));
        const lineCount = Math.max(1, ...wrapped.map(w2 => w2.length));
        const photoH = PHOTO_W > 0 ? PHOTO_W - 2 : 0;
        const rowH = Math.max(lineCount * LINE_H + 1.6, photoH + 2);
        ensureSpace(rowH);
        // Reafirma a fonte AQUI, depois do possível salto de página acima.
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(7);
        if (idx % 2 === 1) {
          docPdf.setFillColor(...PDF_STRIPE);
          docPdf.rect(marginX, y, usableW, rowH, 'F');
        }
        if (opts?.photos) {
          const foto = opts.photos[idx];
          if (foto) {
            try { docPdf.addImage(foto.base64, foto.extension.toUpperCase(), marginX + 1, y + 1, photoH, photoH, undefined, 'FAST'); } catch { /* foto quebrada - ignora */ }
          }
        }
        docPdf.setTextColor(...PDF_NAVY);
        let cx = marginX + PHOTO_W + PAD;
        wrapped.forEach((lines, i) => {
          const linkUrl = opts?.cellLinks?.[idx]?.[i];
          if (opts?.pillCol && opts.pillCol.index === i) {
            const value = String(row[i] ?? '');
            const colors = opts.pillCol.colorFn(value);
            const pillW = Math.min(widths[i] - PAD, docPdf.getTextWidth(value) + 5);
            docPdf.setFillColor(...colors.bg);
            docPdf.roundedRect(cx, y + (rowH - 4.4) / 2, pillW, 4.4, 1, 1, 'F');
            docPdf.setFont('helvetica', 'bold');
            docPdf.setFontSize(7);
            docPdf.setTextColor(...colors.fg);
            docPdf.text(value, cx + pillW / 2, y + rowH / 2 + 1.1, { align: 'center' });
            docPdf.setFont('helvetica', 'normal');
            docPdf.setTextColor(...PDF_NAVY);
          } else if (linkUrl) {
            docPdf.setTextColor(37, 99, 235);
            docPdf.textWithLink(String(row[i] ?? ''), cx, y + LINE_H - 0.6, { url: linkUrl });
            docPdf.setTextColor(...PDF_NAVY);
          } else {
            docPdf.text(lines, cx, y + LINE_H - 0.6);
          }
          cx += widths[i];
        });
        y += rowH;
      });
      repeatSectionHeader = null;
    };

    // Layout "ficha" (um cartão por inscrito, campos em grade de 3 colunas) - usado quando
    // muitas colunas estão marcadas e uma tabela larga ficaria ilegível. Cada campo quebra
    // linha independente, então nada fica cortado. Com a coluna "Foto" marcada, a barra do
    // cabeçalho cresce pra caber a miniatura ao lado do nome.
    const drawFichas = (cols: ColumnDef[], list: any[], fotos: Map<string, FotoImagem | null>) => {
      const FIELDS_PER_ROW = 3;
      const fieldColW = usableW / FIELDS_PER_ROW;
      const LINE_H = 3.6;
      const FOTO_SIZE = 16;
      const HEADER_H = fotos.size > 0 ? FOTO_SIZE + 2 : 7;
      const CUPOM_H = 8;
      repeatSectionHeader = null;

      list.forEach((r, idx) => {
        // Campos com link (comprovante, card #EUVOU) ficam numa linha só, sem quebrar texto -
        // um link clicável de verdade (docPdf.textWithLink), não só texto azul decorativo.
        const fields = cols.map(c => {
          const cell = resolveValue(c.id, r, modalidadeMap, camisetaMap, kitsCadastrados);
          let val = String(cell.value ?? '').trim();
          if (c.id === 'valorPago') val = Number(cell.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          val = pdfUpperIfName(c.id, val);
          return { text: `${c.label}: ${val || '—'}`, link: cell.link };
        });
        const cupomCodigo = r.couponCode ? String(r.couponCode).toUpperCase() : '';

        // Pré-calcula a quebra de linha de cada campo ANTES de desenhar qualquer coisa, pra
        // saber a altura total do cartão inteiro (cabeçalho + cupom + todos os campos) e
        // decidir de uma vez se cabe na página atual. Sem isso, o cabeçalho podia acabar
        // numa página e os campos na seguinte - uma pessoa nunca pode ficar cortada ao meio.
        const linhasCampos: { lines: string[]; link?: string }[][] = [];
        for (let i = 0; i < fields.length; i += FIELDS_PER_ROW) {
          const chunk = fields.slice(i, i + FIELDS_PER_ROW);
          linhasCampos.push(chunk.map(f => ({
            lines: f.link ? [f.text] : docPdf.splitTextToSize(f.text, fieldColW - 3),
            link: f.link,
          })));
        }
        const fieldsH = linhasCampos.reduce((s, wrapped) => s + Math.max(1, ...wrapped.map(w => w.lines.length)) * LINE_H, 0);
        const cardH = HEADER_H + (cupomCodigo ? CUPOM_H : 0) + fieldsH + 4;
        ensureSpace(cardH);

        // Inscrição infantil ganha uma barra de cabeçalho num gradiente azul → rosa (em vez
        // do navy padrão) - só um toque lúdico pra diferenciar quem é criança na lista. Um
        // degradê suave (várias faixas finas interpoladas) em vez de split duro no meio, que
        // ficava com uma quebra feia bem no centro.
        const isInfantil = r.categoria === 'infantil';
        if (isInfantil) {
          const corA: [number, number, number] = [96, 165, 250];
          const corB: [number, number, number] = [244, 114, 182];
          const FAIXAS = 48;
          const faixaW = usableW / FAIXAS + 0.4;
          for (let f = 0; f < FAIXAS; f++) {
            const t = f / (FAIXAS - 1);
            docPdf.setFillColor(
              Math.round(corA[0] + (corB[0] - corA[0]) * t),
              Math.round(corA[1] + (corB[1] - corA[1]) * t),
              Math.round(corA[2] + (corB[2] - corA[2]) * t),
            );
            docPdf.rect(marginX + f * (usableW / FAIXAS), y, faixaW, HEADER_H, 'F');
          }
        } else {
          docPdf.setFillColor(...PDF_NAVY);
          docPdf.rect(marginX, y, usableW, HEADER_H, 'F');
        }
        let nameX = marginX + 2;
        if (fotos.size > 0) {
          const foto = r.fotoUrl ? fotos.get(r.fotoUrl) : null;
          if (foto) {
            try { docPdf.addImage(foto.base64, foto.extension.toUpperCase(), marginX + 1, y + 1, FOTO_SIZE - 2, FOTO_SIZE - 2, undefined, 'FAST'); } catch { /* foto quebrada - ignora */ }
          }
          nameX = marginX + FOTO_SIZE + 2;
        }
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text(`${idx + 1}. ${(r.nome || 'Sem nome').toUpperCase()}`, nameX, y + HEADER_H / 2 + 1.4);
        y += HEADER_H;

        // Cupom utilizado - linha em destaque (fundo verde, código grande) logo abaixo do
        // cabeçalho, só quando o inscrito realmente usou um cupom.
        if (cupomCodigo) {
          docPdf.setFillColor(220, 252, 231);
          docPdf.rect(marginX, y, usableW, CUPOM_H, 'F');
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(7);
          docPdf.setTextColor(22, 101, 52);
          docPdf.text('CUPOM UTILIZADO:', marginX + 2, y + CUPOM_H - 2.6);
          docPdf.setFontSize(11.5);
          docPdf.text(cupomCodigo, marginX + 38, y + CUPOM_H - 2);
          y += CUPOM_H;
        }

        linhasCampos.forEach(wrapped => {
          const lineCount = Math.max(1, ...wrapped.map(w => w.lines.length));
          const rowH = lineCount * LINE_H;
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(7);
          wrapped.forEach((f, ci) => {
            const fx = marginX + ci * fieldColW + 1.5;
            if (f.link) {
              docPdf.setTextColor(37, 99, 235);
              docPdf.textWithLink(f.lines[0], fx, y + LINE_H - 0.8, { url: f.link });
            } else {
              docPdf.setTextColor(...PDF_NAVY);
              docPdf.text(f.lines, fx, y + LINE_H - 0.8);
            }
          });
          y += rowH;
        });

        docPdf.setDrawColor(...PDF_STRIPE);
        docPdf.line(marginX, y + 1, marginX + usableW, y + 1);
        y += 3;
      });
    };

    // Capa do relatório - mesma imagem de fundo das divisórias de módulo, cheia (sem
    // cabeçalho nem rodapé), com o logo e o título do relatório.
    isDividerPage = true;
    if (transitionImagem) {
      try { docPdf.addImage(transitionImagem.base64, transitionImagem.extension.toUpperCase(), 0, 0, pageW, pageH, 'page-transition-bg', 'FAST'); } catch { docPdf.setFillColor(...PDF_NAVY); docPdf.rect(0, 0, pageW, pageH, 'F'); }
    } else {
      docPdf.setFillColor(...PDF_NAVY);
      docPdf.rect(0, 0, pageW, pageH, 'F');
    }
    docPdf.setFillColor(...PDF_GREEN);
    docPdf.rect(0, 0, 6, pageH, 'F');

    if (logoImagem) {
      const coverLogoH = 14;
      const coverLogoW = coverLogoH * LOGO_RATIO;
      docPdf.addImage(logoImagem.base64, logoImagem.extension.toUpperCase(), 22, 18, coverLogoW, coverLogoH, undefined, 'FAST');
    }

    const coverTitleX = 30;
    const coverCenterY = pageH * 0.52;
    // A arte do corredor ocupa a metade direita da capa - o título nunca pode invadir esse
    // lado, então o tamanho da fonte se ajusta ao comprimento do texto até caber.
    const coverMaxTitleW = pageW * 0.5 - coverTitleX;
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(10);
    docPdf.setTextColor(...PDF_GREEN);
    docPdf.text('RELATÓRIO OPERACIONAL', coverTitleX, coverCenterY - 20);

    docPdf.setFont('helvetica', 'bold');
    let coverTitleSize = 36;
    docPdf.setFontSize(coverTitleSize);
    while (coverTitleSize > 14 && docPdf.getTextWidth(tituloBase) > coverMaxTitleW) {
      coverTitleSize -= 2;
      docPdf.setFontSize(coverTitleSize);
    }
    docPdf.setTextColor(255, 255, 255);
    docPdf.text(tituloBase, coverTitleX, coverCenterY);

    docPdf.setDrawColor(...PDF_GREEN);
    docPdf.setLineWidth(1.3);
    docPdf.line(coverTitleX, coverCenterY + 10, coverTitleX + 70, coverCenterY + 10);
    docPdf.setLineWidth(0.2);

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(9);
    docPdf.setTextColor(160, 175, 205);
    docPdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, coverTitleX, coverCenterY + 22);

    newPage();
    isDividerPage = false;
    currentSectionLabel = 'Visão geral';

    // Subtítulo com o recorte aplicado.
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(...PDF_GRAY);
    docPdf.text(`${sortedRegs.length} inscrição(ões) no relatório - filtros aplicados conforme selecionado na tela.`, marginX, y);
    y += 8;

    // Cartões de resumo (sempre que "Incluir resumo" estiver marcado) - totais gerais,
    // iguais aos que já aparecem na aba Resumo da planilha .xlsx.
    if (incluirResumo) {
      const confirmados = sortedRegs.filter(r => r.paymentStatus === 'pago').length;
      const pendentes = sortedRegs.filter(r => r.paymentStatus === 'pendente').length;
      const arrecadado = sortedRegs.filter(r => r.paymentStatus === 'pago').reduce((s, r) => s + Number(r.amount || 0), 0);
      drawSectionTitle('RESUMO GERAL');
      drawKpiRow([
        { label: 'Total', value: String(sortedRegs.length) },
        { label: 'Confirmados', value: String(confirmados) },
        { label: 'Pendentes', value: String(pendentes) },
        { label: 'Arrecadado', value: (arrecadado / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
      ]);
    }

    // Camisetas: módulo próprio com página de capa, igual Kits/Cupons/Equipes - mesma lógica
    // de contagem usada na planilha .xlsx.
    if (incluirResumoCamisetas) {
      const counts = getCamisetaCounts(sortedRegs, camisetaMap);
      const totalCamisetas = counts.reduce((s, c) => s + c.count, 0);
      drawSectionDivider('Camisetas', 'Quantidade confirmada por tamanho');
      drawSectionTitle('CAMISETAS', `${totalCamisetas} confirmada(s)`);
      if (counts.length === 0) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(8);
        docPdf.setTextColor(...PDF_GRAY);
        docPdf.text('Nenhuma camiseta confirmada no momento.', marginX, y + 3);
        y += 8;
      } else {
        drawWrappedTable(
          ['Tamanho', 'Categoria', 'Confirmados'],
          counts.map(item => [item.label, item.categoriaLabel, item.count]),
          [2, 2, 1.2],
        );
        y += 4;
      }
    }

    // Kits: mesmo cruzamento usado na aba .xlsx (kit x inscritos do relatório).
    if (incluirKitsInfo) {
      const kitsOrdenados = [...kitsCadastrados].sort((a, b) => (b.ativo ? 1 : 0) - (a.ativo ? 1 : 0) || (b.isPadrao ? 1 : 0) - (a.isPadrao ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
      drawSectionDivider('Kits', 'Preço, inscritos e arrecadação por kit');
      drawSectionTitle('KITS');
      const linhasKits = kitsOrdenados.map(kit => {
        const membros = sortedRegs.filter((r: any) => (r.kit || kitsOrdenados.find(k => k.isPadrao)?.id) === kit.id);
        const confirmados = membros.filter((m: any) => m.paymentStatus === 'pago');
        const arrecadado = confirmados.reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
        return [
          kit.nome + (kit.isPadrao ? ' (padrão)' : ''),
          kit.ativo ? 'Ativo' : 'Inativo',
          kit.precoForcado ? `${(kit.precoForcadoValor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (forçado)` : 'Segue o lote',
          membros.length,
          confirmados.length,
          (arrecadado / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        ];
      });
      drawWrappedTable(['Kit', 'Status', 'Preço', 'Inscritos', 'Confirmados', 'Arrecadado'], linhasKits, [2.6, 1, 2.2, 1, 1.2, 1.4]);
      y += 4;
    }

    // Cupons: mesmo cruzamento usado na aba .xlsx.
    if (incluirCupons) {
      const linhasCupons = await buildCuponsResumo();
      drawSectionDivider('Cupons', 'Uso e desconto gerado por cupom');
      drawSectionTitle('CUPONS');
      if (linhasCupons.length === 0) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(8);
        docPdf.setTextColor(...PDF_GRAY);
        docPdf.text('Nenhum cupom cadastrado.', marginX, y + 3);
        y += 8;
      } else {
        drawWrappedTable(
          ['Código', 'Tipo', 'Valor', 'Status', 'Usos (total)', 'Usos no relatório', 'Desconto gerado'],
          linhasCupons.map(c => [
            c.codigo, c.tipo, c.valorLabel, c.ativo ? 'Ativo' : 'Inativo',
            `${c.usedCount}${c.maxUses ? ` / ${c.maxUses}` : ''}`, c.usosNoRelatorio,
            (c.descontoNoRelatorio / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          ]),
          [1.4, 1.3, 1.3, 1, 1.3, 1.5, 1.6],
        );
        y += 4;
      }
    }

    // Equipes: mesma regra de agrupamento da aba .xlsx (só confirmados marcados como equipe).
    if (incluirEquipes) {
      const grupos = new Map<string, any[]>();
      sortedRegs.forEach((r: any) => {
        if (r.integranteEquipe !== 'sim' || r.paymentStatus !== 'pago') return;
        const nomeEquipe = String(r.equipeNome || '').trim();
        if (!nomeEquipe) return;
        const key = nomeEquipe.toLowerCase();
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key)!.push(r);
      });
      const listaEquipes = Array.from(grupos.values())
        .map(membros => ({ nome: membros[0]?.equipeNome || 'Equipe sem nome', membros, arrecadado: membros.reduce((s: number, m: any) => s + Number(m.amount || 0), 0) }))
        .sort((a, b) => b.membros.length - a.membros.length || a.nome.localeCompare(b.nome, 'pt-BR'));

      drawSectionDivider('Equipes', `${listaEquipes.length} equipe(s)`);
      drawSectionTitle('EQUIPES', `${listaEquipes.length} equipe(s)`);
      if (listaEquipes.length === 0) {
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(8);
        docPdf.setTextColor(...PDF_GRAY);
        docPdf.text('Nenhuma equipe com inscritos confirmados no momento.', marginX, y + 3);
        y += 8;
      } else {
        drawWrappedTable(
          ['Equipe', 'Integrantes', 'Arrecadado'],
          listaEquipes.map(e => [e.nome, e.membros.length, (e.arrecadado / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })]),
          [3, 1, 1.4],
        );
        y += 4;
      }
    }

    // Extratos bancários - consulta o mesmo worker que a planilha .xlsx usa. Só busca se
    // pelo menos uma das opções de banco estiver marcada.
    if (incluirSaldoBancos || incluirExtratoCora || incluirExtratoAsaas) {
      drawSectionDivider('Bancos (Cora & Asaas)', 'Saldo e movimentações consultados na hora');
      setProgressoLabel('CONSULTANDO BANCOS...');
      const workerUrl = import.meta.env.VITE_WORKER_URL as string | undefined;
      const saldoBancos = (incluirSaldoBancos || incluirExtratoAsaas) ? await fetchBankBalances(workerUrl) : null;
      const movimentosBancos = (incluirExtratoCora || incluirExtratoAsaas) ? await fetchBankMovements(workerUrl, extratoDataInicio, extratoDataFim) : null;
      setProgressoLabel('MONTANDO PDF...');

      if (incluirSaldoBancos) {
        drawSectionTitle('SALDO DOS BANCOS (no momento da geração)');
        const cards: { label: string; value: string }[] = [];
        if (saldoBancos?.cora?.ok) cards.push({ label: 'Saldo Cora', value: ((saldoBancos.cora.balanceCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) });
        else cards.push({ label: 'Saldo Cora', value: 'Indisponível' });
        if (saldoBancos?.asaas?.ok) cards.push({ label: 'Saldo Asaas', value: ((saldoBancos.asaas.balanceCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) });
        else cards.push({ label: 'Saldo Asaas', value: 'Indisponível' });
        drawKpiRow(cards);
      }

      const drawExtratoSection = (titulo: string, bankData: any, pendingCredit?: any, divider?: boolean) => {
        // Cora e Asaas tratam entrada/saída de formas bem diferentes por trás - uma página de
        // transição só entre os dois deixa claro que começou um extrato de banco diferente.
        if (divider) drawSectionDivider(titulo === 'EXTRATO ASAAS' ? 'Extrato Asaas' : titulo, `Período: ${formatDateBR(extratoDataInicio, '')} a ${formatDateBR(extratoDataFim, '')}`);
        drawSectionTitle(titulo, `Período: ${formatDateBR(extratoDataInicio, '')} a ${formatDateBR(extratoDataFim, '')}`);
        if (!bankData || bankData.ok === false) {
          docPdf.setFont('helvetica', 'italic');
          docPdf.setFontSize(8);
          docPdf.setTextColor(220, 38, 38);
          docPdf.text(`Não foi possível consultar o extrato: ${bankData?.error || 'erro desconhecido'}`, marginX, y + 3);
          y += 8;
          return;
        }
        const items = [...(bankData.items || [])].sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const totalEntradas = items.filter((i: any) => i.type === 'entrada').reduce((s: number, i: any) => s + i.amount, 0);
        const totalSaidas = items.filter((i: any) => i.type === 'saida').reduce((s: number, i: any) => s + i.amount, 0);
        const kpis = [
          { label: 'Entradas', value: (totalEntradas / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
          { label: 'Saídas', value: (totalSaidas / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
          { label: 'Saldo do período', value: ((totalEntradas - totalSaidas) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) },
        ];
        if (pendingCredit?.ok && (pendingCredit.amountCents || 0) > 0) {
          kpis.push({ label: 'Total a receber', value: (pendingCredit.amountCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) });
        }
        drawKpiRow(kpis);
        if (items.length === 0) {
          docPdf.setFont('helvetica', 'italic');
          docPdf.setFontSize(8);
          docPdf.setTextColor(...PDF_GRAY);
          docPdf.text('Nenhuma movimentação no período selecionado.', marginX, y + 3);
          y += 8;
        } else {
          const inscritoDoMovimento = (item: any): string => {
            if (item.type !== 'entrada') return '';
            return item.payerName ? String(item.payerName).toUpperCase() : '';
          };
          drawWrappedTable(
            ['Data', 'Tipo', 'Descrição', 'Valor', 'Responsável pelo pagamento'],
            items.map((item: any) => [
              formatDateBR(item.date, ''), item.type === 'entrada' ? 'Entrada' : 'Saída', item.description || item.title || '',
              (item.amount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
              inscritoDoMovimento(item) || (item.type === 'entrada' ? 'Não identificado' : ''),
            ]),
            [1, 0.9, 2.6, 1.2, 1.8],
            { pillCol: { index: 1, colorFn: (v) => v === 'Entrada' ? { bg: [220, 252, 231], fg: [22, 101, 52] } : { bg: [254, 226, 226], fg: [185, 28, 28] } } },
          );
          y += 4;
        }
      };

      if (incluirExtratoCora) drawExtratoSection('EXTRATO CORA', movimentosBancos?.cora);
      if (incluirExtratoAsaas) drawExtratoSection('EXTRATO ASAAS', movimentosBancos?.asaas, saldoBancos?.asaas?.pendingCredit, incluirExtratoCora);
    }

    // Lista por dia: um bloco por data, igual à aba .xlsx.
    if (incluirListaPorDia && dataInicioLista && dataFimLista) {
      drawSectionDivider('Lista por dia', `${formatDateBR(dataInicioLista, '')} a ${formatDateBR(dataFimLista, '')}`);
      drawSectionTitle('LISTA POR DIA', `${formatDateBR(dataInicioLista, '')} a ${formatDateBR(dataFimLista, '')}`);
      const porDia = new Map<string, any[]>();
      sortedRegs.forEach((r: any) => {
        const d = toDateValue(r.createdAt);
        if (!d) return;
        const key = toInputDate(d);
        if (!porDia.has(key)) porDia.set(key, []);
        porDia.get(key)!.push(r);
      });
      const cursor = new Date(`${dataInicioLista}T00:00:00`);
      const fim = new Date(`${dataFimLista}T00:00:00`);
      while (cursor <= fim) {
        const key = toInputDate(cursor);
        const doDia = (porDia.get(key) || []).sort((a: any, b: any) => (toDateValue(a.createdAt)?.getTime() || 0) - (toDateValue(b.createdAt)?.getTime() || 0));
        ensureSpace(7);
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(9);
        docPdf.setTextColor(...PDF_NAVY);
        docPdf.text(`${formatDateBR(key, '')} — ${doDia.length} inscrição(ões)`, marginX, y + 4);
        y += 7;
        if (doDia.length === 0) {
          docPdf.setFont('helvetica', 'italic');
          docPdf.setFontSize(7.5);
          docPdf.setTextColor(...PDF_GRAY);
          ensureSpace(5);
          docPdf.text('Nenhuma inscrição neste dia.', marginX + 2, y + 3);
          y += 6;
        } else {
          drawWrappedTable(
            ['Horário', 'Nome', 'Modalidade', 'Status'],
            doDia.map((r: any) => [
              formatDateTimeBR(r.createdAt).split(' ')[1] || '', (r.nome || '').toUpperCase(),
              modalidadeMap[r.modalidadeId]?.nome || 'Outra', STATUS_LABEL[r.paymentStatus] || r.paymentStatus || '',
            ]),
            [1, 2.6, 2, 1.4],
          );
        }
        y += 3;
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    // Tabela (ou fichas) de inscritos - as mesmas colunas escolhidas na tela. A foto (quando
    // marcada) vira imagem de verdade em qualquer um dos dois layouts, nunca texto. Com
    // poucas colunas usa uma tabela normal; com muitas, muda pra um cartão por pessoa - uma
    // tabela larguíssima ficaria ilegível de qualquer jeito, então essa troca automática é o
    // que garante que o PDF nunca vira uma sopa de letrinhas cortadas.
    const pdfColumns = COLUMN_DEFS.filter(c => c.id !== 'foto' && colunas[c.id]);

    if ((pdfColumns.length > 0 || incluirFotoPdf) && sortedRegs.length > 0) {
      drawSectionDivider('Inscritos', `${sortedRegs.length} registro(s)`);
      drawSectionTitle('INSCRITOS', `${sortedRegs.length} registro(s)`);
      const USA_FICHAS = pdfColumns.length > 9;
      if (USA_FICHAS) {
        drawFichas(pdfColumns, sortedRegs, incluirFotoPdf ? fotoCache : new Map());
      } else {
        const weights = pdfColumns.map(c => PDF_COL_WEIGHT[c.id] ?? 1.4);
        const resolved = sortedRegs.map(r => pdfColumns.map(col => resolveValue(col.id, r, modalidadeMap, camisetaMap, kitsCadastrados)));
        const rows = resolved.map(rowCells => rowCells.map((cell, ci) => {
          const colId = pdfColumns[ci].id;
          if (colId === 'valorPago') return Number(cell.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          return pdfUpperIfName(colId, String(cell.value ?? ''));
        }));
        // Colunas com link (comprovante, card #EUVOU) viram link clicável de verdade no PDF.
        const cellLinks = resolved.map(rowCells => rowCells.map(cell => cell.link));
        const photos = incluirFotoPdf ? sortedRegs.map(r => (r.fotoUrl ? fotoCache.get(r.fotoUrl) ?? null : null)) : undefined;
        drawWrappedTable(pdfColumns.map(c => c.label), rows, weights, { ...(photos ? { photos } : {}), cellLinks });
      }
    }

    drawFooter();
    return docPdf;
  };

  const handleGerar = async () => {
    if (selectedModalidadeIds.size === 0) return showAlert('Selecione pelo menos uma modalidade.', 'warning');
    if (statusSelecionados.size === 0) return showAlert('Selecione pelo menos um status de pagamento.', 'warning');
    if (sortedRegs.length === 0) return showAlert('Nenhuma inscrição corresponde aos filtros selecionados.', 'warning');
    if (formatoSaida === 'planilha' && incluirListaPorDia) {
      if (!dataInicioLista || !dataFimLista) return showAlert('Selecione o período da lista por dia.', 'warning');
      if (new Date(`${dataInicioLista}T00:00:00`) > new Date(`${dataFimLista}T00:00:00`)) {
        return showAlert('Na lista por dia, a data "Até" precisa ser igual ou depois da data "De".', 'warning');
      }
    }

    setGerando(true);
    setProgressoLabel(formatoSaida === 'pdf' ? 'MONTANDO PDF...' : 'MONTANDO PLANILHA...');
    try {
      const nomeBase = nomeArquivo.trim()
        ? nomeArquivo.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\.(xlsx|pdf)$/i, '')
        : `planilha-inscritos-mcu-${new Date().toISOString().slice(0, 10)}`;
      if (formatoSaida === 'pdf') {
        const docPdf = await buildPdf();
        docPdf.save(`${nomeBase}.pdf`);
        showAlert('PDF gerado com sucesso.', 'success');
      } else {
        const buffer = await buildWorkbook();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `${nomeBase}.xlsx`);
        showAlert('Planilha gerada com sucesso.', 'success');
      }
    } catch (e) {
      console.error(e);
      showAlert(formatoSaida === 'pdf' ? 'Erro ao gerar o PDF.' : 'Erro ao gerar a planilha.', 'error');
    } finally {
      setGerando(false);
      setProgressoLabel('');
    }
  };

  const groupedColumnDefs = useMemo(() => {
    const groups: Record<string, ColumnDef[]> = {};
    COLUMN_DEFS.forEach(c => { (groups[c.group] ||= []).push(c); });
    return groups;
  }, []);

  return (
    <div style={{ animation: 'fadeIn .3s ease-out' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', border: '1px solid #e2e8f0', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileSpreadsheet size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 900, color: '#071A45', fontSize: '1rem' }}>Gerador de Planilhas</div>
            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>Configure os dados, filtros e o nível de detalhe da planilha antes de exportar.</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#071A45', lineHeight: 1 }}>{sortedRegs.length}</div>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>inscrições no relatório</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: '18px 22px', border: '1px solid #e2e8f0', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: showSalvarModelo || modelos.length > 0 ? 12 : 0 }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 900, color: '#071A45', display: 'flex', alignItems: 'center', gap: 8, textTransform: 'uppercase', letterSpacing: 0.3, margin: 0 }}>
            <Bookmark size={14} /> Modelos de planilha
          </h3>
          {!showSalvarModelo && (
            <button
              type="button"
              onClick={() => setShowSalvarModelo(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 8, padding: '7px 14px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
            >
              <Plus size={14} /> Salvar configuração atual como modelo
            </button>
          )}
        </div>

        {showSalvarModelo && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: modelos.length > 0 ? 14 : 0, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={novoModeloNome}
              onChange={e => setNovoModeloNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvarModeloAtual(); }}
              placeholder='Ex: "Só confirmados adulto" ou "Kids resumido"'
              autoFocus
              style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600 }}
            />
            <button
              type="button"
              onClick={salvarModeloAtual}
              disabled={salvandoModelo}
              style={{ background: '#071A45', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: '0.75rem', fontWeight: 800, cursor: salvandoModelo ? 'wait' : 'pointer' }}
            >
              {salvandoModelo ? 'SALVANDO...' : 'SALVAR'}
            </button>
            <button
              type="button"
              onClick={() => { setShowSalvarModelo(false); setNovoModeloNome(''); }}
              style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {loadingModelos ? (
          <p style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Carregando modelos...</p>
        ) : modelos.length === 0 ? (
          !showSalvarModelo && <p style={{ color: '#94a3b8', fontSize: '0.78rem' }}>Nenhum modelo salvo ainda. Configure os filtros e colunas abaixo e salve como modelo para reaplicar depois.</p>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {modelos.map(modelo => (
              <div key={modelo.id} style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <button
                  type="button"
                  onClick={() => aplicarModelo(modelo)}
                  title={`Aplicar modelo "${modelo.nome}"`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: '9px 6px 9px 14px', fontSize: '0.8rem', fontWeight: 700, color: '#071A45', cursor: 'pointer' }}
                >
                  <FileSpreadsheet size={14} color="#2563eb" /> {modelo.nome}
                </button>
                <button
                  type="button"
                  onClick={() => excluirModelo(modelo)}
                  title={`Excluir modelo "${modelo.nome}"`}
                  style={{ background: 'none', border: 'none', padding: '9px 12px 9px 4px', color: '#cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#cbd5e1'; }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card title="Título e nome do arquivo" icon={<Type size={14} />}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Título dentro da planilha</label>
              <input
                type="text"
                value={tituloPersonalizado}
                onChange={e => setTituloPersonalizado(e.target.value)}
                placeholder="MCU NIGHT RUN 2026 (padrão)"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600 }}
              />
              <p style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 6 }}>Aparece na faixa de cabeçalho de toda aba, ao lado da logo. Deixe em branco para usar o padrão.</p>
            </div>
            <div>
              <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Nome do arquivo</label>
              <input
                type="text"
                value={nomeArquivo}
                onChange={e => setNomeArquivo(e.target.value)}
                placeholder={`planilha-inscritos-mcu-${toInputDate(new Date())} (padrão)`}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600 }}
              />
              <p style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 6 }}>Sem precisar digitar ".xlsx" - isso é adicionado automaticamente.</p>
            </div>
          </Card>

          <Card title="Modalidades" icon={<Users2 size={14} />}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button style={miniBtnStyle} onClick={() => selecionarModalidades('todas')}>Todas</button>
              <button style={miniBtnStyle} onClick={() => selecionarModalidades('adulto')}>Só adulto</button>
              <button style={miniBtnStyle} onClick={() => selecionarModalidades('infantil')}>Só infantil</button>
              <button style={miniBtnStyle} onClick={() => selecionarModalidades('nenhuma')}>Nenhuma</button>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, paddingRight: 4 }}>
              {modalidades.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Nenhuma modalidade cadastrada.</p>}
              {modalidades.map(mod => (
                <label key={mod.id} onClick={() => toggleModalidade(mod.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', color: '#334155', fontWeight: 600 }}>
                  {selectedModalidadeIds.has(mod.id) ? <CheckSquare size={16} color="#071A45" /> : <Square size={16} color="#cbd5e1" />}
                  {mod.nome}{mod.distancia ? ` — ${mod.distancia}` : ''}
                  <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase' }}>{mod.categoria === 'infantil' ? 'Infantil' : 'Adulto'}</span>
                </label>
              ))}
            </div>
          </Card>

          <Card title="Faixa etária" icon={<SlidersHorizontal size={14} />}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Idade mínima</label>
                <input type="number" min={0} value={idadeMin} onChange={e => setIdadeMin(e.target.value)} placeholder="Sem mínimo" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600 }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Idade máxima</label>
                <input type="number" min={0} value={idadeMax} onChange={e => setIdadeMax(e.target.value)} placeholder="Sem máximo" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600 }} />
              </div>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.72rem', marginTop: 10 }}>Deixe em branco para não filtrar por idade. Calculada a partir da data de nascimento na data de hoje.</p>
          </Card>

          <Card title="Status do pagamento" icon={<Filter size={14} />}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <button type="button" style={miniBtnStyle} onClick={() => setStatusSelecionados(new Set(STATUS_OPTIONS.map(s => s.id)))}>Todos</button>
              <button type="button" style={miniBtnStyle} onClick={() => setStatusSelecionados(new Set())}>Nenhum</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATUS_OPTIONS.map(s => {
                const ativo = statusSelecionados.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStatus(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      border: `1.5px solid ${ativo ? s.color : '#e2e8f0'}`,
                      background: ativo ? `${s.color}14` : '#fff',
                    }}
                  >
                    {ativo ? <CheckSquare size={18} color={s.color} /> : <Square size={18} color="#cbd5e1" />}
                    <span style={{ flex: 1, fontWeight: 700, fontSize: '0.85rem', color: ativo ? '#071A45' : '#64748b' }}>{s.label}</span>
                    <span style={{ fontWeight: 900, fontSize: '0.78rem', color: s.color, background: '#fff', borderRadius: 999, padding: '2px 9px', border: `1px solid ${s.color}55` }}>
                      {statusCounts[s.id] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
            {statusSelecionados.size === 0 && (
              <p style={{ color: '#dc2626', fontSize: '0.72rem', marginTop: 10, fontWeight: 700 }}>Selecione ao menos um status para gerar a planilha.</p>
            )}
          </Card>

          <Card title="Ordenação" icon={<Rows3 size={14} />}>
            <select value={ordenarPor} onChange={e => setOrdenarPor(e.target.value as any)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>
              <option value="nome">Nome (A-Z)</option>
              <option value="modalidade">Modalidade e depois nome</option>
              <option value="dataInscricao">Data de inscrição (mais antiga primeiro)</option>
              <option value="status">Status do pagamento</option>
            </select>
          </Card>

          <Card title="Lista por dia" icon={<CalendarDays size={14} />}>
            <label
              onClick={() => setIncluirListaPorDia(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer', marginBottom: incluirListaPorDia ? 14 : 0 }}
            >
              {incluirListaPorDia ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir lista dividida por dia</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                  Aba própria "Por Dia": um bloco por data, com todos os inscritos daquele dia e o horário exato da inscrição. Dias sem inscrição aparecem também, avisando que não houve.
                </div>
              </div>
            </label>
            {incluirListaPorDia && (
              <div style={{ borderLeft: '2px solid #6BFF2A', paddingLeft: 10 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <button type="button" style={miniBtnStyle} onClick={usarPeriodoCompleto}>Período completo (1ª inscrição até hoje)</button>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>De</label>
                    <input
                      type="date"
                      value={dataInicioLista}
                      max={dataFimLista || undefined}
                      onChange={e => setDataInicioLista(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Até</label>
                    <input
                      type="date"
                      value={dataFimLista}
                      min={dataInicioLista || undefined}
                      max={toInputDate(new Date())}
                      onChange={e => setDataFimLista(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600 }}
                    />
                  </div>
                </div>
                {dataInicioLista && dataFimLista && (() => {
                  const dias = Math.round((new Date(`${dataFimLista}T00:00:00`).getTime() - new Date(`${dataInicioLista}T00:00:00`).getTime()) / 86400000) + 1;
                  if (dias <= 0) return <p style={{ color: '#dc2626', fontSize: '0.72rem', marginTop: 10, fontWeight: 700 }}>A data "Até" precisa ser igual ou depois da data "De".</p>;
                  return (
                    <p style={{ color: dias > 180 ? '#ca8a04' : '#94a3b8', fontSize: '0.72rem', marginTop: 10 }}>
                      {dias} dia(s) no período{dias > 180 ? ' — período longo, a planilha pode ficar grande.' : '.'}
                    </p>
                  );
                })()}
              </div>
            )}
          </Card>

          <Card title="Equipes" icon={<Users2 size={14} />}>
            <label
              onClick={() => setIncluirEquipes(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer' }}
            >
              {incluirEquipes ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir página de Equipes</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                  Aba própria "Equipes": resumo por equipe (integrantes e arrecadado) + detalhe de cada integrante. Só entram inscritos confirmados marcados como parte de equipe.
                </div>
              </div>
            </label>
          </Card>

          <Card title="Kits" icon={<Package size={14} />}>
            <label
              onClick={() => setIncluirKitsInfo(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer' }}
            >
              {incluirKitsInfo ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir página de Kits</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                  Aba própria "Kits": cada kit cadastrado (ativo, preço forçado ou não), quantos inscritos e quanto arrecadou cada um, a tabela de lotes vigente e o detalhe de quem tem cada kit.
                </div>
              </div>
            </label>
          </Card>

          <Card title="Cupons" icon={<Bookmark size={14} />}>
            <label
              onClick={() => setIncluirCupons(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer' }}
            >
              {incluirCupons ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir resumo de cupons</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                  Cada cupom cadastrado, quantos usos teve (de sempre) e quanto desconto gerou dentro do recorte atual do relatório.
                </div>
              </div>
            </label>
          </Card>

          <Card title="Bancos (Cora & Asaas)" icon={<Landmark size={14} />}>
            <label
              onClick={() => setIncluirSaldoBancos(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer' }}
            >
              {incluirSaldoBancos ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir saldo atual dos bancos</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                  Saldo da Cora e do Asaas consultado na hora, no momento em que a planilha for gerada.
                </div>
              </div>
            </label>

            <div style={{ borderTop: '1px solid #f1f5f9', margin: '14px 0 12px' }} />

            <label
              onClick={() => setIncluirExtratoCora(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer' }}
            >
              {incluirExtratoCora ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir extrato da Cora</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>Aba própria "Extrato Cora" com entradas e saídas do período.</div>
              </div>
            </label>

            <label
              onClick={() => setIncluirExtratoAsaas(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer' }}
            >
              {incluirExtratoAsaas ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir extrato do Asaas</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                  Aba própria "Extrato Asaas" com entradas e saídas do período + os pagamentos de cartão já confirmados que ainda vão cair na conta (com a previsão de quando caem).
                </div>
              </div>
            </label>

            {(incluirExtratoCora || incluirExtratoAsaas) && (
              <div style={{ borderLeft: '2px solid #6BFF2A', paddingLeft: 10, marginTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <button type="button" style={miniBtnStyle} onClick={usarUltimos90Dias}>Últimos 90 dias</button>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>De</label>
                    <input
                      type="date"
                      value={extratoDataInicio}
                      max={extratoDataFim || undefined}
                      onChange={e => setExtratoDataInicio(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600 }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Até</label>
                    <input
                      type="date"
                      value={extratoDataFim}
                      min={extratoDataInicio || undefined}
                      max={toInputDate(new Date())}
                      onChange={e => setExtratoDataFim(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.82rem', fontWeight: 600 }}
                    />
                  </div>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 10 }}>
                  Consulta os bancos na hora - pode levar alguns segundos a mais pra gerar a planilha.
                </p>
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card title="Nível de detalhe" icon={<LayoutGrid size={14} />}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label
                onClick={() => setComplexidade('simples')}
                style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 12, border: `2px solid ${complexidade === 'simples' ? '#071A45' : '#e2e8f0'}`, cursor: 'pointer', background: complexidade === 'simples' ? '#f8fafc' : '#fff' }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 9, border: '2px solid #071A45', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  {complexidade === 'simples' && <div style={{ width: 9, height: 9, borderRadius: 5, background: '#071A45' }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Simples</div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2 }}>Uma única aba, tabela direta com todos os inscritos filtrados. Rápida de ler e importar em outros sistemas.</div>
                </div>
              </label>
              <label
                onClick={() => setComplexidade('organizada')}
                style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 12, border: `2px solid ${complexidade === 'organizada' ? '#071A45' : '#e2e8f0'}`, cursor: 'pointer', background: complexidade === 'organizada' ? '#f8fafc' : '#fff' }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 9, border: '2px solid #071A45', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  {complexidade === 'organizada' && <div style={{ width: 9, height: 9, borderRadius: 5, background: '#071A45' }} />}
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Organizada</div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 2 }}>Aba de resumo com totais por modalidade + uma aba separada para cada modalidade, com cabeçalho colorido e linhas zebradas.</div>
                </div>
              </label>
            </div>
          </Card>

          <Card title="Resumo na planilha" icon={<Rows3 size={14} />}>
            <label
              onClick={() => setIncluirResumo(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer', marginBottom: incluirResumo ? 12 : 0 }}
            >
              {incluirResumo ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir resumo</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                  {complexidade === 'simples'
                    ? 'Aparece abaixo da lista de nomes, na mesma aba.'
                    : 'Vira a aba "Resumo", além das abas por modalidade.'}
                </div>
              </div>
            </label>
            {incluirResumo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderLeft: '2px solid #6BFF2A', paddingLeft: 8 }}>
                {RESUMO_FIELD_DEFS.map(f => {
                  const ativo = !!resumoCampos[f.id];
                  return (
                    <label
                      key={f.id}
                      onClick={() => toggleResumoCampo(f.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: ativo ? '#f8fafc' : 'transparent' }}
                    >
                      {ativo ? <CheckSquare size={16} color="#071A45" /> : <Square size={16} color="#cbd5e1" />}
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>{f.label}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ borderTop: '1px solid #f1f5f9', margin: '14px 0 12px' }} />

            <label
              onClick={() => setIncluirResumoCamisetas(v => !v)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', cursor: 'pointer' }}
            >
              {incluirResumoCamisetas ? <CheckSquare size={18} color="#071A45" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={18} color="#cbd5e1" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div>
                <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem' }}>Incluir resumo de camisetas</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 2 }}>
                  Quantos inscritos por tamanho de camiseta (independente do resumo geral acima).
                </div>
              </div>
            </label>
          </Card>

          <Card title={`Colunas da planilha (${Object.values(colunas).filter(Boolean).length}/${COLUMN_DEFS.length})`} icon={<Columns3 size={14} />}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button type="button" style={miniBtnStyle} onClick={() => aplicarPresetColunas('essenciais')}>Essenciais</button>
              <button type="button" style={miniBtnStyle} onClick={() => aplicarPresetColunas('completo')}>Marcar tudo</button>
              <button type="button" style={miniBtnStyle} onClick={() => aplicarPresetColunas('limpar')}>Limpar</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 380, overflowY: 'auto', paddingRight: 6 }}>
              {Object.entries(groupedColumnDefs).map(([grupo, cols]) => {
                const todasMarcadas = cols.every(c => colunas[c.id]);
                const algumaMarcada = cols.some(c => colunas[c.id]);
                return (
                <div key={grupo}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>{grupo}</span>
                    <button
                      type="button"
                      onClick={() => toggleGrupoColunas(cols, !todasMarcadas)}
                      style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.68rem', fontWeight: 800, cursor: 'pointer', padding: 0 }}
                    >
                      {todasMarcadas ? 'Desmarcar' : 'Marcar todas'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderLeft: `2px solid ${algumaMarcada ? '#6BFF2A' : '#e2e8f0'}`, paddingLeft: 8 }}>
                    {cols.map(c => {
                      const ativo = !!colunas[c.id];
                      return (
                        <label
                          key={c.id}
                          onClick={() => toggleColuna(c.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8,
                            cursor: c.always ? 'not-allowed' : 'pointer',
                            background: ativo ? '#f8fafc' : 'transparent',
                          }}
                        >
                          {ativo ? <CheckSquare size={16} color="#071A45" /> : <Square size={16} color="#cbd5e1" />}
                          <div>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155' }}>{c.label}</span>
                            {c.id === 'foto' && ativo && (
                              <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600, marginTop: 1 }}>Baixa e embute a imagem real - deixa a geração mais lenta com muitos inscritos.</div>
                            )}
                          </div>
                          {c.always && <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: '#94a3b8', fontWeight: 800 }}>SEMPRE</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );})}
            </div>
          </Card>
        </div>
      </div>

      <div style={{ marginTop: 20, background: '#071A45', borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem', fontWeight: 600 }}>
          {sortedRegs.length === 0
            ? 'Nenhuma inscrição corresponde aos filtros atuais.'
            : `Pronta para gerar: ${sortedRegs.length} inscrição(ões), ${Object.values(colunas).filter(Boolean).length} coluna(s)${formatoSaida === 'pdf' ? ', formato PDF (A4 paisagem)' : `, modo ${complexidade === 'simples' ? 'simples' : 'organizado'}${incluirResumo ? ' + resumo' : ''}${incluirResumoCamisetas ? ' + resumo de camisetas' : ''}${incluirListaPorDia ? ' + lista por dia' : ''}${incluirSaldoBancos ? ' + saldo dos bancos' : ''}${incluirExtratoCora ? ' + extrato Cora' : ''}${incluirExtratoAsaas ? ' + extrato Asaas' : ''}${incluirEquipes ? ' + equipes' : ''}${incluirKitsInfo ? ' + kits' : ''}${incluirCupons ? ' + cupons' : ''}`}.`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.08)', borderRadius: 10, padding: 3, gap: 2 }}>
            <button
              type="button"
              onClick={() => setFormatoSaida('planilha')}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem',
                background: formatoSaida === 'planilha' ? '#fff' : 'transparent',
                color: formatoSaida === 'planilha' ? '#071A45' : 'rgba(255,255,255,0.65)',
              }}
            >
              PLANILHA (.XLSX)
            </button>
            <button
              type="button"
              onClick={() => setFormatoSaida('pdf')}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.75rem',
                background: formatoSaida === 'pdf' ? '#fff' : 'transparent',
                color: formatoSaida === 'pdf' ? '#071A45' : 'rgba(255,255,255,0.65)',
              }}
            >
              PDF (A4)
            </button>
          </div>
          <button
            onClick={handleGerar}
            disabled={gerando || sortedRegs.length === 0}
            style={{ background: '#6BFF2A', color: '#071A45', border: 'none', padding: '14px 28px', borderRadius: 12, fontWeight: 900, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 10, cursor: gerando ? 'wait' : 'pointer', opacity: gerando || sortedRegs.length === 0 ? 0.6 : 1 }}
          >
            <Download size={18} />
            {gerando ? (progressoLabel || 'GERANDO...') : formatoSaida === 'pdf' ? 'GERAR E BAIXAR PDF' : 'GERAR E BAIXAR PLANILHA (.xlsx)'}
          </button>
        </div>
      </div>
    </div>
  );
}
