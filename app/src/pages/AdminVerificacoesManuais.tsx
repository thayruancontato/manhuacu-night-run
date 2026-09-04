import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Clock, MessageCircleQuestion, Phone, Send, Trash2, XCircle } from 'lucide-react';
import { db } from '../firebase';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { formatDateTimeBR } from '../utils/dateUtils';
import { useDialog } from '../context/CustomDialogContext';

type VerificationRequest = {
  id: string;
  telefone: string;
  telefoneDigits: string;
  status: 'pendente' | 'resolvido';
  whatsappEnviado?: boolean;
  whatsappErro?: string | null;
  createdAt?: any;
};

export default function AdminVerificacoesManuais() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { showAlert, showConfirm } = useDialog();

  const load = async () => {
    try {
      setLoading(true);
      const snap = await getDocs(query(collection(db, 'nightrun_verification_requests'), orderBy('createdAt', 'desc')));
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as VerificationRequest)));
    } catch (e) {
      console.error('Erro ao carregar solicitações de verificação:', e);
      showAlert('Erro ao carregar solicitações.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const marcarResolvido = async (req: VerificationRequest) => {
    try {
      await updateDoc(doc(db, 'nightrun_verification_requests', req.id), { status: 'resolvido' });
      setRequests(prev => prev.map(item => item.id === req.id ? { ...item, status: 'resolvido' } : item));
    } catch (e) {
      console.error(e);
      showAlert('Erro ao atualizar solicitação.', 'error');
    }
  };

  const excluir = (req: VerificationRequest) => {
    showConfirm(`Excluir a solicitação de ${req.telefone}?`, async () => {
      try {
        await deleteDoc(doc(db, 'nightrun_verification_requests', req.id));
        setRequests(prev => prev.filter(item => item.id !== req.id));
      } catch (e) {
        console.error(e);
        showAlert('Erro ao excluir solicitação.', 'error');
      }
    });
  };

  const abrirWhatsApp = (telefoneDigits: string) => {
    const clean = telefoneDigits.startsWith('55') ? telefoneDigits : `55${telefoneDigits}`;
    window.open(`https://wa.me/${clean}`, '_blank', 'noopener,noreferrer');
  };

  const pendentes = requests.filter(r => r.status !== 'resolvido');
  const resolvidos = requests.filter(r => r.status === 'resolvido');

  return (
    <PageContainer>
      <PageTitle
        title="VERIFICAÇÕES MANUAIS"
        subtitle="Pedidos de quem se inscreveu mas não se encontrou na lista de confirmados"
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando...</div>
      ) : requests.length === 0 ? (
        <div className="data-card" style={{ padding: 40, textAlign: 'center' }}>
          <MessageCircleQuestion size={34} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
          <strong style={{ color: '#071A45' }}>Nenhuma solicitação ainda</strong>
        </div>
      ) : (
        <>
          {pendentes.length > 0 && (
            <>
              <h3 style={{ color: '#071A45', fontSize: '.85rem', textTransform: 'uppercase', margin: '10px 0' }}>
                Pendentes ({pendentes.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {pendentes.map(req => (
                  <div key={req.id} className="data-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(202,138,4,0.1)', color: '#ca8a04', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Clock size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <strong style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#071A45' }}>
                        <Phone size={14} /> {req.telefone}
                      </strong>
                      <span style={{ display: 'block', fontSize: '.75rem', color: '#64748b', marginTop: 2 }}>
                        {formatDateTimeBR(req.createdAt, '')}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.72rem', fontWeight: 700, marginTop: 4, color: req.whatsappEnviado ? '#16a34a' : '#dc2626' }}>
                        {req.whatsappEnviado ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {req.whatsappEnviado ? 'WhatsApp enviado' : `WhatsApp não enviado${req.whatsappErro ? ` (${req.whatsappErro})` : ''}`}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-outline" onClick={() => abrirWhatsApp(req.telefoneDigits)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem' }}>
                        <Send size={14} /> WhatsApp
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => marcarResolvido(req)} style={{ fontSize: '.78rem' }}>
                        Marcar resolvido
                      </button>
                      <button type="button" onClick={() => excluir(req)} title="Excluir" style={{ border: 'none', background: '#fee2e2', color: '#dc2626', width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {resolvidos.length > 0 && (
            <>
              <h3 style={{ color: '#071A45', fontSize: '.85rem', textTransform: 'uppercase', margin: '10px 0' }}>
                Resolvidos ({resolvidos.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {resolvidos.map(req => (
                  <div key={req.id} className="data-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 14, opacity: 0.6 }}>
                    <CheckCircle2 size={18} color="#16a34a" />
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: '#071A45' }}>{req.telefone}</strong>
                      <span style={{ display: 'block', fontSize: '.72rem', color: '#64748b' }}>{formatDateTimeBR(req.createdAt, '')}</span>
                    </div>
                    <button type="button" onClick={() => excluir(req)} title="Excluir" style={{ border: 'none', background: '#fee2e2', color: '#dc2626', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}
