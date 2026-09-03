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
import SendCardChoiceModal from '../components/SendCardChoiceModal';
import { groupLinkedRegistrations } from '../utils/linkedRegistrationsUtils';
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
  const [sendChoiceFor, setSendChoiceFor] = useState<any | null>(null);
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

  // Cada inscrição vira seu próprio card na lista - pra cada uma, calculamos quem mais está
  // vinculado a ela (mesma lógica do dashboard do atleta: mesmo e-mail, ou telefone que é
  // contato de emergência de um lado ou do outro) só pra mostrar a citação de apoio no card.
  const linkedByRegId = useMemo(() => {
    const map = new Map<string, any[]>();
    groupLinkedRegistrations(filtered).forEach(({ main, linked }) => {
      const group = [main, ...linked];
      group.forEach(member => map.set(member.id, group.filter(other => other.id !== member.id)));
    });
    return map;
  }, [filtered]);

  const logCardSend = async (registration: any, method: 'whatsapp_manual' | 'whatsapp_auto') => {
    const clickedAt = new Date();
    const historyEntry = {
      at: clickedAt.toISOString(),
      by: user?.email || 'admin',
      cardUrl: registration.euVouCardUrl,
      method,
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
  };

  const sendManual = async (registration: any) => {
    setSendingId(registration.id);
    try {
      const cleanPhone = String(registration.telefone || '').replace(/\D/g, '');
      const phone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const copied = await copyEuVouCardImage(registration.euVouCardUrl);
      const text = buildEuVouWhatsAppText(registration, getModalidadeNome(registration));
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      await logCardSend(registration, 'whatsapp_manual');
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

  const openSendChoice = (registration: any) => {
    const cleanPhone = String(registration.telefone || '').replace(/\D/g, '');
    if (!cleanPhone) return showAlert('Telefone nao encontrado.', 'warning');
    if (!registration.euVouCardUrl) return showAlert('Card #EUVOU nao gerado.', 'warning');
    setSendChoiceFor(registration);
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
          {filtered.map(main => {
            const linked = linkedByRegId.get(main.id) || [];
            const modalidade = getModalidadeNome(main);
            const sending = sendingId === main.id;
            const sentCount = Number(main.euVouCardSendClickCount || main.euVouCardSendHistory?.length || 0);
            const sentAtRaw = main.euVouCardLastSendClickAt?.toDate?.() || (main.euVouCardLastSendClickAt ? new Date(main.euVouCardLastSendClickAt) : null);
            const sentAt = sentAtRaw && !Number.isNaN(sentAtRaw.getTime())
              ? formatDateTimeBR(sentAtRaw)
              : '';
            return (
              <article className="admin-card-euvou-item" key={main.id}>
                <button
                  type="button"
                  className="admin-card-euvou-image"
                  onClick={() => setZoomImageUrl(main.euVouCardUrl)}
                  aria-label={`Ampliar card #EUVOU de ${main.nome || 'atleta'}`}
                >
                  <img src={main.euVouCardUrl} alt={`Card #EUVOU de ${main.nome || 'atleta'}`} />
                </button>
                <div className="admin-card-euvou-info">
                  <strong>{main.nome || 'Atleta sem nome'}</strong>
                  <span>{modalidade}</span>
                  <small>{main.telefone || main.email || 'Sem contato'}</small>
                  <div className={`admin-card-euvou-status ${sentCount > 0 ? 'sent' : 'pending'}`}>
                    {sentCount > 0 ? <CheckCircle size={14} /> : <Clock size={14} />}
                    <span>{sentCount > 0 ? `Enviado${sentCount > 1 ? ` ${sentCount}x` : ''}${sentAt ? ` - ${sentAt}` : ''}` : 'Nao enviado'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-card-euvou-send"
                  onClick={() => openSendChoice(main)}
                  disabled={sending}
                >
                  <Send size={16} />
                  {sending ? 'Abrindo...' : 'Enviar'}
                </button>

                {linked.length > 0 && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: '.66rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: .4 }}>
                      Vinculados ({linked.length})
                    </span>
                    {linked.map(item => {
                      const itemSending = sendingId === item.id;
                      const itemSentCount = Number(item.euVouCardSendClickCount || item.euVouCardSendHistory?.length || 0);
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '6px 8px' }}>
                          <img
                            src={item.euVouCardUrl}
                            alt={`Card #EUVOU de ${item.nome || 'atleta'}`}
                            onClick={() => setZoomImageUrl(item.euVouCardUrl)}
                            style={{ width: 32, height: 40, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in', flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ display: 'block', fontSize: '.74rem', color: '#071A45', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome || 'Atleta sem nome'}</strong>
                            <span style={{ display: 'block', fontSize: '.64rem', color: itemSentCount > 0 ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                              {itemSentCount > 0 ? `Enviado ${itemSentCount}x` : 'Nao enviado'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => openSendChoice(item)}
                            disabled={itemSending}
                            title="Enviar card"
                            style={{ border: 'none', background: '#071A45', color: '#fff', width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: itemSending ? 'wait' : 'pointer', flexShrink: 0 }}
                          >
                            <Send size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {sendChoiceFor && (
        <SendCardChoiceModal
          phone={sendChoiceFor.telefone}
          cardUrl={sendChoiceFor.euVouCardUrl}
          text={buildEuVouWhatsAppText(sendChoiceFor, getModalidadeNome(sendChoiceFor))}
          onClose={() => setSendChoiceFor(null)}
          onManualSend={() => sendManual(sendChoiceFor)}
          onAutoSent={() => logCardSend(sendChoiceFor, 'whatsapp_auto')}
        />
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
