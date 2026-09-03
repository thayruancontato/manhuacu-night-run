import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, User } from 'lucide-react';
import { db } from '../firebase';
import { formatDateBR } from '../utils/dateUtils';
import '../App.css';

type AtletaConfirmado = {
  id: string;
  nome: string;
  fotoUrl?: string;
  dataInscricao: string;
};

export default function AtletasConfirmados() {
  const [atletas, setAtletas] = useState<AtletaConfirmado[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            nome: String(data.nome || '').trim(),
            fotoUrl: data.fotoUrl || '',
            dataInscricao: formatDateBR(data.createdAt, ''),
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

  return (
    <div className="atletas-confirmados-page">
      <div className="atletas-confirmados-header">
        <button className="atletas-confirmados-back" onClick={() => navigate('/')} type="button">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1>ATLETAS CONFIRMADOS</h1>
          <span>{loading ? 'CARREGANDO...' : `${atletas.length} INSCRITOS`}</span>
        </div>
      </div>

      {!loading && (
        <div className="atletas-confirmados-list">
          {atletas.map(atleta => (
            <div className="atletas-confirmados-card" key={atleta.id}>
              <div className="atletas-confirmados-avatar">
                {atleta.fotoUrl ? (
                  <img src={atleta.fotoUrl} alt={atleta.nome} loading="lazy" />
                ) : (
                  <User size={22} />
                )}
              </div>
              <div className="atletas-confirmados-info">
                <strong>{atleta.nome}</strong>
                <span>{atleta.dataInscricao}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
