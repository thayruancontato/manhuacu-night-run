import { useState } from 'react';
import { createPortal } from 'react-dom';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Loader2, MessageCircleQuestion, Phone, X } from 'lucide-react';
import { db } from '../../firebase';

interface NaoEncontreiModalProps {
  onClose: () => void;
}

type Step = 'input' | 'sending' | 'success';

const maskPhone = (value: string) => value
  .replace(/\D/g, '')
  .slice(0, 11)
  .replace(/(\d{2})(\d)/, '($1) $2')
  .replace(/(\d{5})(\d)/, '$1-$2');

const buildWhatsAppText = () =>
  'Olá! Recebemos sua solicitação de verificação de inscrição na MCU Night Run 2026.\n\n' +
  'Para localizarmos seu cadastro, responda esta mensagem com:\n\n' +
  '1) Nome completo\n' +
  '2) CPF\n' +
  '3) Comprovante de pagamento (foto ou PDF)\n\n' +
  'Assim que recebermos, vamos confirmar sua inscrição o quanto antes!';

export default function NaoEncontreiModal({ onClose }: NaoEncontreiModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [telefone, setTelefone] = useState('');
  const [error, setError] = useState('');

  const digits = telefone.replace(/\D/g, '');
  const isValid = digits.length === 10 || digits.length === 11;

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Digite um telefone válido com DDD.');
      return;
    }
    setError('');
    setStep('sending');

    let whatsappEnviado = false;
    let whatsappErro: string | null = null;

    // Tenta o WhatsApp primeiro pra já gravar o resultado junto com o pedido num único
    // create - o público não tem permissão de update nessa coleção (só o admin), então
    // não dá pra criar o doc e completá-lo depois.
    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      const cleanPhone = digits.startsWith('55') ? digits : `55${digits}`;
      const res = await fetch(`${workerUrl}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          text: buildWhatsAppText(),
          imageUrl: `${window.location.origin}/whatsapp-header-verificacao.png`,
        }),
      });
      const data = await res.json().catch(() => null);
      whatsappEnviado = Boolean(data?.success);
      if (!whatsappEnviado) whatsappErro = data?.response?.message || data?.status || 'Falha ao enviar WhatsApp.';
    } catch (e) {
      console.error('Erro ao enviar WhatsApp de verificação:', e);
      whatsappErro = e instanceof Error ? e.message : 'Falha ao enviar WhatsApp.';
    }

    // Mesmo se o WhatsApp falhar, o pedido é salvo do mesmo jeito e fica visível pro admin
    // resolver manualmente - por isso isso nunca bloqueia nem muda a tela de sucesso.
    try {
      await addDoc(collection(db, 'nightrun_verification_requests'), {
        telefone,
        telefoneDigits: digits,
        status: 'pendente',
        origem: 'atletas_confirmados',
        whatsappEnviado,
        whatsappErro,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Erro ao salvar solicitação de verificação:', e);
    }

    setStep('success');
  };

  return createPortal(
    <div className="nao-encontrei-overlay" onClick={onClose}>
      <div className="nao-encontrei-modal" onClick={event => event.stopPropagation()}>
        <button type="button" className="nao-encontrei-close" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>

        {step === 'input' && (
          <>
            <div className="nao-encontrei-icon"><MessageCircleQuestion size={28} /></div>
            <h3>Não encontrei minha inscrição</h3>
            <p>Digite o telefone usado na inscrição. Vamos te chamar no WhatsApp pra confirmar seus dados.</p>
            <div className="nao-encontrei-input-wrap">
              <Phone size={18} />
              <input
                value={telefone}
                onChange={e => setTelefone(maskPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="numeric"
                autoFocus
              />
            </div>
            {error && <span className="nao-encontrei-error">{error}</span>}
            <button type="button" className="btn-start with-glow" onClick={handleSubmit} style={{ width: '100%', height: 50, marginTop: 14 }}>
              Confirmar
            </button>
          </>
        )}

        {step === 'sending' && (
          <div className="nao-encontrei-loading">
            <Loader2 size={32} className="nao-encontrei-spinner" />
            <span>Enviando solicitação...</span>
          </div>
        )}

        {step === 'success' && (
          <>
            <div className="nao-encontrei-icon success"><MessageCircleQuestion size={28} /></div>
            <h3>Solicitação enviada!</h3>
            <p>Recebemos seu pedido. Você vai receber uma mensagem no WhatsApp pedindo nome completo, CPF e o comprovante de pagamento pra localizarmos sua inscrição.</p>
            <button type="button" className="btn-start with-glow" onClick={onClose} style={{ width: '100%', height: 50, marginTop: 14 }}>
              Entendi
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
