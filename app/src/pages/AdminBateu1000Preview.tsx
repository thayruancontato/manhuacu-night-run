import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { SoldOutScreen } from '../components/public-form/SoldOutScreen';
import '../App.css';

export default function AdminBateu1000Preview() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const [eventDate, setEventDate] = useState('');

  useEffect(() => {
    if (!authLoading && (!user || role !== 'admin')) {
      navigate('/admin/login');
    }
  }, [user, role, authLoading, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'));
        const snap = await getCountFromServer(q);
        setConfirmedCount(snap.data().count);
      } catch (e) { console.error('Erro ao buscar inscritos confirmados', e); }
    })();

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'nightrun_settings', 'evento'));
        if (snap.exists()) setEventDate(snap.data().eventDate || '');
      } catch (e) { console.error('Erro ao buscar data do evento', e); }
    })();
  }, []);

  if (authLoading || !user || role !== 'admin' || confirmedCount === null) return null;

  return (
    <div className="public-app-root public-home-root">
      <div style={{
        background: '#0e0f14', color: '#facc15', textAlign: 'center', padding: '8px 16px',
        fontSize: '0.8rem', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 9999,
      }}>
        PRÉ-VISUALIZAÇÃO (admin) — tela real de "esgotado" só aparece com 1000+ confirmados. Confirmados atuais: {confirmedCount}
      </div>
      <main className="public-main-content">
        <SoldOutScreen
          confirmedCount={confirmedCount}
          eventDate={eventDate}
          onViewList={() => navigate('/atletas')}
        />
      </main>
    </div>
  );
}
