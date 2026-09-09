import { jsPDF } from 'jspdf';
import { formatDateBR } from './dateUtils';

// Gerador único do comprovante de inscrição em PDF - usado tanto pelo atleta real
// (AtletaDashboard.tsx) quanto pelo exemplo do admin (AdminComprovanteExemplo.tsx), pra
// garantir que os dois produzam exatamente o mesmo layout (header.png, navy/stripe,
// título em Anton skewed, duas colunas por linha) sem duplicar a lógica de desenho.
export interface ComprovanteInscricaoData {
  nome: string;
  cpf: string;
  dataNascimento: any;
  sexo: string;
  telefone: string;
  email: string;
  categoria: string;
  integranteEquipe?: string;
  equipeNome?: string;
  modalidadeNome?: string;
  modalidadeDistancia?: string;
  kitNome?: string;
  tamanhoCamisetaLabel?: string;
  createdAt: any;
  amount: number;
  isPago: boolean;
  paymentStatus?: string;
  numeroInscricao?: string;
  titularidadeRecebida?: boolean;
  titularidadeRecebidaDeNome?: string;
  endereco?: {
    cidade?: string;
    uf?: string;
    bairro?: string;
    rua?: string;
    numero?: string;
    cep?: string;
  };
  fotoUrl?: string;
  eventDateFmt?: string;
  fileName?: string;
}

