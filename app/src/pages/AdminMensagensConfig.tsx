import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, getDocs, limit as firestoreLimit, orderBy, query, setDoc, where } from 'firebase/firestore';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  History,
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
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { FormInput, FormSwitch, FormTextarea } from '../components/AdminForm';
import LoadingModal from '../components/LoadingModal';
import { useDialog } from '../context/CustomDialogContext';
import { formatDateTimeBR } from '../utils/dateUtils';
import { findCamisetaByValue, formatCamisetaLabel } from '../utils/camisetaUtils';
import { buildDataConfirmationMessage } from '../utils/dataConfirmationMessage';
import '../styles/admin.css';

const dataConfirmationRunsRef = collection(db, 'nightrun_data_confirmation_runs');

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

type TabId = 'numeros' | 'lote' | 'fila' | 'teste' | 'api' | 'automacoes' | 'resumo';

type OperationalConfig = {
  enabled: boolean;
  time: string;
  phone: string;
  instanceName: string;
  bannerUrl: string;
  lastSentDate?: string;
  lastSentAt?: any;
};

const DEFAULT_OPERATIONAL: OperationalConfig = { enabled: false, time: '08:00', phone: '', instanceName: '', bannerUrl: '' };

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
const operationalSummaryRef = doc(db, 'nightrun_settings', 'operational_summary');

