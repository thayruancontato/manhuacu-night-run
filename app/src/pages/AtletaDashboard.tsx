import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { db } from '../firebase';
import { CreditCard, Download, ExternalLink, Flag, Link2, MapPin, Package, Repeat, Trophy, Users } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import { useAuth } from '../context/AuthContext';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { formatDateBR, formatDateTimeBR } from '../utils/dateUtils';
import { formatCamisetaLabel } from '../utils/camisetaUtils';
import { buildSorteioPublicUrl, readGanhadores } from '../utils/sorteioUtils';
import { normalizePhoneDigits } from '../utils/titularidadeUtils';

const formatMoneyBR = (valueInCents: number) => (Number(valueInCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AtletaDashboard() {
  const { atletaData: reg, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [camisetaLabel, setCamisetaLabel] = useState('');
  const [sorteiosGanhos, setSorteiosGanhos] = useState<any[]>([]);
  const [modalidade, setModalidade] = useState<any | null>(null);
  const [vinculados, setVinculados] = useState<any[]>([]);
  const [kitsCadastrados, setKitsCadastrados] = useState<KitRecord[]>([]);
  const [gerandoComprovante, setGerandoComprovante] = useState(false);

  useEffect(() => {
    fetchKits().then(setKitsCadastrados).catch(e => console.error('Erro ao carregar kits', e));
  }, []);

  // Sorteios em que este atleta foi sorteado. Ao acessar, registra que ele viu que ganhou.
  useEffect(() => {
    const loadSorteiosGanhos = async () => {
      if (!reg?.id) return;
      try {
        const snap = await getDocs(query(collection(db, 'nightrun_sorteios'), where('ganhadorIds', 'array-contains', reg.id)));
        const items = snap.docs.map(item => ({ id: item.id, ...item.data() } as any));
        setSorteiosGanhos(items);

        await Promise.all(items.map(item => {
          const ganhadores = readGanhadores(item);
          const eu = ganhadores.find(g => g.registrationId === reg.id);
          if (!eu || eu.visualizouEm) return null;
          const atualizados = ganhadores.map(g => g.registrationId === reg.id ? { ...g, visualizouEm: new Date() } : g);
          return updateDoc(doc(db, 'nightrun_sorteios', item.id), { ganhadores: atualizados, updatedAt: new Date() })
            .catch(error => console.error('Erro ao registrar visualização do sorteio:', error));
        }).filter(Boolean));
      } catch (error) {
        console.error('Erro ao carregar sorteios do atleta:', error);
      }
    };

    loadSorteiosGanhos();
  }, [reg?.id]);

  useEffect(() => {
    const loadCamisetaLabel = async () => {
      if (!reg?.tamanhoCamiseta) {
        setCamisetaLabel('');
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'nightrun_camisetas', reg.tamanhoCamiseta));
        if (snap.exists()) {
          setCamisetaLabel(formatCamisetaLabel(reg.tamanhoCamiseta, { id: snap.id, ...snap.data() }));
          return;
        }
      } catch (error) {
        console.error('Erro ao carregar tamanho da camiseta:', error);
      }

      setCamisetaLabel(formatCamisetaLabel(reg.tamanhoCamiseta));
    };

    loadCamisetaLabel();
  }, [reg?.tamanhoCamiseta]);

  useEffect(() => {
    const loadModalidade = async () => {
      if (!reg?.modalidadeId) return setModalidade(null);
      try {
        const snap = await getDoc(doc(db, 'nightrun_modalidades', reg.modalidadeId));
        setModalidade(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (error) {
        console.error('Erro ao carregar modalidade:', error);
        setModalidade(null);
      }
    };

    loadModalidade();
  }, [reg?.modalidadeId]);

  // Inscrições com ligação a este atleta: mesmo e-mail, ou telefone que aparece
  // como contato de emergência de um lado ou de outro.
  useEffect(() => {
    const loadVinculados = async () => {
      if (!reg?.id) return setVinculados([]);
      try {
        const snap = await getDocs(collection(db, 'nightrun_registrations'));
        const meuEmail = String(reg.email || '').trim().toLowerCase();
        const meuTelefone = normalizePhoneDigits(reg.telefone);
        const meuContatoTelefone = normalizePhoneDigits(reg.contatoEmergencia?.telefone);

        const encontrados = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(other => {
            if (other.id === reg.id) return false;
            const outroEmail = String(other.email || '').trim().toLowerCase();
            const outroTelefone = normalizePhoneDigits(other.telefone);
            const outroContatoTelefone = normalizePhoneDigits(other.contatoEmergencia?.telefone);

            const mesmoEmail = !!meuEmail && meuEmail === outroEmail;
            const souContatoDele = !!meuTelefone && meuTelefone === outroContatoTelefone;
            const eleEhMeuContato = !!meuContatoTelefone && meuContatoTelefone === outroTelefone;

            return mesmoEmail || souContatoDele || eleEhMeuContato;
          })
          .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

        setVinculados(encontrados);
      } catch (error) {
        console.error('Erro ao carregar atletas vinculados:', error);
        setVinculados([]);
      }
    };

    loadVinculados();
  }, [reg?.id, reg?.email, reg?.telefone, reg?.contatoEmergencia?.telefone]);

  if (authLoading || loading) return <PageContainer><div style={{ padding: 60, textAlign: 'center' }}>Carregando...</div></PageContainer>;
  if (!reg) return <PageContainer><div style={{ padding: 60, textAlign: 'center', color: '#999' }}>Inscrição não encontrada.</div></PageContainer>;

  const kitNomeAtual = resolveKitNome(kitsCadastrados, reg.kit, reg.kitNome);
  const isPago = reg.paymentStatus === 'pago';

  const formatDate = (val: any, onlyDate = false) => onlyDate ? formatDateBR(val) : formatDateTimeBR(val);

  const InfoRow = ({ label, value, bold }: any) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', color: '#071A45', fontWeight: bold ? 800 : 600 }}>{value || '---'}</span>
    </div>
  );

  const initials = reg.nome ? reg.nome.split(' ').map((n: any) => n[0]).join('').substring(0, 2).toUpperCase() : '';

  // Troca para o perfil vinculado clicado: reinscrição do ID selecionado + recarga completa
  // (o contexto de autenticação lê a inscrição ativa do localStorage no carregamento).
  const acessarVinculado = (regId: string) => {
    if (!regId || regId === reg.id) return;
    localStorage.setItem('nightrun_atleta_reg_id', regId);
    window.location.reload();
  };

  // Comprovante de inscrição em PDF - mesmo padrão visual (header.png, navy/stripe, título
  // em Anton skewed) do relatório de confirmados por kit em AdminKits.tsx, pra manter a
  // identidade visual consistente em todos os PDFs do sistema.
  const handleDownloadComprovante = async () => {
    setGerandoComprovante(true);
    try {
      const eventoSnap = await getDoc(doc(db, 'nightrun_settings', 'evento'));
      const eventDateRaw = eventoSnap.exists() ? eventoSnap.data().eventDate : '';
      const eventDateFmt = eventDateRaw
        ? new Date(eventDateRaw).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';

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

      // Foto do atleta é opcional (nem toda inscrição tem fotoUrl) - se falhar ao buscar,
      // segue sem foto em vez de travar a geração do comprovante inteiro.
      const fotoBase64: string | null = reg.fotoUrl
        ? await new Promise<string | null>(resolve => {
            fetch(reg.fotoUrl)
              .then(res => res.blob())
              .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || '') || null);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              })
              .catch(() => resolve(null));
          })
        : null;

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
        docPdf.addImage(headerBase64, 'PNG', 0, 0, headerW, headerH, 'comprovante-header', 'FAST');
      } catch {
        docPdf.setFillColor(...NAVY);
        docPdf.rect(0, 0, pageW, headerH, 'F');
      }

      let y = headerH + 11;
      docPdf.addImage(titleImgData, 'PNG', marginX, y - titleImgH + 2, titleImgW, titleImgH, undefined, 'FAST');
      y += 5;

      if (fotoBase64) {
        try {
          const photoSize = 22;
          const photoX = pageW - marginX - photoSize;
          const photoY = headerH + 3;
          const photoFormat = fotoBase64.includes('image/png') ? 'PNG' : 'JPEG';
          docPdf.addImage(fotoBase64, photoFormat, photoX, photoY, photoSize, photoSize, 'comprovante-foto', 'FAST');
          docPdf.setDrawColor(...NAVY);
          docPdf.setLineWidth(0.6);
          docPdf.rect(photoX, photoY, photoSize, photoSize, 'D');
        } catch (e) {
          console.error('Erro ao inserir foto no comprovante:', e);
        }
      }

      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(9);
      docPdf.setTextColor(100, 116, 139);
      docPdf.text(`MCU Night Run 2026${eventDateFmt ? ` · ${eventDateFmt}` : ''} · Manhuaçu/MG`, marginX, y);
      y += 9;

      if (reg.numeroInscricao) {
        docPdf.setFillColor(...NAVY);
        docPdf.roundedRect(marginX, y, usableW, 20, 3, 3, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text('NÚMERO DA INSCRIÇÃO', marginX + 6, y + 7.5);
        docPdf.setFont('courier', 'bold');
        docPdf.setFontSize(17);
        docPdf.setTextColor(...GREEN);
        docPdf.text(String(reg.numeroInscricao), marginX + 6, y + 16);

        const statusText = isPago ? 'PAGAMENTO CONFIRMADO' : 'AGUARDANDO PAGAMENTO';
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        const statusW = docPdf.getTextWidth(statusText);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text(statusText, marginX + usableW - statusW - 6, y + 11.5);
        y += 20 + 8;
      }

      if (reg.titularidadeRecebida) {
        const noticeText = `TITULARIDADE TRANSFERIDA: esta inscrição pertencia originalmente a ${reg.titularidadeRecebidaDeNome || 'outro atleta'} e foi repassada para o atleta abaixo.`;
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8);
        const noticeLines = docPdf.splitTextToSize(noticeText, usableW - 12);
        const noticeH = noticeLines.length * 4 + 6;
        docPdf.setFillColor(255, 251, 235);
        docPdf.setDrawColor(252, 211, 77);
        docPdf.roundedRect(marginX, y, usableW, noticeH, 2, 2, 'FD');
        docPdf.setTextColor(146, 64, 14);
        docPdf.text(noticeLines, marginX + 6, y + 5);
        y += noticeH + 8;
      }

      // Duas colunas lado a lado por linha (label em cima, valor embaixo, quebrando linha
      // se precisar) - em vez de uma coluna só - pra caber tudo numa única página sem
      // nunca cortar texto, não importa quantos campos a inscrição tenha.
      const colGap = 6;
      const colW = (usableW - colGap) / 2;
      const col2X = marginX + colW + colGap;
      const valueLineH = 4.1;

      const drawSection = (title: string, rows: [string, any][]) => {
        const visibleRows = rows.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
        if (visibleRows.length === 0) return;

        docPdf.setFillColor(...NAVY);
        docPdf.rect(marginX, y, usableW, 7, 'F');
        docPdf.setFont('helvetica', 'bold');
        docPdf.setFontSize(8.5);
        docPdf.setTextColor(255, 255, 255);
        docPdf.text(title, marginX + 3, y + 4.9);
        y += 7;

        docPdf.setFont('helvetica', 'normal');
        docPdf.setFontSize(9);
        for (let i = 0; i < visibleRows.length; i += 2) {
          const left = visibleRows[i];
          const right = visibleRows[i + 1];
          const leftLines = docPdf.splitTextToSize(String(left[1]), colW - 4);
          const rightLines = right ? docPdf.splitTextToSize(String(right[1]), colW - 4) : [];
          const lineCount = Math.max(leftLines.length, rightLines.length, 1);
          const rowH = 3.6 + lineCount * valueLineH + 1.5;

          if ((i / 2) % 2 === 1) {
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

      drawSection('DADOS DO ATLETA', [
        ['Nome completo', reg.nome],
        ['CPF', reg.cpf],
        ['Data de nascimento', formatDate(reg.dataNascimento, true)],
        ['Sexo', reg.sexo === 'M' ? 'Masculino' : 'Feminino'],
        ['WhatsApp', reg.telefone],
        ['E-mail', reg.email],
      ]);

      drawSection('PROVA & KIT', [
        ['Modalidade', modalidade?.nome],
        ['Distância', modalidade?.distancia],
        ['Categoria', reg.categoria === 'infantil' ? 'Infantil' : 'Adulto / adolescente'],
        ['Kit', kitNomeAtual],
        ['Tamanho da camiseta', camisetaLabel || reg.tamanhoCamiseta],
        ['Equipe', reg.integranteEquipe === 'sim' ? (reg.equipeNome || 'Sim') : 'Não'],
      ]);

      drawSection('INSCRIÇÃO & PAGAMENTO', [
        ['Data da inscrição', formatDate(reg.createdAt, true)],
        ['Valor pago', formatMoneyBR(reg.amount)],
        ['Status', isPago ? 'Confirmado' : (reg.paymentStatus === 'vencido' ? 'Vencido' : 'Aguardando pagamento')],
      ]);

      if (reg.endereco?.cidade) {
        drawSection('ENDEREÇO', [
          ['Cidade / UF', `${reg.endereco.cidade} / ${reg.endereco.uf || ''}`],
          ['Bairro', reg.endereco.bairro],
          ['Rua', reg.endereco.rua ? `${reg.endereco.rua}${reg.endereco.numero ? `, ${reg.endereco.numero}` : ''}` : ''],
          ['CEP', reg.endereco.cep],
        ]);
      }

      const footerY = Math.max(y + 8, pageH - 14);
      docPdf.setFont('helvetica', 'italic');
      docPdf.setFontSize(7.5);
      docPdf.setTextColor(148, 163, 184);
      docPdf.text('Documento gerado automaticamente pelo sistema MCU Night Run. Válido como comprovante de inscrição no evento.', marginX, footerY);
      docPdf.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, marginX, footerY + 4);

      docPdf.save(`comprovante-inscricao-${String(reg.nome || 'atleta').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}.pdf`);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar o comprovante. Tente novamente.');
    } finally {
      setGerandoComprovante(false);
    }
  };

  return (
    <div style={{ animation: 'fadeIn .4s ease-out', paddingBottom: 76 }}>
      {/* Comprovante de inscrição - fixo no rodapé da tela, centralizado */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
        display: 'flex', justifyContent: 'center', padding: '14px 20px',
        background: 'linear-gradient(to top, #f8fafc 60%, rgba(248,250,252,0))',
      }}>
        <button
          type="button"
          onClick={handleDownloadComprovante}
          disabled={gerandoComprovante}
          style={{
            background: '#071A45', color: '#fff', border: '1px solid rgba(107,255,42,0.5)',
            borderRadius: 40, padding: '14px 28px', fontSize: '0.85rem', fontWeight: 800,
            display: 'flex', alignItems: 'center', gap: 8, cursor: gerandoComprovante ? 'wait' : 'pointer',
            boxShadow: '0 8px 24px rgba(7,26,69,0.28)', opacity: gerandoComprovante ? 0.7 : 1,
          }}
        >
          <Download size={16} color="#6BFF2A" />
          {gerandoComprovante ? 'GERANDO...' : 'BAIXAR COMPROVANTE DE INSCRIÇÃO'}
        </button>
      </div>

      {/* Sorteios ganhos por este atleta */}
      {sorteiosGanhos.map(sorteio => (
        <div
          key={sorteio.id}
          style={{
            background: 'linear-gradient(135deg, #071A45 0%, #0d2a66 100%)',
            borderRadius: 16, padding: '22px 26px', marginBottom: 24,
            border: '1px solid rgba(107,255,42,0.5)', boxShadow: '0 8px 24px rgba(7,26,69,0.24)',
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
          }}
        >
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(107,255,42,0.15)', color: '#6BFF2A', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Trophy size={32} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: '#6BFF2A', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Você ganhou!
            </div>
            <h2 style={{ margin: '4px 0 4px', color: '#fff', fontSize: '1.25rem', fontWeight: 900 }}>
              {sorteio.premioNome || 'Prêmio surpresa'}
            </h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
              {sorteio.titulo || 'Sorteio MCU Night Run'}
              {sorteio.sorteadoEm ? ` · ${formatDateTimeBR(sorteio.sorteadoEm.toDate?.() || sorteio.sorteadoEm)}` : ''}
            </p>
          </div>
          {sorteio.premioImagem && (
            <img src={sorteio.premioImagem} alt={sorteio.premioNome} style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover' }} />
          )}
          <a
            href={buildSorteioPublicUrl(sorteio.id)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#6BFF2A', color: '#071A45', padding: '12px 20px', borderRadius: 12, fontWeight: 900, fontSize: '0.8rem', textDecoration: 'none' }}
          >
            <ExternalLink size={16} /> Ver sorteio
          </a>
        </div>
      ))}

      {/* Hero Header */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 24 }}>
        {/* Foto Quadrada sem contorno */}
        <div style={{ width: 100, height: 100, background: '#f1f5f9', flexShrink: 0, overflow: 'hidden' }}>
          {reg.fotoUrl ? (
            <img src={reg.fotoUrl} alt={reg.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 900, color: '#94a3b8' }}>
              {initials}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Olá, {reg.nome.split(' ')[0]}!</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Acompanhe sua inscrição no evento</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ background: '#f1f5f9', color: '#475569', padding: '6px 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 800 }}>{reg.categoria.toUpperCase()}</div>
            <div style={{ 
              background: isPago ? '#dcfce7' : '#fef9c3', 
              color: isPago ? '#166534' : '#854d0e', 
              padding: '6px 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 800 
            }}>
              {isPago ? 'PAGAMENTO CONFIRMADO' : 'AGUARDANDO PAGAMENTO'}
            </div>
          </div>
        </div>
      </div>

      {reg.numeroInscricao && (
        <div style={{
          background: 'linear-gradient(135deg, #071A45 0%, #0d2a66 100%)',
          borderRadius: 16, padding: '20px 26px', marginBottom: 24,
          border: '1px solid rgba(107,255,42,0.5)', boxShadow: '0 8px 24px rgba(7,26,69,0.24)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>
            Número da sua inscrição
          </div>
          <div style={{
            color: '#6BFF2A', fontSize: '2.1rem', fontWeight: 900, letterSpacing: 4,
            fontFamily: 'monospace', textShadow: '0 0 20px rgba(107,255,42,0.5)',
          }}>
            {reg.numeroInscricao}
          </div>
        </div>
      )}

      {reg.titularidadeRecebida && (
        <div style={{
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12,
          padding: '12px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Repeat size={16} color="#92400e" />
          <span style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 700 }}>
            Titularidade recebida de <strong>{reg.titularidadeRecebidaDeNome || 'outro atleta'}</strong>
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: 24, justifyContent: 'center' }}>
        {/* Lado Esquerdo: Identificação & Kit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              DADOS DO ATLETA
            </h3>
            <InfoRow label="Nome Completo" value={reg.nome} bold />
            <InfoRow label="Data de Nascimento" value={formatDate(reg.dataNascimento, true)} />
            <InfoRow label="CPF" value={reg.cpf} />
            <InfoRow label="E-mail" value={reg.email} />
            <InfoRow label="WhatsApp" value={reg.telefone} />
            <InfoRow label="WhatsApp Secundário" value={reg.telefoneSecundario} />
            <InfoRow label="Gênero" value={reg.sexo === 'M' ? 'Masculino' : 'Feminino'} />
            {reg.responsavelNome && <InfoRow label="Responsável" value={reg.responsavelNome} />}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              <MapPin size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              ENDEREÇO
            </h3>
            <InfoRow label="Cidade / UF" value={reg.endereco?.cidade ? `${reg.endereco.cidade} / ${reg.endereco.uf || ''}` : ''} />
            <InfoRow label="Bairro" value={reg.endereco?.bairro} />
            <InfoRow label="Rua" value={reg.endereco?.rua ? `${reg.endereco.rua}${reg.endereco.numero ? `, ${reg.endereco.numero}` : ''}` : ''} />
            <InfoRow label="CEP" value={reg.endereco?.cep} />
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              <Package size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              KIT & CAMISETA
            </h3>
            <InfoRow label="Kit Selecionado" value={kitNomeAtual} bold />
            <InfoRow label="Tamanho Camiseta" value={camisetaLabel || reg.tamanhoCamiseta} />
          </section>
        </div>

        {/* Lado Direito: Prova, Pagamento & Saúde */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              <Flag size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              PROVA & EQUIPE
            </h3>
            <InfoRow label="Modalidade" value={modalidade?.nome || '---'} bold />
            <InfoRow label="Distância" value={modalidade?.distancia} />
            <InfoRow label="Categoria" value={reg.categoria === 'infantil' ? 'Infantil' : 'Adulto / adolescente'} />
            <InfoRow label="Faz parte de equipe" value={reg.integranteEquipe === 'sim' ? (reg.equipeNome || 'Sim') : 'Não'} />
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              <CreditCard size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              PAGAMENTO
            </h3>
            <InfoRow label="Valor da Inscrição" value={formatMoneyBR(reg.amount)} bold />
            <InfoRow label="Status" value={isPago ? 'Confirmado' : (reg.paymentStatus === 'vencido' ? 'Vencido' : 'Aguardando pagamento')} />
            <InfoRow label="Data da Inscrição" value={formatDate(reg.createdAt, true)} />
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#ef4444', marginBottom: 16, borderBottom: '2px solid #ef4444', display: 'inline-block', paddingBottom: 4 }}>
              SAÚDE & EMERGÊNCIA
            </h3>
            <InfoRow label="Tipo Sanguíneo" value={reg.saude?.tipoSanguineo} />
            <InfoRow label="Condição de Saúde" value={reg.saude?.condicaoSaude || 'Nenhuma'} />
            <InfoRow label="Alergias" value={reg.saude?.alergiaDesc || 'Nenhuma'} />
            <InfoRow label="Medicamentos" value={reg.saude?.medicamentoDesc || 'Nenhum'} />
            <InfoRow label="Contato Emergência" value={reg.contatoEmergencia?.nome} />
            <InfoRow label="Parentesco" value={reg.contatoEmergencia?.parentesco} />
            <InfoRow label="Tel. Emergência" value={reg.contatoEmergencia?.telefone} />
          </section>
        </div>
      </div>

      {vinculados.length > 0 && (
        <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', marginTop: 24 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={16} color="#6BFF2A" />
            ATLETAS COM LIGAÇÃO A VOCÊ
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 18 }}>
            Inscrições com o mesmo e-mail ou vinculadas pelo contato de emergência. Clique para acessar.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {vinculados.map(v => {
              const vInitials = v.nome ? String(v.nome).split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '';
              const vPago = v.paymentStatus === 'pago';
              return (
                <div
                  key={v.id}
                  onClick={() => acessarVinculado(v.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') acessarVinculado(v.id); }}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#6BFF2A'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(7,26,69,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {v.fotoUrl ? (
                      <img src={v.fotoUrl} alt={v.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontWeight: 900, color: '#94a3b8', fontSize: '0.9rem' }}>{vInitials}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        background: vPago ? '#dcfce7' : '#fef9c3', color: vPago ? '#166534' : '#854d0e',
                        padding: '2px 8px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 800,
                      }}>
                        {vPago ? 'CONFIRMADO' : 'PENDENTE'}
                      </span>
                      {v.integranteEquipe === 'sim' && v.equipeNome && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#64748b', fontSize: '0.65rem', fontWeight: 700 }}>
                          <Users size={11} /> {v.equipeNome}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!isPago && reg.invoiceUrl && (
        <div style={{ marginTop: 24, background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 16, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontWeight: 800, color: '#92400e', marginBottom: 4 }}>Pagamento Pendente</div>
            <p style={{ fontSize: '0.85rem', color: '#b45309' }}>Sua inscrição será confirmada após o pagamento.</p>
          </div>
          <a href={reg.invoiceUrl} target="_blank" style={{ background: '#071A45', color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem' }}>
            PAGAR AGORA
          </a>
        </div>
      )}
    </div>
  );
}
