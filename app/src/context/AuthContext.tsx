import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'atleta' | 'staff_kits' | null;
  loading: boolean;
  atletaData: any | null;
}

// Conta de staff exclusiva pra retirada de kits no dia do evento - não é um admin de verdade
// (não tem doc em nightrun_admins, não acessa o resto do painel), só essa uma tela. A criação
// dessa conta no Firebase Auth acontece no primeiro login bem-sucedido (mesmo padrão de
// bootstrap já usado pro primeiro admin do sistema), não precisa ser criada manualmente antes.
const STAFF_KITS_EMAIL = 'kits@admin.com';

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  atletaData: null
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'atleta' | 'staff_kits' | null>(null);
  const [loading, setLoading] = useState(true);
  const [atletaData, setAtletaData] = useState<any | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);

      try {
        // 0. Conta de staff exclusiva pra retirada de kits - checada antes do admin normal,
        // por e-mail fixo, sem doc em nightrun_admins nem acesso ao resto do painel.
        if (firebaseUser?.email === STAFF_KITS_EMAIL) {
          setRole('staff_kits');
          setAtletaData(null);
          localStorage.setItem('nightrun_staff_kits_auth', 'true');
          setLoading(false);
          return;
        }

        // 1. Verificar se é Admin (exige sessão real do Firebase Auth - é o que as
        // regras do Firestore usam para liberar as coleções administrativas).
        if (firebaseUser) {
          const adminDoc = await getDoc(doc(db, 'nightrun_admins', firebaseUser.email || ''));
          if (adminDoc.exists()) {
            setRole('admin');
            setAtletaData(null);
            localStorage.setItem('nightrun_admin_auth', 'true');
            setLoading(false);
            return;
          }
        }

        // 2. Verificar se é Atleta pela inscrição selecionada no login (não pelo e-mail
        // do Firebase Auth). Um mesmo e-mail pode ter várias inscrições com CPFs
        // diferentes, e o Firebase Auth só guarda 1 senha por e-mail - então quem valida
        // "qual atleta é este" é o CPF já conferido no login, salvo aqui localmente.
        const regId = localStorage.getItem('nightrun_atleta_reg_id');
        if (regId) {
          const regSnap = await getDoc(doc(db, 'nightrun_registrations', regId));
          if (regSnap.exists()) {
            setRole('atleta');
            setAtletaData({ id: regSnap.id, ...regSnap.data() });
            localStorage.setItem('nightrun_atleta_auth', 'true');
            setLoading(false);
            return;
          }
        }

        setRole(null);
        setAtletaData(null);
        localStorage.removeItem('nightrun_admin_auth');
        localStorage.removeItem('nightrun_atleta_auth');
        localStorage.removeItem('nightrun_atleta_reg_id');
        localStorage.removeItem('nightrun_staff_kits_auth');
      } catch (error) {
        console.error("AuthContext Error:", error);
        setRole(null);
        setAtletaData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, atletaData }}>
      {children}
    </AuthContext.Provider>
  );
}