// Data BR (UTC-3) em AAAA-MM-DD, com deslocamento em dias (0 = hoje, -1 = ontem).
const brDateStr = (offsetDays = 0) => {
  const br = new Date(Date.now() - 3 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return `${br.getUTCFullYear()}-${String(br.getUTCMonth() + 1).padStart(2, '0')}-${String(br.getUTCDate()).padStart(2, '0')}`;
};
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
  const [searchParams, setSearchParams] = useSearchParams();
  const validTabIds: TabId[] = ['numeros', 'lote', 'fila', 'teste', 'api', 'automacoes', 'resumo'];
  const tabFromUrl = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = tabFromUrl && validTabIds.includes(tabFromUrl) ? tabFromUrl : 'numeros';
  const setActiveTab = (tab: TabId) => {
    setSearchParams(tab === 'numeros' ? {} : { tab }, { replace: false });
  };
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
  const [modalidadesMap, setModalidadesMap] = useState<Record<string, string>>({});
  const [camisetas, setCamisetas] = useState<any[]>([]);
  const [kitsCadastrados, setKitsCadastrados] = useState<KitRecord[]>([]);
  const [automacaoView, setAutomacaoView] = useState<'avisos' | 'confirmacao'>('avisos');
  const [confirmPreviewId, setConfirmPreviewId] = useState<string | null>(null);
  const [confirmSending, setConfirmSending] = useState(false);
  const [confirmRuns, setConfirmRuns] = useState<any[]>([]);
  const [confirmHistoryLoading, setConfirmHistoryLoading] = useState(false);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [opConfig, setOpConfig] = useState<OperationalConfig>(DEFAULT_OPERATIONAL);
  const [opSaving, setOpSaving] = useState(false);
  const [opSending, setOpSending] = useState(false);
  const [opPreview, setOpPreview] = useState('');
  const [opPreviewLoading, setOpPreviewLoading] = useState(false);
  const [opSelectedDate, setOpSelectedDate] = useState(() => brDateStr(-1)); // default: ontem
  const [opBannerNonce, setOpBannerNonce] = useState(0);
  const { showAlert, showConfirm } = useDialog();
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  const connState = status?.instance?.state || status?.state || '';
  const isConnected = connState === 'open';

  useEffect(() => {
    loadConfig();
    fetchKits().then(setKitsCadastrados).catch(e => console.error('Erro ao carregar kits', e));
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
      const [snap, numbersSnap, opSnap] = await Promise.all([getDoc(settingsRef), getDoc(numbersRef), getDoc(operationalSummaryRef)]);
      if (opSnap.exists()) {
        setOpConfig({ ...DEFAULT_OPERATIONAL, ...(opSnap.data() as Partial<OperationalConfig>) });
      }
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
      const [registrationsSnap, modalidadesSnap, camisetasSnap] = await Promise.all([
        getDocs(registrationsQuery),
        getDocs(collection(db, 'nightrun_modalidades')).catch(() => null),
        getDocs(collection(db, 'nightrun_camisetas')).catch(() => null),
      ]);
      setRegistrations(registrationsSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      if (modalidadesSnap) {
        const map: Record<string, string> = {};
        modalidadesSnap.docs.forEach(item => { map[item.id] = String(item.data().nome || ''); });
        setModalidadesMap(map);
      }
      if (camisetasSnap) setCamisetas(camisetasSnap.docs.map(item => ({ id: item.id, ...item.data() })));
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

  // Instancia ativa efetivamente conectada (state 'open'), considerando o status por-instancia
  // (a instancia conectada pode nao ser a padrao). Fallback para o status global.
  const getConnectedInstance = () => {
    const fromInstances = getAvailableInstances().find(item => getInstanceState(item.instanceName) === 'open');
    if (fromInstances) return fromInstances;
    if (isConnected) {
      const label = config.instanceName || DEFAULT_CONFIG.instanceName;
      return { id: 'principal', label, instanceName: label, active: true } as WhatsAppNumberInstance;
    }
    return null;
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

  // --- Mensagem de confirmação de dados (para inscritos confirmados) ---
  const kitNomeOf = (registration: any) => resolveKitNome(kitsCadastrados, registration.kit, registration.kitNome);
  const camisetaLabelOf = (registration: any) => {
    const found = findCamisetaByValue(camisetas, registration.tamanhoCamiseta, registration.tamanhoCamisetaTipo);
    return formatCamisetaLabel(registration.tamanhoCamiseta, found || undefined);
  };
  const buildConfirmationFor = (registration: any) => buildDataConfirmationMessage(registration, {
    modalidadeNome: modalidadesMap[registration.modalidadeId] || registration.modalidadeNome,
    kitNome: kitNomeOf(registration),
    camisetaLabel: camisetaLabelOf(registration),
  });

  const confirmationRecipients = useMemo(
    () => registrations.filter(r => r.paymentStatus === 'pago' && normalizePhone(r.telefone)),
    [registrations],
  );

  const confirmPreviewRegistration = useMemo(() => {
    if (confirmationRecipients.length === 0) return null;
    return confirmationRecipients.find(r => r.id === confirmPreviewId) || confirmationRecipients[0];
  }, [confirmationRecipients, confirmPreviewId]);

  const loadConfirmationHistory = async () => {
    setConfirmHistoryLoading(true);
    try {
      const snap = await getDocs(query(dataConfirmationRunsRef, orderBy('createdAt', 'desc'), firestoreLimit(50)));
      setConfirmRuns(snap.docs.map(item => ({ id: item.id, ...item.data() })));
    } catch (e) {
      console.error('[Confirmacao] historico', e);
    } finally {
      setConfirmHistoryLoading(false);
    }
  };

  const sendDataConfirmation = () => {
    const connectedInstance = getConnectedInstance();
    if (!connectedInstance) return showAlert('Conecte o WhatsApp antes de enviar.', 'warning');
    if (confirmationRecipients.length === 0) return showAlert('Nenhum inscrito confirmado com telefone valido.', 'warning');

    showConfirm(
      `Enviar a mensagem de confirmacao de dados para ${confirmationRecipients.length} inscrito(s) confirmado(s)? O envio respeita 30s entre cada mensagem.`,
      async () => {
        setConfirmSending(true);
        try {
          const messages = confirmationRecipients.map(registration => ({
            phone: normalizePhone(registration.telefone),
            text: buildConfirmationFor(registration),
            alunoNome: registration.nome,
            registrationId: registration.id,
            instanceName: connectedInstance.instanceName,
            type: 'data_confirmation',
          }));

          const res = await fetchWithTimeout(`${workerUrl}/queue/enqueue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages }),
          }, 20000);
          if (!res.ok) throw new Error('Falha ao enfileirar as mensagens.');

          // Registra o disparo no historico.
          await addDoc(dataConfirmationRunsRef, {
            createdAt: new Date(),
            total: messages.length,
            recipientIds: confirmationRecipients.map(r => r.id),
            recipients: confirmationRecipients.map(r => ({ id: r.id, nome: r.nome || '', telefone: normalizePhone(r.telefone) })),
          });

          showAlert(`${messages.length} mensagens enfileiradas. Serao enviadas com 30s de intervalo pelo numero conectado.`, 'success');
          await loadConfirmationHistory();
        } catch (e: any) {
          showAlert(e.message || 'Erro ao enviar as mensagens de confirmacao.', 'error');
        } finally {
          setConfirmSending(false);
        }
      },
    );
  };

  // Telefones que JA receberam a confirmacao (envios com sucesso registrados no whatsapp_logs).
  // Fonte da verdade para nao reenviar para quem ja recebeu.
  const fetchAlreadySentConfirmationPhones = async (): Promise<Set<string>> => {
    const phones = new Set<string>();
    try {
      const since = new Date(Date.now() - 5 * 86400000).toISOString();
      const snap = await getDocs(query(
        collection(db, 'whatsapp_logs'),
        where('dataHora', '>=', since),
        orderBy('dataHora', 'desc'),
        firestoreLimit(8000),
      ));
      snap.docs.forEach(item => {
        const data = item.data();
        if (data.status !== 'SUCESSO') return;
        if (!String(data.mensagem || '').includes('DADOS - MCU NIGHT RUN')) return;
        const phone = normalizePhone(String(data.destinatario || ''));
        if (phone) phones.add(phone);
      });
    } catch (e) {
      console.error('[Confirmacao] whatsapp_logs', e);
      throw new Error('Nao foi possivel verificar quem ja recebeu (logs). Tente novamente.');
    }
    return phones;
  };

  // Garante o estado pausado/rodando da fila de forma deterministica (o endpoint so alterna).
  const setQueuePausedState = async (target: boolean) => {
    const res = await fetchWithTimeout(`${workerUrl}/queue/list`, {}, 15000);
    const data = await res.json().catch(() => ({}));
    if (Boolean(data.paused) !== target) {
      await fetchWithTimeout(`${workerUrl}/queue/toggle-pause`, { method: 'POST' }, 15000);
    }
  };

  const cancelAndResend = () => {
    const connectedInstance = getConnectedInstance();
    if (!connectedInstance) return showAlert('Conecte o WhatsApp antes de reenviar.', 'warning');
    if (confirmationRecipients.length === 0) return showAlert('Nenhum inscrito confirmado com telefone valido.', 'warning');

    showConfirm(
      'Cancelar a fila atual e reenviar (com acentos) apenas para quem ainda NAO recebeu? As mensagens pendentes antigas serao descartadas.',
      async () => {
        setConfirmSending(true);
        setLoading(true);
        try {
          // 1. Pausa para parar imediatamente o envio das mensagens antigas.
          await setQueuePausedState(true);
          // 2. Descobre quem ja recebeu (antes de limpar).
          const sentPhones = await fetchAlreadySentConfirmationPhones();
          // 3. Descarta a fila antiga (texto sem acento) em lotes, ate esvaziar.
          for (let guard = 0; guard < 200; guard++) {
            const clearRes = await fetchWithTimeout(`${workerUrl}/queue/clear`, { method: 'POST' }, 30000);
            const clearData = await clearRes.json().catch(() => ({}));
            if (clearData.done || Number(clearData.cleared || 0) === 0) break;
          }
          // 4. Reenfileira, com o texto novo, apenas quem ainda nao recebeu.
          const toSend = confirmationRecipients.filter(r => !sentPhones.has(normalizePhone(r.telefone)));
          if (toSend.length > 0) {
            const messages = toSend.map(registration => ({
              phone: normalizePhone(registration.telefone),
              text: buildConfirmationFor(registration),
              alunoNome: registration.nome,
              registrationId: registration.id,
              instanceName: connectedInstance.instanceName,
              type: 'data_confirmation',
            }));
            const res = await fetchWithTimeout(`${workerUrl}/queue/enqueue`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messages }),
            }, 120000);
            if (!res.ok) throw new Error('Falha ao reenfileirar as mensagens.');
            await addDoc(dataConfirmationRunsRef, {
              createdAt: new Date(),
              total: messages.length,
              puladosJaReceberam: sentPhones.size,
              tipo: 'reenvio',
              recipientIds: toSend.map(r => r.id),
              recipients: toSend.map(r => ({ id: r.id, nome: r.nome || '', telefone: normalizePhone(r.telefone) })),
            });
          }
          // 5. Retoma a fila para os novos comecarem a sair.
          await setQueuePausedState(false);
          await loadQueue();
          await loadConfirmationHistory();
          showAlert(`Fila antiga cancelada. ${sentPhones.size} ja receberam (pulados) e ${toSend.length} foram reenfileiradas com acento.`, 'success');
        } catch (e: any) {
          const message = String(e?.message || '').includes('aborted')
            ? 'A operacao demorou demais e foi interrompida. A fila foi pausada; tente novamente (o clear pode continuar rodando no servidor).'
            : (e?.message || 'Erro ao cancelar e reenviar.');
          showAlert(message, 'error');
        } finally {
          setConfirmSending(false);
          setLoading(false);
        }
      },
    );
  };

  useEffect(() => {
    if (activeTab === 'automacoes' && automacaoView === 'confirmacao') {
      loadConfirmationHistory().catch(e => console.error('[Confirmacao] load', e));
      loadQueue().catch(e => console.error('[Confirmacao] queue', e));
      // Atualiza o status real de cada instancia para saber qual numero esta conectado.
      if (numberInstances.length) refreshNumberStatuses(numberInstances).catch(e => console.error('[Confirmacao] status', e));
    }
  }, [activeTab, automacaoView]);

  // --- Resumo operacional diario ---
  // O banner (logo + titulo + data real) e gerado pelo proprio worker a cada envio/preview,
  // entao a previa aqui e so uma <img> apontando pro endpoint - sem html2canvas/upload no cliente.
  const loadOperationalPreview = async (dateStr = opSelectedDate) => {
    if (!workerUrl) return;
    setOpPreviewLoading(true);
    try {
      const res = await fetchWithTimeout(`${workerUrl}/operational-summary/preview?date=${dateStr}`, {}, 20000);
      const data = await res.json();
      setOpPreview(data.preview || '');
    } catch (e) {
      console.error('[OpSummary] preview', e);
      setOpPreview('');
    } finally {
      setOpPreviewLoading(false);
      setOpBannerNonce(n => n + 1);
    }
  };

  const saveOperationalConfig = async () => {
    if (opConfig.enabled && !opConfig.phone.trim()) return showAlert('Informe o numero que vai receber o resumo.', 'warning');
    if (opConfig.enabled && !/^\d{2}:\d{2}$/.test(opConfig.time)) return showAlert('Informe um horario valido (HH:MM).', 'warning');
    setOpSaving(true);
    try {
      const payload: OperationalConfig = {
        enabled: opConfig.enabled,
        time: opConfig.time,
        phone: normalizePhone(opConfig.phone),
        instanceName: opConfig.instanceName || (getConnectedInstance()?.instanceName || ''),
        bannerUrl: '',
      };
      await setDoc(operationalSummaryRef, payload, { merge: true });
      setOpConfig(prev => ({ ...prev, ...payload }));
      showAlert('Configuracao do resumo operacional salva.', 'success');
    } catch (e: any) {
      showAlert(e.message || 'Erro ao salvar a configuracao.', 'error');
    } finally {
      setOpSaving(false);
    }
  };

  // Envio manual: hoje ou qualquer data passada, escolhida no seletor.
  const sendManualOperationalSummary = () => {
    if (!opConfig.phone.trim()) return showAlert('Salve um numero antes de enviar.', 'warning');
    const [y, m, d] = opSelectedDate.split('-');
    showConfirm(`Enviar o resumo operacional de ${d}/${m}/${y} para o numero configurado?`, async () => {
      setOpSending(true);
      try {
        const res = await fetchWithTimeout(`${workerUrl}/operational-summary/send-manual`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: opSelectedDate }),
        }, 60000);
        const data = await res.json();
        if (data.success) showAlert('Resumo enviado para o WhatsApp configurado.', 'success');
        else showAlert(data.error || data.skipped || 'Nao foi possivel enviar o resumo.', 'warning');
      } catch (e: any) {
        showAlert(e.message || 'Erro ao enviar o resumo.', 'error');
      } finally {
        setOpSending(false);
      }
    });
  };

  useEffect(() => {
    if (activeTab === 'resumo') {
      loadOperationalPreview(opSelectedDate).catch(e => console.error('[OpSummary] load', e));
      if (numberInstances.length) refreshNumberStatuses(numberInstances).catch(() => undefined);
    }
  }, [activeTab, opSelectedDate]);

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
            { id: 'resumo', label: 'RESUMO DIARIO', icon: <ClipboardCheck size={18} /> },
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

          {activeTab === 'resumo' && (
            <SectionCard title="Resumo operacional diario" icon={<ClipboardCheck size={20} />}>
              <div style={{ padding: 16, background: '#eff6ff', borderRadius: 16, color: '#1d4ed8', fontSize: '.85rem', fontWeight: 700, lineHeight: 1.5, marginBottom: 20 }}>
                Todo dia, no horario escolhido, o sistema envia (pelo servidor, mesmo com o PC desligado) o resumo do
                <strong> dia anterior</strong> para o WhatsApp abaixo. Voce tambem pode disparar manualmente o resumo de
                <strong> hoje ou de qualquer data passada</strong> escolhendo a data logo abaixo.
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap', padding: 16, background: opConfig.enabled ? '#f0fdf4' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, marginBottom: 18 }}>
                <div>
                  <div style={{ color: '#071A45', fontWeight: 900, marginBottom: 4 }}>Envio automatico diario</div>
                  <div style={{ color: '#64748b', fontSize: '.84rem' }}>{opConfig.enabled ? 'Ativo' : 'Desativado'}{opConfig.lastSentDate ? ` - ultimo envio: ${opConfig.lastSentDate}` : ''}</div>
                </div>
                <FormSwitch checked={opConfig.enabled} onChange={value => setOpConfig(prev => ({ ...prev, enabled: value }))} label="" />
              </div>

              <ResponsiveGrid>
                <Field label="Horario de envio automatico (HH:MM)">
                  <input type="time" value={opConfig.time} onChange={e => setOpConfig(prev => ({ ...prev, time: e.target.value }))} className="admin-input" style={{ width: '100%', height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid #e2e8f0', color: '#071A45', fontWeight: 800 }} />
                </Field>
                <Field label="Numero que recebe o resumo">
                  <FormInput value={opConfig.phone} onChange={e => setOpConfig(prev => ({ ...prev, phone: e.target.value }))} placeholder="5533999999999" />
                </Field>
              </ResponsiveGrid>

              <Field label="Numero que envia">
                <select
                  value={opConfig.instanceName || getConnectedInstance()?.instanceName || ''}
                  onChange={e => setOpConfig(prev => ({ ...prev, instanceName: e.target.value }))}
                  className="admin-input"
                  style={{ width: '100%', height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid #e2e8f0', color: '#071A45', fontWeight: 800 }}
                >
                  {getAvailableInstances().map(item => (
                    <option key={item.id} value={item.instanceName}>{(item.label || item.instanceName)} - {getInstanceState(item.instanceName)}</option>
                  ))}
                </select>
              </Field>

              <button className="whatsapp-primary-btn" onClick={saveOperationalConfig} disabled={opSaving} style={{ marginTop: 4 }}>
                <Save size={16} /> {opSaving ? 'Salvando...' : 'Salvar configuracao'}
              </button>

              <div style={{ height: 1, background: '#f1f5f9', margin: '26px 0' }} />

              <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 900, color: '#071A45' }}>Envio manual</h3>
              <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '.82rem' }}>Escolha a data (hoje ou passada) para conferir a previa e, se quiser, disparar na hora.</p>

              <Field label="Data do resumo">
                <input
                  type="date"
                  value={opSelectedDate}
                  max={brDateStr(0)}
                  onChange={e => setOpSelectedDate(e.target.value)}
                  className="admin-input"
                  style={{ width: '100%', maxWidth: 220, height: 46, padding: '0 14px', borderRadius: 12, border: '1px solid #e2e8f0', color: '#071A45', fontWeight: 800 }}
                />
              </Field>

              {/* Preview do banner (gerado pelo worker, com a data real) + da mensagem */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 18, marginTop: 8, alignItems: 'start' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Imagem (banner)</label>
                  <img
                    key={opBannerNonce}
                    src={`${workerUrl}/operational-summary/banner-preview?date=${opSelectedDate}&v=${opBannerNonce}`}
                    alt="Banner do resumo operacional"
                    style={{ width: '100%', maxWidth: 280, borderRadius: 16, border: '2px solid rgba(107,255,42,0.3)', display: 'block' }}
                  />
                  <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 700, marginTop: 8 }}>Gerado com a data real ({opSelectedDate.split('-').reverse().slice(0, 2).join('/')}) no momento do envio/previa.</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 900, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Pre-visualizacao da mensagem</label>
                  <div style={{ background: '#0b141a', borderRadius: 16, padding: 16, minHeight: 200 }}>
                    {opPreviewLoading ? (
                      <div style={{ color: '#8696a0', textAlign: 'center', padding: 24, fontWeight: 700 }}>Carregando...</div>
                    ) : opPreview ? (
                      <div style={{ background: '#005c4b', color: '#e9edef', borderRadius: 12, padding: '12px 14px', whiteSpace: 'pre-wrap', fontSize: '0.82rem', lineHeight: 1.5 }}>{opPreview}</div>
                    ) : (
                      <div style={{ color: '#8696a0', textAlign: 'center', padding: 24, fontWeight: 700 }}>Sem previa disponivel.</div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
                <button className="whatsapp-secondary-btn" onClick={() => loadOperationalPreview(opSelectedDate)} disabled={opPreviewLoading}>
                  <RefreshCcw size={16} /> Atualizar previa
                </button>
                <button className="whatsapp-primary-btn" onClick={sendManualOperationalSummary} disabled={opSending || !getConnectedInstance()} style={{ flex: 1, minWidth: 200, background: '#25D366', color: '#071A45' }}>
                  <Send size={16} /> {opSending ? 'Enviando...' : `Enviar resumo de ${opSelectedDate.split('-').reverse().slice(0, 2).join('/')}`}
                </button>
              </div>
            </SectionCard>
          )}

          {activeTab === 'automacoes' && (
            <div style={{ display: 'grid', gap: 20 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {([['avisos', 'AVISOS DE INSCRIÇÃO', <Clock size={16} />], ['confirmacao', 'MENSAGEM DE CONFIRMAÇÃO DE DADOS', <ClipboardCheck size={16} />]] as const).map(([id, label, icon]) => (
                  <button
                    key={id}
                    onClick={() => setAutomacaoView(id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', cursor: 'pointer',
                      padding: '11px 18px', borderRadius: 12, fontWeight: 900, fontSize: '0.76rem',
                      background: automacaoView === id ? '#071A45' : '#f1f5f9',
                      color: automacaoView === id ? '#fff' : '#64748b',
                    }}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>

              {automacaoView === 'avisos' && (
                <SectionCard title="Avisos de inscricao" icon={<Clock size={20} />}>
                  <div style={{ padding: 18, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16 }}>
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

              {automacaoView === 'confirmacao' && (
                <SectionCard title="Mensagem de confirmacao de dados" icon={<ClipboardCheck size={20} />}>
                  <div style={{ padding: 16, background: '#eff6ff', borderRadius: 16, color: '#1d4ed8', fontSize: '.85rem', fontWeight: 700, lineHeight: 1.5, marginBottom: 20 }}>
                    Envia para <strong>todos os inscritos confirmados</strong> uma mensagem com a lista de dados da inscricao de cada um.
                    O envio usa o numero conectado e respeita 30 segundos entre uma mensagem e outra.
                  </div>

                  {(() => {
                    const connectedInstance = getConnectedInstance();
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 22 }}>
                        <MiniStat label="Confirmados com telefone" value={String(confirmationRecipients.length)} tone="#2563eb" />
                        <MiniStat label="Numero de envio" value={connectedInstance ? (connectedInstance.label || connectedInstance.instanceName) : 'Desconectado'} tone={connectedInstance ? '#16a34a' : '#dc2626'} />
                        <MiniStat label="Intervalo entre envios" value="30 segundos" tone="#b45309" />
                      </div>
                    );
                  })()}

                  {/* Preview */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                      <label style={{ fontSize: '0.72rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase' }}>Pre-visualizacao da mensagem</label>
                      {confirmationRecipients.length > 0 && (
                        <select
                          value={confirmPreviewRegistration?.id || ''}
                          onChange={e => setConfirmPreviewId(e.target.value)}
                          className="admin-input"
                          style={{ height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid #e2e8f0', color: '#071A45', fontWeight: 800, maxWidth: 260 }}
                        >
                          {confirmationRecipients.slice(0, 100).map(r => (
                            <option key={r.id} value={r.id}>{r.nome || 'Atleta'}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div style={{ background: '#0b141a', borderRadius: 16, padding: 16 }}>
                      {confirmPreviewRegistration ? (
                        <div style={{ background: '#005c4b', color: '#e9edef', borderRadius: 12, padding: '12px 14px', maxWidth: 460, marginLeft: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.82rem', lineHeight: 1.5, fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                          {buildConfirmationFor(confirmPreviewRegistration)}
                        </div>
                      ) : (
                        <div style={{ color: '#8696a0', textAlign: 'center', padding: 24, fontWeight: 700 }}>
                          Nenhum inscrito confirmado com telefone para pre-visualizar.
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    className="whatsapp-primary-btn"
                    onClick={sendDataConfirmation}
                    disabled={confirmSending || !getConnectedInstance() || confirmationRecipients.length === 0}
                    style={{ width: '100%', opacity: (!getConnectedInstance() || confirmationRecipients.length === 0) ? 0.5 : 1 }}
                  >
                    <Send size={16} /> {confirmSending ? 'Enfileirando...' : `Enviar para ${confirmationRecipients.length} confirmado(s)`}
                  </button>

                  {/* Controle da fila: pausar / retomar o envio ja disparado */}
                  <div style={{ marginTop: 14, padding: 16, border: '1px solid #e2e8f0', borderRadius: 16, background: queuePaused ? '#fff7ed' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: '#071A45', fontWeight: 900, fontSize: '0.9rem' }}>
                        Envio {queuePaused ? 'PAUSADO' : 'em andamento'} · {queueItems.length} na fila
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
                        As mensagens saem sozinhas no servidor (30s entre cada). Voce pode pausar e retomar quando quiser.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="whatsapp-secondary-btn" onClick={loadQueue} disabled={queueLoading}>
                        <RefreshCcw size={15} /> Atualizar
                      </button>
                      <button
                        className={queuePaused ? 'whatsapp-primary-btn' : 'whatsapp-secondary-btn'}
                        onClick={toggleQueuePause}
                        disabled={queueLoading}
                        style={queuePaused ? { background: '#16a34a' } : { color: '#c2410c' }}
                      >
                        {queuePaused ? <Play size={15} /> : <Clock size={15} />} {queuePaused ? 'Retomar fila' : 'Pausar fila'}
                      </button>
                    </div>
                  </div>

                  <button
                    className="whatsapp-secondary-btn"
                    onClick={cancelAndResend}
                    disabled={confirmSending || !getConnectedInstance()}
                    style={{ width: '100%', marginTop: 10, color: '#c2410c', border: '1px solid #fed7aa', background: '#fff7ed' }}
                  >
                    <Trash2 size={15} /> Cancelar fila e reenviar (pulando quem já recebeu)
                  </button>
                  <div style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 700, marginTop: 6, lineHeight: 1.4 }}>
                    Descarta as mensagens pendentes antigas e recria a fila com o texto corrigido (acentos), enviando apenas para quem ainda não recebeu.
                  </div>

                  {/* Historico */}
                  <div style={{ marginTop: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: '#071A45', fontSize: '0.9rem', fontWeight: 950 }}>
                        <History size={16} /> Historico de envios
                      </h3>
                      <button className="whatsapp-secondary-btn" onClick={loadConfirmationHistory} disabled={confirmHistoryLoading}>
                        <RefreshCcw size={15} /> Atualizar
                      </button>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
                      {confirmRuns.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>
                          {confirmHistoryLoading ? 'Carregando...' : 'Nenhum envio realizado ainda.'}
                        </div>
                      ) : (
                        confirmRuns.map(run => {
                          const runDate = run.createdAt?.toDate?.() || (run.createdAt ? new Date(run.createdAt) : null);
                          const isOpen = expandedRunId === run.id;
                          return (
                            <div key={run.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                              <button
                                onClick={() => setExpandedRunId(isOpen ? null : run.id)}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', background: isOpen ? '#f8fafc' : '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                              >
                                <div>
                                  <div style={{ color: '#071A45', fontWeight: 900, fontSize: '0.88rem' }}>{run.total} mensagem(ns) enviada(s)</div>
                                  <div style={{ color: '#64748b', fontSize: '0.76rem', fontWeight: 700 }}>{runDate ? formatDateTimeBR(runDate) : '-'}</div>
                                </div>
                                <span style={{ color: '#2563eb', fontSize: '0.72rem', fontWeight: 900 }}>{isOpen ? 'OCULTAR' : 'VER DESTINATARIOS'}</span>
                              </button>
                              {isOpen && (
                                <div style={{ padding: '4px 16px 16px', display: 'grid', gap: 6 }}>
                                  {(run.recipients || []).map((recipient: any, index: number) => (
                                    <div key={recipient.id || index} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 10, fontSize: '0.8rem' }}>
                                      <span style={{ color: '#071A45', fontWeight: 800 }}>{recipient.nome || 'Atleta'}</span>
                                      <span style={{ color: '#64748b', fontWeight: 700 }}>{recipient.telefone || '-'}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </SectionCard>
              )}
            </div>
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


function MiniStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 14, background: '#f8fafc', borderLeft: `4px solid ${tone}` }}>
      <div style={{ color: '#94a3b8', fontSize: '.68rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ color: '#071A45', fontSize: '1rem', fontWeight: 950, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
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
