import { useState } from 'react';
import { Send, UserPlus } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { useDialog } from '../context/CustomDialogContext';

export default function AdminMensagensPersonalizadas() {
  const [phone, setPhone] = useState('');
  const [msg, setMsg] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const { showAlert } = useDialog();

  const handleSend = async () => {
    if (!phone || !msg) return showAlert('Preencha telefone e mensagem.', 'warning');
    setSending(true);
    try {
      let p = phone.replace(/\D/g, '');
      if (!p.startsWith('55')) p = '55' + p;
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      await fetch(`${workerUrl}/hub/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: p, text: msg, imageUrl: imageUrl || undefined })
      });
      showAlert('Mensagem enfileirada!', 'success');
      setMsg('');
    } catch (e: any) { showAlert('Erro: ' + e.message, 'error'); }
    finally { setSending(false); }
  };

  return (
    <PageContainer>
      <PageTitle title="MENSAGEM PERSONALIZADA" subtitle="Envie uma mensagem para um número específico ou grupo" />
      <div className="data-card" style={{ padding: 24 }}>
        <div className="form-group">
          <label>Número de telefone (com DDD)</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="5533999999999" style={{ padding: 14, borderRadius: 10, border: '2px solid #eee' }} />
        </div>
        <div className="form-group">
          <label>Mensagem</label>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5} placeholder="Digite sua mensagem aqui..." style={{ padding: 14, borderRadius: 10, border: '2px solid #eee', resize: 'vertical' }} />
        </div>
        <div className="form-group">
          <label>URL da Imagem (opcional)</label>
          <input type="text" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." style={{ padding: 14, borderRadius: 10, border: '2px solid #eee' }} />
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleSend} disabled={sending} style={{ width: '100%' }}>
          <Send size={18} /> {sending ? 'Enviando...' : 'Enviar Mensagem'}
        </button>
      </div>
    </PageContainer>
  );
}
