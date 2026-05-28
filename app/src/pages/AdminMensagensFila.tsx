import { useState, useEffect } from 'react';
import { Pause, Play, Trash2, RefreshCw } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { useDialog } from '../context/CustomDialogContext';
import { formatDateTimeBR } from '../utils/dateUtils';

export default function AdminMensagensFila() {
  const [items, setItems] = useState<any[]>([]);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const { showAlert, showConfirm } = useDialog();
  const workerUrl = import.meta.env.VITE_WORKER_URL;

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${workerUrl}/queue/list`);
      const d = await r.json();
      setItems(d.items || []);
      setPaused(d.paused || false);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);

  const togglePause = async () => {
    await fetch(`${workerUrl}/queue/toggle-pause`, { method: 'POST' });
    load();
  };

  const processNow = async () => {
    await fetch(`${workerUrl}/queue/process`, { method: 'POST' });
    showAlert('Processamento disparado!', 'success');
    setTimeout(load, 3000);
  };

  const clearQueue = () => {
    showConfirm('Limpar toda a fila', async () => {
      await fetch(`${workerUrl}/queue/clear`, { method: 'POST' });
      showAlert('Fila limpa!', 'success');
      load();
    });
  };

  return (
    <PageContainer>
      <PageTitle title="FILA DE MENSAGENS" subtitle="Gerenciamento da fila de envio WhatsApp" />
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className={`btn ${paused ? 'btn-primary' : 'btn-outline'}`} onClick={togglePause}>
          {paused ? <><Play size={16} /> Retomar</> : <><Pause size={16} /> Pausar</>}
        </button>
        <button className="btn btn-secondary" onClick={processNow}><RefreshCw size={16} /> Processar Agora</button>
        <button className="btn btn-danger" onClick={clearQueue}><Trash2 size={16} /> Limpar Fila</button>
        <button className="btn btn-outline" onClick={load}><RefreshCw size={16} /> Atualizar</button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: paused ? '#e74c3c' : '#27ae60' }} />
          <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{paused ? 'Pausada' : 'Ativa'} — {items.length} na fila</span>
        </span>
      </div>
      <div className="data-card">
        <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Telefone</th><th>Mensagem</th><th>Tipo</th><th>Enfileirado em</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 30 }}>Carregando...</td></tr> :
                items.length === 0 ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Fila vazia</td></tr> :
                items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'monospace' }}>{item.phone}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text.substring(0, 80)}...</td>
                    <td><span className={`badge ${item.imageUrl ? 'badge-info' : 'badge-primary'}`}>{item.imageUrl ? 'Mídia' : 'Texto'}</span></td>
                    <td style={{ fontSize: '.8rem', color: '#999' }}>{item.enqueuedAt ? formatDateTimeBR(item.enqueuedAt) : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
