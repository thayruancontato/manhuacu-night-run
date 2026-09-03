import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PartyPopper, MessageSquare, Home } from 'lucide-react';
import { CATEGORIAS } from '../types';
import LoadingModal from '../components/LoadingModal';
import WinnerExperience from '../components/WinnerExperience';
import { LogoCombo } from '../components/LogoCombo';
import '../App.css';

export default function SuccessPaymentPage() {
  const { registrationId } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!registrationId) return;
    
    const docRef = doc(db, 'nightrun_registrations', registrationId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setData(docSnap.data());
        setLoading(false);
      } else {
        navigate('/');
      }
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [registrationId]);

  const handleWinnerImageGenerated = async (dataUrl: string) => {
    if (!registrationId || !data.premioSorteio) return;
    
    try {
      // 1. Converter dataUrl para Blob
      const fetchRes = await fetch(dataUrl);
      const blob = await fetchRes.blob();
      
      // 2. Upload para o worker
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      const fd = new FormData();
      fd.append('file', blob, `ganhador_${registrationId}.png`);
      fd.append('folder', 'nightrun_winners');
      
      const uploadRes = await fetch(`${workerUrl}/media/upload`, { method: 'POST', body: fd });
      const uploadData = await uploadRes.json();
      
      if (uploadData.url) {
        // 3. Encontrar o documento do ganhador e atualizar
        const q = query(collection(db, 'nightrun_sorteios_ganhadores'), where('registrationId', '==', registrationId));
        const snap = await getDocs(q);
        
        if (!snap.empty) {
          const winnerDocId = snap.docs[0].id;
          await updateDoc(doc(db, 'nightrun_sorteios_ganhadores', winnerDocId), {
            vitoriaImageUrl: uploadData.url
          });
          console.log('Imagem de vitória salva com sucesso!');
        }
      }
    } catch (err) {
      console.error('Erro ao salvar imagem de vitória:', err);
    }
  };

  if (loading) return <LoadingModal isOpen={true} />;
  if (!data) return null;

  const cat = CATEGORIAS.find(c => c.id === data.categoria);
  const welcomeMessage = encodeURIComponent(`Pagamento realizado!\n\nOlá, equipe de boas-vindas. Minha inscrição na MCU Night Run 2026 foi confirmada.\n\nNome: ${data.nome || ''}\nID da inscrição: ${registrationId || ''}`);
  const welcomeWhatsAppUrl = `https://wa.me/5533998366544?text=${welcomeMessage}`;

  return (
    <div className="public-app-root">
      <div className="bg-glow-trap">
        <div className="bg-glow-top" />
        <div className="bg-glow-bottom" />
      </div>

      <main className="public-main-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh', justifyContent: 'flex-start', alignItems: 'center', padding: '24px 16px max(24px, env(safe-area-inset-bottom))', gap: '20px', width: '100%' }}>
        
        <div className="form-header-minimal" style={{ display: 'flex', justifyContent: 'center', width: '100%', flex: '0 0 auto' }}>
          <LogoCombo style={{ height: '38px' }} variant="light" />
        </div>

        <div className="success-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: 0, margin: 'auto 0' }}>
          <div className="success-card" style={{ padding: '24px 16px', maxWidth: '420px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', gap: '16px', background: 'transparent', border: 'none', boxShadow: 'none' }}>
            <div className="success-icon-wrapper" style={{ background: 'rgba(107,255,42,0.15)', padding: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '8px' }}>
              <PartyPopper size={44} color="#6BFF2A" />
            </div>
            
            <h1 className="success-title" style={{ fontSize: '1.9rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', color: '#fff', letterSpacing: '0.5px' }}>
              Parabéns, {data.nome.split(' ')[0]}!
            </h1>
            
            <p className="success-msg" style={{ margin: 0, color: 'rgba(255,255,255,0.78)', fontSize: '0.92rem', lineHeight: '1.45', maxWidth: '320px' }}>
              Sua inscrição para a <strong>MANHUAÇU Night Run 2026</strong> está confirmada!
            </p>

            <div style={{ width: '100%', padding: '16px', borderRadius: '16px', background: 'rgba(107,255,42,0.10)', border: '1px solid rgba(107,255,42,0.28)', textAlign: 'left' }}>
              <div style={{ color: '#6BFF2A', fontWeight: 900, fontSize: '.82rem', textTransform: 'uppercase', marginBottom: 6 }}>
                Próximo passo
              </div>
              <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '.88rem', lineHeight: 1.45 }}>
                Avise nossa equipe de boas-vindas que seu pagamento foi realizado.
              </p>
            </div>

            <a
              href={welcomeWhatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                borderRadius: '14px',
                background: '#6BFF2A',
                color: '#071A45',
                fontWeight: 900,
                fontSize: '0.9rem',
                textDecoration: 'none',
                gap: '8px',
                textTransform: 'uppercase',
              }}
            >
              <MessageSquare size={18} />
              Falar com boas-vindas
            </a>

            <a 
              href="https://chat.whatsapp.com/LdM79ltwcWpHRdgfSlm8tz"
              target="_blank"
              rel="noopener noreferrer"
              style={{ 
                width: '100%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '16px', 
                borderRadius: '14px', 
                marginTop: '16px',
                background: 'rgba(37, 211, 102, 0.15)',
                border: '1.5px dashed rgba(37, 211, 102, 0.4)',
                color: '#25D366',
                fontWeight: 700,
                fontSize: '0.9rem',
                textDecoration: 'none',
                gap: '8px',
                transition: 'all 0.3s ease',
              }}
            >
              <MessageSquare size={18} />
              Grupo Exclusivo no WhatsApp
            </a>

            <button 
              onClick={() => navigate('/')}
              className="btn-nav btn-next" 
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', borderRadius: '14px', marginTop: '8px' }}
            >
              <Home size={18} style={{ marginRight: 8 }} />
              Voltar ao Início
            </button>

          </div>
        </div>
      </main>
      
      {data.premioSorteio && (
        <WinnerExperience 
          atletaNome={data.nome} 
          premioNome={data.premioSorteio} 
          premioImagem={data.premioImagem} 
          atletaFoto={data.fotoUrl}
          onImageGenerated={handleWinnerImageGenerated}
          isSimulacao={false}
        />
      )}
    </div>
  );
}
