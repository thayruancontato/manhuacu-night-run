import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

interface AuthContextType {
  user: User | null;
  role: 'admin' | 'atleta' | null;
  loading: boolean;
  atletaData: any | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  atletaData: null
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'atleta' | null>(null);
  const [loading, setLoading] = useState(true);
  const [atletaData, setAtletaData] = useState<any | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);

      try {
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
