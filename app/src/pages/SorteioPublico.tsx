import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { CalendarClock, Gift, Ticket, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';
import { db } from '../firebase';
import LoadingModal from '../components/LoadingModal';
import { LogoCombo } from '../components/LogoCombo';
import { formatDateTimeBR } from '../utils/dateUtils';
import { readGanhadores } from '../utils/sorteioUtils';
import '../App.css';
import '../styles/sorteio-publico.css';

export default function SorteioPublico() {
  const { sorteioId } = useParams();
  const [sorteio, setSorteio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Ouve o sorteio em tempo real: quando o admin muda o status, a página pública reage sozinha.
  useEffect(() => {
    if (!sorteioId) return;
    return onSnapshot(doc(db, 'nightrun_sorteios', sorteioId), snapshot => {
      if (!snapshot.exists()) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setSorteio({ id: snapshot.id, ...snapshot.data() });
      setLoading(false);
    }, error => {
      console.error(error);
      setLoading(false);
    });
  }, [sorteioId]);

  const status = sorteio?.status || 'agendado';
  const ganhadores = sorteio ? readGanhadores(sorteio) : [];
  const revelado = status === 'finalizado' && ganhadores.length > 0;

  useEffect(() => {
    if (!revelado) return;
    confetti({ particleCount: 140, spread: 75, origin: { y: 0.6 }, zIndex: 50 });
  }, [revelado]);

  if (loading) return <LoadingModal isOpen={true} />;

  if (notFound || !sorteio) {
    return (
      <div className="sorteio-page">
        <div className="sorteio-shell">
          <LogoCombo style={{ height: 38 }} variant="light" />
          <div className="sorteio-empty">
            <Gift size={38} />
            <strong>Sorteio não encontrado</strong>
            <span>O link pode estar incorreto ou o sorteio foi removido.</span>
          </div>
        </div>
      </div>
    );
  }

  const dataPrevista = sorteio.dataPrevista ? formatDateTimeBR(new Date(sorteio.dataPrevista)) : '';

  return (
    <div className={`sorteio-page ${status === 'acontecendo' ? 'is-live' : ''}`}>
      <div className="sorteio-bg-glow" />
      <div className="sorteio-shell">
        <header className="sorteio-header">
          <LogoCombo style={{ height: 38 }} variant="light" />
        </header>

        <span className={`sorteio-status-pill ${status}`}>
          {status === 'acontecendo' ? (
            <><span className="sorteio-live-dot" /> Acontecendo agora</>
          ) : status === 'finalizado' ? 'Resultado oficial' : 'Em breve'}
        </span>

        <h1 className="sorteio-title">{sorteio.titulo || 'Sorteio MCU Night Run'}</h1>
        {sorteio.descricao && <p className="sorteio-desc">{sorteio.descricao}</p>}

        {/* Prêmio em formato de ticket / vale */}
        <div className="sorteio-ticket">
          <div className="sorteio-ticket-top">
            {sorteio.premioImagem ? (
              <img src={sorteio.premioImagem} alt={sorteio.premioNome || 'Prêmio'} />
            ) : (
              <div className="sorteio-ticket-placeholder"><Gift size={44} /></div>
            )}
          </div>

          <span className="sorteio-ticket-perf" />

          <div className="sorteio-ticket-bottom">
            <div className="sorteio-ticket-info">
              <span className="sorteio-ticket-label"><Ticket size={12} /> O prêmio</span>
              <strong>{sorteio.premioNome || 'Prêmio surpresa'}</strong>
            </div>
            <div className="sorteio-ticket-barcode" aria-hidden="true">
              {Array.from({ length: 34 }).map((_, index) => <i key={index} />)}
            </div>
          </div>
        </div>

        {/* Estado: acontecendo -> suspense */}
        {status === 'acontecendo' && (
          <div className="sorteio-suspense">
            <div className="sorteio-stage">
              <span className="sorteio-wave" />
              <span className="sorteio-wave" />
              <span className="sorteio-wave" />
              <span className="sorteio-ring-dashed" />
              <span className="sorteio-ring-arc" />
              <span className="sorteio-ring-arc inner" />
              <span className="sorteio-orbit"><i /></span>
              <span className="sorteio-orbit reverse"><i /></span>
              <span className="sorteio-core"><Trophy size={34} /></span>
            </div>
            <h2>Sorteando agora...</h2>
            <p>O nome do ganhador aparece aqui a qualquer instante. Não saia desta página!</p>
            <div className="sorteio-suspense-names">
              <div className="sorteio-suspense-track">
                {['?????', '????????', '??????', '?????????', '???????', '????????'].map((item, index) => (
                  <span key={index}>{item}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Estado: agendado */}
        {status === 'agendado' && (
          <div className="sorteio-scheduled">
            <CalendarClock size={30} />
            <h2>O sorteio ainda não começou</h2>
            <p>{dataPrevista ? `Previsto para ${dataPrevista}.` : 'Em breve divulgaremos o horário.'} Deixe esta página aberta — ela atualiza sozinha.</p>
          </div>
        )}

        {/* Estado: finalizado */}
        {status === 'finalizado' && (
          revelado ? (
            <div className="sorteio-winner">
              <span className="sorteio-winner-label"><Trophy size={16} /> {ganhadores.length > 1 ? `${ganhadores.length} Ganhadores` : 'Ganhador'}</span>

              {ganhadores.length === 1 ? (
                <>
                  <div className="sorteio-winner-photo">
                    {ganhadores[0].fotoUrl
                      ? <img src={ganhadores[0].fotoUrl} alt={ganhadores[0].nome} />
                      : <span>{String(ganhadores[0].nome || 'AT').slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <h2>{ganhadores[0].nome}</h2>
                  <p>Ganhou <strong>{sorteio.premioNome}</strong></p>
                </>
              ) : (
                <>
                  <div className="sorteio-op-winners" style={{ marginTop: 18 }}>
                    {ganhadores.map((g, index) => (
                      <div key={g.registrationId} className="sorteio-op-winner">
                        <div className="sorteio-op-winner-photo">
                          {g.fotoUrl ? <img src={g.fotoUrl} alt={g.nome} /> : <span>{index + 1}</span>}
                        </div>
                        <div><strong>{g.nome}</strong></div>
                      </div>
                    ))}
                  </div>
                  <p style={{ marginTop: 14 }}>Ganharam <strong>{sorteio.premioNome}</strong></p>
                </>
              )}

              {sorteio.sorteadoEm && (
                <small>
                  Sorteado em {formatDateTimeBR(sorteio.sorteadoEm.toDate?.() || sorteio.sorteadoEm)}
                  {sorteio.totalElegiveis ? ` · entre ${sorteio.totalElegiveis} inscritos` : ''}
                </small>
              )}
            </div>
          ) : (
            <div className="sorteio-scheduled">
              <Trophy size={30} />
              <h2>Sorteio encerrado</h2>
              <p>O ganhador será divulgado em instantes.</p>
            </div>
          )
        )}

        <footer className="sorteio-footer">MCU Night Run 2026</footer>
      </div>
    </div>
  );
}
