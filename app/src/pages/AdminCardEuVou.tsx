import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { arrayUnion, collection, doc, getDocs, increment, orderBy, query, updateDoc } from 'firebase/firestore';
import { CheckCircle, Clock, Image as ImageIcon, Send, Search, X } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { useAuth } from '../context/AuthContext';
import type { Modalidade } from '../types';
import { SkeletonCard } from '../components/Skeleton';
import { formatDateTimeBR } from '../utils/dateUtils';
import '../styles/admin.css';

const buildEuVouWhatsAppText = (registration: any, modalidadeNome: string) => {
  const modalidade = String(modalidadeNome || registration.modalidadeNome || registration.modalidade || '').trim() || 'MCU Night Run';

  return `Pagamento confirmado!\n\n` +
    `Ola ${registration.nome || 'Atleta'}! Sua inscricao na Manhuacu Night Run 2026 esta garantida.\n\n` +
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
    console.warn('[AdminCardEuVou] Falha ao copiar card para clipboard', error);
    return false;
  }
};

export default function AdminCardEuVou() {
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const { showAlert } = useDialog();
  const { user } = useAuth();

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const [modSnap, regSnap] = await Promise.all([
        getDocs(query(collection(db, 'nightrun_modalidades'), orderBy('nome'))),
        getDocs(query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc'))),
      ]);
      setModalidades(modSnap.docs.map(d => ({ id: d.id, ...d.data() } as Modalidade)));
      setRegistrations(regSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error(error);
      showAlert('Erro ao carregar cards #EUVOU.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getModalidadeNome = (registration: any) => {
    return modalidades.find(m => m.id === registration.modalidadeId)?.nome || String(registration.categoria || 'MCU Night Run').toUpperCase();
  };

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return registrations.filter(registration => {
      if (registration.paymentStatus !== 'pago' || !registration.euVouCardUrl) return false;
      if (!normalizedSearch) return true;
      return [
        registration.nome,
        registration.email,
        registration.telefone,
        registration.cpf,
        getModalidadeNome(registration),
      ].some(value => String(value || '').toLowerCase().includes(normalizedSearch));
    });
  }, [registrations, search, modalidades]);

  const openWhatsAppWithEuVouCard = async (registration: any) => {
    const cleanPhone = String(registration.telefone || '').replace(/\D/g, '');
    if (!cleanPhone) return showAlert('Telefone nao encontrado.', 'warning');
    if (!registration.euVouCardUrl) return showAlert('Card #EUVOU nao gerado.', 'warning');

    const phone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    setSendingId(registration.id);
    try {
      const copied = await copyEuVouCardImage(registration.euVouCardUrl);
      const text = buildEuVouWhatsAppText(registration, getModalidadeNome(registration));
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      const clickedAt = new Date();
      const historyEntry = {
        at: clickedAt.toISOString(),
        by: user?.email || 'admin',
        cardUrl: registration.euVouCardUrl,
        method: 'whatsapp_manual',
      };
      await updateDoc(doc(db, 'nightrun_registrations', registration.id), {
        euVouCardLastSendClickAt: clickedAt,
        euVouCardSendClickCount: increment(1),
        euVouCardSendHistory: arrayUnion(historyEntry),
        updatedAt: clickedAt,
      });
      setRegistrations(prev => prev.map(item => {
        if (item.id !== registration.id) return item;
        return {
          ...item,
          euVouCardLastSendClickAt: clickedAt,
          euVouCardSendClickCount: Number(item.euVouCardSendClickCount || 0) + 1,
          euVouCardSendHistory: [...(item.euVouCardSendHistory || []), historyEntry],
          updatedAt: clickedAt,
        };
      }));
      showAlert(
        copied
          ? 'WhatsApp aberto com a mensagem pronta. A imagem #EUVOU foi copiada, cole na conversa antes de enviar.'
          : 'WhatsApp aberto com a mensagem pronta. Clique na imagem do card para ampliar e anexar manualmente.',
        copied ? 'success' : 'warning'
      );
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="admin-card-euvou-page">
      <div className="admin-card-euvou-header">
        <div>
          <span>Envio manual</span>
          <h1>Card #EUVOU</h1>
          <p>{filtered.length} inscritos com pagamento confirmado e card gerado</p>
        </div>
        <div className="admin-card-euvou-search">
          <Search size={18} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar atleta..." />
        </div>
      </div>

      {loading ? (
        <div className="admin-card-euvou-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonCard key={index} style={{ minHeight: 360 }}>
              <div />
            </SkeletonCard>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="admin-card-euvou-empty">
          <ImageIcon size={34} />
          <strong>Nenhum card encontrado</strong>
          <span>Somente inscritos pagos com imagem #EUVOU aparecem nesta lista.</span>
        </div>
      ) : (
        <div className="admin-card-euvou-grid">
          {filtered.map(registration => {
            const modalidade = getModalidadeNome(registration);
            const sending = sendingId === registration.id;
            const sentCount = Number(registration.euVouCardSendClickCount || registration.euVouCardSendHistory?.length || 0);
            const sentAtRaw = registration.euVouCardLastSendClickAt?.toDate?.() || (registration.euVouCardLastSendClickAt ? new Date(registration.euVouCardLastSendClickAt) : null);
            const sentAt = sentAtRaw && !Number.isNaN(sentAtRaw.getTime())
              ? formatDateTimeBR(sentAtRaw)
              : '';
            return (
              <article className="admin-card-euvou-item" key={registration.id}>
                <button
                  type="button"
                  className="admin-card-euvou-image"
                  onClick={() => setZoomImageUrl(registration.euVouCardUrl)}
                  aria-label={`Ampliar card #EUVOU de ${registration.nome || 'atleta'}`}
                >
                  <img src={registration.euVouCardUrl} alt={`Card #EUVOU de ${registration.nome || 'atleta'}`} />
                </button>
                <div className="admin-card-euvou-info">
                  <strong>{registration.nome || 'Atleta sem nome'}</strong>
                  <span>{modalidade}</span>
                  <small>{registration.telefone || registration.email || 'Sem contato'}</small>
                  <div className={`admin-card-euvou-status ${sentCount > 0 ? 'sent' : 'pending'}`}>
                    {sentCount > 0 ? <CheckCircle size={14} /> : <Clock size={14} />}
                    <span>{sentCount > 0 ? `Enviado${sentCount > 1 ? ` ${sentCount}x` : ''}${sentAt ? ` - ${sentAt}` : ''}` : 'Nao enviado'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-card-euvou-send"
                  onClick={() => openWhatsAppWithEuVouCard(registration)}
                  disabled={sending}
                >
                  <Send size={16} />
                  {sending ? 'Abrindo...' : 'Enviar'}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {zoomImageUrl && createPortal(
        <div className="admin-card-euvou-zoom" onClick={() => setZoomImageUrl(null)}>
          <button type="button" aria-label="Fechar imagem" onClick={() => setZoomImageUrl(null)}>
            <X size={24} />
          </button>
          <img src={zoomImageUrl} alt="Card #EUVOU ampliado" onClick={event => event.stopPropagation()} />
        </div>,
        document.body
      )}
    </div>
  );
}
