import { useState, useEffect } from 'react';
import { MessageSquare, Send, RefreshCcw, Trash2, List, Database, Download, Upload, FileJson, Package } from 'lucide-react';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { useDialog } from '../context/CustomDialogContext';
import LoadingModal from '../components/LoadingModal';
import { formatDateTimeBR } from '../utils/dateUtils';
import '../App.css';

export default function AdminDev() {
  const [phone, setPhone] = useState('55');
  const [message, setMessage] = useState('Mensagem de teste MCU Night Run');
  const [loading, setLoading] = useState(false);
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const { showAlert } = useDialog();
  const workerUrl = import.meta.env.VITE_WORKER_URL;

  const checkStatus = async () => {
    try {
      const res = await fetch(`${workerUrl}/whatsapp/status`);
      const data = await res.json();
      setStatus({ ...data, httpStatus: res.status });
      if (data.instance.state === 'open') setQrCode(null);
    } catch (e) { console.error('Error checking status', e); }
  };

  const initInstance = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${workerUrl}/whatsapp/create`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showAlert('Instância inicializada! Gerando QR...', 'success');
        setTimeout(connectInstance, 2000);
      } else {
        showAlert('Erro: ' + (data.message || 'Falha ao criar'), 'error');
      }
    } catch (e) { showAlert('Erro de conexão', 'error'); }
    finally { setLoading(false); }
  };

  const connectInstance = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${workerUrl}/whatsapp/connect`);
      const data = await res.json();
      if (data.base64) setQrCode(data.base64);
      else showAlert('Instância já conectada ou erro ao gerar QR', 'info');
    } catch (e) { showAlert('Erro ao conectar', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    checkStatus();
    const timer = setInterval(checkStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  const sendDirect = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${workerUrl}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, text: message })
      });
      const data = await res.json();
      if (data.success) showAlert('Mensagem enviada!', 'success');
      else showAlert('Erro: ' + JSON.stringify(data.response), 'error');
    } catch (e) { showAlert('Erro de conexão', 'error'); }
    finally { setLoading(false); }
  };

  const enqueue = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${workerUrl}/queue/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ phone, text: message }] })
      });
      if (res.ok) showAlert('Adicionado à fila!', 'success');
    } catch (e) { showAlert('Erro de conexão', 'error'); }
    finally { setLoading(false); }
  };

  const listQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${workerUrl}/queue/list`);
      const data = await res.json();
      setQueueItems(data.items || []);
    } catch (e) { showAlert('Erro ao listar fila', 'error'); }
    finally { setLoading(false); }
  };

  const processQueue = async () => {
    setLoading(true);
    try {
      await fetch(`${workerUrl}/queue/process`, { method: 'POST' });
      showAlert('Processamento iniciado!', 'success');
      setTimeout(listQueue, 2000);
    } catch (e) { showAlert('Erro ao processar', 'error'); }
    finally { setLoading(false); }
  };

  const clearQueue = async () => {
    if (!confirm('Limpar toda a fila')) return;
    setLoading(true);
    try {
      await fetch(`${workerUrl}/queue/clear`, { method: 'POST' });
      showAlert('Fila limpa!', 'success');
      setQueueItems([]);
    } catch (e) { showAlert('Erro ao limpar', 'error'); }
    finally { setLoading(false); }
  };

  const exportDB = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'nightrun_registrations'));
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mcu_registrations_export_${new Date().toISOString().split('T')[0]}.json`;
      a?.click();
      showAlert('Base exportada com sucesso!', 'success');
    } catch (e) { showAlert('Erro ao exportar base', 'error'); }
    finally { setLoading(false); }
  };

  const importDB = async (file: File) => {
    setLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Formato inválido');
      
      const batch = writeBatch(db);
      data.forEach(item => {
        const { id, ...rest } = item;
        const ref = id ? doc(db, 'nightrun_registrations', id) : doc(collection(db, 'nightrun_registrations'));
        batch.set(ref, { ...rest, updatedAt: serverTimestamp() });
      });
      
      await batch.commit();
      showAlert(`${data.length} registros importados com sucesso!`, 'success');
    } catch (e: any) { showAlert('Erro na importação: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  const injectMock = async () => {
    setLoading(true);
    try {
      const { default: mockRegistrations } = await import('../mock_registrations.json');
      if (!confirm(`Deseja injetar ${mockRegistrations.length} registros fictícios no banco Isso pode custar muitas leituras/escritas.`)) return;
      
      // Firebase writeBatch limit is 500
      const batch = writeBatch(db);
      mockRegistrations.forEach((item: any) => {
        const ref = doc(collection(db, 'nightrun_registrations'));
        batch.set(ref, { 
          ...item, 
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      showAlert('Injeção de mock concluída!', 'success');
    } catch (e) { 
      console.error(e);
      showAlert('Erro ao injetar mock', 'error'); 
    }
    finally { setLoading(false); }
  };

  return (
    <div className="admin-container" style={{ padding: '20px' }}>
      <header className="admin-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <MessageSquare size={32} color="var(--accent)" />
            <h1 className="admin-title">WhatsApp Dev Area</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '8px 15px', borderRadius: '20px' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: status.instance.state === 'open' ? '#44ff44' : '#ff4444' }} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{status.instance.state === 'open' ? 'CONECTADO' : 'DESCONECTADO'}</span>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', margin: '20px 0' }}>
        
        {/* Database Tools */}
        <div className="admin-card" style={{ margin: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 15 }}>
            <Database size={24} color="var(--accent)" />
            <h3 className="section-title" style={{ margin: 0 }}>Base de Dados</h3>
          </div>
          <p style={{ opacity: 0.6, fontSize: '0.8rem', marginBottom: 20 }}>Gerencie o backup e restauração das inscrições.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={exportDB} className="btn-nav" style={{ width: '100%', gap: 10, justifyContent: 'center' }}>
              <Download size={18} /> Exportar Base (JSON)
            </button>
            
            <label className="btn-nav" style={{ width: '100%', gap: 10, justifyContent: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.05)' }}>
              <Upload size={18} /> Importar Base
              <input type="file" accept=".json" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && importDB(e.target.files[0])} />
            </label>

            <button onClick={injectMock} className="btn-nav btn-next" style={{ width: '100%', gap: 10, justifyContent: 'center' }}>
              <FileJson size={18} /> Injetar 500 Mocks
            </button>

            <button 
              onClick={async () => {
                if (!confirm('Isso irá criar os itens iniciais de kits e camisetas. Deseja continuar')) return;
                setLoading(true);
                try {
                  const { seedKitsAndShirts } = await import('../utils/seedData');
                  await seedKitsAndShirts();
                  showAlert('Kits e Camisetas sincronizados!', 'success');
                } catch (e) {
                  showAlert('Erro ao sincronizar dados', 'error');
                } finally {
                  setLoading(false);
                }
              }} 
              className="btn-nav" 
              style={{ width: '100%', gap: 10, justifyContent: 'center', background: 'rgba(107,255,42,0.1)', color: 'var(--accent)' }}
            >
              <Package size={18} /> Sincronizar Kits & Camisetas
            </button>
          </div>
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 className="section-title">Status da Instância</h3>
          <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: 20 }}>
            Para enviar mensagens, sua conta do WhatsApp deve estar pareada com a instância <strong>mcu_nightrun_uba</strong>.
          </p>
          
          {status.httpStatus === 404 ? (
            <div style={{ background: 'rgba(255,165,0,0.1)', padding: '15px', borderRadius: '12px', border: '1px solid orange', marginBottom: 20 }}>
              <p style={{ color: 'orange', fontWeight: 700, margin: 0, fontSize: '0.85rem' }}>Instância Não Encontrada</p>
              <p style={{ fontSize: '0.75rem', margin: '5px 0 15px 0', opacity: 0.8 }}>A instância <strong>mcu_nightrun_uba</strong> ainda não foi criada no servidor Evolution API.</p>
              <button onClick={initInstance} className="btn-nav" style={{ width: '100%', background: 'orange', color: '#000' }}>
                Inicializar Instância
              </button>
            </div>
          ) : status.instance.state !== 'open' && (
            <button onClick={connectInstance} className="btn-nav btn-next" style={{ width: '100%' }}>
              Conectar WhatsApp
            </button>
          )}

          {qrCode && (
            <div style={{ marginTop: 20, textAlign: 'center', background: '#fff', padding: 20, borderRadius: '16px' }}>
              <p style={{ color: '#000', fontWeight: 700, marginBottom: 15, fontSize: '0.9rem' }}>Escanear com seu WhatsApp</p>
              <img src={qrCode} alt="QR Code" style={{ width: '100%', maxWidth: '200px' }} />
            </div>
          )}
        </div>

        <div className="admin-card" style={{ margin: 0 }}>
          <h3 className="section-title">Teste de Envio</h3>
          <div className="form-group">
            <label>Telefone (com DDD)</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="55..." />
          </div>
          <div className="form-group">
            <label>Mensagem</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={sendDirect} className="btn-nav btn-next" style={{ flex: 1 }}>
              <Send size={18} style={{ marginRight: 8 }} />
              Enviar Direto
            </button>
            <button onClick={enqueue} className="btn-nav" style={{ flex: 1, background: 'rgba(107,255,42,0.1)', color: 'var(--accent)' }}>
              <RefreshCcw size={18} style={{ marginRight: 8 }} />
              Enfileirar
            </button>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Fila de Mensagens</h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={listQueue} className="btn-nav" style={{ padding: '8px 15px' }}><List size={16} /></button>
            <button onClick={processQueue} className="btn-nav btn-next" style={{ padding: '8px 15px' }}>Processar Agora</button>
            <button onClick={clearQueue} className="btn-nav" style={{ padding: '8px 15px', background: 'rgba(255,0,0,0.1)', color: '#ff4444' }}><Trash2 size={16} /></button>
          </div>
        </div>

        {queueItems.length === 0 ? (
          <p style={{ opacity: 0.5 }}>Nenhuma mensagem pendente na fila.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {queueItems.map((item, idx) => (
              <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <strong>{item.phone}</strong>
                  <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{formatDateTimeBR(item.enqueuedAt)}</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.8 }}>{item.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <LoadingModal isOpen={loading} />
    </div>
  );
}
