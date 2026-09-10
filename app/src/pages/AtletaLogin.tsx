import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { getFriendlyErrorMessage } from '../utils/errorMessageUtils';
import { useDialog } from '../context/CustomDialogContext';
import { useLoading } from '../components/LoadingService';
import { 
  User, Lock, Eye, EyeOff, ArrowRight, 
  ChevronLeft, LayoutPanelLeft 
} from 'lucide-react';
import '../App.css';

export default function UnifiedLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showAlert } = useDialog();
  const { showLoading } = useLoading();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return showAlert('Preencha e-mail e senha.', 'warning');
    
    setLoading(true);
    const cleanEmail = email.toLowerCase().trim();
    const cleanPassword = password.replace(/\D/g, '');

    const STAFF_KITS_EMAIL = 'kits@admin.com';

    try {
      // 0. Conta de staff exclusiva pra retirada de kits - e-mail fixo, sem doc em
      // nightrun_admins. Cria a conta no primeiro login (mesmo bootstrap do primeiro admin).
      if (cleanEmail === STAFF_KITS_EMAIL) {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, password);
        } catch (authError: any) {
          if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password' || authError.code === 'auth/user-not-found') {
            await createUserWithEmailAndPassword(auth, cleanEmail, password);
          } else {
            throw authError;
          }
        }
        localStorage.setItem('nightrun_staff_kits_auth', 'true');
        showLoading(1000, 'Acessando Retirada de Kits...');
        setTimeout(() => { window.location.href = '/admin/retirada-kits'; }, 1000);
        return;
      }

      // 1. TENTAR LOGIN COMO ADMIN
      // (o bootstrap do primeiro admin do sistema já foi feito há muito tempo - checar "existe
      // algum admin?" a cada tentativa de login só gastava 1 leitura extra de Firestore sempre,
      // à toa, para todo mundo, inclusive atletas.)
      const adminDoc = await getDocs(query(collection(db, 'nightrun_admins'), where('email', '==', cleanEmail)));
      if (!adminDoc.empty) {
        try {
          await signInWithEmailAndPassword(auth, cleanEmail, password);
          localStorage.setItem('nightrun_admin_auth', 'true');
          showLoading(1500, 'Acessando Painel Admin...');
          setTimeout(() => navigate('/admin/dashboard'), 1500);
          return;
        } catch (authError: any) {
          if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password' || authError.code === 'auth/user-not-found') {
             try {
                await createUserWithEmailAndPassword(auth, cleanEmail, password);
                localStorage.setItem('nightrun_admin_auth', 'true');
                showAlert('Primeiro acesso! Sua senha administrativa foi configurada.', 'success');
                navigate('/admin/dashboard');
                return;
             } catch (createError) {}
          }
        }
      }

      // 2. TENTAR LOGIN COMO ATLETA
      // O mesmo e-mail pode ter várias inscrições (ex: um responsável cadastrando vários atletas),
      // cada uma com seu próprio CPF/senha. O Firebase Auth só guarda 1 senha por e-mail, então
      // NÃO autenticamos por ali (tentar geraria erro 400 sempre que o CPF digitado não for o
      // mesmo que criou a conta daquele e-mail). A validação real é o CPF batendo com a inscrição
      // no Firestore - o ID dela é salvo localmente e é o que identifica o atleta no dashboard.
      const atletaQuery = query(collection(db, 'nightrun_registrations'), where('email', '==', cleanEmail));
      const atletaSnap = await getDocs(atletaQuery);
      if (!atletaSnap.empty && cleanPassword.length >= 11) {
        const docAtleta = atletaSnap.docs.find(d => (d.data().cpf || '').replace(/\D/g, '') === cleanPassword);
        if (docAtleta) {
          try { await signOut(auth); } catch {} // Limpa qualquer sessão (admin/outro atleta) que possa estar ativa
          localStorage.setItem('nightrun_atleta_auth', 'true');
          localStorage.setItem('nightrun_atleta_reg_id', docAtleta.id);
          showLoading(1000, 'Acessando Área do Atleta...');
          // Navegação completa (não só o router) para o contexto de autenticação recarregar
          // já lendo a inscrição selecionada acima.
          setTimeout(() => { window.location.href = '/atleta/dashboard'; }, 1000);
          return;
        }
      }
      showAlert('E-mail ou senha incorretos.', 'error');
    } catch (err: any) {
      showAlert(getFriendlyErrorMessage(err, 'Erro ao autenticar: ' + err.message), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="athlete-login-page">
      <div className="athlete-login-container">
        <header className="athlete-login-header">
          <img src="/LOGO horizontal NIGHT RUN SEM FUNDO (em amarelo e branco).png" alt="MCU Night Run" className="athlete-login-logo" />
          <p>Acesse sua conta para gerenciar sua inscrição ou administrar o evento.</p>
          <div className="header-accent-line" />
        </header>

        <div className="athlete-section-title">
          <div className="icon-box">
            <LayoutPanelLeft size={22} />
          </div>
          <h2>ÁREA DE <span className="highlight">ACESSO</span></h2>
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
                autoComplete="email"
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
                placeholder="........" 
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

          <div className="athlete-form-options">
            <a href="#" className="athlete-forgot" onClick={(e) => { e.preventDefault(); showAlert('Use seu CPF (apenas números) como senha.', 'info'); }}>
              Esqueci minha senha
            </a>
          </div>

          <button type="submit" className="athlete-btn-primary" disabled={loading}>
            {loading ? 'VERIFICANDO...' : 'ACESSAR CONTA'}
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
