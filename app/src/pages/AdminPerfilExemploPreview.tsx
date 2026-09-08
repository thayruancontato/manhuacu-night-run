import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AtletaDashboard from './AtletaDashboard';
import { MOCK_ATLETA_REG, MOCK_MODALIDADE, MOCK_CAMISETA_LABEL, MOCK_KIT_NOME } from '../utils/mockAtletaExemplo';
import '../App.css';

// Pré-visualização admin do acesso do atleta (mesma tela real de AtletaDashboard.tsx),
// com dados fictícios via a prop `mock` - não exige login de atleta nem lê/escreve nada
// no Firestore além do que a própria AtletaDashboard já faz normalmente.
export default function AdminPerfilExemploPreview() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && (!user || role !== 'admin')) {
      navigate('/admin/login');
    }
  }, [user, role, authLoading, navigate]);

  if (authLoading || !user || role !== 'admin') return null;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#071A45' }}>
      <div style={{
        background: '#0e0f14', color: '#facc15', textAlign: 'center', padding: '6px 16px',
        fontSize: '0.7rem', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 9999,
      }}>
        PRÉ-VISUALIZAÇÃO (admin) — dados fictícios de exemplo
      </div>
      <header style={{
        background: 'linear-gradient(135deg, #071A45, #123068)', padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,.1)',
      }}>
        <img src="/LOGO horizontal NIGHT RUN SEM FUNDO (em amarelo e branco).png" alt="MCU Night Run" style={{ height: '32px' }} />
        <button
          onClick={() => navigate('/admin/comprovante-exemplo')}
          style={{
            background: 'rgba(255,255,255,.08)', border: 'none', color: '#fff',
            padding: '8px 16px', borderRadius: 8, cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700,
          }}
        >
          <ArrowLeft size={16} /> Voltar ao admin
        </button>
      </header>
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        <AtletaDashboard
          mock={{
            reg: MOCK_ATLETA_REG,
            modalidade: MOCK_MODALIDADE,
            camisetaLabel: MOCK_CAMISETA_LABEL,
            kitNome: MOCK_KIT_NOME,
          }}
        />
      </main>
    </div>
  );
}
