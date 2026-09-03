import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { CheckCircle, CalendarDays, MoonStar, ArrowRight } from 'lucide-react';
import { db } from '../../firebase';

interface SoldOutScreenProps {
  confirmedCount: number;
  eventDate: string;
  onViewList: () => void;
}

const PHOTOS_QUERY_LIMIT = 60;

export const SoldOutScreen = ({ confirmedCount, eventDate, onViewList }: SoldOutScreenProps) => {
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const q = query(
          collection(db, 'nightrun_registrations'),
          where('paymentStatus', '==', 'pago'),
          limit(PHOTOS_QUERY_LIMIT)
        );
        const snap = await getDocs(q);
        const urls = snap.docs
          .map(d => d.data().fotoUrl)
          .filter((url): url is string => Boolean(url));
        setPhotos(urls);
      } catch (e) {
        console.error('Erro ao buscar fotos dos atletas confirmados:', e);
      }
    })();
  }, []);

  const formattedEventDate = (() => {
    if (!eventDate) return '';
    const date = new Date(eventDate);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  })();

  const columnA = photos.filter((_, i) => i % 2 === 0);
  const columnB = photos.filter((_, i) => i % 2 === 1);

  return (
    <div className="landing-page pro-version sold-out-screen">
      <div className="swoosh-bg" />

      {photos.length > 0 && (
        <div className="sold-out-photo-bg" aria-hidden="true">
          <div className="sold-out-photo-col sold-out-photo-col-up">
            {[...columnA, ...columnA].map((url, i) => (
              <div className="sold-out-photo-card" key={`a-${i}`}>
                <img src={url} alt="" loading="lazy" />
              </div>
            ))}
          </div>
          <div className="sold-out-photo-col sold-out-photo-col-down">
            {[...columnB, ...columnB].map((url, i) => (
              <div className="sold-out-photo-card" key={`b-${i}`}>
                <img src={url} alt="" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="landing-content landing-content-home">
        <div className="landing-brand-lockup animate-fade-up">
          <img src="/logo-mcu.png" alt="Prefeitura de Manhuacu" className="landing-side-logo" />
          <img
            src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png"
            alt="MCU Night Run"
            className="landing-main-logo"
          />
          <img src="/logo-ademare.png" alt="Ademare" className="landing-side-logo" />
        </div>

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

        <div className="animate-fade-up delay-2 countdown-wrapper sold-out-card">
          <div className="sold-out-check">
            <CheckCircle size={40} />
          </div>
          <strong className="sold-out-count">{confirmedCount} INSCRITOS</strong>
          <strong className="sold-out-title">INSCRIÇÕES ESGOTADAS!</strong>
          <p className="sold-out-subtitle">Todas as vagas foram preenchidas.</p>

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

        <div className="animate-fade-up delay-3" style={{ width: '100%', marginTop: '16px' }}>
          <button
            className="btn-start with-glow"
            onClick={onViewList}
            style={{ borderRadius: '40px', width: '100%', height: '55px', fontSize: '1rem' }}
          >
            VER LISTA DE ATLETAS INSCRITOS
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};
