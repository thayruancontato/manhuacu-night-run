import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquareWarning, RefreshCcw, Save, Send } from 'lucide-react';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import LoadingModal from '../components/LoadingModal';
import '../styles/admin.css';

const settingsRef = doc(db, 'system_settings', 'nightrun_pending_charge');

const DEFAULT_TEMPLATE =
  'Olá {nome}! Tudo bem\n\n' +
  'Seu pagamento da inscrição na MCU Night Run 2026 ainda não foi registrado no sistema.\n\n' +
  'Aceitamos pagamento via Pix e cartão de débito/crédito.\n\n' +
  'Para garantir sua vaga, acesse o link de pagamento:\n{link_pagamento}\n\n' +
  'Se você já pagou, basta nos enviar o comprovante por este WhatsApp para conferirmos e garantir sua vaga.';

const PAYMENT_PAGE_BASE_URL = 'https://mcunightrun.com.br/inscricao/pagamento';

const normalizePhone = (phone: string) => {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.startsWith('55') ? clean : `55${clean}`;
};

const fillTemplate = (template: string, registration: any) => template
  .replaceAll('{nome}', registration.nome.split(' ')[0] || 'Atleta')
  .replaceAll('{nome_completo}', registration.nome || 'Atleta')
  .replaceAll('{link_pagamento}', registration.id ? `${PAYMENT_PAGE_BASE_URL}/${registration.id}` : 'Link de pagamento não disponível')
  .replaceAll('{valor}', ((Number(registration.amount || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })));

