import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { CheckCircle, CalendarDays, MoonStar, ArrowRight, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../firebase';

interface SoldOutScreenProps {
  confirmedCount: number;
  eventDate: string;
  onViewList: () => void;
}

const PHOTOS_QUERY_LIMIT = 60;

export const SoldOutScreen = ({ confirmedCount, eventDate, onViewList }: SoldOutScreenProps) => {
  const navigate = useNavigate();
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

  const NUM_COLUMNS = 8;
  // Cada coluna faz um loop infinito (o miolo é renderizado 2x e a animação anda -50%,
  // que é exatamente uma "volta" de conteúdo). Se a coluna tiver poucas fotos, uma volta
  // fica mais baixa que a tela e aparece um buraco vazio no ponto em que ela reinicia -
  // por isso repetimos as fotos da coluna até garantir uma altura mínima segura.
  const MIN_CARDS_PER_LOOP = 20;
  const columns = Array.from({ length: NUM_COLUMNS }, (_, colIndex) => {
    const base = photos.filter((_, i) => i % NUM_COLUMNS === colIndex);
    if (base.length === 0) return [];
    const padded: string[] = [];
    while (padded.length < MIN_CARDS_PER_LOOP) padded.push(...base);
    return padded;
  }).filter(col => col.length > 0);

  return (
    <div className="landing-page pro-version sold-out-screen">
      <div className="swoosh-bg" />

      {photos.length > 0 && (
        <div className="sold-out-photo-bg" aria-hidden="true">
          {columns.map((col, colIndex) => (
            <div
              className={`sold-out-photo-col ${colIndex % 2 === 0 ? 'sold-out-photo-col-up' : 'sold-out-photo-col-down'}`}
              key={colIndex}
              style={{ animationDelay: `${-(colIndex * 4)}s` }}
            >
              {[...col, ...col].map((url, i) => (
                <div className="sold-out-photo-card" key={`${colIndex}-${i}`}>
                  <img src={url} alt="" loading="lazy" />
                </div>
              ))}
            </div>
          ))}
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
        </div>

        <div className="animate-fade-up delay-2 countdown-wrapper sold-out-card">
          <div className="sold-out-check">
            <CheckCircle size={40} />
          </div>
          <strong className="sold-out-count">{confirmedCount} INSCRITOS</strong>
          <strong className="sold-out-title">INSCRIÇÕES ESGOTADAS!</strong>

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
              </span>
            </div>
          </div>
        </div>

        <button type="button" className="endereco-cta animate-fade-up delay-3" onClick={() => navigate('/endereco')}>
          <div className="endereco-cta-icon"><MapPin size={22} /></div>
          <div className="endereco-cta-text">
            <strong>INFORME SEU ENDEREÇO</strong>
            <span>Necessário para participar da premiação</span>
          </div>
          <ArrowRight size={20} />
        </button>

        <div className="animate-fade-up delay-3" style={{ width: '100%', marginTop: '10px' }}>
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
