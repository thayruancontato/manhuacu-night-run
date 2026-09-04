import { useEffect, useState } from 'react';
import { Loader2, Phone, PlayCircle, Plus, Trash2 } from 'lucide-react';

type Props = {
  workerUrl: string | undefined;
  showAlert: (message: string, severity?: string, image?: string) => void;
};

type Status = {
  count: number;
  sent: boolean;
  sentAt: string | null;
  numbers: string[];
};

const maskPhone = (value: string) => value
  .replace(/\D/g, '')
  .slice(0, 11)
  .replace(/(\d{2})(\d)/, '($1) $2')
  .replace(/(\d{5})(\d)/, '$1-$2');

export default function ThousandBroadcastPanel({ workerUrl, showAlert }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [newNumber, setNewNumber] = useState('');

  const load = async () => {
    if (!workerUrl) return setLoading(false);
    try {
      setLoading(true);
      const res = await fetch(`${workerUrl}/thousand/status`);
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao carregar status do aviso de 1000 confirmados.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workerUrl]);

  const saveNumbers = async (numbers: string[]) => {
    if (!workerUrl) return;
    setSaving(true);
    try {
      await fetch(`${workerUrl}/thousand/numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numbers }),
      });
      setStatus(prev => prev ? { ...prev, numbers } : prev);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar números.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const addNumber = () => {
    const digits = newNumber.replace(/\D/g, '');
    if (digits.length < 10) return showAlert('Digite um telefone válido com DDD.', 'warning');
    const current = status?.numbers || [];
    if (current.includes(digits)) return showAlert('Esse número já está na lista.', 'warning');
    const next = [...current, digits];
    setNewNumber('');
    saveNumbers(next);
  };

  const removeNumber = (n: string) => {
    const next = (status?.numbers || []).filter(item => item !== n);
    saveNumbers(next);
  };

  const runTest = async () => {
    if (!workerUrl) return;
    if (!status?.numbers?.length) return showAlert('Cadastre pelo menos um número antes de testar.', 'warning');
    setTesting(true);
    try {
      const res = await fetch(`${workerUrl}/thousand/test-broadcast`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showAlert(`Teste enviado para ${status.numbers.length} número(s): banner + PDF com ${data.rosterCount} confirmados atuais.`, 'success');
      } else {
        showAlert(`Falha no teste: ${data.reason || 'erro desconhecido'}`, 'error');
      }
    } catch (e) {
      console.error(e);
      showAlert('Erro ao disparar o teste.', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (!workerUrl) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>VITE_WORKER_URL não configurado.</div>;
  }

  if (loading) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Carregando...</div>;
  }

  return (
    <div>
      <div style={{ padding: 16, background: status?.sent ? '#f0fdf4' : '#eff6ff', border: `1px solid ${status?.sent ? '#bbf7d0' : '#bfdbfe'}`, borderRadius: 16, marginBottom: 24 }}>
        <strong style={{ color: '#071A45', display: 'block', marginBottom: 4 }}>
          Confirmados atuais: {status?.count ?? '-'} / 1000
        </strong>
        <span style={{ fontSize: '.82rem', color: '#475569', fontWeight: 600 }}>
          {status?.sent
            ? `Aviso real já disparado${status.sentAt ? ` em ${new Date(status.sentAt).toLocaleString('pt-BR')}` : ''}.`
            : 'Aviso ainda não disparado. Assim que o contador cruzar 1000, o sistema envia automaticamente (banner + PDF com todos os confirmados) para os números abaixo.'}
        </span>
      </div>

      <h3 style={{ fontSize: '.85rem', textTransform: 'uppercase', color: '#071A45', marginBottom: 10 }}>
        Números que recebem o aviso
      </h3>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e2e8f0', borderRadius: 12, padding: '0 14px' }}>
          <Phone size={16} color="#94a3b8" />
          <input
            value={newNumber}
            onChange={e => setNewNumber(maskPhone(e.target.value))}
            placeholder="(00) 00000-0000"
            style={{ flex: 1, border: 'none', outline: 'none', height: 44, fontWeight: 700, color: '#071A45' }}
          />
        </div>
        <button className="whatsapp-primary-btn" onClick={addNumber} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={16} /> Adicionar
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
        {(status?.numbers || []).length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: '.85rem', fontWeight: 600 }}>Nenhum número cadastrado ainda.</div>
        )}
        {(status?.numbers || []).map(n => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 10, padding: '10px 14px' }}>
            <Phone size={14} color="#64748b" />
            <span style={{ flex: 1, fontWeight: 800, color: '#071A45' }}>{n}</span>
            <button
              type="button"
              onClick={() => removeNumber(n)}
              disabled={saving}
              style={{ border: 'none', background: '#fee2e2', color: '#dc2626', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ padding: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, color: '#92400e', fontSize: '.82rem', fontWeight: 700, marginBottom: 16 }}>
        O teste manda o banner e o PDF de verdade (marcado como [TESTE]) para os números acima, usando os confirmados atuais - sem mexer no contador real nem marcar o aviso como enviado.
      </div>

      <button
        className="whatsapp-primary-btn"
        onClick={runTest}
        disabled={testing || !status?.numbers?.length}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: status?.numbers?.length ? 1 : 0.5 }}
      >
        {testing ? <Loader2 size={16} className="spin-anim" /> : <PlayCircle size={16} />}
        {testing ? 'Enviando teste...' : 'Testar agora'}
      </button>
    </div>
  );
}
