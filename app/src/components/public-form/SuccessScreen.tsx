import { CheckCircle } from 'lucide-react';

interface SuccessScreenProps {
  pixQr: string;
  pixPayload: string;
  invoiceUrl: string;
  nome: string;
  onCopy: () => void;
}

export const SuccessScreen = ({ pixQr, pixPayload, invoiceUrl, nome, onCopy }: SuccessScreenProps) => {
  return (
    <div className="success-container">
      <div className="success-card">
        <CheckCircle size={80} color="#6BFF2A" style={{ marginBottom: 24 }} />
        <h1 className="success-title">Inscrição Recebida!</h1>
        <p className="success-msg">Olá {nome.split(' ')[0]}, sua vaga está garantida. Realize o pagamento via PIX para confirmar.</p>
        
        {pixQr ? (
          <div className="pix-box">
            <div className="qr-wrapper">
              <img src={`data:image/png;base64,${pixQr}`} alt="PIX QR Code" />
            </div>
            <button className="btn-nav btn-next" style={{ width: '100%', marginTop: 15 }} onClick={onCopy}>
              Copiar Código PIX
            </button>
            {invoiceUrl && (
              <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary-pill" style={{ display: 'block', marginTop: 15, textAlign: 'center' }}>
                Ver Comprovante / Fatura
              </a>
            )}
          </div>
        ) : (
          <p style={{ marginTop: 20 }}>Você receberá os dados de pagamento via WhatsApp.</p>
        )}
      </div>
    </div>
  );
};
