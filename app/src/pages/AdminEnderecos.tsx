import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CheckCircle2, MapPin, Phone, Search, XCircle } from 'lucide-react';
import { db } from '../firebase';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { formatDateTimeBR } from '../utils/dateUtils';

type Registro = {
  id: string;
  nome: string;
  telefone: string;
  preenchido: boolean;
  preenchidoEm: any;
  cidade: string;
  uf: string;
  enderecoResumo: string;
};

type Filtro = 'todos' | 'pendentes' | 'preenchidos';

export default function AdminEnderecos() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => {
          const data = d.data();
          const endereco = data.endereco || {};
          const preenchido = Boolean(data.enderecoPreenchidoEm);
          const enderecoResumo = preenchido
            ? [endereco.rua, endereco.numero].filter(Boolean).join(', ') +
              (endereco.bairro ? ` - ${endereco.bairro}` : '')
            : '';
          return {
            id: d.id,
            nome: String(data.nome || 'Sem nome'),
            telefone: data.telefone || '',
            preenchido,
            preenchidoEm: data.enderecoPreenchidoEm || null,
            cidade: endereco.cidade || '',
            uf: endereco.uf || '',
            enderecoResumo,
          } as Registro;
        });
        list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
        setRegistros(list);
      } catch (e) {
        console.error('Erro ao carregar endereços:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const stats = useMemo(() => {
    const preenchidos = registros.filter(r => r.preenchido).length;
    return { total: registros.length, preenchidos, pendentes: registros.length - preenchidos };
  }, [registros]);

  const filtrados = useMemo(() => {
    const term = search.trim().toLowerCase();
    return registros.filter(r => {
      if (filtro === 'pendentes' && r.preenchido) return false;
      if (filtro === 'preenchidos' && !r.preenchido) return false;
      if (!term) return true;
      return [r.nome, r.telefone, r.cidade].some(v => String(v || '').toLowerCase().includes(term));
    });
  }, [registros, filtro, search]);

  return (
    <PageContainer>
      <PageTitle
        title="ENDEREÇOS DOS ATLETAS"
        subtitle="Acompanhe quem já preencheu o endereço para a divisão da premiação por cidade"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="data-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(168,85,247,0.1)', color: '#a855f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={20} />
          </div>
          <div>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: '#071A45', fontWeight: 900 }}>{stats.total}</strong>
            <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 700 }}>Total confirmados</span>
          </div>
        </div>
        <div className="data-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(22,163,74,0.1)', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: '#071A45', fontWeight: 900 }}>{stats.preenchidos}</strong>
            <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 700 }}>Endereço preenchido</span>
          </div>
        </div>
        <div className="data-card" style={{ padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(220,38,38,0.1)', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <XCircle size={20} />
          </div>
          <div>
            <strong style={{ display: 'block', fontSize: '1.4rem', color: '#071A45', fontWeight: 900 }}>{stats.pendentes}</strong>
            <span style={{ fontSize: '.75rem', color: '#64748b', fontWeight: 700 }}>Pendentes</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', flex: 1, minWidth: 220 }}>
          <Search size={16} color="#94a3b8" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone ou cidade..."
            style={{ border: 'none', outline: 'none', flex: 1, fontSize: '.85rem', fontWeight: 600, color: '#071A45' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            { id: 'todos', label: 'Todos' },
            { id: 'pendentes', label: 'Pendentes' },
            { id: 'preenchidos', label: 'Preenchidos' },
          ] as { id: Filtro; label: string }[]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setFiltro(opt.id)}
              style={{
                padding: '10px 16px', borderRadius: 12, border: '1px solid #e2e8f0', cursor: 'pointer',
                background: filtro === opt.id ? '#071A45' : '#fff',
                color: filtro === opt.id ? '#fff' : '#64748b',
                fontWeight: 800, fontSize: '.78rem',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="data-card" style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhum registro encontrado.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtrados.map(r => (
            <div key={r.id} className="data-card" style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: r.preenchido ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                color: r.preenchido ? '#16a34a' : '#dc2626',
              }}>
                {r.preenchido ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <strong style={{ color: '#071A45', display: 'block' }}>{r.nome}</strong>
                <span style={{ fontSize: '.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Phone size={11} /> {r.telefone || 'sem telefone'}
                </span>
              </div>
              {r.preenchido ? (
                <div style={{ textAlign: 'right', minWidth: 180 }}>
                  <span style={{ display: 'block', fontSize: '.82rem', fontWeight: 800, color: '#16a34a' }}>
                    {r.cidade}{r.uf ? ` - ${r.uf}` : ''}
                  </span>
                  <span style={{ display: 'block', fontSize: '.7rem', color: '#94a3b8' }}>{r.enderecoResumo}</span>
                  <span style={{ display: 'block', fontSize: '.68rem', color: '#cbd5e1', marginTop: 2 }}>
                    Preenchido em {formatDateTimeBR(r.preenchidoEm, '')}
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: '.78rem', fontWeight: 800, color: '#dc2626', background: 'rgba(220,38,38,0.08)', padding: '6px 12px', borderRadius: 20 }}>
                  Pendente
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
