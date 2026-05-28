import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { 
  User, Lock, Eye, EyeOff, ArrowRight, 
  ChevronLeft, LayoutPanelLeft, ShieldCheck 
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { useLoading } from '../components/LoadingService';
import '../App.css';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showAlert } = useDialog();
  const { showLoading } = useLoading();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const q = query(collection(db, 'nightrun_admins'), where('email', '==', email.toLowerCase().trim()));
      const snap = await getDocs(q);

      if (snap.empty) {
        await auth.signOut();
        showAlert('Acesso negado. Este e-mail não está autorizado como administrador.', 'error');
        return;
      }

      localStorage.setItem('nightrun_admin_auth', 'true');
      showLoading(2000, 'Acessando Painel...');
      setTimeout(() => navigate('/admin/dashboard'), 2000);
    } catch (error: any) {
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        const q = query(collection(db, 'nightrun_admins'), where('email', '==', email.toLowerCase().trim()));
        const snap = await getDocs(q);

        if (!snap.empty) {
          try {
            await createUserWithEmailAndPassword(auth, email, password);
            localStorage.setItem('nightrun_admin_auth', 'true');
            showAlert('Primeiro acesso! Sua senha foi configurada.', 'success');
            showLoading(2000, 'Configurando Painel...');
            setTimeout(() => navigate('/admin/dashboard'), 2000);
          } catch (createError: any) {
            showAlert('Erro ao criar senha: ' + createError.message, 'error');
          }
        } else {
          showAlert('Usuário não encontrado ou senha incorreta.', 'error');
        }
      } else {
        showAlert('Erro de autenticação: ' + error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="athlete-login-page">
      <div className="athlete-login-container">
        <header className="athlete-login-header">
          <img src="/LOGO horizontal NIGHT RUN SEM FUNDO (em amarelo e branco).png" alt="MCU Night Run" className="athlete-login-logo" />
          <p>Portal Administrativo - MCU Night Run 2026</p>
          <div className="header-accent-line" />
        </header>

        <div className="athlete-section-title">
          <div className="icon-box">
            <ShieldCheck size={22} />
          </div>
          <h2>ÁREA DO <span className="highlight">ADMIN</span></h2>
        </div>

        <form onSubmit={handleLogin}>
          <div className="athlete-form-group">
            <label>E-MAIL</label>
            <div className="athlete-input-wrapper">
              <User className="icon" size={20} />
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="seu@email.com" 
                required
              />
            </div>
          </div>

          <div className="athlete-form-group">
            <label>SENHA</label>
            <div className="athlete-input-wrapper">
              <Lock className="icon" size={20} />
              <input 
                type={showPassword ? "text" : "password"} 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="••••••••" 
                required
              />
              <button 
                type="button" 
                className="eye-btn"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <button type="submit" className="athlete-btn-primary" disabled={loading} style={{ marginTop: '10px' }}>
            {loading ? 'VERIFICANDO...' : 'ACESSAR PAINEL'}
            {!loading && <ArrowRight size={20} />}
          </button>
        </form>

        <div className="partners-banner transparent">
          <img src="/logo-mcu.png" alt="MCU" className="partner-logo" />
          <div className="partner-divider" />
          <img src="/logo-ademare.png" alt="Ademare" className="partner-logo" />
        </div>

        <Link to="/" className="athlete-back-link">
          <ChevronLeft size={18} />
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
