import { ArrowLeft, Download, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { REGULAMENTO_OFICIAL, REGULAMENTO_PDF_URL } from '../content/regulamentoOficial';
import '../App.css';

export default function Regulamento() {
  const navigate = useNavigate();

  return (
    <div className="public-app-root regulation-page">
      <div className="regulation-shell">
        <header className="regulation-header">
          <button type="button" className="regulation-back" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
            Voltar
          </button>
          <div className="regulation-brand">
            <img src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png" alt="MCU Night Run" />
          </div>
          <a className="regulation-download" href={REGULAMENTO_PDF_URL} target="_blank" rel="noreferrer">
            <Download size={18} />
            PDF
          </a>
        </header>

        <main className="regulation-card">
          <div className="regulation-title">
            <span>
              <FileText size={20} />
              Regulamento oficial
            </span>
            <h1>MCU Night Run 2026</h1>
            <p>Manhuaçu/MG • 12/09/2026</p>
            <div className="regulation-mobile-actions">
              <a href={REGULAMENTO_PDF_URL} target="_blank" rel="noreferrer">
                <Download size={18} />
                Abrir PDF oficial
              </a>
            </div>
          </div>

          <pre className="regulation-text">{REGULAMENTO_OFICIAL}</pre>
        </main>
      </div>
    </div>
  );
}
