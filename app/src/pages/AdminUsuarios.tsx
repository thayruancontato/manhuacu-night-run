import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Users, UserPlus, Trash2, ShieldCheck, Mail } from 'lucide-react';
import { useDialog } from '../context/CustomDialogContext';
import LoadingModal from '../components/LoadingModal';
import { FormHeader } from '../components/AdminForm';
import '../App.css';

export default function AdminUsuarios() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const { showAlert } = useDialog();

  const fetchAdmins = async () => {
    try {
      const q = query(collection(db, 'nightrun_admins'));
      const querySnapshot = await getDocs(q);
      const list = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAdmins(list);
    } catch (err) {
      console.error(err);
      showAlert('Erro ao carregar administradores', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.includes('@')) return showAlert('E-mail inválido', 'error');
    
    setLoading(true);
    try {
      // Verificar se já existe
      const q = query(collection(db, 'nightrun_admins'), where('email', '==', newEmail.toLowerCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        showAlert('Este e-mail já é administrador', 'info');
        setLoading(false);
        return;
      }

      const { setDoc, doc: firestoreDoc } = await import('firebase/firestore');
      await setDoc(firestoreDoc(db, 'nightrun_admins', newEmail.toLowerCase().trim()), {
        email: newEmail.toLowerCase().trim(),
        role: 'admin',
        createdAt: new Date().toISOString()
      });
      
      showAlert('Novo administrador autorizado!', 'success');
      setNewEmail('');
      fetchAdmins();
    } catch (err) {
      showAlert('Erro ao adicionar administrador', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Remover acesso de ${email}`)) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'nightrun_admins', id));
      showAlert('Acesso removido com sucesso', 'success');
      fetchAdmins();
    } catch (err) {
      showAlert('Erro ao remover acesso', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: '#071A45', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <ShieldCheck size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 2 }}>Gestão de Acesso</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Controle quem pode acessar o painel administrativo do evento.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24 }}>
        {/* Autorizar Novo */}
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: 30, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
           <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
             <UserPlus size={20} color="#071A45" /> Autorizar Novo E-mail
           </h3>
           
           <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 24, lineHeight: 1.5 }}>
             Insira o e-mail da pessoa que poderá acessar o painel administrativo. 
             O sistema permitirá o login automático para este endereço.
           </p>

           <form onSubmit={handleAddAdmin}>
             <div style={{ marginBottom: 20 }}>
               <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>E-mail do Administrador</label>
               <div style={{ position: 'relative' }}>
                 <Mail size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                 <input 
                   type="email" 
                   value={newEmail} 
                   onChange={e => setNewEmail(e.target.value)} 
                   placeholder="exemplo@email.com"
                   required
                   style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                 />
               </div>
             </div>
             <button type="submit" style={{ width: '100%', background: '#071A45', color: '#fff', border: 'none', padding: '14px', borderRadius: 12, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
               <UserPlus size={20} /> AUTORIZAR ACESSO
             </button>
           </form>
        </div>

        {/* Lista Atuais */}
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: 30, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45', marginBottom: 20 }}>Administradores Atuais</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {admins.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Nenhum administrador cadastrado.</div>
            ) : (
              admins.map((admin) => (
                <div key={admin.id} style={{ 
                  background: '#f8fafc', 
                  padding: '16px 20px', 
                  borderRadius: 16, 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  border: '1px solid #f1f5f9'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ 
                      width: 40, height: 40, borderRadius: 12, 
                      background: '#071A45', color: '#fff', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.8rem', fontWeight: 800
                    }}>
                      {admin.email.substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#071A45' }}>{admin.email}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Acesso Total</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(admin.id, admin.email)}
                    style={{ background: '#fee2e2', border: 'none', color: '#ef4444', cursor: 'pointer', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <LoadingModal isOpen={loading} />
    </div>
  );
}
