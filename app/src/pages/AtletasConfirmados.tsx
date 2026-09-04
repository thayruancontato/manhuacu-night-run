import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2, MessageCircleQuestion, Search, User, Users, X } from 'lucide-react';
import { db } from '../firebase';
import { formatDateBR } from '../utils/dateUtils';
import NaoEncontreiModal from '../components/public-form/NaoEncontreiModal';
import '../App.css';

type AtletaConfirmado = {
  id: string;
  nome: string;
  fotoUrl?: string;
  dataInscricao: string;
  searchNome: string;
  searchDigits: string;
};

const DIACRITICS_RE = /[̀-ͯ]/g;

const normalizeText = (value: string) => value
  .normalize('NFD')
  .replace(DIACRITICS_RE, '')
  .toLowerCase()
  .trim();

const onlyDigits = (value: string) => value.replace(/\D/g, '');

export default function AtletasConfirmados() {
  const [atletas, setAtletas] = useState<AtletaConfirmado[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNaoEncontrei, setShowNaoEncontrei] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => {
          const data = d.data();
          const nome = String(data.nome || '').trim();
          return {
            id: d.id,
            nome,
            fotoUrl: data.fotoUrl || '',
            dataInscricao: formatDateBR(data.createdAt, ''),
            searchNome: normalizeText(nome),
            searchDigits: `${onlyDigits(data.telefone || '')} ${onlyDigits(data.cpf || '')}`,
          };
        });
        list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
        setAtletas(list);
      } catch (e) {
        console.error('Erro ao buscar atletas confirmados:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim();
    if (!term) return atletas;
    const normalizedTerm = normalizeText(term);
    const digitsTerm = onlyDigits(term);
    return atletas.filter(atleta => {
      const matchesNome = normalizedTerm && atleta.searchNome.includes(normalizedTerm);
      const matchesDigits = digitsTerm.length >= 3 && atleta.searchDigits.includes(digitsTerm);
      return matchesNome || matchesDigits;
    });
  }, [atletas, search]);

  const groups = useMemo(() => {
    const map = new Map<string, AtletaConfirmado[]>();
    filtered.forEach(atleta => {
      const letter = /[A-Z]/i.test(atleta.nome[0] || '') ? atleta.nome[0].toUpperCase() : '#';
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(atleta);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="atletas-confirmados-page">
      <div className="atletas-confirmados-header">
        <button className="atletas-confirmados-back" onClick={() => navigate('/')} type="button">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>ATLETAS CONFIRMADOS</h1>
          <span>
            {loading ? 'CARREGANDO...' : `${filtered.length} DE ${atletas.length} INSCRITOS`}
          </span>
        </div>
      </div>

      <div className="atletas-confirmados-search">
        <Search size={17} />
        <input
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Buscar por nome, telefone ou CPF..."
          inputMode="search"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca">
            <X size={15} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="atletas-confirmados-empty">
          <Users size={30} />
          <span>Carregando atletas confirmados...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="atletas-confirmados-empty">
          <Users size={30} />
          <span>Nenhum atleta encontrado para "{search}".</span>
        </div>
      ) : (
        <div className="atletas-confirmados-groups">
          {groups.map(([letter, items]) => (
            <div className="atletas-confirmados-group" key={letter}>
              <div className="atletas-confirmados-letter">
                <span>{letter}</span>
              </div>
              <div className="atletas-confirmados-list">
                {items.map(atleta => (
                  <div className="atletas-confirmados-card" key={atleta.id}>
                    <div className="atletas-confirmados-avatar">
                      {atleta.fotoUrl ? (
                        <img src={atleta.fotoUrl} alt={atleta.nome} loading="lazy" />
                      ) : (
                        <User size={20} />
                      )}
                    </div>
                    <div className="atletas-confirmados-info">
                      <strong>{atleta.nome}</strong>
                      <span>Inscrito em {atleta.dataInscricao}</span>
                      <div className="atletas-confirmados-badge">
                        <CheckCircle2 size={12} />
                        <span>Atleta confirmado</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="atletas-confirmados-fab-wrap">
        <button type="button" className="atletas-confirmados-fab" onClick={() => setShowNaoEncontrei(true)}>
          <MessageCircleQuestion size={18} />
          Me inscrevi mas não estou na lista
        </button>
      </div>

      {showNaoEncontrei && <NaoEncontreiModal onClose={() => setShowNaoEncontrei(false)} />}
    </div>
  );
}
