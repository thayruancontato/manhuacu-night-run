import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
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
      if (firebaseUser) {
        setUser(firebaseUser);
        console.log("Auth: Usuário detectado:", firebaseUser.email);
        
        try {
          // 1. Verificar se é Admin
          const adminDoc = await getDoc(doc(db, 'nightrun_admins', firebaseUser.email || ''));
          
          if (adminDoc.exists()) {
            console.log("Auth: Papel Admin detectado");
            setRole('admin');
            localStorage.setItem('nightrun_admin_auth', 'true');
          } else {
            // 2. Verificar se é Atleta
            const atletaQuery = query(collection(db, 'nightrun_registrations'), where('email', '==', firebaseUser.email));
            const atletaSnap = await getDocs(atletaQuery);
            if (!atletaSnap.empty) {
              console.log("Auth: Papel Atleta detectado");
              setRole('atleta');
              setAtletaData({ id: atletaSnap.docs[0].id, ...atletaSnap.docs[0].data() });
              localStorage.setItem('nightrun_atleta_auth', 'true');
            } else {
              console.log("Auth: Nenhum papel associado ao e-mail");
              setRole(null);
            }
          }
        } catch (error) {
          console.error("AuthContext Error:", error);
          setRole(null);
        }
      } else {
        setUser(null);
        setRole(null);
        setAtletaData(null);
        localStorage.removeItem('nightrun_admin_auth');
        localStorage.removeItem('nightrun_atleta_auth');
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
