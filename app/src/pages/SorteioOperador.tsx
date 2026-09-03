import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { ExternalLink, Gift, Lock, Radio, ShieldCheck, Shuffle, Trophy, Users } from 'lucide-react';
import { db } from '../firebase';
import LoadingModal from '../components/LoadingModal';
import { LogoCombo } from '../components/LogoCombo';
import { countElegiveis, runSorteio } from '../utils/sorteioDraw';
import { buildSorteioPublicUrl, readGanhadores } from '../utils/sorteioUtils';
import '../App.css';
import '../styles/sorteio-publico.css';

export default function SorteioOperador() {
  const { sorteioId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [sorteio, setSorteio] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [elegiveis, setElegiveis] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [erro, setErro] = useState('');

  // Valida o token uma vez; depois acompanha o sorteio em tempo real.
  useEffect(() => {
    const check = async () => {
      if (!sorteioId) return;
      try {
        const snap = await getDoc(doc(db, 'nightrun_sorteios', sorteioId));
        if (!snap.exists()) {
          setErro('Sorteio não encontrado.');
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...snap.data() } as any;
        if (!data.operatorToken || data.operatorToken !== token) {
          setErro('Link inválido ou expirado. Peça um novo link ao administrador.');
          setLoading(false);
          return;
        }
        setAuthorized(true);
        setSorteio(data);
        setLoading(false);
      } catch (error) {
        console.error(error);
        setErro('Não foi possível carregar o sorteio.');
        setLoading(false);
      }
    };
    check();
  }, [sorteioId, token]);

  useEffect(() => {
    if (!authorized || !sorteioId) return;
    return onSnapshot(doc(db, 'nightrun_sorteios', sorteioId), snapshot => {
      if (snapshot.exists()) setSorteio({ id: snapshot.id, ...snapshot.data() });
    });
  }, [authorized, sorteioId]);

  useEffect(() => {
    if (!authorized || !sorteio) return;
    countElegiveis(sorteio).then(setElegiveis).catch(() => setElegiveis(null));
  }, [authorized, sorteio?.tipo, sorteio?.couponCode, sorteio?.ganhadorIds?.length]);

  const setStatus = async (status: string) => {
    if (!sorteioId) return;
    try {
      await updateDoc(doc(db, 'nightrun_sorteios', sorteioId), {
        status,
        ...(status === 'acontecendo' ? { iniciadoEm: new Date() } : {}),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error(error);
      setErro('Não foi possível alterar o status.');
    }
  };

  const handleDraw = async () => {
    if (!sorteio) return;
    setErro('');
    setDrawing(true);
    try {
      // Modo suspense no telão enquanto a roleta roda.
      await setStatus('acontecendo');
      await new Promise(resolve => setTimeout(resolve, 3200));
      await runSorteio(sorteio);
    } catch (error: any) {
      console.error(error);
      setErro(error.message || 'Erro ao realizar o sorteio.');
      await setStatus('agendado');
    } finally {
      setDrawing(false);
    }
  };

  if (loading) return <LoadingModal isOpen={true} />;

  if (!authorized) {
    return (
      <div className="sorteio-page">
        <div className="sorteio-shell">
          <LogoCombo style={{ height: 38 }} variant="light" />
          <div className="sorteio-empty">
            <Lock size={38} />
            <strong>Acesso negado</strong>
            <span>{erro}</span>
          </div>
        </div>
      </div>
    );
  }

  const ganhadores = readGanhadores(sorteio);
  const jaSorteado = ganhadores.length > 0;
  const quantidade = Math.max(1, Number(sorteio.quantidadeGanhadores || 1));
  const isLive = sorteio.status === 'acontecendo';

  return (
    <div className={`sorteio-page ${isLive ? 'is-live' : ''}`}>
      <div className="sorteio-bg-glow" />
      <div className="sorteio-shell">
        <header className="sorteio-header"><LogoCombo style={{ height: 38 }} variant="light" /></header>

        <span className="sorteio-status-pill finalizado"><ShieldCheck size={13} /> Painel do coordenador</span>

        <h1 className="sorteio-title">{sorteio.titulo || 'Sorteio'}</h1>

        {/* Somente leitura: o coordenador dispara, mas não edita nada. */}
        <div className="sorteio-op-readonly">
          <div className="sorteio-op-row">
            <span><Gift size={14} /> Prêmio</span>
            <strong>{sorteio.premioNome || 'Não definido'}</strong>
          </div>
          <div className="sorteio-op-row">
            <span><Radio size={14} /> Tipo</span>
            <strong>{sorteio.tipo === 'cupom' ? `Somente cupom ${sorteio.couponCode || '-'}` : 'Sorteio geral'}</strong>
          </div>
          <div className="sorteio-op-row">
            <span><Trophy size={14} /> Ganhadores</span>
            <strong>{quantidade}</strong>
          </div>
          <div className="sorteio-op-row">
            <span><Users size={14} /> Concorrendo</span>
            <strong>{elegiveis === null ? '...' : `${elegiveis} inscritos`}</strong>
          </div>
        </div>

        <p className="sorteio-op-note">
          <Lock size={12} /> Este link permite apenas disparar o sorteio. Os dados são definidos pelo administrador e não podem ser alterados aqui.
        </p>

        {erro && <div className="sorteio-op-error">{erro}</div>}

        {jaSorteado ? (
          <div className="sorteio-winner" style={{ width: '100%' }}>
            <span className="sorteio-winner-label"><Trophy size={16} /> {ganhadores.length > 1 ? 'Ganhadores' : 'Ganhador'}</span>
            <div className="sorteio-op-winners">
              {ganhadores.map(g => (
                <div key={g.registrationId} className="sorteio-op-winner">
                  <div className="sorteio-op-winner-photo">
                    {g.fotoUrl ? <img src={g.fotoUrl} alt={g.nome} /> : <span>{String(g.nome || 'AT').slice(0, 2).toUpperCase()}</span>}
                  </div>
                  <div>
                    <strong>{g.nome}</strong>
                    <small>{g.telefone || 'Sem telefone'}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button className="sorteio-op-draw" onClick={handleDraw} disabled={drawing || elegiveis === 0}>
            <Shuffle size={22} />
            {drawing ? 'SORTEANDO...' : 'REALIZAR SORTEIO'}
          </button>
        )}

        <a className="sorteio-op-link" href={buildSorteioPublicUrl(sorteio.id)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} /> Abrir telão público
        </a>

        <footer className="sorteio-footer">MCU Night Run 2026</footer>
      </div>
    </div>
  );
}
