import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle, Copy, CreditCard, Clock } from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';
import LoadingModal from '../components/LoadingModal';
import { LogoCombo } from '../components/LogoCombo';
import '../App.css';

export default function PaymentPage() {
  const { registrationId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutos padrão
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [creatingCardPayment, setCreatingCardPayment] = useState(false);
  const autoCheckingRef = useRef(false);
  const { showAlert } = useDialog();
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatMoney = (amountInCents: number) => {
    const amount = Number(amountInCents || 0) / 100;
    return amount.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  useEffect(() => {
    const fetchRegistration = async () => {
      if (!registrationId) return;
      try {
        const docRef = doc(db, 'nightrun_registrations', registrationId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const regData = docSnap.data();
          setData(regData);
          if (regData.paymentStatus === 'pago') {
            navigate(`/inscricao/confirmada/${registrationId}`);
          }
        } else {
          showAlert('Inscrição não encontrada.', 'error');
          navigate('/');
        }
      } catch (err) {
        console.error(err);
        showAlert('Erro ao carregar dados de pagamento.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchRegistration();
  }, [registrationId]);

  useEffect(() => {
    if (!registrationId) return;
    const docRef = doc(db, 'nightrun_registrations', registrationId);
    return onSnapshot(docRef, snapshot => {
      if (!snapshot.exists()) return;
      const regData = snapshot.data();
      setData(regData);
      setLoading(false);
      if (regData.paymentStatus === 'pago') {
        navigate(`/inscricao/confirmada/${registrationId}`);
      }
    });
  }, [registrationId, navigate]);

  const handleCopyPix = () => {
    if (data.pixPayload || data.asaasPaymentId) {
      // In a real scenario, we might need to fetch the QR code again if not saved
      // But for now, we'll assume it's in the data or we can copy a placeholder
      navigator.clipboard.writeText(data.pixPayload || '');
      showAlert('Código PIX copiado!', 'success');
    }
  };

  const handleCreditCardPayment = async () => {
    if (!registrationId) return;
    if (data.creditCardInvoiceUrl) {
      window.open(data.creditCardInvoiceUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    setCreatingCardPayment(true);
    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      const res = await fetch(`${workerUrl}/registrations/${registrationId}/credit-card-payment`, {
        method: 'POST',
      });
      const result = await res.json();
      if (!res.ok || result.success === false) {
        throw new Error(result.error || 'Não foi possível gerar o pagamento com cartão.');
      }
      setData((prev: any) => ({
        ...prev,
        creditCardInvoiceUrl: result.invoiceUrl,
        creditCardAsaasPaymentId: result.paymentId,
      }));
      window.open(result.invoiceUrl, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      showAlert(error.message || 'Erro ao gerar pagamento com cartão.', 'error');
    } finally {
      setCreatingCardPayment(false);
    }
  };

  const checkPayment = useCallback(async (silent = false) => {
    if (!registrationId) return;
    if (autoCheckingRef.current) return;
    try {
      autoCheckingRef.current = true;
      setCheckingPayment(true);
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      const res = await fetch(`${workerUrl}/registrations/${registrationId}/check-payment`, {
        method: 'POST',
      });
      const result = await res.json();
      if (res.ok && result.paid) {
        if (!silent) showAlert('Pagamento confirmado com sucesso!', 'success');
        navigate(`/inscricao/confirmada/${registrationId}`);
      } else if (!silent) {
        showAlert(
          result.error || 'Pagamento ainda não detectado. O banco pode levar de 1 a 2 minutos para confirmar o PIX.',
          'warning'
        );
      }
    } catch (err) {
      console.error(err);
      if (!silent) showAlert('Erro ao verificar pagamento. Tente novamente.', 'error');
    } finally {
      setCheckingPayment(false);
      autoCheckingRef.current = false;
    }
  }, [registrationId, navigate, showAlert]);

  useEffect(() => {
    if (!registrationId || data?.paymentStatus === 'pago') return;
    const firstCheck = window.setTimeout(() => checkPayment(true), 4000);
    const timer = window.setInterval(() => checkPayment(true), 12000);
    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(timer);
    };
  }, [registrationId, data?.paymentStatus, checkPayment]);

  if (loading) return <LoadingModal isOpen={true} />;
  if (!data) return null;

  return (
    <div className="public-app-root pro-payment-version">
      <LoadingModal isOpen={loading} />

      <main className="public-main-content animate-fade-up">
        {/* Header Pro */}
        <header className="payment-header-pro">
          <img
            src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png"
            alt="MCU Night Run"
            style={{ width: '180px' }}
          />
          <div className="seals-container">
            <img src="/logo-mcu.png" alt="MCU" className="seal-img" />
            <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
            <img src="/logo-ademare.png" alt="Ademare" className="seal-img" />
          </div>
        </header>

        {/* Payment Card Pro */}
        <div className="payment-card-pro">
          <h1 className="payment-title-pro">
            <CheckCircle size={32} />
            INSCRIÇÃO RECEBIDA!
          </h1>

          <p className="payment-msg">
            Olá <b>{data.nome.split(' ')[0]}</b>, sua vaga ainda não está garantida.<br />
            Falta pouco para confirmarmos.
          </p>

          <div className="payment-divider" />

          <div className="payment-amount-pro">
            <span>Valor da inscrição</span>
            <strong>{formatMoney(data.amount)}</strong>
            {Number(data.paymentFee || 0) > 0 && (
              <small>Taxa PIX: {formatMoney(data.paymentFee)}</small>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', margin: '14px 0 16px' }}>
            <button type="button" onClick={() => setPaymentMethod('pix')} style={{ border: paymentMethod === 'pix' ? '2px solid #6BFF2A' : '1px solid rgba(255,255,255,0.14)', background: paymentMethod === 'pix' ? 'rgba(107,255,42,0.12)' : 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 14, padding: '12px 10px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
              <Copy size={16} /> Pix
            </button>
            <button type="button" onClick={() => setPaymentMethod('card')} style={{ border: paymentMethod === 'card' ? '2px solid #6BFF2A' : '1px solid rgba(255,255,255,0.14)', background: paymentMethod === 'card' ? 'rgba(107,255,42,0.12)' : 'rgba(255,255,255,0.06)', color: '#fff', borderRadius: 14, padding: '12px 10px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
              <CreditCard size={16} /> Cartão
            </button>
          </div>

          {/* QR Code Section */}
          {paymentMethod === 'pix' ? (
            <div className="qr-container-pro">
              {data.pixQr ? (
                <img
                  src={data.pixQr.startsWith('http') ? data.pixQr : `data:image/png;base64,${data.pixQr}`}
                  alt="PIX QR Code"
                  className="qr-img-pro"
                />
              ) : (
                <div className="qr-img-pro" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: '20px' }}>
                  <p style={{ color: '#000', fontSize: '0.7rem', fontWeight: 700 }}>GERANDO QR CODE...</p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ width: '100%', border: '1px solid rgba(107,255,42,0.35)', borderRadius: 22, padding: 22, background: 'rgba(255,255,255,0.05)', textAlign: 'center', marginBottom: 18 }}>
              <CreditCard size={42} color="#6BFF2A" />
              <h3 style={{ color: '#fff', margin: '12px 0 6px', fontSize: '1.05rem', fontWeight: 900 }}>Cartão de crédito</h3>
            </div>
          )}

          {/* Action Buttons */}
          {paymentMethod === 'pix' ? (
            <button className="btn-copy-pix-pro animate-float" onClick={handleCopyPix}>
              <Copy size={20} />
              COPIAR CÓDIGO PIX
            </button>
          ) : (
            <button className="btn-copy-pix-pro animate-float" onClick={handleCreditCardPayment} disabled={creatingCardPayment}>
              <CreditCard size={20} />
              {creatingCardPayment ? 'GERANDO LINK...' : 'PAGAR COM CARTÃO'}
            </button>
          )}

          <button 
            className="btn-check-payment-pro" 
            onClick={() => checkPayment(false)} 
            disabled={checkingPayment}
            style={{
              background: '#6BFF2A',
              color: '#071A45',
              border: 'none',
              borderRadius: '40px',
              width: '100%',
              height: '50px',
              fontSize: '0.9rem',
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginTop: '12px',
              boxShadow: '0 4px 15px rgba(107, 255, 42, 0.3)',
              transition: 'transform 0.2s, opacity 0.2s'
            }}
          >
            {checkingPayment ? 'Verificando...' : 'JÁ PAGUEI! VERIFICAR'}
          </button>


          {/* Footer Pro - Countdown */}
          <div className="payment-footer-pro">
            <Clock size={18} />
            Este código expira em: <strong>{formatTime(timeLeft)}</strong>
          </div>
        </div>

      </main>
    </div>
  );
}
