import { useEffect, useState, type ReactNode } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  KeyRound,
  Plus,
  MessageSquareText,
  Play,
  QrCode,
  RefreshCcw,
  Save,
  Send,
  Server,
  Smartphone,
  TestTube2,
  Users,
  XCircle,
  Trash2,
} from 'lucide-react';
import { db } from '../firebase';
import { FormInput, FormSwitch, FormTextarea } from '../components/AdminForm';
import LoadingModal from '../components/LoadingModal';
import { useDialog } from '../context/CustomDialogContext';
import { formatDateTimeBR } from '../utils/dateUtils';
import '../styles/admin.css';

type WhatsAppConfig = {
  evolutionUrl: string;
  instanceName: string;
  apiKey: string;
  testPhone: string;
  testMessage: string;
  receiveRegistrationNoticeEnabled: boolean;
  registrationNoticePhone: string;
};

type WhatsAppNumberInstance = {
  id: string;
  label: string;
  instanceName: string;
  active: boolean;
};

type QueueItem = {
  key: string;
  phone?: string;
  text?: string;
  imageUrl?: string;
  instanceName?: string;
  instanceLabel?: string;
  alunoNome?: string;
  type?: string;
  enqueuedAt?: string;
  attempts?: number;
};

type TabId = 'numeros' | 'lote' | 'fila' | 'teste' | 'api' | 'automacoes';

const DEFAULT_CONFIG: WhatsAppConfig = {
  evolutionUrl: 'https://evolution-api-im3d.onrender.com',
  instanceName: 'mcu_nightrun_uba',
  apiKey: '',
  testPhone: '',
  testMessage: 'Mensagem de teste MCU Night Run',
  receiveRegistrationNoticeEnabled: false,
  registrationNoticePhone: '',
};

const settingsRef = doc(db, 'system_settings', 'nightrun_whatsapp');
const publicNoticeRef = doc(db, 'nightrun_settings', 'whatsapp_registration_notice');
const publicNumbersRef = doc(db, 'nightrun_settings', 'whatsapp_numbers_public');
const numbersRef = doc(db, 'system_settings', 'nightrun_whatsapp_numbers');

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
};

const isAbortError = (error: unknown) => {
  const err = error as { name: string; message: string };
  return err.name === 'AbortError' || String(err.message || '').toLowerCase().includes('aborted');
};

const summarizeResetFailure = (data: any) => {
  if (data.message) return data.message;
  const failedStep = (data.steps || []).find((step: any) => !step.ok);
  if (!failedStep) return 'Falha ao resetar a instancia.';

  const detail = failedStep.body?.message ||
    failedStep.body?.error ||
    failedStep.body?.response?.message ||
    failedStep.body.raw ||
    failedStep.error ||
    '';

  const stepLabel = failedStep.name === 'create'
    ? 'criar a instancia novamente'
    : failedStep.name === 'delete'
      ? 'apagar a instancia antiga'
      : failedStep.name === 'logout'
        ? 'desconectar a sessao antiga'
        : failedStep.name;

  return `Falha ao ${stepLabel}${failedStep.status ? ` (${failedStep.status})` : ''}${detail ? `: ${detail}` : '.'}`;
};

