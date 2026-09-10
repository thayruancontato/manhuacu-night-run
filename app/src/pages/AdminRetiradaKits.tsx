import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { Search, CheckCircle2, PackageCheck, Users, X, AlertTriangle, LogOut, User as UserIcon } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

type Reg = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  numeroInscricao?: string;
  kit?: string;
  modalidadeNome?: string;
  categoria?: string;
  kitRetiradoEm?: any;
  kitRetiradoPor?: string;
  kitRetiradoTerceiro?: boolean;
};

const onlyDigits = (v: string) => (v || '').toString().replace(/\D/g, '');
const normalize = (v: string) => (v || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Painel exclusivo pra retirada de kits no dia do evento - separado do painel admin completo
// de propósito: uma única tela grande, busca no topo, sem menus/abas, pra qualquer voluntário
// conseguir usar sem treinamento. Login normal de admin (a sessão do Firebase Auth já persiste
// no navegador por padrão, então quem logar uma vez no tablet/computador da mesa continua
// logado nas próximas aberturas deste link, sem precisar digitar senha de novo).
export default function AdminRetiradaKits() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [regs, setRegs] = useState<Reg[]>([]);
  const [kits, setKits] = useState<KitRecord[]>([]);
  const [search, setSearch] = useState('');
  const [modo, setModo] = useState<'unica' | 'multipla'>('unica');
  const [terceiroNome, setTerceiroNome] = useState('');
  const [selecionadosMultipla, setSelecionadosMultipla] = useState<Record<string, Reg>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingMultipla, setProcessingMultipla] = useState(false);
  const [confirmarDuplicado, setConfirmarDuplicado] = useState<Reg | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || role !== 'admin')) navigate('/admin/login');
  }, [user, role, authLoading, navigate]);

  useEffect(() => {
    fetchKits().then(setKits).catch(() => {});
    const unsub = onSnapshot(
      query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago')),
      snap => setRegs(snap.docs.map(d => ({ id: d.id, ...d.data() } as Reg))),
      error => console.error('Erro ao acompanhar inscrições confirmadas:', error)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 3500);
    return () => clearTimeout(t);
  }, [feedback]);

  const results = useMemo(() => {
    const term = normalize(search);
    const termDigits = onlyDigits(search);
    if (term.length < 2 && termDigits.length < 2) return [];
    return regs
      .filter(r => {
        if (term.length >= 2 && normalize(r.nome).includes(term)) return true;
        if (termDigits.length >= 2 && onlyDigits(r.cpf).includes(termDigits)) return true;
        if (termDigits.length >= 2 && onlyDigits(r.telefone).includes(termDigits)) return true;
        if (termDigits.length >= 2 && onlyDigits(r.numeroInscricao || '').includes(termDigits)) return true;
        return false;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 40);
  }, [search, regs]);

  const kitNomeDe = (r: Reg) => resolveKitNome(kits, r.kit, 'Kit Único');

  const registrarRetirada = async (r: Reg, nomeRetirante: string, terceiro: boolean) => {
    setProcessingId(r.id);
    try {
      await updateDoc(doc(db, 'nightrun_registrations', r.id), {
        kitRetiradoEm: serverTimestamp(),
        kitRetiradoPor: nomeRetirante,
        kitRetiradoTerceiro: terceiro,
      });
      setFeedback({ text: `Kit de ${r.nome} registrado como retirado.`, type: 'success' });
      setConfirmarDuplicado(null);
      setSearch('');
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao registrar retirada. Tente novamente.', type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleClickRetirarUnica = (r: Reg) => {
    if (r.kitRetiradoEm) {
      setConfirmarDuplicado(r);
      return;
    }
    registrarRetirada(r, r.nome, false);
  };

  const toggleMultipla = (r: Reg) => {
    setSelecionadosMultipla(prev => {
      const next = { ...prev };
      if (next[r.id]) delete next[r.id];
      else next[r.id] = r;
      return next;
    });
  };

  const confirmarRetiradaMultipla = async () => {
    const nome = terceiroNome.trim();
    const ids = Object.keys(selecionadosMultipla);
    if (!nome) return setFeedback({ text: 'Informe o nome de quem está retirando os kits.', type: 'error' });
    if (ids.length === 0) return setFeedback({ text: 'Selecione ao menos um kit pra retirar.', type: 'error' });
    setProcessingMultipla(true);
    try {
      await Promise.all(ids.map(id => updateDoc(doc(db, 'nightrun_registrations', id), {
        kitRetiradoEm: serverTimestamp(),
        kitRetiradoPor: nome,
        kitRetiradoTerceiro: true,
      })));
      setFeedback({ text: `${ids.length} kit(s) registrado(s) como retirado(s) por ${nome}.`, type: 'success' });
      setSelecionadosMultipla({});
      setTerceiroNome('');
      setSearch('');
    } catch (e) {
      console.error(e);
      setFeedback({ text: 'Erro ao registrar as retiradas. Tente novamente.', type: 'error' });
    } finally {
      setProcessingMultipla(false);
    }
  };

  const handleLogout = () => {
    signOut(auth).catch(() => {});
    localStorage.removeItem('nightrun_admin_auth');
    navigate('/admin/login');
  };

  if (authLoading || !user || role !== 'admin') return null;

  const selecionadosArr = Object.values(selecionadosMultipla);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45' }}>
      <header style={{
        background: 'linear-gradient(135deg, #071A45, #123068)', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PackageCheck size={28} color="#6BFF2A" />
          <div>
            <h1 style={{ color: '#fff', fontSize: '1.3rem', fontWeight: 900, margin: 0 }}>RETIRADA DE KITS</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', margin: 0 }}>MCU Night Run 2026</p>
          </div>
        </div>
        <button onClick={handleLogout} style={{ background: 'rgba(255,255,255,.1)', border: 'none', color: '#fff', padding: '10px 16px', borderRadius: 10, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={16} /> Sair
        </button>
      </header>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 100px' }}>
        <div style={{ display: 'flex', gap: 8, background: '#e2e8f0', padding: 5, borderRadius: 14, marginBottom: 20 }}>
          <button
            onClick={() => { setModo('unica'); setSelecionadosMultipla({}); }}
            style={{
              flex: 1, padding: '14px', borderRadius: 10, border: 'none', fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer',
              background: modo === 'unica' ? '#fff' : 'transparent', color: modo === 'unica' ? '#071A45' : '#64748b',
              boxShadow: modo === 'unica' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            Retirada individual
          </button>
          <button
            onClick={() => setModo('multipla')}
            style={{
              flex: 1, padding: '14px', borderRadius: 10, border: 'none', fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer',
              background: modo === 'multipla' ? '#fff' : 'transparent', color: modo === 'multipla' ? '#071A45' : '#64748b',
              boxShadow: modo === 'multipla' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <Users size={18} /> Retirada múltipla (terceiro)
          </button>
        </div>

        {modo === 'multipla' && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, border: '2px solid #071A45' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 900, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Nome de quem está retirando os kits
            </label>
            <input
              value={terceiroNome}
              onChange={e => setTerceiroNome(e.target.value)}
              placeholder="Nome completo da pessoa"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '1rem', marginBottom: 12 }}
            />
            {selecionadosArr.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {selecionadosArr.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px' }}>
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: '#071A45' }}>{r.nome}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{kitNomeDe(r)}{r.numeroInscricao ? ` · Nº ${r.numeroInscricao}` : ''}</div>
                    </div>
                    <button onClick={() => toggleMultipla(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={confirmarRetiradaMultipla}
              disabled={processingMultipla || selecionadosArr.length === 0}
              style={{
                width: '100%', background: selecionadosArr.length === 0 ? '#cbd5e1' : '#6BFF2A',
                color: '#071A45', border: 'none', borderRadius: 12, padding: '16px', fontWeight: 900, fontSize: '1rem',
                cursor: selecionadosArr.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <CheckCircle2 size={20} />
              CONFIRMAR RETIRADA DE {selecionadosArr.length} KIT(S)
            </button>
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={20} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF, telefone ou número de inscrição..."
            autoFocus
            style={{ width: '100%', padding: '16px 16px 16px 48px', borderRadius: 14, border: '2px solid #071A45', fontSize: '1rem', boxSizing: 'border-box' }}
          />
        </div>

        {feedback && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontWeight: 800, fontSize: '0.85rem',
            background: feedback.type === 'success' ? '#dcfce7' : '#fee2e2',
            color: feedback.type === 'success' ? '#166534' : '#b91c1c',
          }}>
            {feedback.text}
          </div>
        )}

        {search.trim().length >= 2 && results.length === 0 && (
          <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px 0' }}>Nenhum confirmado encontrado.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {results.map(r => {
            const jaRetirado = Boolean(r.kitRetiradoEm);
            const selecionado = Boolean(selecionadosMultipla[r.id]);
            return (
              <div key={r.id} style={{
                background: '#fff', borderRadius: 14, padding: 16,
                border: selecionado ? '2px solid #071A45' : jaRetirado ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: jaRetirado ? '#dcfce7' : '#eff6ff', color: jaRetirado ? '#16a34a' : '#2563eb',
                }}>
                  {jaRetirado ? <CheckCircle2 size={22} /> : <UserIcon size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <strong style={{ fontSize: '0.95rem', color: '#071A45' }}>{r.nome}</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                    {kitNomeDe(r)}{r.numeroInscricao ? ` · Nº ${r.numeroInscricao}` : ''}
                  </div>
                  {jaRetirado && (
                    <div style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700, marginTop: 4 }}>
                      Retirado por {r.kitRetiradoPor || r.nome}{r.kitRetiradoTerceiro ? ' (terceiro)' : ''}
                    </div>
                  )}
                </div>
                {modo === 'unica' ? (
                  <button
                    onClick={() => handleClickRetirarUnica(r)}
                    disabled={processingId === r.id}
                    style={{
                      background: jaRetirado ? '#f1f5f9' : '#071A45', color: jaRetirado ? '#64748b' : '#fff',
                      border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 800, fontSize: '0.8rem',
                      cursor: processingId === r.id ? 'wait' : 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {jaRetirado ? 'JÁ RETIRADO' : 'CONFIRMAR RETIRADA'}
                  </button>
                ) : (
                  <button
                    onClick={() => toggleMultipla(r)}
                    style={{
                      background: selecionado ? '#071A45' : '#f1f5f9', color: selecionado ? '#fff' : '#334155',
                      border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    {selecionado ? 'SELECIONADO' : 'ADICIONAR'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {confirmarDuplicado && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 20, maxWidth: 380, width: '100%', padding: 28, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <AlertTriangle size={28} color="#d97706" />
            </div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 900, color: '#071A45', marginBottom: 8 }}>Este kit já foi retirado</h3>
            <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20 }}>
              O kit de <strong>{confirmarDuplicado.nome}</strong> já consta como retirado por{' '}
              <strong>{confirmarDuplicado.kitRetiradoPor || confirmarDuplicado.nome}</strong>. Confirmar mesmo assim?
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmarDuplicado(null)} style={{ flex: 1, padding: '14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => registrarRetirada(confirmarDuplicado, confirmarDuplicado.nome, false)}
                style={{ flex: 1, padding: '14px', borderRadius: 10, border: 'none', background: '#d97706', color: '#fff', fontWeight: 800, cursor: 'pointer' }}
              >
                Confirmar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
