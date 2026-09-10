import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { AdminPageSkeleton } from '../components/Skeleton';
import { GraduationCap, Plus, Copy, Trash2, ToggleLeft, ToggleRight, School } from 'lucide-react';
import '../styles/admin.css';

type LinkEscolar = {
  codigo: string;
  escola: string;
  maxAlunos: number;
  usados: number;
  ativo: boolean;
  createdAt?: any;
};

const MAX_ALUNOS_PADRAO = 4;

// Codigo curto (6 caracteres, sem letras/numeros ambiguos tipo 0/O/1/I) - vira o proprio ID
// do documento em nightrun_links_escolares, pra buscar o link na pagina publica com um unico
// getDoc (mais barato que uma query) em vez de gastar leitura extra do Firestore procurando.
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const gerarCodigo = () => Array.from({ length: 6 }, () => ALFABETO_CODIGO[Math.floor(Math.random() * ALFABETO_CODIGO.length)]).join('');

export default function AdminLinksEscolares() {
  const { showAlert, showConfirm } = useDialog();
  const [links, setLinks] = useState<LinkEscolar[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [copiadoCodigo, setCopiadoCodigo] = useState('');
  const [novaEscola, setNovaEscola] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'nightrun_links_escolares'), orderBy('createdAt', 'desc')),
      snap => {
        setLinks(snap.docs.map(d => ({ codigo: d.id, ...d.data() } as LinkEscolar)));
        setLoading(false);
      },
      err => {
        console.error('Erro ao carregar links escolares:', err);
        setLoading(false);
      }
    );
    return unsub;
  }, []);

  const criarLink = async () => {
    const escola = novaEscola.trim();
    if (!escola) return showAlert('Informe o nome da escola antes de gerar o link.', 'error');
    setCriando(true);
    try {
      const codigo = gerarCodigo();
      await setDoc(doc(db, 'nightrun_links_escolares', codigo), {
        escola,
        maxAlunos: MAX_ALUNOS_PADRAO,
        usados: 0,
        ativo: true,
        createdAt: new Date(),
      });
      setNovaEscola('');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao gerar o link. Tente novamente.', 'error');
    } finally {
      setCriando(false);
    }
  };

  const urlDoLink = (codigo: string) => `https://mcunightrun.com.br/inscricao-escolar/${codigo}`;

  const copiarLink = (codigo: string) => {
    navigator.clipboard.writeText(urlDoLink(codigo)).then(() => {
      setCopiadoCodigo(codigo);
      setTimeout(() => setCopiadoCodigo(''), 1800);
    });
  };

  const alternarAtivo = async (link: LinkEscolar) => {
    try {
      await updateDoc(doc(db, 'nightrun_links_escolares', link.codigo), { ativo: !link.ativo });
    } catch (e) {
      console.error(e);
      showAlert('Erro ao atualizar o link.', 'error');
    }
  };

  const apagarLink = (link: LinkEscolar) => {
    showConfirm(`Apagar o link da escola "${link.escola}"? Essa ação não pode ser desfeita.`, async () => {
      try {
        await deleteDoc(doc(db, 'nightrun_links_escolares', link.codigo));
      } catch (e) {
        console.error(e);
        showAlert('Erro ao apagar o link.', 'error');
      }
    });
  };

  if (loading) return <AdminPageSkeleton variant="table" />;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            <GraduationCap size={26} /> Links Escolares (Cortesia)
          </h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>
            Um link por escola municipal, com direito a {MAX_ALUNOS_PADRAO} inscrições gratuitas cada, exclusivas
            para menores de 18 anos. A inscrição feita por esses links fica marcada com a tag ESCOLAR.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={novaEscola}
            onChange={e => setNovaEscola(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') criarLink(); }}
            placeholder="Nome da escola municipal"
            style={{ padding: '13px 16px', borderRadius: 12, border: '2px solid #071A45', fontSize: '0.9rem', minWidth: 240 }}
          />
          <button
            onClick={criarLink}
            disabled={criando}
            style={{
              background: criando ? '#94a3b8' : '#071A45', color: '#fff', border: 'none', padding: '14px 22px', borderRadius: 12,
              fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 10, cursor: criando ? 'wait' : 'pointer',
              boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)', whiteSpace: 'nowrap',
            }}
          >
            <Plus size={20} /> GERAR LINK
          </button>
        </div>
      </div>

      {links.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '60px 0', fontWeight: 600 }}>
          Nenhum link escolar gerado ainda.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {links.map(link => {
            const esgotado = link.usados >= link.maxAlunos;
            return (
              <div key={link.codigo} style={{
                background: '#fff', borderRadius: 16, padding: 18, border: `1px solid ${link.ativo ? '#e2e8f0' : '#fecaca'}`,
                opacity: link.ativo ? 1 : 0.65,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <School size={18} color="#071A45" />
                    <strong style={{ fontSize: '0.95rem' }}>{link.escola}</strong>
                  </div>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 900, padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap',
                    background: esgotado ? '#fef2f2' : '#f0fdf4', color: esgotado ? '#dc2626' : '#16a34a',
                  }}>
                    {link.usados}/{link.maxAlunos} VAGAS
                  </span>
                </div>

                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px',
                  fontSize: '0.72rem', color: '#475569', wordBreak: 'break-all', marginBottom: 10, fontFamily: 'monospace',
                }}>
                  {urlDoLink(link.codigo)}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => copiarLink(link.codigo)}
                    style={{ background: '#eff6ff', color: '#2563eb', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Copy size={13} /> {copiadoCodigo === link.codigo ? 'COPIADO!' : 'COPIAR LINK'}
                  </button>
                  <button
                    onClick={() => alternarAtivo(link)}
                    style={{ background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {link.ativo ? <ToggleRight size={14} color="#16a34a" /> : <ToggleLeft size={14} color="#94a3b8" />}
                    {link.ativo ? 'ATIVO' : 'DESATIVADO'}
                  </button>
                  <button
                    onClick={() => apagarLink(link)}
                    style={{ background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Trash2 size={13} /> APAGAR
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