export default function AdminMensagensConfig() {
  const [config, setConfig] = useState<WhatsAppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrWatcherActive, setQrWatcherActive] = useState(false);
  const [lastQrRefreshAt, setLastQrRefreshAt] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('numeros');
  const [testInstanceName, setTestInstanceName] = useState('');
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [batchPaymentStatus, setBatchPaymentStatus] = useState<'pago' | 'pendente'>('pendente');
  const [batchMessage, setBatchMessage] = useState('');
  const [batchImageUrl, setBatchImageUrl] = useState('');
  const [batchSending, setBatchSending] = useState(false);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [numberInstances, setNumberInstances] = useState<WhatsAppNumberInstance[]>([]);
  const [newNumberLabel, setNewNumberLabel] = useState('');
  const [newInstanceName, setNewInstanceName] = useState('');
  const [instanceStatuses, setInstanceStatuses] = useState<Record<string, any>>({});
  const [instanceQr, setInstanceQr] = useState<Record<string, string>>({});
  const { showAlert, showConfirm } = useDialog();
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  const connState = status?.instance?.state || status?.state || '';
  const isConnected = connState === 'open';

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    if (activeTab === 'fila') {
      loadQueue().catch(e => console.error('[WhatsApp Queue] load failed', e));
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'numeros' || numberInstances.length === 0 || !workerUrl) return;
    refreshNumberStatuses(numberInstances).catch(e => console.error('[WhatsApp Numbers] auto status failed', e));
  }, [activeTab, numberInstances.length, workerUrl]);

  useEffect(() => {
    if (!qrWatcherActive || isConnected || !workerUrl) return;

    const checkTimer = window.setInterval(() => {
      checkStatus().catch(e => console.error('[WhatsApp Admin] QR status check failed', e));
    }, 3000);

    const renewTimer = window.setInterval(() => {
      requestQrCode({ silent: true, keepWatcher: true }).catch(e => console.error('[WhatsApp Admin] QR auto renew failed', e));
    }, 45000);

    return () => {
      window.clearInterval(checkTimer);
      window.clearInterval(renewTimer);
    };
  }, [qrWatcherActive, isConnected, workerUrl]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const [snap, numbersSnap] = await Promise.all([getDoc(settingsRef), getDoc(numbersRef)]);
      if (snap.exists()) {
        const savedConfig = snap.data() as Partial<WhatsAppConfig>;
        setConfig(prev => ({ ...prev, ...savedConfig }));
      }
      let loadedInstances: WhatsAppNumberInstance[];
      if (numbersSnap.exists() && Array.isArray(numbersSnap.data().instances)) {
        loadedInstances = numbersSnap.data().instances;
        setNumberInstances(loadedInstances);
      } else {
        loadedInstances = [{ id: 'principal', label: 'Principal', instanceName: DEFAULT_CONFIG.instanceName, active: true }];
        setNumberInstances(loadedInstances);
      }
      const registrationsQuery = query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc'));
      const registrationsSnap = await getDocs(registrationsQuery);
      setRegistrations(registrationsSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      await checkStatus();
      await refreshNumberStatuses(loadedInstances);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao carregar configuracoes do WhatsApp.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = <K extends keyof WhatsAppConfig>(key: K, value: WhatsAppConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(settingsRef, config, { merge: true });
      await setDoc(publicNoticeRef, {
        receiveRegistrationNoticeEnabled: config.receiveRegistrationNoticeEnabled,
        registrationNoticePhone: config.registrationNoticePhone,
      }, { merge: true });
      showAlert('Configuracoes do WhatsApp salvas com sucesso!', 'success');
    } catch (e: any) {
      showAlert('Erro ao salvar: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const checkStatus = async () => {
    if (!workerUrl) return;
    try {
      const res = await fetchWithTimeout(`${workerUrl}/whatsapp/status`, {}, 8000);
      const data = await res.json();
      setStatus({ ...data, httpStatus: res.status });
      if (data.instance.state === 'open') {
        setQrCode(null);
        setQrWatcherActive(false);
      }
    } catch (e) {
      console.error(e);
      setStatus({ error: true });
    }
  };

  const initInstance = async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/whatsapp/create`, { method: 'POST' }, 12000);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Falha ao inicializar instancia.');
      }
      showAlert('Instancia inicializada. Gerando QR Code...', 'success');
      window.setTimeout(() => {
        requestQrCode({ keepWatcher: true }).catch(e => console.error('[WhatsApp Admin] connect after init failed', e));
      }, 1200);
    } catch (e: any) {
      showAlert(e.message || 'Erro ao inicializar instancia.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetInstance = async () => {
    setLoading(true);
    setQrCode(null);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/whatsapp/reset`, { method: 'POST' }, 20000);
      const data = await res.json().catch(() => ({}));
      console.log('[WhatsApp Admin] reset response', { status: res.status, ok: res.ok, data });
      if (!res.ok || data.success === false) {
        throw new Error(summarizeResetFailure(data));
      }
      setQrWatcherActive(false);
      showAlert('Sessao resetada. Gere um novo QR Code e escaneie novamente.', 'success');
      await checkStatus();
    } catch (e: any) {
      console.error('[WhatsApp Admin] reset failed', e);
      showAlert(isAbortError(e) ? 'A Evolution demorou para responder. Atualize o status em alguns segundos.' : e.message || 'Erro ao resetar sessao.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const requestQrCode = async (options: { silent?: boolean; keepWatcher?: boolean } = {}) => {
    if (!options.silent) setLoading(true);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/whatsapp/connect`, {}, 12000);
      const data = await res.json();
      if (data.base64) {
        setQrCode(data.base64);
        setQrWatcherActive(options.keepWatcher ?? true);
        setLastQrRefreshAt(Date.now());
        if (!options.silent) showAlert('QR Code gerado. Vou monitorar ate conectar ou renovar automaticamente.', 'success');
      } else {
        if (!options.silent) showAlert('Instancia ja conectada ou sem QR Code disponivel.', 'info');
      }
      await checkStatus();
    } catch (e) {
      if (!options.silent) {
        showAlert(isAbortError(e) ? 'A Evolution demorou para responder. Tente gerar o QR novamente.' : 'Erro ao gerar QR Code.', 'error');
      }
    } finally {
      if (!options.silent) setLoading(false);
    }
  };

  const connectInstance = () => requestQrCode({ keepWatcher: true });

  const saveNumberInstances = async (instances = numberInstances) => {
    await setDoc(numbersRef, { instances, updatedAt: new Date() }, { merge: true });
    await setDoc(publicNumbersRef, {
      instances: instances.map(item => ({
        id: item.id,
        label: item.label,
        instanceName: item.instanceName,
        active: item.active,
      })),
      updatedAt: new Date(),
    }, { merge: true });
  };

  const addNumberInstance = async () => {
    const instanceName = newInstanceName.trim();
    if (!instanceName) return showAlert('Informe o nome da instancia.', 'warning');
    if (numberInstances.some(item => item.instanceName === instanceName)) return showAlert('Essa instancia ja existe.', 'warning');
    const next = [
      ...numberInstances,
      {
        id: crypto.randomUUID(),
        label: newNumberLabel.trim() || instanceName,
        instanceName,
        active: true,
      },
    ];
    setNumberInstances(next);
    setNewNumberLabel('');
    setNewInstanceName('');
    await saveNumberInstances(next);
    showAlert('Numero adicionado. Agora inicialize e gere o QR Code.', 'success');
  };

  const updateNumberInstance = async (id: string, patch: Partial<WhatsAppNumberInstance>) => {
    const next = numberInstances.map(item => item.id === id ? { ...item, ...patch } : item);
    setNumberInstances(next);
    await saveNumberInstances(next);
  };

  const removeNumberInstance = async (id: string) => {
    const next = numberInstances.filter(item => item.id !== id);
    setNumberInstances(next);
    await saveNumberInstances(next);
  };

  const checkInstanceStatus = async (instanceName: string) => {
    const res = await fetchWithTimeout(`${workerUrl}/whatsapp/status?instanceName=${encodeURIComponent(instanceName)}`, {}, 8000);
    const data = await res.json();
    setInstanceStatuses(prev => ({ ...prev, [instanceName]: { ...data, checkedAt: new Date().toISOString() } }));
    return data;
  };

  const refreshNumberStatuses = async (instances = numberInstances) => {
    if (!workerUrl) return;
    const uniqueInstances = Array.from(new Set(instances.map(item => item.instanceName).filter(Boolean)));
    await Promise.allSettled(uniqueInstances.map(instanceName => checkInstanceStatus(instanceName)));
  };

  const createNumberInstance = async (instanceName: string) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/whatsapp/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceName }),
      }, 12000);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || data.response?.message || `Falha ao inicializar instancia (${res.status}).`);
      }
      showAlert('Instancia inicializada.', 'success');
      await checkInstanceStatus(instanceName);
    } catch (e: any) {
      showAlert(e.message || 'Erro ao inicializar instancia.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const connectNumberInstance = async (instanceName: string) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/whatsapp/connect?instanceName=${encodeURIComponent(instanceName)}`, {}, 12000);
      const data = await res.json();
      if (data.base64) {
        setInstanceQr(prev => ({ ...prev, [instanceName]: data.base64 }));
        showAlert('QR Code gerado para esta instancia.', 'success');
      } else {
        showAlert('Instancia ja conectada ou sem QR Code disponivel.', 'info');
      }
      await checkInstanceStatus(instanceName);
    } catch (e: any) {
      showAlert(e.message || 'Erro ao gerar QR Code.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getInstanceState = (instanceName: string) => {
    return instanceStatuses[instanceName]?.instance?.state || instanceStatuses[instanceName]?.state || 'nao_verificado';
  };

  const getAvailableInstances = () => {
    const instances = numberInstances.length
      ? numberInstances
      : [{ id: 'principal', label: 'Principal', instanceName: config.instanceName || DEFAULT_CONFIG.instanceName, active: true }];
    return instances.filter(item => item.active);
  };

  const sendTest = async () => {
    if (!config.testPhone.trim()) return showAlert('Informe um telefone de teste.', 'warning');
    if (!config.testMessage.trim()) return showAlert('Digite a mensagem de teste.', 'warning');

    const availableInstances = getAvailableInstances();
    const selectedInstanceName = testInstanceName || availableInstances[0]?.instanceName || config.instanceName;
    if (!selectedInstanceName) return showAlert('Selecione uma instancia para enviar o teste.', 'warning');

    setLoading(true);
    try {
      const cleanPhone = config.testPhone.replace(/\D/g, '');
      const phone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
      const res = await fetchWithTimeout(`${workerUrl}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, text: config.testMessage, instanceName: selectedInstanceName }),
      }, 15000);
      const data = await res.json();
      if (data.success) showAlert('Mensagem de teste enviada!', 'success');
      else showAlert(data.message || data.error || 'Falha no envio de teste.', 'error');
    } catch (e: any) {
      showAlert(e.message || 'Erro ao enviar mensagem de teste.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const normalizePhone = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '') || '';
    if (!cleanPhone) return '';
    return cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
  };

  const batchRecipients = registrations.filter(registration => registration.paymentStatus === batchPaymentStatus && normalizePhone(registration.telefone));

  const sendBatch = () => {
    if (!batchMessage.trim()) return showAlert('Digite a mensagem do lote.', 'warning');
    if (batchRecipients.length === 0) return showAlert('Nenhum destinatario encontrado para esse tipo.', 'warning');

    const messages = batchRecipients.map(registration => ({
      phone: normalizePhone(registration.telefone),
      text: batchMessage
        .replace('{nome}', registration.nome.split(' ')[0] || 'Atleta')
        .replace('{categoria}', registration.categoria.toUpperCase() || ''),
      imageUrl: batchImageUrl || undefined,
      alunoNome: registration.nome,
    }));
    const label = batchPaymentStatus === 'pago' ? 'pagos' : 'pendentes';

    showConfirm(`Enviar mensagem para ${messages.length} atleta(s) ${label}`, async () => {
      setBatchSending(true);
      try {
        const res = await fetchWithTimeout(`${workerUrl}/queue/enqueue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
        }, 15000);
        if (!res.ok) throw new Error('Falha ao enfileirar mensagens.');
        showAlert(`${messages.length} mensagens para ${label} foram enfileiradas!`, 'success');
        setBatchMessage('');
        setBatchImageUrl('');
      } catch (e: any) {
        showAlert(e.message || 'Erro ao enviar lote.', 'error');
      } finally {
        setBatchSending(false);
      }
    });
  };

  const loadQueue = async () => {
    if (!workerUrl) return;
    setQueueLoading(true);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/queue/list`, {}, 12000);
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.details || data.error || 'Falha ao carregar fila.');
      setQueueItems(Array.isArray(data.items) ? data.items : []);
      setQueuePaused(Boolean(data.paused));
    } catch (e: any) {
      showAlert(e.message || 'Erro ao carregar fila de mensagens.', 'error');
    } finally {
      setQueueLoading(false);
    }
  };

  const toggleQueuePause = async () => {
    if (!workerUrl) return;
    setQueueLoading(true);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/queue/toggle-pause`, { method: 'POST' }, 12000);
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'Falha ao alterar a fila.');
      setQueuePaused(Boolean(data.paused));
      showAlert(data.paused ? 'Fila pausada.' : 'Fila retomada.', 'success');
      await loadQueue();
    } catch (e: any) {
      showAlert(e.message || 'Erro ao alterar fila.', 'error');
    } finally {
      setQueueLoading(false);
    }
  };

  const processQueueNow = async () => {
    if (!workerUrl) return;
    setQueueLoading(true);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/queue/process`, { method: 'POST' }, 20000);
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || 'Falha ao processar fila.');
      const sent = data.sent ?? 0;
      const failed = data.failed ?? 0;
      const message = failed > 0
        ? `Fila processada. Enviadas: ${sent}. Falhas: ${failed}.`
        : `Fila processada. Enviadas: ${sent}.`;
      showAlert(message, failed > 0 ? 'warning' : 'success');
      await loadQueue();
    } catch (e: any) {
      showAlert(e.message || 'Erro ao processar fila.', 'error');
    } finally {
      setQueueLoading(false);
    }
  };

  const clearQueue = () => {
    showConfirm('Excluir todas as mensagens pendentes da fila?', async () => {
      if (!workerUrl) return;
      setQueueLoading(true);
      try {
        const res = await fetchWithTimeout(`${workerUrl}/queue/clear`, { method: 'POST' }, 12000);
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) throw new Error(data.error || 'Falha ao limpar fila.');
        setQueueItems([]);
        showAlert('Fila excluida.', 'success');
      } catch (e: any) {
        showAlert(e.message || 'Erro ao excluir fila.', 'error');
      } finally {
        setQueueLoading(false);
      }
    });
  };

  const isOffline = connState === 'offline' || status?.error === true;
  const statusText = isConnected
    ? 'Conectado'
    : isOffline
      ? 'Servidor Offline'
      : connState === 'connecting'
        ? 'Conectando / QR pendente'
        : connState === 'close'
          ? 'Desconectado'
          : status
            ? 'Desconectado'
            : 'Verificando...';
  const statusTone = isConnected ? 'success' : isOffline ? 'danger' : 'warning';
  const statusIcon = isConnected ? <CheckCircle2 size={24} /> : <XCircle size={24} />;

  return (
    <div className="whatsapp-config-page" style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Configuracao WhatsApp</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Conexao, Evolution API, testes e automacoes financeiras.</p>
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)' }}
        >
          <Save size={18} />
          {saving ? 'Salvando...' : 'Salvar Configuracoes'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <SummaryCard icon={statusIcon} label="Status" value={statusText} tone={statusTone as any} />
        <SummaryCard icon={<Server size={24} />} label="Worker" value={workerUrl ? 'Configurado' : 'Sem URL'} tone={workerUrl ? 'info' : 'warning'} />
        <SummaryCard icon={<Smartphone size={24} />} label="Instancia" value={config.instanceName || '-'} tone="accent" />
        <SummaryCard icon={<MessageSquareText size={24} />} label="Aviso inscricao" value={config.receiveRegistrationNoticeEnabled ? 'Ativo' : 'Inativo'} tone={config.receiveRegistrationNoticeEnabled ? 'success' : 'warning'} />
      </div>

      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 20px', overflowX: 'auto', background: '#f8fafc' }}>
          {[
            { id: 'numeros', label: 'NUMEROS', icon: <Users size={18} /> },
            { id: 'lote', label: 'ENVIO EM LOTE', icon: <Users size={18} /> },
            { id: 'fila', label: 'FILA', icon: <Clock size={18} /> },
            { id: 'teste', label: 'TESTE', icon: <TestTube2 size={18} /> },
            { id: 'api', label: 'EVOLUTION API', icon: <KeyRound size={18} /> },
            { id: 'automacoes', label: 'AUTOMACOES', icon: <Clock size={18} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabId)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', padding: '18px 24px', color: activeTab === tab.id ? '#071A45' : '#94a3b8', fontWeight: 800, fontSize: '0.8rem', borderBottom: activeTab === tab.id ? '3px solid #6BFF2A' : '3px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 30 }}>
          {false && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
              <SectionCard title="Status da conexao" icon={<Smartphone size={20} />}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 18, background: isConnected ? '#dcfce7' : isOffline ? '#fee2e2' : '#fef3c7', color: isConnected ? '#15803d' : isOffline ? '#dc2626' : '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {statusIcon}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, color: '#071A45', fontSize: '1.2rem', fontWeight: 900 }}>{statusText}</h3>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 600 }}>{config.instanceName}</p>
                  </div>
                </div>
                {isOffline && (
                  <div style={{ padding: 14, background: '#fef2f2', borderRadius: 14, border: '1px solid #fecaca', marginBottom: 16, fontSize: '.84rem', color: '#991b1b', fontWeight: 600, lineHeight: 1.5 }}>
                    ⚠️ O servidor WhatsApp esta offline. {status?.message || 'Verifique se o Docker esta rodando no seu computador ou migre para um servidor na nuvem.'}
                  </div>
                )}
                <ActionRow>
                  <button className="whatsapp-secondary-btn" onClick={checkStatus}><RefreshCcw size={16} /> Atualizar</button>
                  {status?.httpStatus === 404 ? (
                    <button className="whatsapp-primary-btn" onClick={initInstance}><Play size={16} /> Inicializar</button>
                  ) : (
                    <button className="whatsapp-primary-btn" onClick={connectInstance}><QrCode size={16} /> Gerar QR Code</button>
                  )}
                  <button className="whatsapp-secondary-btn" onClick={resetInstance}><RefreshCcw size={16} /> Resetar sessao</button>
                </ActionRow>
              </SectionCard>

              <SectionCard title="Pareamento do aparelho" icon={<QrCode size={20} />}>
                {qrCode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <div style={{ background: '#fff', padding: 12, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                      <img src={qrCode ?? undefined} alt="QR Code do WhatsApp" style={{ width: 220, height: 220, display: 'block' }} />
                    </div>
                    <p style={{ color: '#64748b', fontWeight: 700, fontSize: '.85rem', textAlign: 'center' }}>WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho</p>
                    <p style={{ color: '#15803d', fontWeight: 800, fontSize: '.78rem', textAlign: 'center', margin: 0 }}>
                      Monitorando leitura e renovando o QR automaticamente.
                      {lastQrRefreshAt ? ` Ultima geracao: ${formatDateTimeBR(lastQrRefreshAt)}` : ''}
                    </p>
                  </div>
                ) : (
                  <EmptyState title="QR Code nao gerado" text="Use o botao Gerar QR Code quando precisar parear ou reconectar o aparelho." />
                )}
              </SectionCard>
            </div>
          )}

          {activeTab === 'api' && (
            <SectionCard title="Parametros da Evolution API" icon={<Server size={20} />}>
              <ResponsiveGrid>
                <Field label="URL da Evolution API">
                  <FormInput value={config.evolutionUrl} onChange={e => updateConfig('evolutionUrl', e.target.value)} />
                </Field>
                <Field label="Nome da instancia">
                  <FormInput value={config.instanceName} onChange={e => updateConfig('instanceName', e.target.value)} />
                </Field>
              </ResponsiveGrid>
              <Field label="API Key">
                <FormInput type="password" value={config.apiKey} onChange={e => updateConfig('apiKey', e.target.value)} />
              </Field>
              <div style={{ padding: 16, background: '#eff6ff', borderRadius: 16, color: '#1d4ed8', fontSize: '.85rem', fontWeight: 600, lineHeight: 1.5 }}>
                Esses dados sao salvos no Firebase e usados pelas rotinas de envio e automacao do WhatsApp.
              </div>
            </SectionCard>
          )}

          {activeTab === 'automacoes' && (
            <SectionCard title="Avisos de inscricao" icon={<Clock size={20} />}>
              <div style={{ padding: 18, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ color: '#071A45', fontWeight: 900, marginBottom: 4 }}>Receber aviso de inscricao</div>
                    <div style={{ color: '#64748b', fontSize: '.84rem', lineHeight: 1.4 }}>Envia a ficha do atleta para um numero assim que a inscricao chega na etapa de pagamento.</div>
                  </div>
                  <FormSwitch
                    checked={config.receiveRegistrationNoticeEnabled}
                    onChange={value => updateConfig('receiveRegistrationNoticeEnabled', value)}
                    label=""
                  />
                </div>
                <Field label="Numero que recebera o aviso">
                  <FormInput
                    value={config.registrationNoticePhone}
                    onChange={e => updateConfig('registrationNoticePhone', e.target.value)}
                    placeholder="5533999999999"
                  />
                </Field>
              </div>
            </SectionCard>
          )}

          {activeTab === 'numeros' && (
            <SectionCard title="Central de numeros" icon={<Users size={20} />}>
              <div style={{ padding: 16, background: '#eff6ff', borderRadius: 16, color: '#1d4ed8', fontSize: '.85rem', fontWeight: 700, lineHeight: 1.5, marginBottom: 20 }}>
                Cadastre uma instancia para cada chip. As instancias ativas serão usadas em rodizio nos envios automaticos, inclusive pagamento confirmado.
              </div>
              <ResponsiveGrid>
                <Field label="Apelido do chip">
                  <FormInput value={newNumberLabel} onChange={e => setNewNumberLabel(e.target.value)} placeholder="Ex: Chip 01" />
                </Field>
                <Field label="Nome da instancia">
                  <FormInput value={newInstanceName} onChange={e => setNewInstanceName(e.target.value)} placeholder="mcu_nightrun_chip_01" />
                </Field>
              </ResponsiveGrid>
              <button className="whatsapp-secondary-btn" onClick={addNumberInstance} style={{ marginBottom: 22 }}>
                <Plus size={16} /> Adicionar numero
              </button>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {numberInstances.map(item => {
                  const state = getInstanceState(item.instanceName);
                  const isItemConnected = state === 'open';
                  return (
                    <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 18, padding: 16, background: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <FormSwitch checked={item.active} onChange={value => updateNumberInstance(item.id, { active: value })} label="" />
                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ color: '#071A45', fontWeight: 900 }}>{item.label || item.instanceName}</div>
                          <div style={{ color: '#64748b', fontSize: '.78rem', fontWeight: 700 }}>{item.instanceName}</div>
                        </div>
                        <span style={{ background: isItemConnected ? '#dcfce7' : '#fef3c7', color: isItemConnected ? '#15803d' : '#b45309', padding: '6px 10px', borderRadius: 999, fontSize: '.7rem', fontWeight: 900, textTransform: 'uppercase' }}>
                          {state || 'nao verificado'}
                        </span>
                        <button className="whatsapp-secondary-btn" onClick={() => checkInstanceStatus(item.instanceName)}><RefreshCcw size={15} /> Status</button>
                        <button className="whatsapp-secondary-btn" onClick={() => createNumberInstance(item.instanceName)}><Play size={15} /> Inicializar</button>
                        <button className="whatsapp-primary-btn" onClick={() => connectNumberInstance(item.instanceName)}><QrCode size={15} /> QR Code</button>
                        <button className="whatsapp-secondary-btn" onClick={() => removeNumberInstance(item.id)}><Trash2 size={15} /> Remover</button>
                      </div>
                      {instanceQr[item.instanceName] && (
                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                          <div style={{ background: '#fff', padding: 12, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                            <img src={instanceQr[item.instanceName]} alt={`QR Code ${item.instanceName}`} style={{ width: 210, height: 210, display: 'block' }} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {activeTab === 'lote' && (
            <SectionCard title="Envio em lote" icon={<Users size={20} />}>
              <ResponsiveGrid>
                <Field label="Quem recebe">
                  <select
                    value={batchPaymentStatus}
                    onChange={e => setBatchPaymentStatus(e.target.value as 'pago' | 'pendente')}
                    className="admin-input"
                    style={{ width: '100%', height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid #e2e8f0', color: '#071A45', fontWeight: 800 }}
                  >
                    <option value="pendente">Pendentes</option>
                    <option value="pago">Pagos</option>
                  </select>
                </Field>
                <Field label="Destinatarios encontrados">
                  <div style={{ height: 46, display: 'flex', alignItems: 'center', color: '#071A45', fontWeight: 900 }}>
                    {batchRecipients.length} atleta(s)
                  </div>
                </Field>
              </ResponsiveGrid>
              <Field label="Mensagem">
                <FormTextarea
                  value={batchMessage}
                  onChange={e => setBatchMessage(e.target.value)}
                  placeholder="Ola {nome}! Digite aqui a mensagem para os atletas..."
                />
              </Field>
              <Field label="URL da imagem (opcional)">
                <FormInput
                  value={batchImageUrl}
                  onChange={e => setBatchImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </Field>
              <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, color: '#64748b', fontSize: '.84rem', fontWeight: 700, marginBottom: 18 }}>
                Variaveis disponiveis: {'{nome}'} e {'{categoria}'}.
              </div>
              <button className="whatsapp-primary-btn" onClick={sendBatch} disabled={!isConnected || batchSending} style={{ width: '100%', opacity: isConnected ? 1 : .5 }}>
                <Send size={16} /> {batchSending ? 'Enfileirando...' : 'Enviar lote'}
              </button>
            </SectionCard>
          )}

          {activeTab === 'fila' && (
            <SectionCard title="Fila de mensagens" icon={<Clock size={20} />}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
                <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 16, background: '#f8fafc' }}>
                  <div style={{ color: '#94a3b8', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 6 }}>Pendentes</div>
                  <div style={{ color: '#071A45', fontSize: '1.6rem', fontWeight: 950 }}>{queueItems.length}</div>
                </div>
                <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 16, background: queuePaused ? '#fff7ed' : '#f0fdf4' }}>
                  <div style={{ color: '#94a3b8', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 6 }}>Status</div>
                  <div style={{ color: queuePaused ? '#c2410c' : '#15803d', fontSize: '1.1rem', fontWeight: 950 }}>{queuePaused ? 'Pausada' : 'Rodando'}</div>
                </div>
              </div>

              <ActionRow>
                <button className="whatsapp-secondary-btn" onClick={loadQueue} disabled={queueLoading}><RefreshCcw size={16} /> Atualizar</button>
                <button className={queuePaused ? 'whatsapp-primary-btn' : 'whatsapp-secondary-btn'} onClick={toggleQueuePause} disabled={queueLoading}>
                  {queuePaused ? <Play size={16} /> : <Clock size={16} />} {queuePaused ? 'Continuar fila' : 'Pausar fila'}
                </button>
                <button className="whatsapp-primary-btn" onClick={processQueueNow} disabled={queueLoading || queuePaused || queueItems.length === 0} style={{ opacity: queuePaused || queueItems.length === 0 ? .5 : 1 }}>
                  <Send size={16} /> Processar agora
                </button>
                <button className="whatsapp-secondary-btn" onClick={clearQueue} disabled={queueLoading || queueItems.length === 0} style={{ color: '#dc2626', opacity: queueItems.length === 0 ? .5 : 1 }}>
                  <Trash2 size={16} /> Excluir fila
                </button>
              </ActionRow>

              <div style={{ marginTop: 20, border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr .9fr .9fr', gap: 12, padding: '12px 14px', background: '#f8fafc', color: '#64748b', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase' }}>
                  <span>Destino</span>
                  <span>Mensagem</span>
                  <span>Numero</span>
                  <span>Entrada</span>
                </div>
                {queueItems.length === 0 ? (
                  <div style={{ padding: 28, color: '#64748b', fontWeight: 800, textAlign: 'center' }}>
                    {queueLoading ? 'Carregando fila...' : 'Nenhuma mensagem pendente na fila.'}
                  </div>
                ) : (
                  queueItems.map(item => (
                    <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr .9fr .9fr', gap: 12, padding: '14px', borderTop: '1px solid #f1f5f9', alignItems: 'center', color: '#071A45', fontSize: '.84rem', fontWeight: 700 }}>
                      <div>
                        <div style={{ fontWeight: 950 }}>{item.alunoNome || item.phone || '-'}</div>
                        <div style={{ color: '#64748b', fontSize: '.75rem' }}>{item.phone || '-'}</div>
                      </div>
                      <div style={{ color: '#475569', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {item.text || (item.imageUrl ? 'Imagem sem texto' : '-')}
                      </div>
                      <div>
                        <div style={{ fontWeight: 900 }}>{item.instanceLabel || item.instanceName || 'Rodizio'}</div>
                        {item.attempts ? <div style={{ color: '#b45309', fontSize: '.72rem' }}>Tentativas: {item.attempts}</div> : null}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '.78rem' }}>
                        {item.enqueuedAt ? formatDateTimeBR(item.enqueuedAt) : '-'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </SectionCard>
          )}

          {activeTab === 'teste' && (
            <SectionCard title="Envio de teste" icon={<MessageSquareText size={20} />}>
              <ResponsiveGrid>
                <Field label="Telefone de teste">
                  <FormInput value={config.testPhone} onChange={e => updateConfig('testPhone', e.target.value)} placeholder="5533999999999" />
                </Field>
                <Field label="Numero que vai enviar">
                  <select
                    value={testInstanceName || getAvailableInstances()[0]?.instanceName || ''}
                    onChange={e => setTestInstanceName(e.target.value)}
                    className="admin-input"
                    style={{ width: '100%', height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid #e2e8f0', color: '#071A45', fontWeight: 800 }}
                  >
                    {getAvailableInstances().map(item => (
                      <option key={item.id} value={item.instanceName}>
                        {(item.label || item.instanceName)} - {getInstanceState(item.instanceName)}
                      </option>
                    ))}
                  </select>
                </Field>
              </ResponsiveGrid>
              <Field label="Mensagem">
                <FormTextarea value={config.testMessage} onChange={e => updateConfig('testMessage', e.target.value)} />
              </Field>
              <div style={{ padding: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, color: '#64748b', fontSize: '.84rem', fontWeight: 700, marginBottom: 18 }}>
                Use o botao Status na aba Numeros para conferir se a instancia esta conectada antes de enviar.
              </div>
              <button className="whatsapp-primary-btn" onClick={sendTest} disabled={getAvailableInstances().length === 0} style={{ width: '100%', opacity: getAvailableInstances().length > 0 ? 1 : .5 }}>
                <Send size={16} /> Enviar teste
              </button>
            </SectionCard>
          )}
        </div>
      </div>

      <LoadingModal isOpen={loading} />
      <style>{`
        .whatsapp-primary-btn,
        .whatsapp-secondary-btn {
          border: none;
          padding: 12px 18px;
          border-radius: 12px;
          font-weight: 800;
          font-size: .82rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
        }
        .whatsapp-primary-btn {
          background: #071A45;
          color: #fff;
        }
        .whatsapp-secondary-btn {
          background: #f1f5f9;
          color: #475569;
        }
        .whatsapp-primary-btn:disabled {
          cursor: not-allowed;
        }
        .whatsapp-config-page .admin-input {
          background: #fff !important;
          border-color: #e2e8f0 !important;
          color: #071A45 !important;
        }
        .whatsapp-config-page .admin-input::placeholder {
          color: #94a3b8 !important;
        }
        @media (max-width: 720px) {
          .whatsapp-action-row {
            flex-direction: column;
          }
          .whatsapp-action-row button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: 'success' | 'danger' | 'warning' | 'info' | 'accent' }) {
  const colors = {
    success: ['#dcfce7', '#15803d'],
    danger: ['#fee2e2', '#dc2626'],
    warning: ['#fef3c7', '#b45309'],
    info: ['#dbeafe', '#2563eb'],
    accent: ['#f3f7c6', '#071A45'],
  } as const;
  return (
    <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 46, height: 46, borderRadius: 14, background: colors[tone][0], color: colors[tone][1], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#94a3b8', fontSize: '.7rem', fontWeight: 900, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ color: '#071A45', fontSize: '1rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 24 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 22px', color: '#071A45', fontSize: '1.05rem', fontWeight: 900 }}>
        <span style={{ width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', color: '#071A45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>{label}</label>
      {children}
    </div>
  );
}

function ResponsiveGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>{children}</div>;
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="whatsapp-action-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ minHeight: 240, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 18, padding: 24 }}>
      <QrCode size={42} style={{ opacity: .35, marginBottom: 14 }} />
      <strong style={{ color: '#123068', marginBottom: 4 }}>{title}</strong>
      <span style={{ fontSize: '.85rem', lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}
