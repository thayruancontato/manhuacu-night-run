import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, NavLink } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, collection, getCountFromServer } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { ADMIN_MENU_ITEMS } from '../config/menu';
import { CalendarDays, LogOut, Menu, X, ChevronDown, ChevronRight } from 'lucide-react';
import { AdminLayoutSkeleton } from '../components/Skeleton';
import { formatDateTimeBR } from '../utils/dateUtils';
import '../styles/admin.css';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role, loading: authLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [eventDate, setEventDate] = useState('');
  const [paymentProvider, setPaymentProvider] = useState<'asaas' | 'cora'>('asaas');
  const [inscritosCount, setInscritosCount] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || role !== 'admin')) {
      navigate('/atleta/login');
    }
  }, [user, role, authLoading, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'nightrun_settings', 'evento'));
        if (snap.exists()) setEventDate(snap.data().eventDate || '');
      } catch (e) {
        console.error('Erro ao carregar data do evento', e);
      }
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'nightrun_settings', 'payment_integration'),
      snap => {
        const provider = snap.exists() ? snap.data().provider : 'asaas';
        setPaymentProvider(provider === 'cora' ? 'cora' : 'asaas');
      },
      error => {
        console.error('Erro ao carregar integração ativa', error);
        setPaymentProvider('asaas');
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'nightrun_registrations'),
      (snap) => setInscritosCount(snap.size),
      (err) => console.error('Erro ao contar inscritos', err)
    );
    return unsubscribe;
  }, []);

  if (authLoading) return <AdminLayoutSkeleton variant="dashboard" />;
  if (!user || role !== 'admin') return null;

  const handleLogout = async () => {
    try { await signOut(auth); } catch {}
    localStorage.removeItem('nightrun_admin_auth');
    navigate('/admin/login');
  };

  const toggleGroup = (path: string) => {
    const s = new Set(openGroups);
    s.has(path) ? s.delete(path) : s.add(path);
    setOpenGroups(s);
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');
  const formattedEventDate = eventDate ? formatDateTimeBR(eventDate) : 'Definir data';
  const activeBankLogo = paymentProvider === 'cora' ? '/cora-logo.svg' : '/asaas-logo.svg';
  const activeBankName = paymentProvider === 'cora' ? 'Cora' : 'Asaas';

  return (
    <div className="admin-dark-layout">
      {/* Mobile Header */}
      <div className="adm-mobile-header">
        <img src="/LOGO horizontal NIGHT RUN SEM FUNDO (em amarelo e branco).png" alt="MCU Night Run" />
        <button onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 99, backdropFilter: 'blur(3px)' }}
        />
      )}

      {/* Sidebar */}
      <aside className={`adm-sidebar ${isMobile && sidebarOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="adm-sidebar-logo">
          <img src="/LOGO horizontal NIGHT RUN SEM FUNDO (em amarelo e branco).png" alt="MCU Night Run" />
        </div>

        <button
          className="adm-event-date"
          onClick={() => {
            navigate('/admin/configuracoes');
            isMobile && setSidebarOpen(false);
          }}
        >
          <span className="adm-event-date-icon"><CalendarDays size={18} /></span>
          <span>
            <strong>Data do evento</strong>
            <small>{formattedEventDate}</small>
          </span>
        </button>

        {/* Nav */}
        <nav className="adm-sidebar-nav">
          {ADMIN_MENU_ITEMS.map(item => {
            const hasSub = item.subItems && item.subItems.length > 0;
            const groupOpen = openGroups.has(item.path);
            const active = isActive(item.path);

            return (
              <div key={item.path}>
                <div
                  className={`adm-nav-item ${active && !hasSub ? 'active' : ''}`}
                  onClick={() => {
                    if (hasSub) { toggleGroup(item.path); }
                    else { navigate(item.path); isMobile && setSidebarOpen(false); }
                  }}
                >
                  <span className="nav-icon"><item.icon size={19} /></span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.path === '/admin/inscritos' && inscritosCount !== null && (
                    <span style={{
                      background: active ? 'rgba(2,10,34,0.12)' : 'rgba(107,255,42,0.15)',
                      color: active ? '#020A22' : '#6bff2a',
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      marginLeft: 4,
                    }}>{inscritosCount}</span>
                  )}
                  {item.path === '/admin/integracoes' && (
                    <span className="nav-active-bank">
                      <span className="nav-active-bank-divider" />
                      <span className="nav-active-bank-content">
                        <small>Atual</small>
                        <img className="nav-bank-logo" src={activeBankLogo} alt={activeBankName} />
                      </span>
                    </span>
                  )}
                  {hasSub && (
                    <span className="nav-chevron">
                      {groupOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </span>
                  )}
                </div>

                {hasSub && groupOpen && (
                  <div className="adm-nav-sub">
                    {item.subItems!.map(sub => (
                      <NavLink
                        key={sub.to}
                        to={sub.to}
                        className={({ isActive: a }) => `adm-nav-item ${a ? 'active' : ''}`}
                        onClick={() => isMobile && setSidebarOpen(false)}
                      >
                        <span className="sub-dot" />
                        <span>{sub.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="adm-sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-dark-main">
        <Outlet />
      </main>
    </div>
  );
}
