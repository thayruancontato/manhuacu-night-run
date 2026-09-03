import { useEffect, useMemo, useState } from 'react';
import {
  Medal,
  Droplets,
  ShieldCheck,
  ClipboardList,
  ArrowRight,
  CalendarDays,
  Flame,
  MoonStar,
  Zap
} from 'lucide-react';

interface LandingPageProps {
  displayVagas: number;
  vagas: number | null;
  eventDate: string;
  showUrgencyBanner: boolean;
  onStart: () => void;
  onRegulation: () => void;
  onCheckStatus: () => void;
}

const EMPTY_COUNTDOWN = { days: 0, hours: 0, minutes: 0, seconds: 0 };
const SEGMENTS: Record<string, string[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'd', 'e', 'g'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '4': ['b', 'c', 'f', 'g'],
  '5': ['a', 'c', 'd', 'f', 'g'],
  '6': ['a', 'c', 'd', 'e', 'f', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
};

const SevenSegmentDigit = ({ digit }: { digit: string }) => (
  <span className="seven-digit">
    {['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(segment => (
      <i key={segment} className={`segment segment-${segment} ${SEGMENTS[digit].includes(segment) ? 'on' : ''}`} />
    ))}
  </span>
);

const SevenSegmentNumber = ({ value }: { value: number }) => (
  <span className="seven-number">
    {String(value).padStart(2, '0').split('').map((digit, index) => (
      <SevenSegmentDigit key={`${digit}-${index}`} digit={digit} />
    ))}
  </span>
);

const getCountdown = (eventDate: string) => {
  if (!eventDate) return null;
  const target = new Date(eventDate).getTime();
  if (Number.isNaN(target)) return null;

  const diff = target - Date.now();
  if (diff <= 0) return EMPTY_COUNTDOWN;

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
};

export const LandingPage = ({ displayVagas, vagas, eventDate, showUrgencyBanner = false, onStart, onRegulation, onCheckStatus }: LandingPageProps) => {
  const [countdown, setCountdown] = useState(() => getCountdown(eventDate));
  const formattedEventDate = useMemo(() => {
    if (!eventDate) return '';
    const date = new Date(eventDate);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, [eventDate]);

  useEffect(() => {
    setCountdown(getCountdown(eventDate));
    if (!eventDate) return;

    const interval = window.setInterval(() => {
      setCountdown(getCountdown(eventDate));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [eventDate]);

  return (
    <div className="landing-page pro-version">
      <div className="swoosh-bg" />

      <div className="landing-content landing-content-home">

        {/* Top Branding */}
        <div className="landing-brand-lockup animate-fade-up">
          <img src="/logo-mcu.png" alt="Prefeitura de Manhuacu" className="landing-side-logo" />
          <img
            src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png"
            alt="MCU Night Run"
            className="landing-main-logo"
          />
          <img src="/logo-ademare.png" alt="Ademare" className="landing-side-logo" />
        </div>

        {/* Hero Text */}
        <div className="animate-fade-up delay-1" style={{ textAlign: 'center', marginBottom: '15px' }}>
          <h2 style={{
            fontSize: '0.9rem',
            fontWeight: 800,
            letterSpacing: '1px',
            margin: 0,
            textTransform: 'uppercase',
            color: '#fff'
          }}>
            A MAIOR CORRIDA NOTURNA <br />
            <span className="yellow-highlight">DA REGIÃO!</span>
          </h2>
          <div className="divider-yellow" style={{ margin: '10px auto' }} />
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 500, margin: 0 }}>
            Inscreva-se e garanta seu kit.
          </p>
        </div>

        {countdown && (
          <div className="animate-fade-up delay-2 countdown-wrapper">
            <div className="countdown-header">
              <span>FALTAM PARA A CORRIDA</span>
            </div>
            <div className="countdown-grid">
              {[
                { value: countdown.days, label: 'DIAS' },
                { value: countdown.minutes, label: 'MINUTOS' },
                { value: countdown.seconds, label: 'SEGUNDOS' },
              ].map(item => (
                <div key={item.label} className="countdown-card">
                  <strong><SevenSegmentNumber value={item.value} /></strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            {showUrgencyBanner && (
              <div className="countdown-urgency">
                <Flame size={24} />
                <span>
                  <strong>Últimos dias de inscrição!</strong>
                  <small>Não fique de fora.</small>
                </span>
              </div>
            )}
            <div className="countdown-footer">
              <div>
                <CalendarDays size={22} />
                <span>
                  <small>DIA DA CORRIDA</small>
                  <strong>{formattedEventDate || '--/--/----'}</strong>
                </span>
              </div>
              <div>
                <MoonStar size={23} />
                <span>
                  <small>A NOITE</small>
                  <strong>Mais energia, mais emocao!</strong>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Contador de vagas restantes ocultado a pedido: manter apenas o tempo restante (countdown). */}

        {/* Action Buttons */}
        <div className="animate-fade-up delay-3" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn-start with-glow"
            onClick={onStart}
            disabled={vagas !== null && vagas <= 0}
            style={{ borderRadius: '40px', width: '100%', height: '55px', fontSize: '1rem' }}
          >
            {vagas !== null && vagas <= 0 ? 'VAGAS ESGOTADAS' : (
              <>
                INSCREVA-SE AGORA
                <ArrowRight size={20} />
              </>
            )}
          </button>

          <button
            onClick={onRegulation}
            className="btn-regulation"
            type="button"
          >
            <ClipboardList size={18} />
            Ver regulamento
          </button>

          <button 
            onClick={onCheckStatus} 
            style={{ 
              background: 'rgba(255, 255, 255, 0.06)', 
              border: '1px solid rgba(255, 255, 255, 0.15)', 
              borderRadius: '40px', 
              color: '#fff', 
              width: '100%', 
              height: '50px', 
              fontSize: '0.85rem', 
              fontWeight: 700, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              gap: '8px', 
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              transition: 'background 0.2s, border-color 0.2s'
            }}
          >
            Acompanhar minha inscrição
          </button>
        </div>

        {/* Feature Grid */}
        <div className="animate-fade-up delay-4 feature-grid" style={{ margin: '15px 0 10px', padding: '15px 0 10px' }}>
          <div className="feature-item">
            <Medal className="feature-icon" size={20} />
            <span className="feature-label">KIT ATLETA</span>
            <span className="feature-desc">Completo</span>
          </div>
          <div className="feature-item">
            <Droplets className="feature-icon" size={20} />
            <span className="feature-label">HIDRATAÇÃO</span>
            <span className="feature-desc">Garantida</span>
          </div>
          <div className="feature-item">
            <ShieldCheck className="feature-icon" size={20} />
            <span className="feature-label">SEGURANÇA</span>
            <span className="feature-desc">e Estrutura</span>
          </div>
        </div>

      </div>
    </div>
  );
};
