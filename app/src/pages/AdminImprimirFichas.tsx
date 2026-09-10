import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db } from '../firebase';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { getCamisetaShortLabel } from '../utils/camisetaUtils';
import { AdminPageSkeleton } from '../components/Skeleton';
import { FileDown, User } from 'lucide-react';
import '../styles/admin.css';

// Programação oficial do dia 12/09 (sábado) - conteúdo fixo do evento, impresso em toda ficha
// independente do atleta.
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

const formatDateBRSimple = (value: any): string => {
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date?.getTime?.())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

type AthleteRow = {
  id: string;
  nome: string;
  cpf: string;
  telefone?: string;
  email?: string;
  dataNascimento?: any;
  sexo?: string;
  categoria?: string;
  integranteEquipe?: string;
  equipeNome?: string;
  fotoUrl?: string;
  numeroInscricao?: string;
  kit?: string;
  tamanhoCamiseta?: string;
  modalidadeId?: string;
  modalidadeNome?: string;
};

export default function AdminImprimirFichas() {
  const [searchParams] = useSearchParams();
  const atletaId = searchParams.get('atletaId');
  const [athletes, setAthletes] = useState<AthleteRow[]>([]);
  const [kits, setKits] = useState<KitRecord[]>([]);
  const [camisetas, setCamisetas] = useState<any[]>([]);
  const [modalidades, setModalidades] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });

  useEffect(() => {
    (async () => {
      try {
        const [regsSnap, kitsList, camisetasSnap, modalidadesSnap] = await Promise.all([
          getDocs(query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'))),
          fetchKits(),
          getDocs(collection(db, 'nightrun_camisetas')),
          getDocs(collection(db, 'nightrun_modalidades')),
        ]);
        let list = regsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as AthleteRow))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        // Modo ficha unica: veio direto do painel de retirada de kits pra imprimir a
        // ficha de um atleta so - filtra pra so ele antes de qualquer outra coisa.
        if (atletaId) list = list.filter(a => a.id === atletaId);
        setAthletes(list);
        setKits(kitsList);
        setCamisetas(camisetasSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
        setModalidades(modalidadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any)));
      } catch (e) {
        console.error('Erro ao carregar fichas:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [atletaId]);

  const kitDe = (a: AthleteRow) => kits.find(k => k.id === a.kit);
  const kitNomeDe = (a: AthleteRow) => resolveKitNome(kits, a.kit, 'Kit Único');
  const camisetaLabelDe = (a: AthleteRow) => {
    if (!a.tamanhoCamiseta) return '';
    const item = camisetas.find(c => c.id === a.tamanhoCamiseta);
    return getCamisetaShortLabel(a.tamanhoCamiseta, item);
  };
  const modalidadeNomeDe = (a: AthleteRow) => modalidades.find(m => m.id === a.modalidadeId)?.nome || a.modalidadeNome || '';
  const modalidadeDistanciaDe = (a: AthleteRow) => modalidades.find(m => m.id === a.modalidadeId)?.distancia || '';

  const generatePdf = async () => {
    if (athletes.length === 0) return;
    setGenerating(true);
    setProgresso({ atual: 0, total: athletes.length });
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

      const makeTitleImg = (text: string) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        ctx.font = '90px Anton';
        const skew = 0.22;
        const padding = 24;
        const textW = ctx.measureText(text).width;
        canvas.width = textW + skew * 100 + padding * 2;
        canvas.height = 130;
        ctx.font = '90px Anton';
        ctx.setTransform(1, 0, -skew, 1, padding, 92);
        ctx.fillStyle = 'rgb(7, 26, 69)';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(text, 0, 0);
        return { data: canvas.toDataURL('image/png'), aspect: canvas.width / canvas.height };
      };

      const titleImgH = 9;
      const titleCache = new Map<string, { data: string; aspect: number }>();
      const getTitleImg = (primeiroNome: string) => {
        const text = `${primeiroNome.toUpperCase()}, SEU KIT CHEGOU!`;
        if (!titleCache.has(text)) titleCache.set(text, makeTitleImg(text));
        return titleCache.get(text)!;
      };

      const photoCache = new Map<string, string | null>();
      const loadPhoto = async (url?: string): Promise<string | null> => {
        if (!url) return null;
        if (photoCache.has(url)) return photoCache.get(url)!;
        const result = await new Promise<string | null>(resolve => {
          fetch(url)
            .then(res => res.blob())
            .then(blob => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result || '') || null);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            })
            .catch(() => resolve(null));
        });
        photoCache.set(url, result);
        return result;
      };

      const docPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pageW = docPdf.internal.pageSize.getWidth();
      const pageH = docPdf.internal.pageSize.getHeight();
      const marginX = 16;
      const marginBottom = 16;
      const headerAspect = 2172 / 724;
      const headerW = pageW;
      const headerH = headerW / headerAspect;
      const usableW = pageW - marginX * 2;
      const NAVY: [number, number, number] = [7, 26, 69];
      const GREEN: [number, number, number] = [107, 255, 42];
      const STRIPE: [number, number, number] = [241, 245, 249];

      const drawHeader = () => {
        try {
          docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'ficha-pdf-header', 'FAST');
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

      for (let i = 0; i < athletes.length; i++) {
        const a = athletes[i];
        setProgresso({ atual: i + 1, total: athletes.length });

        // jsPDF já cria a primeira página sozinho - só criamos uma nova a partir do
        // segundo atleta em diante.
        if (i > 0) docPdf.addPage();
        drawHeader();
        y = headerH + 10;

        const fotoBase64 = await loadPhoto(a.fotoUrl);
        const primeiroNome = (a.nome || 'ATLETA').trim().split(/\s+/)[0];
        const titleImg = getTitleImg(primeiroNome);
        const kitDoc = kitDe(a);
        const temCamiseta = Boolean(kitDoc?.itens?.some(item => item.toUpperCase().includes('CAMISETA')));

        // Título personalizado (pequeno, pra economizar espaço - a ficha inteira precisa
        // caber numa única página).
        docPdf.addImage(titleImg.data, 'PNG', marginX, y, titleImgH * titleImg.aspect, titleImgH, undefined, 'FAST');
        y += titleImgH + 4;

        // Foto à esquerda do nome, sem fundo colorido - só a foto e o nome bem grande ao
        // lado, com um respiro entre as duas.
        const photoSize = 22;
        if (fotoBase64) {
          try {
            const photoFormat = fotoBase64.includes('image/png') ? 'PNG' : 'JPEG';
            docPdf.addImage(fotoBase64, photoFormat, marginX, y, photoSize, photoSize, undefined, 'FAST');
            docPdf.setDrawColor(...NAVY);
            docPdf.setLineWidth(0.6);
            docPdf.rect(marginX, y, photoSize, photoSize, 'D');
          } catch { /* segue sem foto */ }
        }
        const nomeX = fotoBase64 ? marginX + photoSize + 6 : marginX;
        const nomeW = usableW - (nomeX - marginX);
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(17);
        docPdf.setTextColor(...NAVY);
        const nomeLines = docPdf.splitTextToSize(a.nome.toUpperCase(), nomeW).slice(0, 2);
        const nomeBlockH = nomeLines.length * 7;
        const nomeStartY = y + Math.max(photoSize, nomeBlockH) / 2 - (nomeBlockH - 7) / 2;
        docPdf.text(nomeLines, nomeX, nomeStartY);
        y += photoSize + 6;

        // Duas colunas por linha (label em cima, valor embaixo) - mesmo padrão do
        // comprovante de inscrição. Uma seção só, combinando dados pessoais e da prova,
        // pra economizar altura (menos um cabeçalho de seção repetido).
        const colGap = 6;
        const colW = (usableW - colGap) / 2;
        const col2X = marginX + colW + colGap;
        const valueLineH = 3.4;

        const drawInfoSection = (title: string, rows: [string, any][]) => {
          const visibleRows = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
          if (visibleRows.length === 0) return;
          docPdf.setFillColor(...NAVY);
          docPdf.rect(marginX, y, usableW, 6, 'F');
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(7.5);
          docPdf.setTextColor(255, 255, 255);
          docPdf.text(title, marginX + 3, y + 4.2);
          y += 6;

          for (let idx = 0; idx < visibleRows.length; idx += 2) {
            const left = visibleRows[idx];
            const right = visibleRows[idx + 1];
            const leftLines = docPdf.splitTextToSize(String(left[1]), colW - 4);
            const rightLines = right ? docPdf.splitTextToSize(String(right[1]), colW - 4) : [];
            const lineCount = Math.max(leftLines.length, rightLines.length, 1);
            const rowH = 3 + lineCount * valueLineH + 1;

            if ((idx / 2) % 2 === 1) {
              docPdf.setFillColor(...STRIPE);
              docPdf.rect(marginX, y, usableW, rowH, 'F');
            }
            const drawCell = (x: number, label: string, lines: string[]) => {
              docPdf.setFont('helvetica', 'bold');
              docPdf.setFontSize(6.3);
              docPdf.setTextColor(100, 116, 139);
              docPdf.text(label.toUpperCase(), x + 3, y + 3);
              docPdf.setFont('helvetica', 'normal');
              docPdf.setFontSize(8);
              docPdf.setTextColor(...NAVY);
              docPdf.text(lines, x + 3, y + 3 + valueLineH);
            };
            drawCell(marginX, left[0], leftLines);
            if (right) drawCell(col2X, right[0], rightLines);
            y += rowH;
          }
          y += 3;
        };

        drawInfoSection('SEUS DADOS E DA PROVA', [
          ['Número da inscrição', a.numeroInscricao],
          ['CPF', a.cpf],
          ['Data de nascimento', a.dataNascimento ? formatDateBRSimple(a.dataNascimento) : ''],
          ['Sexo', a.sexo === 'M' ? 'Masculino' : a.sexo === 'F' ? 'Feminino' : ''],
          ['WhatsApp', a.telefone],
          ['E-mail', a.email],
          ['Modalidade', modalidadeNomeDe(a)],
          ['Distância', modalidadeDistanciaDe(a)],
          ['Categoria', a.categoria === 'infantil' ? 'Infantil' : 'Adulto / adolescente'],
          ['Equipe', a.integranteEquipe === 'sim' ? (a.equipeNome || 'Sim') : 'Não'],
          ['Kit', kitNomeDe(a)],
          ['Tamanho da camiseta', temCamiseta ? camisetaLabelDe(a) : ''],
        ]);

        // Itens do kit - navy/stripe, em duas colunas pra economizar altura.
        const itens = kitDoc?.itens && kitDoc.itens.length > 0 ? kitDoc.itens : ['Itens do kit a confirmar.'];
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 6, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(7.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text(`ITENS DO SEU KIT (${kitNomeDe(a).toUpperCase()})`, marginX + 3, y + 4.2);
        y += 6;

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(8);
        for (let idx = 0; idx < itens.length; idx += 2) {
          const itemL = itens[idx] || '';
          const itemR = itens[idx + 1] || '';
          const linesL = itemL ? docPdf.splitTextToSize(`•  ${itemL}`, colW - 4) : [];
          const linesR = itemR ? docPdf.splitTextToSize(`•  ${itemR}`, colW - 4) : [];
          const lineCount = Math.max(linesL.length, linesR.length, 1);
          const rowH = lineCount * 3.6 + 1.6;
          if ((idx / 2) % 2 === 1) {
            docPdf.setFillColor(...STRIPE);
            docPdf.rect(marginX, y, usableW, rowH, 'F');
          }
          docPdf.setTextColor(...NAVY);
          if (linesL.length) docPdf.text(linesL, marginX + 3, y + 3);
          if (linesR.length) docPdf.text(linesR, col2X + 3, y + 3);
          y += rowH;
        }
        y += 4;

        // Mensagem motivacional
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(8.3);
        const motivLines = docPdf.splitTextToSize(MENSAGEM_MOTIVACIONAL, usableW - 10);
        const motivH = motivLines.length * 3.8 + 6;
        docPdf.setFillColor(240, 253, 244);
        docPdf.setDrawColor(187, 247, 208);
        docPdf.roundedRect(marginX, y, usableW, motivH, 3, 3, 'FD');
        docPdf.setTextColor(...NAVY);
        docPdf.text(motivLines, marginX + 5, y + 5.2);
        y += motivH + 4;

        // Programação do dia - mesmo padrão navy/stripe usado no resto da ficha (sem
        // blocos coloridos), pra manter tudo visualmente calmo e consistente.
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 6, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(7.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('PROGRAMAÇÃO DO DIA 12/09 (SÁBADO)', marginX + 3, y + 4.2);
        y += 6;

        const horaColW = 24;
        PROGRAMACAO.forEach((item, idx) => {
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(7.6);
          const tituloLines = docPdf.splitTextToSize(item.titulo, usableW - horaColW - 8);
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(6.6);
          const subLines = item.sub ? docPdf.splitTextToSize(item.sub, usableW - horaColW - 8) : [];
          const lineCount = tituloLines.length + subLines.length;
          const rowH = Math.max(6.5, lineCount * 3.3 + 1.8);

          if (idx % 2 === 1) {
            docPdf.setFillColor(...STRIPE);
            docPdf.rect(marginX, y, usableW, rowH, 'F');
          }
          docPdf.setDrawColor(226, 232, 240);
          docPdf.setLineWidth(0.2);
          docPdf.line(marginX + horaColW, y, marginX + horaColW, y + rowH);

          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(7.3);
          docPdf.setTextColor(...NAVY);
          const horaLines = docPdf.splitTextToSize(item.hora, horaColW - 4);
          docPdf.text(horaLines, marginX + 2.5, y + rowH / 2 - (horaLines.length - 1) * 1.6 + 1.1);

          let subY = y + 3.4;
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(7.6);
          docPdf.setTextColor(...NAVY);
          docPdf.text(tituloLines, marginX + horaColW + 3, subY);
          subY += tituloLines.length * 3.3;
          if (subLines.length) {
            docPdf.setFont('helvetica', 'normal');
            docPdf.setFontSize(6.6);
            docPdf.setTextColor(100, 116, 139);
            docPdf.text(subLines, marginX + horaColW + 3, subY + 1);
          }

          y += rowH;
        });
        y += 3;

        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(6.5);
        docPdf.setTextColor(148, 163, 184);
        const footerY = Math.min(y + 3, pageH - 5);
        docPdf.text('Documento gerado automaticamente pelo sistema MCU Night Run.', marginX, footerY);
      }

      const fileName = atletaId && athletes[0]
        ? `ficha-${athletes[0].nome.toLowerCase().replace(/\s+/g, '-')}-mcu-night-run.pdf`
        : `fichas-atletas-mcu-night-run-${new Date().toISOString().slice(0, 10)}.pdf`;
      docPdf.save(fileName);
    } catch (e) {
      console.error('Erro ao gerar fichas:', e);
      alert('Erro ao gerar o PDF de fichas. Tente novamente.');
    } finally {
      setGenerating(false);
      setProgresso({ atual: 0, total: 0 });
    }
  };

  useEffect(() => {
    if (!loading && atletaId && athletes.length === 1) {
      generatePdf();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, atletaId, athletes.length]);

  if (loading) return <AdminPageSkeleton variant="table" />;

  if (atletaId && athletes.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
        <p style={{ color: '#dc2626', fontWeight: 700 }}>Atleta não encontrado ou pagamento não confirmado.</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>
            {atletaId ? `Ficha de ${athletes[0]?.nome || ''}` : 'Imprimir Fichas'}
          </h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>
            {atletaId
              ? 'Gerando a ficha em PDF deste atleta automaticamente...'
              : `Uma ficha por atleta confirmado (${athletes.length}), com dados completos, prova/kit, itens do kit, mensagem motivacional e a programação do dia 12/09.`}
          </p>
        </div>
        <button
          onClick={generatePdf}
          disabled={generating || athletes.length === 0}
          style={{
            background: generating ? '#94a3b8' : '#071A45', color: '#fff', border: 'none', padding: '14px 26px', borderRadius: 12,
            fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 10, cursor: generating ? 'wait' : 'pointer',
            boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)',
          }}
        >
          <FileDown size={20} />
          {generating
            ? `GERANDO... (${progresso.atual}/${progresso.total})`
            : atletaId ? 'BAIXAR FICHA NOVAMENTE' : `BAIXAR PDF COM TODAS (${athletes.length})`}
        </button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20,
      }}>
        {athletes.map(a => {
          const kitDoc = kitDe(a);
          const temCamiseta = Boolean(kitDoc?.itens?.some(item => item.toUpperCase().includes('CAMISETA')));
          const itens = kitDoc?.itens && kitDoc.itens.length > 0 ? kitDoc.itens : ['Itens a confirmar'];
          const primeiroNome = (a.nome || 'ATLETA').trim().split(/\s+/)[0];
          return (
          <div key={a.id} style={{
            aspectRatio: '210 / 297', background: '#fff', borderRadius: 4, border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontSize: '2.6px',
          }}>
            <div style={{ background: 'linear-gradient(135deg, #071A45, #123068)', height: '9%', flexShrink: 0 }} />
            <div style={{ padding: '3%', flex: 1, display: 'flex', flexDirection: 'column', gap: '2%', overflow: 'hidden' }}>
              <div style={{ color: '#071A45', fontWeight: 900, fontSize: '2.6em', textTransform: 'uppercase' }}>
                {primeiroNome}, seu kit chegou!
              </div>
              <div style={{ display: 'flex', gap: '3%', alignItems: 'center' }}>
                <div style={{ width: '24%', aspectRatio: '1', flexShrink: 0, overflow: 'hidden', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #071A45' }}>
                  {a.fotoUrl ? <img src={a.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={5} color="#2563eb" />}
                </div>
                <strong style={{ color: '#071A45', fontSize: '4em', lineHeight: 1.1 }}>{a.nome.toUpperCase()}</strong>
              </div>

              <div style={{ background: '#071A45', color: '#fff', fontWeight: 800, fontSize: '2em', padding: '1.5% 3%', marginTop: '2%' }}>SEUS DADOS E DA PROVA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '1.9em', color: '#334155', gap: '1%' }}>
                <span>Nº: {a.numeroInscricao || '-'}</span>
                <span>CPF: {a.cpf || '-'}</span>
                <span>WhatsApp: {a.telefone || '-'}</span>
                <span>Modalidade: {modalidadeNomeDe(a)}</span>
                <span>Categoria: {a.categoria === 'infantil' ? 'Infantil' : 'Adulto'}</span>
                <span>Equipe: {a.integranteEquipe === 'sim' ? (a.equipeNome || 'Sim') : 'Não'}</span>
                <span>Kit: {kitNomeDe(a)}</span>
                {temCamiseta && <span>Camiseta: {camisetaLabelDe(a)}</span>}
              </div>

              <div style={{ background: '#071A45', color: '#fff', fontWeight: 800, fontSize: '2em', padding: '1.5% 3%', marginTop: '2%' }}>
                ITENS DO KIT ({kitNomeDe(a).toUpperCase()})
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '1.9em', color: '#334155', gap: '1%' }}>
                {itens.slice(0, 6).map((item, idx) => <span key={idx}>• {item}</span>)}
              </div>

              <div style={{ background: '#f0fdf4', border: '1px solid #6BFF2A', borderRadius: '4%', padding: '2% 3%', marginTop: '2%', fontSize: '1.8em', fontStyle: 'italic', color: '#071A45' }}>
                Chegou a hora! Guarde seu kit com carinho e venha viver uma noite histórica!
              </div>

              <div style={{ background: '#071A45', color: '#fff', fontWeight: 800, fontSize: '2em', padding: '1.5% 3%', marginTop: '2%' }}>PROGRAMAÇÃO 12/09</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5%', marginTop: '1%' }}>
                {PROGRAMACAO.map((item, idx) => (
                  <div key={idx} style={{
                    background: idx % 2 === 0 ? '#6BFF2A' : '#fff', border: idx % 2 === 0 ? 'none' : '1px solid #e2e8f0',
                    borderRadius: '3px', padding: '1.5% 3%', fontSize: '1.8em', color: '#071A45', fontWeight: 700,
                  }}>
                    {item.hora} — {item.titulo}
                  </div>
                ))}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
