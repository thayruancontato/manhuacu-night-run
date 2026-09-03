import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  Send, Users, MessageSquare, Search, Settings, 
  RefreshCcw, Trash2, List, Smartphone, Save,
  CheckCircle2, XCircle, AlertCircle, Play
} from 'lucide-react';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { useDialog } from '../context/CustomDialogContext';
import { Tabs, FormHeader, FormSwitch, FormField, FormLabel, FormInput, FormGrid, FormTextarea } from '../components/AdminForm';
import LoadingModal from '../components/LoadingModal';
import { formatDateTimeBR } from '../utils/dateUtils';
import '../App.css';

export default function AdminMensagens() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'campanha';
  const setActiveTab = (tab: string) => {
    setSearchParams(tab === 'campanha' ? {} : { tab }, { replace: false });
  };
  const [loading, setLoading] = useState(true);
  const { showAlert, showConfirm } = useDialog();
  const workerUrl = import.meta.env.VITE_WORKER_URL;

  // --- TAB: CAMPANHA (DISPAROS) ---
  const [regs, setRegs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ c: 0, t: 0 });
  const [batchPaymentStatus, setBatchPaymentStatus] = useState<'pago' | 'pendente'>('pendente');

  // --- TAB: CONEXAO ---
  const [status, setStatus] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrWatcherActive, setQrWatcherActive] = useState(false);
  const [lastQrRefreshAt, setLastQrRefreshAt] = useState<number | null>(null);
  const isConnected = status.instance.state === 'open';

  // --- TAB: FILA ---
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [testPhone, setTestPhone] = useState('55');
  const [testMessage, setTestMessage] = useState('Mensagem de teste MCU Night Run');

  // --- TAB: AUTOMACAO (CONFIG) ---
  const [config, setConfig] = useState<any>({ 
    evolutionUrl: 'https://evolution-api-im3d.onrender.com', 
    instanceName: 'mcu_nightrun_uba', 
    apiKey: '', 
    testPhone: '', 
    finAutoBeforeEnabled: false, 
    finAutoBeforeDays: 3, 
    finAutoOnDayEnabled: false, 
    finAutoAfterEnabled: false, 
    finAutoAfterDays: 5, 
    finAutoSendTime: '09:00' 
  });

  useEffect(() => {
    loadAll();
    const timer = setInterval(checkWhatsAppStatus, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!qrWatcherActive || isConnected || !workerUrl) return;
    const checkTimer = window.setInterval(checkWhatsAppStatus, 3000);
    const renewTimer = window.setInterval(() => {
      requestQrCode({ silent: true, keepWatcher: true }).catch(e => console.error('[WhatsApp] QR auto renew failed', e));
    }, 45000);
    return () => {
      window.clearInterval(checkTimer);
      window.clearInterval(renewTimer);
    };
  }, [qrWatcherActive, isConnected, workerUrl]);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Load Registrations
      const q = query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setRegs(snap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Load Settings
      const d = await getDoc(doc(db, 'system_settings', 'nightrun_whatsapp'));
      if (d.exists()) setConfig((p: any) => ({ ...p, ...d.data() }));

      // Load WhatsApp Status
      await checkWhatsAppStatus();
      
      // Load Queue
      await listQueue();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const checkWhatsAppStatus = async () => {
    try {
      const res = await fetch(`${workerUrl}/whatsapp/status`);
      const data = await res.json();
      setStatus({ ...data, httpStatus: res.status });
      if (data.instance.state === 'open') {
        setQrCode(null);
        setQrWatcherActive(false);
      }
    } catch (e) { console.error('Error checking status', e); }
  };

  // --- HANDLERS: CAMPANHA ---
  const filtered = regs.filter(r => !search || r.nome.toLowerCase().includes(search.toLowerCase()) || r.telefone.includes(search));
  const batchRecipients = regs.filter(r => r.paymentStatus === batchPaymentStatus && r.telefone);

  const normalizePhone = (phone: string) => {
    let normalized = phone.replace(/\D/g, '') || '';
    if (normalized && !normalized.startsWith('55')) normalized = '55' + normalized;
    return normalized;
  };

  const buildMessages = (items: any[]) => items
    .map(r => {
      const phone = normalizePhone(r.telefone);
      const personalMsg = msg.replace('{nome}', r.nome.split(' ')[0] || 'Atleta').replace('{categoria}', r.categoria.toUpperCase() || '');
      return { phone, text: personalMsg, imageUrl: imageUrl || undefined, alunoNome: r.nome };
    })
    .filter(message => message.phone);
  
  const toggleAll = () => {
    const ids = filtered.map(r => r.id);
    const allSel = ids.every(id => selected.has(id));
    const s = new Set(selected);
    ids.forEach(id => allSel ? s.delete(id) : s.add(id));
    setSelected(s);
  };

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const handleSendBatch = () => {
    if (selected.size === 0) return showAlert('Selecione ao menos um destinatário.', 'warning');
    if (!msg.trim()) return showAlert('Digite uma mensagem.', 'warning');

    showConfirm(`Enviar mensagem para ${selected.size} pessoa(s)`, async () => {
      setSending(true);
      const items = regs.filter(r => selected.has(r.id));
      const messages = buildMessages(items);

      try {
        setProgress({ c: 0, t: messages.length });
        const res = await fetch(`${workerUrl}/queue/enqueue`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages })
        });
        if (!res.ok) throw new Error('Falha ao enfileirar mensagens.');
        setProgress({ c: messages.length, t: messages.length });
        showAlert(`${messages.length} mensagens enfileiradas com sucesso!`, 'success');
        setMsg(''); setImageUrl(''); setSelected(new Set());
      } catch (e: any) { showAlert('Erro: ' + e.message, 'error'); }
      finally { setSending(false); }
    });
  };

  const handleSendPaymentStatusBatch = () => {
    if (!msg.trim()) return showAlert('Digite uma mensagem.', 'warning');
    const messages = buildMessages(batchRecipients);
    if (messages.length === 0) return showAlert('Nenhum destinatário encontrado para esse tipo.', 'warning');

    const label = batchPaymentStatus === 'pago' ? 'pagos' : 'pendentes';
    showConfirm(`Enviar mensagem para ${messages.length} atleta(s) ${label}`, async () => {
      setSending(true);
      try {
        setProgress({ c: 0, t: messages.length });
        const res = await fetch(`${workerUrl}/queue/enqueue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages })
        });
        if (!res.ok) throw new Error('Falha ao enfileirar mensagens.');
        setProgress({ c: messages.length, t: messages.length });
        showAlert(`${messages.length} mensagens para ${label} foram enfileiradas!`, 'success');
        setMsg('');
        setImageUrl('');
      } catch (e: any) {
        showAlert('Erro: ' + e.message, 'error');
      } finally {
        setSending(false);
      }
    });
  };

  // --- HANDLERS: CONEXAO ---
  const initInstance = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${workerUrl}/whatsapp/create`, { method: 'POST' });
      if (res.ok) {
        showAlert('Instância inicializada! Gerando QR...', 'success');
        setTimeout(() => requestQrCode({ keepWatcher: true }), 2000);
      } else {
        const data = await res.json();
        showAlert('Erro: ' + (data.message || 'Falha ao criar'), 'error');
      }
    } catch (e) { showAlert('Erro de conexão', 'error'); }
    finally { setLoading(false); }
  };

  const requestQrCode = async (options: { silent?: boolean; keepWatcher?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const res = await fetch(`${workerUrl}/whatsapp/connect`);
      const data = await res.json();
      if (data.base64) {
        setQrCode(data.base64);
        setQrWatcherActive(options.keepWatcher ?? true);
        setLastQrRefreshAt(Date.now());
        if (!options.silent) showAlert('QR Code gerado. Vou monitorar ate conectar ou renovar automaticamente.', 'success');
      } else if (!options.silent) {
        showAlert('Instância já conectada ou erro ao gerar QR', 'info');
      }
      await checkWhatsAppStatus();
    } catch (e) {
      if (!options.silent) showAlert('Erro ao conectar', 'error');
    }
    finally { if (!options.silent) setLoading(false); }
  };

  const connectInstance = () => requestQrCode({ keepWatcher: true });

  // --- HANDLERS: FILA ---
  const listQueue = async () => {
    try {
      const res = await fetch(`${workerUrl}/queue/list`);
      const data = await res.json();
      setQueueItems(data.items || []);
    } catch (e) { console.error('Error listing queue', e); }
  };

  const sendTest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${workerUrl}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: testPhone, text: testMessage })
      });
      const data = await res.json();
      if (data.success) showAlert('Mensagem de teste enviada!', 'success');
      else showAlert('Erro: ' + JSON.stringify(data.response), 'error');
    } catch (e) { showAlert('Erro de conexão', 'error'); }
    finally { setLoading(false); }
  };

  const processQueue = async () => {
    setLoading(true);
    try {
      await fetch(`${workerUrl}/queue/process`, { method: 'POST' });
      showAlert('Processamento da fila iniciado!', 'success');
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

  // --- HANDLERS: AUTOMACAO ---
  const handleSaveConfig = async () => {
    setLoading(true);
    try {
      await setDoc(doc(db, 'system_settings', 'nightrun_whatsapp'), config, { merge: true });
      showAlert('Configurações de automação salvas!', 'success');
    } catch (e: any) { showAlert('Erro: ' + e.message, 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Central WhatsApp</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Gerencie conexões, disparos em massa e automações financeiras.</p>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 20px', overflowX: 'auto', background: '#f8fafc' }}>
          {[
            { id: 'campanha', label: 'CAMPANHA', icon: <Users size={18} /> },
            { id: 'conexao', label: 'CONEXÃO', icon: <Smartphone size={18} /> },
            { id: 'fila', label: 'FILA & TESTES', icon: <List size={18} /> },
            { id: 'automacao', label: 'AUTOMAÇÕES', icon: <Settings size={18} /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'transparent', border: 'none',
                padding: '18px 24px',
                color: activeTab === tab.id ? '#071A45' : '#94a3b8',
                fontWeight: 800, fontSize: '0.8rem',
                borderBottom: activeTab === tab.id ? '3px solid #6BFF2A' : '3px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '32px' }}>
          {activeTab === 'campanha' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 30 }}>
                {/* Composition Card */}
                <div style={{ background: '#f8fafc', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0' }}>
                   <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                     <MessageSquare size={20} color="#071A45" /> Compor Mensagem
                   </h3>
                   <textarea 
                      value={msg} 
                      onChange={e => setMsg(e.target.value)} 
                      rows={4} 
                      placeholder="Olá {nome}! Sua inscrição na categoria {categoria} está confirmada..." 
                      style={{ width: '100%', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', marginBottom: 20 }} 
                   />
                   <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <input 
                        type="text" 
                        value={imageUrl} 
                        onChange={e => setImageUrl(e.target.value)} 
                        placeholder="URL da imagem (opcional)" 
                        style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.9rem' }} 
                      />
                      <button 
                        onClick={handleSendBatch} 
                        disabled={sending || !isConnected}
                        style={{ 
                          background: '#071A45', color: '#fff', border: 'none', padding: '12px 24px', 
                          borderRadius: 10, fontWeight: 800, cursor: 'pointer', opacity: isConnected ? 1 : 0.5 
                        }}
                      >
                        {sending ? 'Enviando...' : `Disparar para ${selected.size} selecionados`}
                      </button>
                   </div>
                   {!isConnected && (
                     <p style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, marginTop: 12 }}>⚠️ WhatsApp desconectado. Conecte-o na aba "Conexão".</p>
                   )}
                </div>

                <div style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0' }}>
                   <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                     <Send size={20} color="#071A45" /> Envio em lote
                   </h3>
                   <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
                     Escolha quem deve receber a mensagem composta acima.
                   </p>
                   <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr auto', gap: 12, alignItems: 'end' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Tipo de destinatário</label>
                        <select
                          value={batchPaymentStatus}
                          onChange={e => setBatchPaymentStatus(e.target.value as 'pago' | 'pendente')}
                          style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', fontWeight: 800, color: '#071A45', background: '#fff' }}
                        >
                          <option value="pendente">Pendentes</option>
                          <option value="pago">Pagos</option>
                        </select>
                      </div>
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Encontrados</div>
                        <strong style={{ fontSize: '1rem', color: '#071A45' }}>{batchRecipients.length} atleta(s)</strong>
                      </div>
                      <button
                        onClick={handleSendPaymentStatusBatch}
                        disabled={sending || !isConnected}
                        style={{
                          background: '#6BFF2A',
                          color: '#071A45',
                          border: 'none',
                          padding: '13px 22px',
                          borderRadius: 12,
                          fontWeight: 900,
                          cursor: 'pointer',
                          opacity: isConnected ? 1 : 0.5,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {sending ? 'Enfileirando...' : 'Enviar lote'}
                      </button>
                   </div>
                </div>

                {/* Recipients Table */}
                <div>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 15 }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45' }}>Destinatários ({filtered.length})</h3>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                         <div style={{ position: 'relative' }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            <input 
                              value={search} 
                              onChange={e => setSearch(e.target.value)} 
                              placeholder="Buscar..." 
                              style={{ padding: '10px 12px 10px 36px', borderRadius: 10, border: '1px solid #e2e8f0', outline: 'none', fontSize: '0.85rem', width: 200 }} 
                            />
                         </div>
                         <button 
                           onClick={toggleAll}
                           style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '10px 16px', borderRadius: 10, fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer' }}
                         >
                           {filtered.every(r => selected.has(r.id)) ? 'DESMARCAR TODOS' : 'MARCAR TODOS'}
                         </button>
                      </div>
                   </div>

                   <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '16px 20px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>NOME</th>
                            <th style={{ padding: '16px 20px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>TELEFONE</th>
                            <th style={{ padding: '16px 20px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b' }}>STATUS</th>
                            <th style={{ padding: '16px 20px', width: 40 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map(r => (
                            <tr 
                              key={r.id} 
                              onClick={() => toggle(r.id)}
                              style={{ 
                                borderBottom: '1px solid #f1f5f9', cursor: 'pointer', 
                                background: selected.has(r.id) ? '#f8fafc' : 'transparent',
                                transition: 'all 0.2s'
                              }}
                            >
                              <td style={{ padding: '16px 20px', fontSize: '0.9rem', fontWeight: 700, color: '#071A45' }}>{r.nome}</td>
                              <td style={{ padding: '16px 20px', fontSize: '0.9rem', color: '#64748b', fontFamily: 'monospace' }}>{r.telefone}</td>
                              <td style={{ padding: '16px 20px' }}>
                                <span style={{ 
                                  padding: '4px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800,
                                  background: r.paymentStatus === 'pago' ? '#dcfce7' : '#fee2e2',
                                  color: r.paymentStatus === 'pago' ? '#166534' : '#ef4444'
                                }}>
                                  {r.paymentStatus === 'pago' ? 'PAGO' : 'PENDENTE'}
                                </span>
                              </td>
                              <td style={{ padding: '16px 20px' }}>
                                <div style={{ 
                                  width: 20, height: 20, borderRadius: 6, border: '2px solid #cbd5e1',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: selected.has(r.id) ? '#6BFF2A' : 'transparent',
                                  borderColor: selected.has(r.id) ? '#6BFF2A' : '#cbd5e1'
                                }}>
                                  {selected.has(r.id) && <CheckCircle2 size={14} color="#071A45" />}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                   </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'conexao' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
                <div style={{ background: '#fff', padding: 32, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                   <div style={{ 
                     width: 80, height: 80, borderRadius: '50%', 
                     background: isConnected ? '#dcfce7' : '#fee2e2',
                     display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24
                   }}>
                     {isConnected ? <CheckCircle2 size={40} color="#166534" /> : <XCircle size={40} color="#ef4444" />}
                   </div>
                   <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: isConnected ? '#166534' : '#ef4444', marginBottom: 8 }}>
                     {isConnected ? 'SISTEMA CONECTADO' : 'SISTEMA DESCONECTADO'}
                   </h3>
                   <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: 280 }}>
                     {isConnected
                        ? `A inst?ncia ${config.instanceName} est? ativa e pronta para realizar disparos.`
                        : 'Escaneie o QR Code ou inicialize a instncia para comear a enviar mensagens.'}
                   </p>
                </div>

                <div style={{ background: '#fff', padding: 32, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                   {qrCode ? (
                     <div style={{ textAlign: 'center' }}>
                        <div style={{ background: '#fff', padding: 12, borderRadius: 16, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                           <img src={qrCode} alt="QR Code" style={{ width: 200, height: 200 }} />
                        </div>
                        <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#071A45' }}>Acesse WhatsApp &gt; Aparelhos Conectados</p>
                        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#15803d', marginTop: 8 }}>
                          Monitorando leitura e renovando automaticamente.
                          {lastQrRefreshAt ? ` Ultima geracao: ${formatDateTimeBR(lastQrRefreshAt)}` : ''}
                        </p>
                     </div>
                   ) : (
                     <div style={{ width: '100%' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45', marginBottom: 24 }}>Ações de Controle</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                           {status.httpStatus === 404 ? (
                             <button onClick={initInstance} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '14px', borderRadius: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                               <RefreshCcw size={18} /> INICIALIZAR INSTÂNCIA
                             </button>
                           ) : (
                             <button onClick={connectInstance} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '14px', borderRadius: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                               <Smartphone size={18} /> GERAR QR CODE
                             </button>
                           )}
                           <button onClick={checkWhatsAppStatus} style={{ background: '#f1f5f9', color: '#475569', border: 'none', padding: '14px', borderRadius: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                             <RefreshCcw size={18} /> ATUALIZAR STATUS
                           </button>
                        </div>
                     </div>
                   )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fila' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
                {/* Test Card */}
                <div style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0' }}>
                   <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45', marginBottom: 24 }}>Teste de Envio Direto</h3>
                   <div style={{ marginBottom: 20 }}>
                     <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>TELEFONE (DDD)</label>
                     <input 
                       value={testPhone} 
                       onChange={e => setTestPhone(e.target.value)} 
                       placeholder="55..." 
                       style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none' }}
                     />
                   </div>
                   <div style={{ marginBottom: 24 }}>
                     <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>MENSAGEM</label>
                     <textarea 
                        value={testMessage} 
                        onChange={e => setTestMessage(e.target.value)} 
                        rows={3}
                        style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', resize: 'none' }}
                     />
                   </div>
                   <button onClick={sendTest} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '14px', borderRadius: 12, fontWeight: 800, width: '100%', cursor: 'pointer' }}>ENVIAR TESTE AGORA</button>
                </div>

                {/* Queue Card */}
                <div style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45' }}>Fila Pendente ({queueItems.length})</h3>
                      <div style={{ display: 'flex', gap: 8 }}>
                         <button onClick={listQueue} style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><RefreshCcw size={14} /></button>
                         <button onClick={clearQueue} style={{ width: 32, height: 32, borderRadius: 8, background: '#fee2e2', border: 'none', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Trash2 size={14} /></button>
                      </div>
                   </div>

                   {queueItems.length === 0 ? (
                     <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                        <CheckCircle2 size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
                        <p style={{ fontWeight: 600 }}>Tudo pronto! Fila vazia.</p>
                     </div>
                   ) : (
                     <div>
                        <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                           {queueItems.map((item, idx) => (
                             <div key={idx} style={{ background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #f1f5f9' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                   <strong style={{ fontSize: '0.8rem', color: '#071A45' }}>{item.phone}</strong>
                                   <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{formatDateTimeBR(item.enqueuedAt)}</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.text}</p>
                             </div>
                           ))}
                        </div>
                        <button onClick={processQueue} style={{ background: '#6BFF2A', color: '#071A45', border: 'none', padding: '14px', borderRadius: 12, fontWeight: 900, width: '100%', cursor: 'pointer' }}>PROCESSAR FILA</button>
                     </div>
                   )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'automacao' && (
            <div style={{ animation: 'fadeIn 0.3s ease', maxWidth: 800 }}>
               <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45', marginBottom: 24 }}>Configurações de Automação</h3>
               
               <div style={{ background: '#fff', padding: 30, borderRadius: 24, border: '1px solid #e2e8f0' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: '#071A45', marginBottom: 20, textTransform: 'uppercase' }}>Parâmetros da API</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                     <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>URL DO SERVIDOR</label>
                        <input value={config.evolutionUrl} onChange={e => setConfig({...config, evolutionUrl: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none' }} />
                     </div>
                     <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>NOME DA INSTÂNCIA</label>
                        <input value={config.instanceName} onChange={e => setConfig({...config, instanceName: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none' }} />
                     </div>
                  </div>
                  <div style={{ marginBottom: 32 }}>
                     <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>API KEY</label>
                     <input type="password" value={config.apiKey} onChange={e => setConfig({...config, apiKey: e.target.value})} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none' }} />
                  </div>

                  <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: '#071A45', marginBottom: 20, textTransform: 'uppercase' }}>Cobranças Automáticas</h4>
                  <div style={{ marginBottom: 24 }}>
                     <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8 }}>HORÁRIO DE ENVIO DIÁRIO</label>
                     <input type="time" value={config.finAutoSendTime} onChange={e => setConfig({...config, finAutoSendTime: e.target.value})} style={{ width: 140, padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', outline: 'none', fontWeight: 800 }} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
                    {[
                      { key: 'finAutoBeforeEnabled', daysKey: 'finAutoBeforeDays', label: 'Lembrete Antecipado', desc: 'Avisa sobre o vencimento próximo.' },
                      { key: 'finAutoOnDayEnabled', label: 'Aviso no Vencimento', desc: 'Cobra no dia exato do vencimento.' },
                      { key: 'finAutoAfterEnabled', daysKey: 'finAutoAfterDays', label: 'Cobrança Atrasada', desc: 'Envia após o vencimento confirmado.' },
                    ].map(item => (
                      <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 20, background: '#f8fafc', borderRadius: 16, border: '1px solid #f1f5f9' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 800, color: '#071A45', marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{item.desc}</div>
                        </div>
                        {item.daysKey && (
                          <div style={{ width: 80 }}>
                            <input 
                              type="number" 
                              value={config[item.daysKey]} 
                              onChange={e => setConfig({...config, [item.daysKey]: parseInt(e.target.value)})} 
                              style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 800 }}
                            />
                          </div>
                        )}
                        <FormSwitch 
                          checked={config[item.key]}
                          onChange={val => setConfig({...config, [item.key]: val})}
                          label=""
                        />
                      </div>
                    ))}
                  </div>

                  <button onClick={handleSaveConfig} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '16px', borderRadius: 12, fontWeight: 800, width: '100%', cursor: 'pointer' }}>SALVAR CONFIGURAÇÕES</button>
               </div>
            </div>
          )}
        </div>
      </div>

      <LoadingModal isOpen={loading} />
    </div>
  );
}

// Sub-components used internally (FormSelect, FormTextarea were already imported)
