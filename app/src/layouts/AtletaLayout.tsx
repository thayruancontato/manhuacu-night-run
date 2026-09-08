import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { Home, CreditCard, User, LogOut, Menu, X, MapPin, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';
import '../App.css';

const NAV_ITEMS = [
  { to: '/atleta/dashboard', label: 'Início', icon: Home },
  { to: '/atleta/pagamentos', label: 'Pagamentos', icon: CreditCard },
];

export default function AtletaLayout() {
  const navigate = useNavigate();
  const { role, loading, atletaData } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showEnderecoModal, setShowEnderecoModal] = useState(false);

  // O acesso do atleta é identificado pela inscrição selecionada no login (ver AuthContext),
  // não exige uma sessão real do Firebase Auth - por isso não checamos `user` aqui.
  useEffect(() => {
    if (!loading && role !== 'atleta') {
      navigate('/atleta/login');
    }
  }, [role, loading, navigate]);

  useEffect(() => {
    if (role === 'atleta' && atletaData && !atletaData.enderecoPreenchidoEm) {
      setShowEnderecoModal(true);
    } else {
      setShowEnderecoModal(false);
    }
  }, [role, atletaData]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>;
  if (role !== 'atleta') return null;

  const handleLogout = () => {
    localStorage.removeItem('nightrun_atleta_auth');
    localStorage.removeItem('nightrun_atleta_reg_id');
    signOut(auth).catch(() => {});
    // Navegação completa para o contexto de autenticação recarregar do zero.
    window.location.href = '/atleta/login';
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#071A45' }}>
      {/* Top Bar */}
      <header style={{
        background: 'linear-gradient(135deg, #071A45, #123068)', padding: '12px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 2px 10px rgba(0,0,0,.1)'
      }}>
        <img src="/LOGO horizontal NIGHT RUN SEM FUNDO (em amarelo e branco).png" alt="MCU Night Run" style={{ height: '32px' }} />
        <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
              color: isActive ? '#6BFF2A' : 'rgba(255,255,255,.6)', display: 'flex', alignItems: 'center', gap: 6,
              textDecoration: 'none', fontSize: '.85rem', fontWeight: isActive ? 700 : 500, padding: '6px 12px',
              borderRadius: 8, background: isActive ? 'rgba(107,255,42,.1)' : 'transparent', transition: 'all .2s'
            })}>
              <item.icon size={18} />
              {!isMobile && item.label}
            </NavLink>
          ))}
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
          <button onClick={handleLogout} style={{
            background: 'rgba(255,255,255,.08)', border: 'none', color: 'rgba(255,255,255,.6)',
            padding: '6px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <LogOut size={18} />
          </button>
        </nav>
      </header>
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        <Outlet />
      </main>

      {showEnderecoModal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(7,26,69,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            style={{
              background: '#fff', borderRadius: 20, maxWidth: 420, width: '100%',
              padding: '32px 26px', textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              border: '2px solid #e53e3e',
            }}
          >
            <div style={{
              width: 60, height: 60, borderRadius: '50%', background: '#fee2e2',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <AlertTriangle size={30} color="#e53e3e" />
            </div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#071A45', margin: '0 0 8px' }}>
              Falta informar seu endereço
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#4a5568', margin: '0 0 24px', lineHeight: 1.5 }}>
              É obrigatório para participar da premiação por cidade. Leva menos de 1 minuto para preencher.
            </p>
            <button
              type="button"
              onClick={() => navigate('/endereco')}
              style={{
                background: '#e53e3e', color: '#fff', border: 'none', borderRadius: 40,
                width: '100%', height: 52, fontSize: '0.95rem', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px',
              }}
            >
              <MapPin size={20} />
              Preencher endereço agora
            </button>
            <button
              type="button"
              onClick={() => setShowEnderecoModal(false)}
              style={{
                background: 'transparent', border: 'none', color: '#94a3b8',
                fontSize: '0.8rem', marginTop: 14, cursor: 'pointer', textDecoration: 'underline',
              }}
            >
              Preencher depois
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
