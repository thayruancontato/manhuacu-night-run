import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Home, CreditCard, User, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import '../App.css';

const NAV_ITEMS = [
  { to: '/atleta/dashboard', label: 'Início', icon: Home },
  { to: '/atleta/pagamentos', label: 'Pagamentos', icon: CreditCard },
];

export default function AtletaLayout() {
  const navigate = useNavigate();
  const { user, role, loading, atletaData } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    if (!loading && (!user || role !== 'atleta')) {
      navigate('/atleta/login');
    }
  }, [user, role, loading, navigate]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>;
  if (!user || role !== 'atleta') return null;

  const handleLogout = () => {
    localStorage.removeItem('nightrun_atleta_auth');
    navigate('/atleta/login');
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
    </div>
  );
}