export default function AdminCobrancaPendentes() {
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [testRegistrationId, setTestRegistrationId] = useState('');
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const workerUrl = import.meta.env.VITE_WORKER_URL;

  const pendentes = useMemo(() => registrations.filter(item => item.paymentStatus === 'pendente'), [registrations]);
  const sendable = useMemo(() => pendentes.filter(item => normalizePhone(item.telefone)), [pendentes]);
  const selectedTestRegistration = useMemo(() => (
    sendable.find(item => item.id === testRegistrationId) || sendable[0]
  ), [sendable, testRegistrationId]);
  const preview = selectedTestRegistration ? fillTemplate(template, selectedTestRegistration) : fillTemplate(template, { id: 'YUgRRc6EG5Vat3rqL9kz', nome: 'Rodrigo', amount: 9500 });

  const load = async () => {
    setLoading(true);
    try {
      const [settingsSnap, registrationsSnap] = await Promise.all([
        getDoc(settingsRef),
        getDocs(query(collection(db, 'nightrun_registrations'), orderBy('createdAt', 'desc'))),
      ]);
      if (settingsSnap.exists() && settingsSnap.data().template) {
        setTemplate(settingsSnap.data().template);
      }
      setRegistrations(registrationsSnap.docs.map(item => ({ id: item.id, ...item.data() })));
    } catch (error) {
      console.error(error);
      showAlert('Erro ao carregar cobranças pendentes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveTemplate = async () => {
    if (!template.trim()) return showAlert('Informe o modelo da mensagem.', 'warning');
    setSaving(true);
    try {
      await setDoc(settingsRef, { template, updatedAt: new Date() }, { merge: true });
      showAlert('Modelo de cobrança salvo.', 'success');
    } catch (error: any) {
      showAlert(error.message || 'Erro ao salvar modelo.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const sendCharges = () => {
    if (!workerUrl) return showAlert('Worker não configurado.', 'error');
    if (!template.trim()) return showAlert('Informe o modelo da mensagem.', 'warning');
    if (sendable.length === 0) return showAlert('Nenhum pendente com telefone encontrado.', 'warning');

    showConfirm(`Enviar cobrança para ${sendable.length} inscrição(ões) pendente(s)`, async () => {
      setSending(true);
      try {
        await setDoc(settingsRef, { template, updatedAt: new Date() }, { merge: true });
        const res = await fetch(`${workerUrl}/pending-charges/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) throw new Error(data.error || data.message || 'Falha ao iniciar cobrança pelo worker.');
        showAlert(`${data.count || 0} cobrança(s) enfileirada(s) pelo worker.`, 'success');
      } catch (error: any) {
        showAlert(error.message || 'Erro ao enviar cobranças.', 'error');
      } finally {
        setSending(false);
      }
    });
  };

  const sendTest = async () => {
    if (!workerUrl) return showAlert('Worker não configurado.', 'error');
    if (!template.trim()) return showAlert('Informe o modelo da mensagem.', 'warning');
    if (!selectedTestRegistration) return showAlert('Selecione uma inscrição pendente para o teste.', 'warning');
    const phone = normalizePhone(testPhone);
    if (!phone) return showAlert('Informe o número que vai receber o teste.', 'warning');

    setSendingTest(true);
    try {
      const res = await fetch(`${workerUrl}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          text: fillTemplate(template, selectedTestRegistration),
          alunoNome: selectedTestRegistration.nome,
          type: 'pending_charge_test',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || data.error || data.normalizedError || 'Falha ao enviar teste.');
      showAlert('Teste enviado.', 'success');
    } catch (error: any) {
      showAlert(error.message || 'Erro ao enviar teste.', 'error');
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div>
          <button onClick={() => navigate('/admin/inscritos')} style={{ border: 'none', background: 'transparent', color: '#64748b', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
            <ArrowLeft size={18} /> Voltar para inscritos
          </button>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', margin: 0 }}>Cobrança de pendentes</h1>
          <p style={{ color: '#64748b', fontWeight: 600, marginTop: 6 }}>Envie um aviso para quem ainda não teve o pagamento registrado.</p>
        </div>
        <button onClick={load} style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#475569', padding: '10px 18px', borderRadius: 12, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <RefreshCcw size={17} /> Atualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Metric label="Pendentes" value={pendentes.length} tone="#f59e0b" />
        <Metric label="Com telefone" value={sendable.length} tone="#22c55e" />
        <Metric label="Sem telefone" value={pendentes.length - sendable.length} tone="#ef4444" />
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: 18, borderRadius: 18, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', marginBottom: 22 }}>
          <MessageSquareWarning size={24} style={{ flexShrink: 0 }} />
          <div style={{ fontWeight: 800, lineHeight: 1.5 }}>
            Esta mensagem informa que o pagamento ainda não foi registrado. Se o inscrito já pagou, ele deve enviar o comprovante para conferência e garantia da vaga.
          </div>
        </div>

        <label style={{ display: 'block', color: '#64748b', fontSize: '.74rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 8 }}>Modelo da mensagem</label>
        <textarea
          value={template}
          onChange={event => setTemplate(event.target.value)}
          rows={9}
          style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, color: '#071A45', fontWeight: 650, lineHeight: 1.5, outline: 'none', resize: 'vertical' }}
        />
        <div style={{ color: '#64748b', fontSize: '.78rem', fontWeight: 700, marginTop: 10 }}>
          Variáveis: {'{nome}'}, {'{nome_completo}'}, {'{link_pagamento}'} e {'{valor}'}.
        </div>

        <div style={{ marginTop: 18, padding: 16, border: '1px solid #e2e8f0', borderRadius: 16, background: '#f8fafc' }}>
          <div style={{ color: '#071A45', fontWeight: 900, marginBottom: 12 }}>Enviar teste</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) auto', gap: 12, alignItems: 'end' }}>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', color: '#64748b', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 6 }}>Número do teste</span>
              <input
                value={testPhone}
                onChange={event => setTestPhone(event.target.value)}
                placeholder="5533999999999"
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', color: '#071A45', fontWeight: 800, outline: 'none' }}
              />
            </label>
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', color: '#64748b', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 6 }}>Pendente usado no modelo</span>
              <select
                value={selectedTestRegistration?.id || ''}
                onChange={event => setTestRegistrationId(event.target.value)}
                style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', color: '#071A45', fontWeight: 800, outline: 'none', background: '#fff' }}
              >
                {sendable.map(item => (
                  <option key={item.id} value={item.id}>{item.nome || 'Sem nome'} - {item.telefone || 'sem telefone'}</option>
                ))}
              </select>
            </label>
            <button onClick={sendTest} disabled={sendingTest || !selectedTestRegistration} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 18px', borderRadius: 12, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: sendingTest ? 'wait' : 'pointer', opacity: selectedTestRegistration ? 1 : .55 }}>
              <Send size={17} /> {sendingTest ? 'Enviando...' : 'Enviar teste'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
          <button onClick={saveTemplate} disabled={saving} style={{ background: '#f1f5f9', color: '#071A45', border: 'none', padding: '12px 18px', borderRadius: 12, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: saving ? 'wait' : 'pointer' }}>
            <Save size={17} /> {saving ? 'Salvando...' : 'Salvar modelo'}
          </button>
          <button onClick={sendCharges} disabled={sending} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 22px', borderRadius: 12, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 8, cursor: sending ? 'wait' : 'pointer' }}>
            <Send size={17} /> {sending ? 'Enfileirando...' : 'Confirmar e enviar para pendentes'}
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 24 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 900, color: '#071A45', margin: '0 0 14px' }}>Prévia</h2>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', color: '#475569', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 16, padding: 16, lineHeight: 1.5 }}>{preview}</pre>
      </div>

      <LoadingModal isOpen={loading} />
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: `${tone}15`, color: tone, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>{value}</div>
      <div style={{ color: '#64748b', fontWeight: 900, textTransform: 'uppercase', fontSize: '.75rem' }}>{label}</div>
    </div>
  );
}