const formatMoneyBR = (valueInCents: number) =>
  (Number(valueInCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fetchAsBase64 = (url: string): Promise<string | null> =>
  new Promise(resolve => {
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

export async function generateComprovanteInscricaoPdf(data: ComprovanteInscricaoData): Promise<void> {
  const headerBase64 = await fetchAsBase64(`/header.png?v=${Date.now()}`);
  const fotoBase64 = data.fotoUrl ? await fetchAsBase64(data.fotoUrl) : null;

  const titleFont = new FontFace('Anton', 'url(/fonts/Anton-Regular.ttf)');
  await titleFont.load();
  (document as any).fonts.add(titleFont);
  const titleText = 'COMPROVANTE DE INSCRIÇÃO';
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
  const titleImgH = 10;
  const titleImgW = titleImgH * titleImgAspect;

  const docPdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageW = docPdf.internal.pageSize.getWidth();
  const pageH = docPdf.internal.pageSize.getHeight();
  const marginX = 16;
  const headerAspect = 2172 / 724;
  const headerW = pageW;
  const headerH = headerW / headerAspect;
  const usableW = pageW - marginX * 2;
  const NAVY: [number, number, number] = [7, 26, 69];
  const STRIPE: [number, number, number] = [241, 245, 249];
  const GREEN: [number, number, number] = [107, 255, 42];

  try {
    if (headerBase64) docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'comprovante-header', 'FAST');
    else throw new Error('sem header');
  } catch {
    docPdf.setFillColor(...NAVY);
    docPdf.rect(0, 0, pageW, headerH, 'F');
  }

  let y = headerH + 11;
  docPdf.addImage(titleImgData, 'PNG', marginX, y - titleImgH + 2, titleImgW, titleImgH, undefined, 'FAST');
  y += 5;

  docPdf.setFont('helvetica', 'italic');
  docPdf.setFontSize(9);
  docPdf.setTextColor(100, 116, 139);
  docPdf.text(`MCU Night Run 2026${data.eventDateFmt ? ` · ${data.eventDateFmt}` : ''} · Manhuaçu/MG`, marginX, y);
  y += 9;

  if (fotoBase64) {
    try {
      const photoSize = 24;
      const photoX = pageW / 2 - photoSize / 2;
      const photoY = y;
      const photoFormat = fotoBase64.includes('image/png') ? 'PNG' : 'JPEG';
      docPdf.addImage(fotoBase64, photoFormat, photoX, photoY, photoSize, photoSize, 'comprovante-foto', 'FAST');
      docPdf.setDrawColor(...NAVY);
      docPdf.setLineWidth(0.6);
      docPdf.rect(photoX, photoY, photoSize, photoSize, 'D');
      y += photoSize + 6;
    } catch (e) {
      console.error('Erro ao inserir foto no comprovante:', e);
    }
  }

  if (data.numeroInscricao) {
    docPdf.setFillColor(...NAVY);
    docPdf.roundedRect(marginX, y, usableW, 18, 3, 3, 'F');
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(7.5);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text('NÚMERO DA INSCRIÇÃO', marginX + 6, y + 7);
    docPdf.setFont('courier', 'bold');
    docPdf.setFontSize(15.5);
    docPdf.setTextColor(...GREEN);
    docPdf.text(String(data.numeroInscricao), marginX + 6, y + 14.5);

    const statusText = data.isPago ? 'PAGAMENTO CONFIRMADO' : 'AGUARDANDO PAGAMENTO';
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(8);
    const statusW = docPdf.getTextWidth(statusText);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text(statusText, marginX + usableW - statusW - 6, y + 10.5);
    y += 18 + 6;
  }

  if (data.titularidadeRecebida) {
    const noticeText = `TITULARIDADE TRANSFERIDA: esta inscrição pertencia originalmente a ${data.titularidadeRecebidaDeNome || 'outro atleta'} e foi repassada para o atleta abaixo.`;
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(7.5);
    const noticeLines = docPdf.splitTextToSize(noticeText, usableW - 12);
    const noticeH = noticeLines.length * 3.6 + 5;
    docPdf.setFillColor(255, 251, 235);
    docPdf.setDrawColor(252, 211, 77);
    docPdf.roundedRect(marginX, y, usableW, noticeH, 2, 2, 'FD');
    docPdf.setTextColor(146, 64, 14);
    docPdf.text(noticeLines, marginX + 6, y + 4.6);
    y += noticeH + 6;
  }

  // Duas colunas lado a lado por linha (label em cima, valor embaixo, quebrando linha se
  // precisar) pra caber tudo numa única página sem nunca cortar texto. O número de campos
  // preenchidos varia por inscrição (endereço, foto, aviso de titularidade são opcionais),
  // então medimos a altura total ANTES de desenhar: se a versão normal (mais espaçada) não
  // couber no espaço restante da página, compactamos fonte/espaçamento - nunca o contrário
  // (nunca deixamos o conteúdo estourar a página pra manter um espaçamento "bonito").
  const colGap = 6;
  const colW = (usableW - colGap) / 2;
  const col2X = marginX + colW + colGap;

  const sections: { title: string; rows: [string, any][] }[] = [
    {
      title: 'DADOS DO ATLETA',
      rows: [
        ['Nome completo', data.nome],
        ['CPF', data.cpf],
        ['Data de nascimento', data.dataNascimento ? formatDateBR(data.dataNascimento) : ''],
        ['Sexo', data.sexo === 'M' ? 'Masculino' : data.sexo === 'F' ? 'Feminino' : ''],
        ['WhatsApp', data.telefone],
        ['E-mail', data.email],
      ],
    },
    {
      title: 'PROVA & KIT',
      rows: [
        ['Modalidade', data.modalidadeNome],
        ['Distância', data.modalidadeDistancia],
        ['Categoria', data.categoria === 'infantil' ? 'Infantil' : 'Adulto / adolescente'],
        ['Kit', data.kitNome],
        ['Tamanho da camiseta', data.tamanhoCamisetaLabel],
        ['Equipe', data.integranteEquipe === 'sim' ? (data.equipeNome || 'Sim') : 'Não'],
      ],
    },
    {
      title: 'INSCRIÇÃO & PAGAMENTO',
      rows: [
        ['Data da inscrição', data.createdAt ? formatDateBR(data.createdAt) : ''],
        ['Valor pago', formatMoneyBR(data.amount)],
        ['Status', data.isPago ? 'Confirmado' : (data.paymentStatus === 'vencido' ? 'Vencido' : 'Aguardando pagamento')],
      ],
    },
  ];
  if (data.endereco?.cidade) {
    sections.push({
      title: 'ENDEREÇO',
      rows: [
        ['Cidade / UF', `${data.endereco.cidade} / ${data.endereco.uf || ''}`],
        ['Bairro', data.endereco.bairro],
        ['Rua', data.endereco.rua ? `${data.endereco.rua}${data.endereco.numero ? `, ${data.endereco.numero}` : ''}` : ''],
        ['CEP', data.endereco.cep],
      ],
    });
  }

  type SectionStyle = {
    valueFontSize: number; labelFontSize: number; titleFontSize: number;
    valueLineH: number; rowPadTop: number; rowPadBottom: number;
    sectionHeaderH: number; sectionGap: number;
  };
  const NORMAL: SectionStyle = { valueFontSize: 9, labelFontSize: 7, titleFontSize: 8.5, valueLineH: 4.1, rowPadTop: 3.6, rowPadBottom: 1.5, sectionHeaderH: 7, sectionGap: 5 };
  const COMPACT: SectionStyle = { valueFontSize: 7.8, labelFontSize: 6, titleFontSize: 7.5, valueLineH: 3.3, rowPadTop: 3, rowPadBottom: 1, sectionHeaderH: 5.5, sectionGap: 3 };

  const visibleSections = sections
    .map(s => ({ title: s.title, visibleRows: s.rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '') }))
    .filter(s => s.visibleRows.length > 0);

  const measureHeight = (style: SectionStyle) => {
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(style.valueFontSize);
    let total = 0;
    visibleSections.forEach(s => {
      total += style.sectionHeaderH;
      for (let i = 0; i < s.visibleRows.length; i += 2) {
        const left = s.visibleRows[i];
        const right = s.visibleRows[i + 1];
        const leftLines = docPdf.splitTextToSize(String(left[1]), colW - 4).length;
        const rightLines = right ? docPdf.splitTextToSize(String(right[1]), colW - 4).length : 0;
        const lineCount = Math.max(leftLines, rightLines, 1);
        total += style.rowPadTop + lineCount * style.valueLineH + style.rowPadBottom;
      }
      total += style.sectionGap;
    });
    return total;
  };

  const footerReserve = 14;
  const availableForSections = pageH - footerReserve - y;
  const style = measureHeight(NORMAL) <= availableForSections ? NORMAL : COMPACT;

  const drawSection = (title: string, visibleRows: [string, any][]) => {
    docPdf.setFillColor(...NAVY);
    docPdf.rect(marginX, y, usableW, style.sectionHeaderH, 'F');
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(style.titleFontSize);
    docPdf.setTextColor(255, 255, 255);
    docPdf.text(title, marginX + 3, y + style.sectionHeaderH * 0.7);
    y += style.sectionHeaderH;

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(style.valueFontSize);
    for (let i = 0; i < visibleRows.length; i += 2) {
      const left = visibleRows[i];
      const right = visibleRows[i + 1];
      const leftLines = docPdf.splitTextToSize(String(left[1]), colW - 4);
      const rightLines = right ? docPdf.splitTextToSize(String(right[1]), colW - 4) : [];
      const lineCount = Math.max(leftLines.length, rightLines.length, 1);
      const rowH = style.rowPadTop + lineCount * style.valueLineH + style.rowPadBottom;

      if ((i / 2) % 2 === 1) {
        docPdf.setFillColor(...STRIPE);
        docPdf.rect(marginX, y, usableW, rowH, 'F');
      }

      const drawCell = (x: number, label: string, lines: string[]) => {
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(style.labelFontSize);
        docPdf.setTextColor(100, 116, 139);
        docPdf.text(label.toUpperCase(), x + 3, y + style.rowPadTop);
        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(style.valueFontSize);
        docPdf.setTextColor(...NAVY);
        docPdf.text(lines, x + 3, y + style.rowPadTop + style.valueLineH);
      };

      drawCell(marginX, left[0], leftLines);
      if (right) drawCell(col2X, right[0], rightLines);

      y += rowH;
    }
    y += style.sectionGap;
  };

  visibleSections.forEach(s => drawSection(s.title, s.visibleRows));

  const footerY = Math.min(Math.max(y + 8, pageH - footerReserve), pageH - 8);
  docPdf.setFont('helvetica', 'italic');
  docPdf.setFontSize(7.5);
  docPdf.setTextColor(148, 163, 184);
  docPdf.text('Documento gerado automaticamente pelo sistema MCU Night Run. Válido como comprovante de inscrição no evento.', marginX, footerY);
  docPdf.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, marginX, footerY + 4);

  const fileName = data.fileName || `comprovante-inscricao-${String(data.nome || 'atleta').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}.pdf`;
  docPdf.save(fileName);
}
