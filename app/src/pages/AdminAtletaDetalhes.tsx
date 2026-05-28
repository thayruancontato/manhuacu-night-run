import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import { useParams, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, collection, getDocs, query, where, orderBy, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { KITS, CATEGORIAS } from '../types';
import { useDialog } from '../context/CustomDialogContext';
import { formatDateBR, toDateValue } from '../utils/dateUtils';
import { formatCamisetaLabel } from '../utils/camisetaUtils';
import {
  ArrowLeft, Edit, Trash2, Send, Save, X, Phone,
  User, Mail, Calendar, MapPin, ClipboardList,
  MessageCircle, Clock, Zap, Activity, Trophy,
  Settings, CreditCard, ChevronRight, ExternalLink, LogIn
} from 'lucide-react';

// Sub-components
import { CollapsibleCard } from '../components/AdminAtletaDetalhes/CollapsibleCard';
import { AtletaHero } from '../components/AdminAtletaDetalhes/AtletaHero';
import { AtletaSummary } from '../components/AdminAtletaDetalhes/AtletaSummary';
import { AtletaHistory } from '../components/AdminAtletaDetalhes/AtletaHistory';
import { AtletaStats } from '../components/AdminAtletaDetalhes/AtletaStats';
import { AtletaPerformance } from '../components/AdminAtletaDetalhes/AtletaPerformance';
import { AtletaQuickActions } from '../components/AdminAtletaDetalhes/AtletaQuickActions';
import { AtletaObservations } from '../components/AdminAtletaDetalhes/AtletaObservations';
import { AtletaExtraInfo } from '../components/AdminAtletaDetalhes/AtletaExtraInfo';
import { AtletaEditModal } from '../components/AdminAtletaDetalhes/AtletaEditModal';
import { AtletaPaymentModal } from '../components/AdminAtletaDetalhes/AtletaPaymentModal';
import { AtletaFicha } from '../components/AdminAtletaDetalhes/AtletaFicha';
import { AdminPageSkeleton } from '../components/Skeleton';

import '../styles/atleta-detalhes.css';

const formatCurrency = (valueInCents: number) => {
  const value = Number(valueInCents || 0) / 100;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

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

const parseBirthDate = (value: string) => {
  return toDateValue(value);
};

const calculateAgeFromDate = (birthDate: Date | null) => {
  if (!birthDate) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

export default function AdminAtletaDetalhes() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [reg, setReg] = useState<any>(null);
  const [allRegs, setAllRegs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [observations, setObservations] = useState<string[]>([]);
  const [camisetas, setCamisetas] = useState<any[]>([]);
  const [camisetaCounts, setCamisetaCounts] = useState<Record<string, number>>({});
  const [modalidades, setModalidades] = useState<any[]>([]);
  const [winnerData, setWinnerData] = useState<any>(null);
  const [vagaId, setVagaId] = useState<number | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const { showAlert, showConfirm } = useDialog();

  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showZoomPhoto, setShowZoomPhoto] = useState(false);
  const [editForm, setEditForm] = useState({
    categoria: '', kit: '', tamanhoCamiseta: '', nome: '', email: '', telefone: '',
    dataNascimento: '', sexo: '', modalidadeId: '', condicaoSaude: '', responsavelNome: '', responsavelCpf: ''
  });
  const [saving, setSaving] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [generatingEuVouCard, setGeneratingEuVouCard] = useState(false);
  const [sendingEuVouCard, setSendingEuVouCard] = useState(false);
  const [cardPhotoCrop, setCardPhotoCrop] = useState<{ src: string; name: string; type: string } | null>(null);
  const [cardCrop, setCardCrop] = useState({ x: 0, y: 0 });
  const [cardCropZoom, setCardCropZoom] = useState(1);
  const [cardCroppedAreaPixels, setCardCroppedAreaPixels] = useState<Area | null>(null);
  const [collapsed, setCollapsed] = useState<any>({
    history: true, stats: true, performance: true, actions: true, observations: true, extras: true
  });

  const toggleCollapse = (sec: string) => setCollapsed({ ...collapsed, [sec]: !collapsed[sec] });

  useEffect(() => { loadAtleta(); loadCamisetas(); loadModalidades(); loadCamisetaCounts(); }, [id]);

  const loadAtleta = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const snap = await getDoc(doc(db, 'nightrun_registrations', id));
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() };
        setReg(data);
        setObservations((data as any).observations || []);
        if ((data as any).cpf) {
          const q = query(collection(db, 'nightrun_registrations'), where('cpf', '==', (data as any).cpf), orderBy('createdAt', 'desc'));
          const allSnap = await getDocs(q);
          setAllRegs(allSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } else { setAllRegs([data]); }

        // Calculate Vaga ID (sequential registration number starting from 1000)
        const qCount = query(collection(db, 'nightrun_registrations'), where('createdAt', '<', (data as any).createdAt));
        const countSnap = await getDocs(qCount);
        setVagaId(1000 + countSnap.size);

        // Load Winner Info
        const winnerQuery = query(collection(db, 'nightrun_sorteios_ganhadores'), where('registrationId', '==', id));
        const winnerSnap = await getDocs(winnerQuery);
        if (!winnerSnap.empty) {
          setWinnerData(winnerSnap.docs[0].data());
        }
      }
    } catch (e: any) {
      console.error(e);
    } finally { setLoading(false); }
  };

  const loadCamisetas = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'nightrun_camisetas')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const order = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'BL_P', 'BL_M', 'BL_G'];
      list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      setCamisetas(list);
    } catch (e) { console.error(e); }
  };

  const loadCamisetaCounts = async () => {
    try {
      const snap = await getDocs(collection(db, 'nightrun_registrations'));
      const counts: Record<string, number> = {};
      snap.docs.forEach(item => {
        const data = item.data();
        const confirmed = data.paymentStatus === 'pago' || data.kitConfirmado || data.contractStatus === 'confirmado';
        if (!confirmed || !data.tamanhoCamiseta) return;
        counts[data.tamanhoCamiseta] = (counts[data.tamanhoCamiseta] || 0) + 1;
      });
      setCamisetaCounts(counts);
    } catch (e) {
      console.error(e);
    }
  };

  const loadModalidades = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'nightrun_modalidades'), orderBy('nome')));
      setModalidades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  if (loading) return <AdminPageSkeleton variant="detail" />;
  if (!reg) return <div style={{ padding: 100, textAlign: 'center', color: '#64748b', fontWeight: 600 }}>Atleta não encontrado.</div>;

  // Data Processing
  const isPago = reg.paymentStatus === 'pago';
  const isConfirmada = isPago || reg.kitConfirmado;
  const createdAt = reg.createdAt?.toDate?.() || new Date();
  const formattedCreatedAt = formatDateBR(createdAt);
  const nascimentoFormatado = reg.dataNascimento ? formatDateBR(reg.dataNascimento) : '';
  const categoriaLabel = CATEGORIAS.find(c => c.id === reg.categoria)?.nome || reg.categoria || '';
  const modalidadeLabel = modalidades.find(m => m.id === reg.modalidadeId)?.nome || '';
  const sexoLabel = reg.sexo === 'M' ? 'Masculino' : reg.sexo === 'F' ? 'Feminino' : reg.sexo || '';
  const kitNome = KITS.find(k => k.id === reg.kit)?.nome || reg.kit || '';
  const selectedCamiseta = camisetas.find(t => t.id === reg.tamanhoCamiseta);
  const formattedTamanho = formatCamisetaLabel(reg.tamanhoCamiseta, selectedCamiseta);
  const statusClass = isPago ? 'confirmed' : reg.paymentStatus === 'pendente' ? 'pending' : 'cancelled';
  const pagamentoLabel = isPago ? 'Pago' : reg.paymentStatus === 'pendente' ? 'Pendente' : 'Cancelado';
  const ticketMedio = allRegs.filter(r => r.paymentStatus === 'pago').length > 0 ? (reg.amount || KITS.find(k => k.id === reg.kit)?.preco || 0) / 100 : 0;
  const idadeCadastro = reg.idadeNoCadastro ?? calculateAgeFromDate(parseBirthDate(reg.dataNascimento));
  const camisetaMedida = selectedCamiseta?.medidas ? `${selectedCamiseta?.medidas.largura} x ${selectedCamiseta?.medidas.altura} cm` : '';
  const originalAmount = Number(reg.originalAmount || reg.amount || 0);
  const finalAmount = Number(reg.amount || 0);
  const discountAmount = Math.max(originalAmount - finalAmount, 0);
  const discountLabel = reg.descontoServidorPublicoMunicipal
    ? 'Servidor pblico municipal - 20%'
    : reg.descontoAplicado || 'Sem desconto';
  const equipeLabel = reg.integranteEquipe === 'sim' ? (reg.equipeNome || 'Sim, no informado') : 'No';
  const paymentProvider = reg.creditCardAsaasPaymentId ? 'asaas' : reg.paymentProvider === 'cora' ? 'cora' : 'asaas';
  const paymentMethodLabel = reg.creditCardAsaasPaymentId || reg.paymentMethod === 'credit_card' ? 'Cartão' : 'PIX';
  const paymentProviderInfo = reg.paymentProvider || reg.invoiceUrl
    ? {
        name: paymentProvider === 'cora' ? 'Cora' : 'Asaas',
        logo: paymentProvider === 'cora' ? '/cora-logo.svg' : '/asaas-logo.svg',
      }
    : null;

  // Actions
  const openWhatsApp = () => {
    const phone = reg.telefone.replace(/\D/g, '');
    if (!phone) return showAlert('Telefone não encontrado.', 'warning');
    const formattedPhone = phone.startsWith('55') ? phone : '55' + phone;
    const url = `https://wa.me/${formattedPhone}`;
    window.open(url, '_blank');
  };

  const openPendingChargeWhatsApp = async () => {
    const phone = String(reg.telefone || '').replace(/\D/g, '');
    if (!phone) return showAlert('Telefone não encontrado.', 'warning');
    const formattedPhone = phone.startsWith('55') ? phone : `55${phone}`;
    try {
      const settingsSnap = await getDoc(PENDING_CHARGE_SETTINGS_REF);
      const template = settingsSnap.exists() && settingsSnap.data().template
        ? settingsSnap.data().template
        : DEFAULT_PENDING_CHARGE_TEMPLATE;
      const text = fillPendingChargeTemplate(template, reg);
      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('[AdminAtletaDetalhes] pending charge template failed', error);
      const text = fillPendingChargeTemplate(DEFAULT_PENDING_CHARGE_TEMPLATE, reg);
      window.open(`https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    }
  };

  const accessAthleteProfile = () => {
    const cleanEmail = String(reg.email || '').trim().toLowerCase();
    const cleanCpf = String(reg.cpf || '').replace(/\D/g, '');
    if (!cleanEmail) return showAlert('E-mail do atleta nao encontrado.', 'warning');
    if (cleanCpf.length < 11) return showAlert('CPF do atleta invalido para login.', 'warning');

    showConfirm('Acessar o perfil deste atleta agora? Sua sessao admin sera trocada para a area do atleta.', async () => {
      try {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, cleanCpf);
        } catch (authError: any) {
          if (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password') {
            await createUserWithEmailAndPassword(auth, cleanEmail, cleanCpf);
          } else {
            throw authError;
          }
        }
        localStorage.removeItem('nightrun_admin_auth');
        localStorage.setItem('nightrun_atleta_auth', 'true');
        navigate('/atleta/dashboard');
      } catch (error: any) {
        console.error('[AdminAtletaDetalhes] athlete impersonation failed', error);
        showAlert(error.message || 'Nao foi possivel acessar o perfil do atleta.', 'error');
      }
    });
  };

  const cancelRegistration = async () => {
    if (!window.confirm('Tem certeza que deseja CANCELAR esta inscrição')) return;
    try {
      await updateDoc(doc(db, 'nightrun_registrations', id!), { paymentStatus: 'cancelado', updatedAt: new Date() });
      showAlert('Inscrição cancelada.', 'success'); loadAtleta();
    } catch { showAlert('Erro ao cancelar.', 'error'); }
  };

  const deleteRegistration = async () => {
    showConfirm('Tem certeza que deseja excluir esta inscrição definitivamente', async () => {
      try {
        await deleteDoc(doc(db, 'nightrun_registrations', id!));
        showAlert('Inscrição excluída.', 'success');
        navigate('/admin/inscritos');
      } catch {
        showAlert('Erro ao excluir inscrição.', 'error');
      }
    });
  };

  const markAsPaid = async () => {
    if (!window.confirm('Marcar como PAGO manualmente')) return;
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) {
      showAlert('Worker não configurado para confirmar pagamento.', 'error');
      return;
    }
    setConfirmingPayment(true);
    try {
      const res = await fetch(`${workerUrl}/registrations/${encodeURIComponent(id!)}/confirm-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceNotify: true })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data.found === false) {
        throw new Error(data.reason || data.error || 'Erro ao confirmar pagamento.');
      }
      const sent = data.notifyResult.success === true;
      showAlert(sent ? 'Pagamento confirmado e mensagem enviada.' : 'Pagamento confirmado. Verifique a conexão do WhatsApp.', sent ? 'success' : 'warning');
      loadAtleta();
    } catch (error: any) {
      console.error('[AdminAtletaDetalhes] confirm payment failed', error);
      showAlert(error.message || 'Erro ao atualizar.', 'error');
    } finally {
      setConfirmingPayment(false);
    }
  };

  const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Falha ao carregar imagem para montar o card.'));
    image.src = src;
  });

  const uploadMediaFile = async (file: File, folder: string) => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    if (!workerUrl) throw new Error('Worker nao configurado para upload.');
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);
    const res = await fetch(`${workerUrl}/media/upload`, { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw new Error(body.error || 'Falha ao enviar arquivo.');
    return body.url as string;
  };

  const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, width: number, height: number) => {
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const sw = width / scale;
    const sh = height / scale;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
  };

  const drawFitText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, initialSize: number, minSize: number, color: string) => {
    const normalizedText = text.trim().toUpperCase();
    let size = initialSize;
    ctx.font = `900 ${size}px Arial Black, Impact, sans-serif`;
    while (ctx.measureText(normalizedText).width > maxWidth && size > minSize) {
      size -= 2;
      ctx.font = `900 ${size}px Arial Black, Impact, sans-serif`;
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.lineWidth = Math.max(3, size * 0.055);
    ctx.strokeText(normalizedText, x, y);
    ctx.fillText(normalizedText, x, y);
  };

  const generateEuVouCard = async (photoUrl: string, modalidadeNome: string) => {
    const [template, photo] = await Promise.all([loadImage('/modelo-card.png'), loadImage(photoUrl)]);
    const canvas = document.createElement('canvas');
    canvas.width = template.naturalWidth;
    canvas.height = template.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Navegador sem suporte para montar o card.');
    ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
    const box = {
      centerX: canvas.width * 0.6738,
      centerY: canvas.height * 0.4429,
      width: canvas.width * 0.4955,
      height: canvas.height * 0.4265,
      rotation: 4.35 * Math.PI / 180,
    };
    ctx.save();
    ctx.translate(box.centerX, box.centerY);
    ctx.rotate(box.rotation);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-box.width / 2, -box.height / 2, box.width, box.height);
    ctx.clip();
    drawCover(ctx, photo, -box.width / 2, -box.height / 2, box.width, box.height);
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);
    ctx.restore();

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const modalityX = canvas.width * 0.095;
    const modalityY = canvas.height * 0.412;
    ctx.font = `900 ${canvas.width * 0.018}px Arial Black, Impact, sans-serif`;
    ctx.fillStyle = '#6BFF2A';
    ctx.fillText('MODALIDADE', modalityX, modalityY + canvas.height * 0.008);
    drawFitText(ctx, modalidadeNome || 'MCU NIGHT RUN', modalityX + canvas.width * 0.012, modalityY + canvas.height * 0.029, canvas.width * 0.205, canvas.width * 0.034, canvas.width * 0.022, '#ffffff');
    ctx.restore();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Falha ao gerar card.')), 'image/jpeg', 0.9);
    });
    return uploadMediaFile(new File([blob], `eu-vou-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'nightrun_cards');
  };

  const buildEuVouWhatsAppText = () => {
    const modalidade = String(modalidadeLabel || reg.modalidadeNome || reg.modalidade || '').trim() || 'MCU Night Run';

    return `Pagamento confirmado!\n\n` +
      `Olá ${reg.nome || 'Atleta'}! Sua inscrição na Manhuaçu Night Run 2026 está garantida.\n\n` +
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
      console.warn('[AdminAtletaDetalhes] Falha ao copiar card para clipboard', error);
      return false;
    }
  };

  const openWhatsAppWithEuVouCard = async (cardUrl: string) => {
    const cleanPhone = String(reg.telefone || '').replace(/\D/g, '');
    if (!cleanPhone) return showAlert('Telefone não encontrado.', 'warning');
    const phone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    setSendingEuVouCard(true);
    try {
      const copied = await copyEuVouCardImage(cardUrl);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildEuVouWhatsAppText())}`, '_blank', 'noopener,noreferrer');
      showAlert(
        copied
          ? 'WhatsApp aberto com a mensagem pronta. A imagem #EUVOU foi copiada, cole na conversa antes de enviar.'
          : 'WhatsApp aberto com a mensagem pronta. Anexe a imagem #EUVOU pelo botão ABRIR.',
        copied ? 'success' : 'warning'
      );
    } finally {
      setSendingEuVouCard(false);
    }
  };

  const handleSendEuVouCard = () => {
    if (!reg.euVouCardUrl) return showAlert('Card Eu Vou não gerado.', 'warning');
    openWhatsAppWithEuVouCard(reg.euVouCardUrl);
  };

  const handleGenerateEuVouCard = async () => {
    if (!reg.fotoUrl) return showAlert('O atleta precisa ter foto para gerar o card.', 'warning');
    setGeneratingEuVouCard(true);
    try {
      const cardUrl = await generateEuVouCard(reg.fotoUrl, modalidadeLabel);
      await updateDoc(doc(db, 'nightrun_registrations', id!), { euVouCardUrl: cardUrl, updatedAt: new Date() });
      setReg((prev: any) => ({ ...prev, euVouCardUrl: cardUrl, updatedAt: new Date() }));
      showConfirm('Card Eu Vou gerado. Quer enviar para o atleta agora', async () => {
        await openWhatsAppWithEuVouCard(cardUrl);
      });
    } catch (e: any) {
      showAlert(e.message || 'Erro ao gerar card Eu Vou.', 'error');
    } finally {
      setGeneratingEuVouCard(false);
    }
  };

  const handleSelectCardPhoto = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCardPhotoCrop({ src: String(reader.result), name: file.name, type: file.type || 'image/jpeg' });
      setCardCrop({ x: 0, y: 0 });
      setCardCropZoom(1);
      setCardCroppedAreaPixels(null);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const onCardCropComplete = (_area: Area, pixels: Area) => {
    setCardCroppedAreaPixels(pixels);
  };

  const confirmCardPhotoCrop = async () => {
    if (!cardPhotoCrop || !cardCroppedAreaPixels) return;
    setGeneratingEuVouCard(true);
    try {
      const img = await loadImage(cardPhotoCrop.src);
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 900;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Navegador sem suporte a corte.');
      ctx.drawImage(img, cardCroppedAreaPixels.x, cardCroppedAreaPixels.y, cardCroppedAreaPixels.width, cardCroppedAreaPixels.height, 0, 0, 900, 900);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Falha ao cortar foto.')), 'image/jpeg', 0.92);
      });
      const fotoUrl = await uploadMediaFile(new File([blob], `foto-card-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'nightrun_photos');
      const cardUrl = await generateEuVouCard(fotoUrl, modalidadeLabel);
      await updateDoc(doc(db, 'nightrun_registrations', id!), { fotoUrl, euVouCardUrl: cardUrl, updatedAt: new Date() });
      setReg((prev: any) => ({ ...prev, fotoUrl, euVouCardUrl: cardUrl, updatedAt: new Date() }));
      setCardPhotoCrop(null);
      showConfirm('Foto trocada e arte gerada novamente. Quer enviar para o atleta agora', async () => {
        await openWhatsAppWithEuVouCard(cardUrl);
      });
    } catch (e: any) {
      showAlert(e.message || 'Erro ao trocar foto e gerar card.', 'error');
    } finally {
      setGeneratingEuVouCard(false);
    }
  };

  const saveEdit = async () => {
    const editedAge = (() => {
      const birth = toDateValue(editForm.dataNascimento);
      if (!birth) return null;
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    })();

    if (editedAge !== null && editedAge <= 12) {
      if (editForm.responsavelNome.trim().length < 3) {
        showAlert('Informe o nome do responsável pelo atleta.', 'warning');
        return;
      }
      if (!editForm.responsavelCpf || editForm.responsavelCpf.replace(/\D/g, '').length !== 11) {
        showAlert('Informe o CPF do responsável pelo atleta.', 'warning');
        return;
      }
    }

    setSaving(true);
    try {
      const { condicaoSaude, ...rest } = editForm;
      const updatedData = {
        ...rest,
        responsavelNome: editedAge !== null && editedAge <= 12 ? editForm.responsavelNome.trim() : '',
        responsavelCpf: editedAge !== null && editedAge <= 12 ? editForm.responsavelCpf : '',
        saude: {
          ...reg.saude,
          condicaoSaude
        },
        updatedAt: new Date()
      };
      await updateDoc(doc(db, 'nightrun_registrations', id!), updatedData);
      showAlert('Sucesso!', 'success'); setShowEditModal(false); loadAtleta();
    } catch { showAlert('Erro', 'error'); } finally { setSaving(false); }
  };
  const addObservation = async () => {
    const text = prompt('Adicionar observação:');
    if (!text) return;
    try {
      const newObs = [...observations, text];
      await updateDoc(doc(db, 'nightrun_registrations', id!), { observations: newObs, updatedAt: new Date() });
      setObservations(newObs); showAlert('Observação adicionada.', 'success');
    } catch { showAlert('Erro ao adicionar observação.', 'error'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', paddingBottom: 40 }}>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        onChange={handleSelectCardPhoto}
        style={{ display: 'none' }}
      />

      {/* Top Bar Simplificada */}
      <div className="admin-det-top-bar" style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '12px 24px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/admin/inscritos')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', fontWeight: 600 }}>
            <ArrowLeft size={18} /> Voltar
          </button>
          <div className="admin-det-divider" style={{ width: 1, height: 20, background: '#e2e8f0' }} />
          <span className="admin-det-breadcrumb-text" style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 600 }}>Inscritos / Detalhes do Atleta</span>
        </div>
        <div className="admin-det-top-actions" style={{ display: 'flex', gap: 8 }}>
          <button onClick={openWhatsApp} style={{ background: '#25D366', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <MessageCircle size={18} /> WhatsApp
          </button>
          <button onClick={() => {
            setEditForm({
              categoria: reg.categoria || '', kit: reg.kit || '', tamanhoCamiseta: reg.tamanhoCamiseta || '',
              nome: reg.nome || '', email: reg.email || '', telefone: reg.telefone || '',
              dataNascimento: reg.dataNascimento || '', sexo: reg.sexo || '',
              modalidadeId: reg.modalidadeId || '',
              condicaoSaude: reg.saude.condicaoSaude || '',
              responsavelNome: reg.responsavelNome || '',
              responsavelCpf: reg.responsavelCpf || ''
            }); setShowEditModal(true);
          }} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <Edit size={18} /> Editar
          </button>
          <button onClick={deleteRegistration} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <Trash2 size={18} /> Excluir
          </button>
        </div>
      </div>

      <div className="admin-det-content" style={{ maxWidth: 1000, margin: '24px auto', padding: '0 20px' }}>
        {/* Header Hero - Lógica Simplificada */}
        <div className="admin-det-hero-card" style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: 24, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          {/* Foto Quadrada sem contorno */}
          <div
            onClick={() => { setZoomImageUrl(reg.fotoUrl || '/fundo-card-atleta.png'); setShowZoomPhoto(true); }}
            className="admin-det-hero-photo"
            style={{ width: 120, height: 120, background: '#f1f5f9', flexShrink: 0, overflow: 'hidden', cursor: 'pointer', borderRadius: 4 }}
          >
            {reg.fotoUrl ? (
              <img src={reg.fotoUrl} alt={reg.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 900, color: '#cbd5e1' }}>
                {reg.nome.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className="admin-det-hero-info" style={{ flex: 1 }}>
            <div className="admin-det-hero-name-wrapper" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ background: '#071A45', color: '#6BFF2A', padding: '4px 10px', borderRadius: 6, fontWeight: 900, fontSize: '1rem', flexShrink: 0 }}>#{vagaId}</span>
              <h1 className="admin-det-hero-name" style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', textTransform: 'uppercase', margin: 0 }}>{reg.nome}</h1>
            </div>
            <div className="admin-det-hero-tags" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ background: '#f1f5f9', color: '#475569', padding: '6px 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 800 }}>{categoriaLabel.toUpperCase()}</div>
              {reg.modalidadeId && (
                <div style={{ background: '#071A45', color: '#6BFF2A', padding: '6px 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 800 }}>{modalidadeLabel.toUpperCase()}</div>
              )}
              <div style={{
                background: isPago ? '#dcfce7' : '#fef9c3',
                color: isPago ? '#166534' : '#854d0e',
                padding: '6px 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 800
              }}>
                {pagamentoLabel.toUpperCase()}
              </div>
              {reg.servidorPublicoMunicipal && (
                <div style={{ background: '#fff7ed', color: '#9a3412', padding: '6px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 800 }}>
                  SERVIDOR MUNICIPAL
                </div>
              )}
            </div>
          </div>

          <div className="admin-det-hero-actions" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reg.paymentStatus === 'pendente' && (
              <button
                onClick={openPendingChargeWhatsApp}
                style={{ background: '#f59e0b', color: '#071A45', border: 'none', padding: '10px 20px', borderRadius: 10, fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer', boxShadow: '0 4px 0 #d97706' }}
              >
                COBRAR NO WHATSAPP
              </button>
            )}
            {!isConfirmada && (
              <button
                onClick={markAsPaid}
                disabled={confirmingPayment}
                style={{ background: '#2ecc71', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', cursor: confirmingPayment ? 'wait' : 'pointer', boxShadow: '0 4px 0 #27ae60', opacity: confirmingPayment ? 0.7 : 1 }}
              >
                {confirmingPayment ? 'CONFIRMANDO...' : 'CONFIRMAR PAGAMENTO'}
              </button>
            )}
            <button onClick={cancelRegistration} style={{ background: '#f1f5f9', color: '#ef4444', border: '1px solid #fee2e2', padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer' }}>
              CANCELAR INSCRIÇÃO
            </button>
          </div>
        </div>

        {/* Informações em Alta Densidade */}
        {reg.servidorPublicoMunicipal && (
          <div style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 14, padding: '14px 18px', marginBottom: 24, fontWeight: 900, fontSize: '0.85rem', textTransform: 'uppercase' }}>
            Servidor público deve apresentar o contracheque na retirada do kit. É obrigatório.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: 24 }}>
          {/* Lado Esquerdo: Identificação & Kit */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
                IDENTIFICAÇÃO DO ATLETA
              </h3>
              {[
                ['CPF', reg.cpf], ['Data de Nascimento', nascimentoFormatado],
                ['Idade no cadastro', idadeCadastro !== null ? `${idadeCadastro} anos` : '---'],
                ['Responsável', reg.responsavelNome],
                ['CPF do Responsável', reg.responsavelCpf],
                ['Sexo', sexoLabel], ['E-mail', reg.email], ['Telefone', reg.telefone],
                ['Servidor municipal', reg.servidorPublicoMunicipal ? 'Sim - contracheque obrigatório' : 'Não'],
                ['Equipe', equipeLabel]
              ].map(([l, v]) => (
                <div key={l as string} className="admin-det-info-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{l}</span>
                  <span style={{ fontSize: '0.9rem', color: '#071A45', fontWeight: 600 }}>{v || '---'}</span>
                </div>
              ))}
            </section>

            <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
                DADOS DA INSCRIÇÃO
              </h3>
              {[
                ['Categoria', categoriaLabel],
                ['Prova', modalidadeLabel],
                ['Kit Selecionado', kitNome], 
                ['Tamanho Camiseta', camisetaMedida ? `${formattedTamanho} - ${camisetaMedida}` : formattedTamanho],
                ['Valor do lote', formatCurrency(originalAmount)],
                ['Desconto', discountAmount > 0 ? `${discountLabel} (-${formatCurrency(discountAmount)})` : 'Sem desconto'],
                ['Valor final', formatCurrency(finalAmount)],
                ['Status do pagamento', pagamentoLabel],
                ['Banco do pagamento', paymentProviderInfo ? `${paymentProviderInfo.name} ${paymentMethodLabel}` : '---'],
                ['ID do pagamento', reg.creditCardAsaasPaymentId || reg.paymentExternalId || reg.asaasPaymentId || reg.coraInvoiceId],
                ['Card Eu Vou', reg.euVouCardUrl ? 'Gerado' : 'Nao gerado'],
                ['Data da Inscrição', formattedCreatedAt],
                ['Lote', `${reg.lote || '1º Lote'} (R$ ${((reg.amount || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`]
              ].map(([l, v]) => (
                <div key={l as string} className="admin-det-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{l}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '0.9rem', color: '#071A45', fontWeight: 700 }}>{v || '---'}</span>
                    {(l === 'Lote' || l === 'Card Eu Vou') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {reg.invoiceUrl && (
                          <a 
                            href={reg.invoiceUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            style={{ background: '#071A45', color: '#fff', padding: '4px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <ExternalLink size={12} /> FATURA
                          </a>
                        )}
                        {reg.comprovanteUrl && (
                          <a 
                            href={reg.comprovanteUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            style={{ background: '#f1f5f9', color: '#071A45', padding: '4px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 800, textDecoration: 'none', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            <ClipboardList size={12} /> COMPROVANTE
                          </a>
                        )}
                        {l === 'Card Eu Vou' && reg.euVouCardUrl && (
                          <>
                            <button
                              type="button"
                              onClick={handleSendEuVouCard}
                              disabled={sendingEuVouCard}
                              style={{ background: '#25D366', color: '#071A45', padding: '4px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 900, border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: sendingEuVouCard ? 'wait' : 'pointer', opacity: sendingEuVouCard ? 0.75 : 1 }}
                            >
                              <Send size={12} /> {sendingEuVouCard ? 'ENVIANDO...' : 'ENVIAR'}
                            </button>
                            <button
                              type="button"
                              onClick={() => photoInputRef.current?.click()}
                              disabled={generatingEuVouCard}
                              style={{ background: '#f1f5f9', color: '#071A45', padding: '4px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 900, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 4, cursor: generatingEuVouCard ? 'wait' : 'pointer', opacity: generatingEuVouCard ? 0.7 : 1 }}
                            >
                              <Edit size={12} /> {generatingEuVouCard ? 'GERANDO...' : 'TROCAR FOTO'}
                            </button>
                            <a
                              href={reg.euVouCardUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ background: '#6BFF2A', color: '#071A45', padding: '4px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <ExternalLink size={12} /> ABRIR
                            </a>
                          </>
                        )}
                        {l === 'Card Eu Vou' && !reg.euVouCardUrl && (
                          <button
                            type="button"
                            onClick={handleGenerateEuVouCard}
                            disabled={generatingEuVouCard}
                            style={{ background: '#6BFF2A', color: '#071A45', padding: '4px 8px', borderRadius: 6, fontSize: '0.6rem', fontWeight: 900, border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: generatingEuVouCard ? 'wait' : 'pointer', opacity: generatingEuVouCard ? 0.7 : 1 }}
                          >
                            <Zap size={12} /> {generatingEuVouCard ? 'GERANDO...' : 'GERAR'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </div>

          {/* Lado Direito: Saúde & Observações */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 900, color: '#ef4444', marginBottom: 16, borderBottom: '2px solid #ef4444', display: 'inline-block', paddingBottom: 4 }}>
                SAÚDE & EMERGÊNCIA
              </h3>
              {[
                ['Condição de Saúde', reg.saude.condicaoSaude], ['Alergias', reg.saude.alergiaDesc || 'Nenhuma'],
                ['Medicamentos', reg.saude.medicamentoDesc || 'Nenhum'],
                ['Contato de Emergência', `${reg.contatoEmergencia.nome} (${reg.contatoEmergencia.parentesco})`],
                ['Telefone Emergência', reg.contatoEmergencia.telefone],
                ['Termos aceitos', reg.termos ? 'Sim' : 'Não'],
                ['Responsabilidade aceita', reg.aceitouTermosResponsabilidade ? 'Sim' : 'Não'],
                ['Assinatura digital', reg.assinatura ? 'Registrada' : 'Não registrada']
              ].map(([l, v]) => (
                <div key={l as string} className="admin-det-info-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{l}</span>
                  <span style={{ fontSize: '0.9rem', color: '#071A45', fontWeight: 600 }}>{v || '---'}</span>
                </div>
              ))}
            </section>

            <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: 900, color: '#071A45', borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
                  OBSERVAÇÕES INTERNAS
                </h3>
                <button onClick={addObservation} style={{ background: '#f1f5f9', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer', color: '#475569' }}>
                  + ADICIONAR
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {observations.length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>Nenhuma observação registrada.</p>
                ) : observations.map((obs, idx) => (
                  <div key={idx} style={{ background: '#f8fafc', padding: '12px', borderRadius: 8, fontSize: '0.85rem', color: '#475569', borderLeft: '3px solid #cbd5e1' }}>
                    {obs}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section style={{ background: '#071A45', borderRadius: 16, padding: 22, marginTop: 24, border: '1px solid rgba(107,255,42,0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ color: '#fff', fontSize: '0.98rem', fontWeight: 900, margin: 0 }}>Perfil do atleta</h3>
            <p style={{ color: 'rgba(255,255,255,0.68)', fontSize: '0.82rem', fontWeight: 700, margin: '5px 0 0' }}>
              Acesse a area do atleta usando as credenciais deste cadastro.
            </p>
          </div>
          <button
            type="button"
            onClick={accessAthleteProfile}
            style={{ background: '#6BFF2A', color: '#071A45', border: 'none', padding: '12px 18px', borderRadius: 10, fontWeight: 950, fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <LogIn size={18} /> ACESSAR PERFIL
          </button>
        </section>
      </div>

      {/* Zoom Overlay (Reutilizado) */}
      {showZoomPhoto && createPortal(
        <div className="atleta-det-zoom-overlay" onClick={() => { setShowZoomPhoto(false); setZoomImageUrl(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={zoomImageUrl || ''} alt="Zoom" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain', borderRadius: 8 }} />
        </div>,
        document.body
      )}

      {cardPhotoCrop && createPortal(
        <div className="photo-crop-overlay" role="dialog" aria-modal="true">
          <div className="photo-crop-modal">
            <div className="photo-crop-header">
              <div>
                <span>Card Eu Vou</span>
                <h2>Recortar nova foto</h2>
              </div>
              <button type="button" onClick={() => setCardPhotoCrop(null)}>×</button>
            </div>
            <div className="photo-crop-stage">
              <Cropper
                image={cardPhotoCrop.src}
                crop={cardCrop}
                zoom={cardCropZoom}
                aspect={1}
                cropShape="rect"
                showGrid={false}
                onCropChange={setCardCrop}
                onZoomChange={setCardCropZoom}
                onCropComplete={onCardCropComplete}
              />
            </div>
            <div className="photo-crop-actions">
              <button type="button" className="photo-crop-cancel" onClick={() => setCardPhotoCrop(null)}>Cancelar</button>
              <button type="button" className="photo-crop-confirm" onClick={confirmCardPhotoCrop} disabled={generatingEuVouCard}>
                {generatingEuVouCard ? 'Gerando...' : 'Usar foto e gerar arte'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <AtletaEditModal show={showEditModal} onClose={() => setShowEditModal(false)} form={editForm} setForm={setEditForm} onSave={saveEdit} saving={saving} CATEGORIAS={CATEGORIAS} KITS={KITS} camisetas={camisetas} modalidades={modalidades} camisetaCounts={camisetaCounts} />
    </div>
  );
}
