import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, Smartphone, Wifi, WifiOff, X } from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';

type Props = {
  phone: string;
  cardUrl: string;
  text: string;
  onClose: () => void;
  onManualSend: () => Promise<void> | void;
  onAutoSent?: () => Promise<void> | void;
};

/** Modal de escolha entre envio automático (via instância WhatsApp conectada, se houver) e envio
 * manual (wa.me + imagem copiada para colar). Usado tanto na ficha do atleta quanto no #EUVOU. */
export default function SendCardChoiceModal({ phone, cardUrl, text, onClose, onManualSend, onAutoSent }: Props) {
  const { showAlert } = useDialog();
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [connected, setConnected] = useState(false);
  const [sendingAuto, setSendingAuto] = useState(false);
  const [sendingManual, setSendingManual] = useState(false);

  useEffect(() => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    (async () => {
      try {
        const res = await fetch(`${workerUrl}/whatsapp/status`);
        const data = await res.json();
        setConnected(data?.instance?.state === 'open');
      } catch (error) {
        console.error('[SendCardChoiceModal] Falha ao checar status do WhatsApp', error);
        setConnected(false);
      } finally {
        setCheckingStatus(false);
      }
    })();
  }, []);

  const handleAuto = async () => {
    const cleanPhone = String(phone || '').replace(/\D/g, '');
    if (!cleanPhone) return showAlert('Telefone não encontrado.', 'warning');
    const normalizedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    setSendingAuto(true);
    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      const res = await fetch(`${workerUrl}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalizedPhone, text, imageUrl: cardUrl }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || 'Falha no envio automático.');
      await onAutoSent?.();
      showAlert('Card enviado automaticamente pelo WhatsApp!', 'success');
      onClose();
    } catch (error: any) {
      showAlert(error.message || 'Erro ao enviar automaticamente.', 'error');
    } finally {
      setSendingAuto(false);
    }
  };

  const handleManual = async () => {
    setSendingManual(true);
    try {
      await onManualSend();
      onClose();
    } finally {
      setSendingManual(false);
    }
  };

  const sending = sendingAuto || sendingManual;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 2000 }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: 460, borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,.28)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={20} />
            </div>
            <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.05rem', fontWeight: 950 }}>Como enviar o card?</h2>
          </div>
          <button onClick={onClose} disabled={sending} style={{ border: 'none', background: '#f1f5f9', width: 36, height: 36, borderRadius: 10, color: '#64748b', cursor: sending ? 'default' : 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={handleAuto}
            disabled={sending || checkingStatus || !connected}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '16px 18px',
              borderRadius: 16, border: `2px solid ${connected ? '#bbf7d0' : '#e2e8f0'}`,
              background: connected ? '#f0fdf4' : '#f8fafc',
              cursor: sending || checkingStatus || !connected ? 'not-allowed' : 'pointer',
              opacity: !connected && !checkingStatus ? 0.6 : 1,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: connected ? '#dcfce7' : '#e2e8f0', color: connected ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {connected ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', color: '#071A45', fontSize: '.92rem', fontWeight: 900 }}>
                {sendingAuto ? 'Enviando...' : 'Enviar automaticamente'}
              </strong>
              <span style={{ display: 'block', color: '#64748b', fontSize: '.78rem', fontWeight: 600, marginTop: 2 }}>
                {checkingStatus
                  ? 'Verificando conexão...'
                  : connected
                    ? 'Via WhatsApp conectado — não abre nada, envia direto.'
                    : 'Nenhuma instância de WhatsApp conectada no momento.'}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleManual}
            disabled={sending}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '16px 18px',
              borderRadius: 16, border: '2px solid #e2e8f0', background: '#fff',
              cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Smartphone size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', color: '#071A45', fontSize: '.92rem', fontWeight: 900 }}>
                {sendingManual ? 'Abrindo...' : 'Enviar manualmente'}
              </strong>
              <span style={{ display: 'block', color: '#64748b', fontSize: '.78rem', fontWeight: 600, marginTop: 2 }}>
                Abre o WhatsApp Web/app com a mensagem pronta e copia a imagem pra você colar.
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
