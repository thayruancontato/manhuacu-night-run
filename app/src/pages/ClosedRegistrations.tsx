import { useEffect, useState } from 'react';
import { CalendarClock, ClipboardList } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import PublicForm from './PublicForm';
import '../App.css';

export default function ClosedRegistrations() {
  const [bypassClosedScreen, setBypassClosedScreen] = useState(() => sessionStorage.getItem('nightrun:bypass-closed-screen') === 'true');
  const [registrationsClosed, setRegistrationsClosed] = useState(true);
  const [loadingSetting, setLoadingSetting] = useState(true);

  useEffect(() => {
    const loadMaintenanceMode = async () => {
      try {
        const snap = await getDoc(doc(db, 'nightrun_settings', 'site_maintenance'));
        setRegistrationsClosed(snap.exists() ? snap.data().registrationsClosed !== false : true);
      } catch (error) {
        console.error('Erro ao carregar modo de manutencao:', error);
        setRegistrationsClosed(true);
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

  if (loadingSetting) return null;
  if (!registrationsClosed) return <PublicForm />;
  if (bypassClosedScreen) return <PublicForm />;

  return (
    <main className="closed-site-page">
      <section className="closed-site-content">
        <img src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png" alt="MCU Night Run" className="closed-site-logo" />
        <div className="closed-site-icon">
          <CalendarClock size={34} />
        </div>
        <h1>Inscrições abertas em breve!</h1>
        <a className="closed-site-regulation-link" href="/regulamento">
          <ClipboardList size={18} />
          Ver regulamento
        </a>
      </section>
    </main>
  );
}
