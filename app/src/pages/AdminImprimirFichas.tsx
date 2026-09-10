import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db } from '../firebase';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { getCamisetaShortLabel } from '../utils/camisetaUtils';
import { AdminPageSkeleton } from '../components/Skeleton';
import { FileDown, User, Package } from 'lucide-react';
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
  'Chegou a hora! Depois de meses de treino e expectativa, o grande dia finalmente chegou. ' +
  'Sábado, dia 12, Manhuaçu vai parar pra ver você brilhar - seja na largada, na chegada ou em cada ' +
  'passo no meio do caminho. Guarde seu kit com carinho, vista a camisa com orgulho e venha viver ' +
  'uma noite histórica. Nos vemos na arena!';

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
        const list = regsSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as AthleteRow))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
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
  }, []);

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

      const title1 = makeTitleImg('SUA FICHA CHEGOU!');
      const titleImgH = 11;

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

        // Título + foto
        docPdf.addImage(title1.data, 'PNG', marginX, y - titleImgH + 3, titleImgH * title1.aspect, titleImgH, undefined, 'FAST');
        if (fotoBase64) {
          try {
            const photoSize = 22;
            const photoX = pageW - marginX - photoSize;
            const photoFormat = fotoBase64.includes('image/png') ? 'PNG' : 'JPEG';
            docPdf.addImage(fotoBase64, photoFormat, photoX, y - photoSize + 4, photoSize, photoSize, undefined, 'FAST');
            docPdf.setDrawColor(...NAVY);
            docPdf.setLineWidth(0.6);
            docPdf.rect(photoX, y - photoSize + 4, photoSize, photoSize, 'D');
          } catch { /* segue sem foto */ }
        }
        y += 6;

        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(9);
        docPdf.setTextColor(100, 116, 139);
        docPdf.text('MCU Night Run 2026 · 12/09/2026 (sábado) · Manhuaçu/MG', marginX, y);
        y += 9;

        // Número de inscrição em destaque, mesmo padrão do comprovante de inscrição
        if (a.numeroInscricao) {
          docPdf.setFillColor(...NAVY);
          docPdf.roundedRect(marginX, y, usableW, 16, 3, 3, 'F');
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(7.5);
          docPdf.setTextColor(255, 255, 255);
          docPdf.text('NÚMERO DA INSCRIÇÃO', marginX + 6, y + 6.5);
          docPdf.setFont('courier', 'bold');
          docPdf.setFontSize(14);
          docPdf.setTextColor(...GREEN);
          docPdf.text(String(a.numeroInscricao), marginX + 6, y + 13);
          y += 16 + 6;
        }

        // Duas colunas por linha (label em cima, valor embaixo, quebrando linha se
        // precisar) - mesmo padrão do comprovante de inscrição - com quebra de página
        // automática se uma seção não couber, garantindo que nada seja cortado.
        const colGap = 6;
        const colW = (usableW - colGap) / 2;
        const col2X = marginX + colW + colGap;
        const valueLineH = 4.1;

        const drawInfoSection = (title: string, rows: [string, any][]) => {
          const visibleRows = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
          if (visibleRows.length === 0) return;
          if (y + 7 > pageH - marginBottom) newPage();
          docPdf.setFillColor(...NAVY);
          docPdf.rect(marginX, y, usableW, 7, 'F');
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(8.5);
          docPdf.setTextColor(255, 255, 255);
          docPdf.text(title, marginX + 3, y + 4.9);
          y += 7;

          for (let idx = 0; idx < visibleRows.length; idx += 2) {
            const left = visibleRows[idx];
            const right = visibleRows[idx + 1];
            const leftLines = docPdf.splitTextToSize(String(left[1]), colW - 4);
            const rightLines = right ? docPdf.splitTextToSize(String(right[1]), colW - 4) : [];
            const lineCount = Math.max(leftLines.length, rightLines.length, 1);
            const rowH = 3.6 + lineCount * valueLineH + 1.5;

            if (y + rowH > pageH - marginBottom) newPage();

            if ((idx / 2) % 2 === 1) {
              docPdf.setFillColor(...STRIPE);
              docPdf.rect(marginX, y, usableW, rowH, 'F');
            }
            const drawCell = (x: number, label: string, lines: string[]) => {
              docPdf.setFont('helvetica', 'bold');
              docPdf.setFontSize(7);
              docPdf.setTextColor(100, 116, 139);
              docPdf.text(label.toUpperCase(), x + 3, y + 3.6);
              docPdf.setFont('helvetica', 'normal');
              docPdf.setFontSize(9);
              docPdf.setTextColor(...NAVY);
              docPdf.text(lines, x + 3, y + 3.6 + valueLineH);
            };
            drawCell(marginX, left[0], leftLines);
            if (right) drawCell(col2X, right[0], rightLines);
            y += rowH;
          }
          y += 5;
        };

        drawInfoSection('DADOS DO ATLETA', [
          ['Nome completo', a.nome],
          ['CPF', a.cpf],
          ['Data de nascimento', a.dataNascimento ? formatDateBRSimple(a.dataNascimento) : ''],
          ['Sexo', a.sexo === 'M' ? 'Masculino' : a.sexo === 'F' ? 'Feminino' : ''],
          ['WhatsApp', a.telefone],
          ['E-mail', a.email],
        ]);

        drawInfoSection('PROVA & KIT', [
          ['Modalidade', modalidadeNomeDe(a)],
          ['Distância', modalidadeDistanciaDe(a)],
          ['Categoria', a.categoria === 'infantil' ? 'Infantil' : 'Adulto / adolescente'],
          ['Kit', kitNomeDe(a)],
          ['Tamanho da camiseta', camisetaLabelDe(a)],
          ['Equipe', a.integranteEquipe === 'sim' ? (a.equipeNome || 'Sim') : 'Não'],
        ]);

        // Itens do kit - mesmo padrão navy/stripe, uma coluna por item.
        const kitDoc = kitDe(a);
        const itens = kitDoc?.itens && kitDoc.itens.length > 0 ? kitDoc.itens : ['Itens do kit a confirmar.'];
        if (y + 7 > pageH - marginBottom) newPage();
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 7, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text(`ITENS DO SEU KIT (${kitNomeDe(a).toUpperCase()})`, marginX + 3, y + 4.9);
        y += 7;

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(9.5);
        itens.forEach((item, idx) => {
          const lines = docPdf.splitTextToSize(`•  ${item}`, usableW - 8);
          const rowH = lines.length * 4.6 + 2.6;
          if (y + rowH > pageH - marginBottom) newPage();
          if (idx % 2 === 1) {
            docPdf.setFillColor(...STRIPE);
            docPdf.rect(marginX, y, usableW, rowH, 'F');
          }
          docPdf.setTextColor(...NAVY);
          docPdf.text(lines, marginX + 4, y + 4.4);
          y += rowH;
        });
        y += 5;

        // Mensagem motivacional
        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(9.5);
        const motivLines = docPdf.splitTextToSize(MENSAGEM_MOTIVACIONAL, usableW - 12);
        const motivH = motivLines.length * 4.4 + 10;
        if (y + motivH > pageH - marginBottom) newPage();
        docPdf.setFillColor(240, 253, 244);
        docPdf.setDrawColor(...GREEN);
        docPdf.roundedRect(marginX, y, usableW, motivH, 3, 3, 'FD');
        docPdf.setTextColor(...NAVY);
        docPdf.text(motivLines, marginX + 6, y + 6.5);
        y += motivH + 8;

        // Programação do dia - mesmo padrão navy/stripe das outras seções.
        if (y + 7 > pageH - marginBottom) newPage();
        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 7, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('PROGRAMAÇÃO DO DIA 12/09 (SÁBADO)', marginX + 3, y + 4.9);
        y += 7;

        const horaColW = 28;
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(9);
        PROGRAMACAO.forEach((item, idx) => {
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(8.5);
          const tituloLines = docPdf.splitTextToSize(item.titulo, usableW - horaColW - 8);
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(7.3);
          const subLines = item.sub ? docPdf.splitTextToSize(item.sub, usableW - horaColW - 8) : [];
          const lineCount = tituloLines.length + subLines.length;
          const rowH = Math.max(9, lineCount * 3.8 + 4);

          if (y + rowH > pageH - marginBottom) newPage();

          if (idx % 2 === 1) {
            docPdf.setFillColor(...STRIPE);
            docPdf.rect(marginX, y, usableW, rowH, 'F');
          }
          docPdf.setDrawColor(226, 232, 240);
          docPdf.setLineWidth(0.2);
          docPdf.line(marginX + horaColW, y, marginX + horaColW, y + rowH);

          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(8);
          docPdf.setTextColor(21, 128, 61);
          const horaLines = docPdf.splitTextToSize(item.hora, horaColW - 4);
          docPdf.text(horaLines, marginX + 3, y + rowH / 2 - (horaLines.length - 1) * 1.8 + 1.2);

          let subY = y + 4.3;
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(8.5);
          docPdf.setTextColor(...NAVY);
          docPdf.text(tituloLines, marginX + horaColW + 4, subY);
          subY += tituloLines.length * 3.8;
          if (subLines.length) {
            docPdf.setFont('helvetica', 'normal');
            docPdf.setFontSize(7.3);
            docPdf.setTextColor(100, 116, 139);
            docPdf.text(subLines, marginX + horaColW + 4, subY + 1.2);
          }

          y += rowH;
        });
        y += 5;

        docPdf.setFont('helvetica', 'italic');
        docPdf.setFontSize(7);
        docPdf.setTextColor(148, 163, 184);
        const footerY = Math.min(y + 4, pageH - 6);
        docPdf.text('Documento gerado automaticamente pelo sistema MCU Night Run.', marginX, footerY);
      }

      docPdf.save(`fichas-atletas-mcu-night-run-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error('Erro ao gerar fichas:', e);
      alert('Erro ao gerar o PDF de fichas. Tente novamente.');
    } finally {
      setGenerating(false);
      setProgresso({ atual: 0, total: 0 });
    }
  };

  if (loading) return <AdminPageSkeleton variant="table" />;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Imprimir Fichas</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>
            Uma ficha por atleta confirmado ({athletes.length}), com dados completos, prova/kit, itens do kit,
            mensagem motivacional e a programação do dia 12/09.
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
          {generating ? `GERANDO... (${progresso.atual}/${progresso.total})` : `BAIXAR PDF COM TODAS (${athletes.length})`}
        </button>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20,
      }}>
        {athletes.map(a => (
          <div key={a.id} style={{
            aspectRatio: '210 / 297', background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ background: 'linear-gradient(135deg, #071A45, #0d2a66)', padding: '6% 8%', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: '20%', aspectRatio: '1', borderRadius: '50%', overflow: 'hidden', background: 'rgba(255,255,255,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {a.fotoUrl ? <img src={a.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={14} color="#fff" />}
              </div>
              <div style={{ color: '#6BFF2A', fontWeight: 900, fontSize: '0.62rem', textTransform: 'uppercase' }}>Sua Ficha Chegou!</div>
            </div>
            <div style={{ padding: '8%', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <strong style={{ fontSize: '0.68rem', color: '#071A45', lineHeight: 1.2 }}>{a.nome.toUpperCase()}</strong>
              <span style={{ fontSize: '0.58rem', color: '#64748b' }}>{a.numeroInscricao ? `Nº ${a.numeroInscricao}` : ''}</span>
              <span style={{ fontSize: '0.58rem', color: '#64748b' }}>{kitNomeDe(a)}</span>
              <span style={{ fontSize: '0.58rem', color: '#64748b' }}>{modalidadeNomeDe(a)}</span>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8' }}>
                <Package size={11} />
                <span style={{ fontSize: '0.55rem' }}>{(kitDe(a)?.itens || []).length} itens</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
