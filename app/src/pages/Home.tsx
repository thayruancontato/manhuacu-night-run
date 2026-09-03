import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore';
import { LandingPage } from '../components/public-form/LandingPage';
import { SoldOutScreen } from '../components/public-form/SoldOutScreen';
import { KitDrawer } from '../components/public-form/KitDrawer';
import ClosedRegistrations from './ClosedRegistrations';
import '../App.css';

const CONFIRMED_SOLD_OUT_THRESHOLD = 1000;

export default function Home() {
  const [vagas, setVagas] = useState<number | null>(null);
  const [displayVagas, setDisplayVagas] = useState(1000);
  const [eventDate, setEventDate] = useState('');
  const [showUrgencyBanner, setShowUrgencyBanner] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const navigate = useNavigate();

  const [registrationsClosed, setRegistrationsClosed] = useState(false);
  const [bypassClosedScreen, setBypassClosedScreen] = useState(() => sessionStorage.getItem('nightrun:bypass-closed-screen') === 'true');
  const [loadingSetting, setLoadingSetting] = useState(true);

  useEffect(() => {
    const loadMaintenanceMode = async () => {
      try {
        const snap = await getDoc(doc(db, 'nightrun_settings', 'site_maintenance'));
        if (snap.exists()) {
          setRegistrationsClosed(snap.data().registrationsClosed !== false);
        }
      } catch (error) {
        console.error('Erro ao carregar modo de manutencao:', error);
      } finally {
        setLoadingSetting(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        sessionStorage.setItem('nightrun:bypass-closed-screen', 'true');
        setBypassClosedScreen(true);
      }
    };

    loadMaintenanceMode();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getCountFromServer(collection(db, 'nightrun_registrations'));
        const registrationsCount = snap.data().count;

        const lotesSnap = await getDoc(doc(db, 'nightrun_settings', 'lotes'));
        if (lotesSnap.exists()) {
          const lotes = lotesSnap.data();
          const adultLots = lotes.adulto || [];
          const activeLot = lotes.mode === 'manual'
            ? adultLots[lotes.manualIndex || 0] || adultLots[0]
            : adultLots.find((lot: any) => registrationsCount < lot.max) || adultLots[adultLots.length - 1];
          const remainingInLot = activeLot ? Math.max(activeLot.max - registrationsCount, 0) : Number.POSITIVE_INFINITY;
          setShowUrgencyBanner(Boolean(lotes.forceUrgencyBanner) || remainingInLot <= 10);
        }
      } catch (e) { console.error('Erro ao buscar vagas', e); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'));
        const snap = await getCountFromServer(q);
        setConfirmedCount(snap.data().count);
      } catch (e) { console.error('Erro ao buscar inscritos confirmados', e); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'nightrun_settings', 'evento'));
        if (snap.exists()) setEventDate(snap.data().eventDate || '');
      } catch (e) {
        console.error('Erro ao buscar data do evento', e);
      }
    })();
  }, []);

  useEffect(() => {
    let interval: any;
    if (vagas === null) {
      interval = setInterval(() => {
        setDisplayVagas(Math.floor(Math.random() * 9999));
      }, 50);
    } else {
      let current = displayVagas;
      interval = setInterval(() => {
        const diff = current - vagas;
        if (Math.abs(diff) > 0) {
          current -= Math.sign(diff) * Math.ceil(Math.abs(diff) / 5);
          setDisplayVagas(current);
        } else {
          clearInterval(interval);
        }
      }, 30);
    }
    return () => clearInterval(interval);
  }, [vagas, displayVagas]);

  const handleStart = () => navigate('/inscricao');
  const handleRegulation = () => navigate('/regulamento');

  if (loadingSetting) return null;
  if (registrationsClosed && !bypassClosedScreen) {
    return <ClosedRegistrations />;
  }

  const soldOut = confirmedCount !== null && confirmedCount >= CONFIRMED_SOLD_OUT_THRESHOLD;

  if (soldOut) {
    return (
      <div className="public-app-root public-home-root">
        <main className="public-main-content">
          <SoldOutScreen
            confirmedCount={confirmedCount as number}
            eventDate={eventDate}
            onViewList={() => navigate('/atletas')}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="public-app-root public-home-root">
      {registrationsClosed && bypassClosedScreen && (
        <div style={{
          background: '#e0a800',
          color: '#000',
          textAlign: 'center',
          padding: '8px 16px',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          ⚠️ Modo de visualização de testes ativo (Bypass Ctrl+Z). As inscrições estão FECHADAS para o público geral.
        </div>
      )}
      <main className="public-main-content">
        <LandingPage 
          displayVagas={displayVagas} 
          vagas={vagas} 
          eventDate={eventDate}
          showUrgencyBanner={showUrgencyBanner}
          onStart={handleStart} 
          onRegulation={handleRegulation}
          onCheckStatus={() => navigate('/atleta/login')}
        />
        <KitDrawer 
          variant="section"
          isOpen
          onClose={() => undefined}
          onStart={handleStart}
        />
      </main>
    </div>
  );
}
