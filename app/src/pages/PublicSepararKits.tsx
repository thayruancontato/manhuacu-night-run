import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Package,
  Search,
  User,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import '../App.css';

type Atleta = {
  id: string;
  nome: string;
  kit?: string;
  numeroInscricao?: string;
  modalidadeNome?: string;
  fotoUrl?: string;
  euVouCardUrl?: string;
  kitRetiradoEm?: any;
  kitRetiradoPor?: string;
  kitSeparadoPara?: string;
  searchNome: string;
};

type Step = 'carregando' | 'identificacao' | 'selecionar' | 'sucesso';

const DIACRITICS_RE = /[̀-ͯ]/g;
const normalizeText = (value: string) => value.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase().trim();
const onlyDigits = (value: string) => value.replace(/\D/g, '');

const maskCpf = (value: string) => onlyDigits(value)
  .slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

// Página pública (sem login) pra quem vai retirar o kit de outras pessoas se identificar
// (nome + CPF) e já marcar de antemão quais atletas ela vai buscar - grava o mesmo campo
// kitSeparadoPara/kitSeparadoEm que a aba "Separar Kits" do painel admin usa, então a mesa
// de retirada já vê tudo pronto quando a pessoa chegar no evento.
export default function PublicSepararKits() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('carregando');
  const [atletas, setAtletas] = useState<Atleta[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [terceiroNome, setTerceiroNome] = useState('');
  const [terceiroCpf, setTerceiroCpf] = useState('');
  const [erroIdentificacao, setErroIdentificacao] = useState('');

  const [search, setSearch] = useState('');
  const [selecionados, setSelecionados] = useState<Record<string, Atleta>>({});
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const workerUrl = import.meta.env.VITE_WORKER_URL;
        const res = await fetch(`${workerUrl}/roster/confirmed`);
        const data = await res.json();
        const list = (data.athletes || []).map((a: any) => {
          const nome = String(a.nome || '').trim();
          return {
            id: a.id,
            nome,
            kit: a.kit || '',
            numeroInscricao: a.numeroInscricao || '',
            modalidadeNome: a.modalidadeNome || '',
            fotoUrl: a.fotoUrl || '',
            euVouCardUrl: a.euVouCardUrl || '',
            kitRetiradoEm: a.kitRetiradoEm || null,
            kitRetiradoPor: a.kitRetiradoPor || '',
            kitSeparadoPara: a.kitSeparadoPara || '',
            searchNome: normalizeText(nome),
          } as Atleta;
        });
        list.sort((a: Atleta, b: Atleta) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
        setAtletas(list);
        setStep('identificacao');
      } catch (e) {
        console.error('Erro ao carregar lista de confirmados:', e);
        setLoadError(true);
      }
    })();
  }, []);

  const resultados = useMemo(() => {
    const term = normalizeText(search);
    if (term.length < 2) return [];
    return atletas.filter(a => a.searchNome.includes(term)).slice(0, 20);
  }, [atletas, search]);

  const confirmarIdentificacao = () => {
    if (terceiroNome.trim().length < 3) {
      setErroIdentificacao('Digite seu nome completo.');
      return;
    }
    if (onlyDigits(terceiroCpf).length !== 11) {
      setErroIdentificacao('Digite os 11 números do seu CPF.');
      return;
    }
    setErroIdentificacao('');
    setStep('selecionar');
  };

  const toggleSelecionado = (a: Atleta) => {
    if (a.kitRetiradoEm) return;
    setSelecionados(prev => {
      const next = { ...prev };
      if (next[a.id]) delete next[a.id];
      else next[a.id] = a;
      return next;
    });
  };

  const selecionadosArr = Object.values(selecionados);

  const confirmarSeparacao = async () => {
    if (selecionadosArr.length === 0) {
      setErroEnvio('Selecione ao menos um atleta.');
      return;
    }
    setErroEnvio('');
    setEnviando(true);
    try {
      await Promise.all(selecionadosArr.map(a => updateDoc(doc(db, 'nightrun_registrations', a.id), {
        kitSeparadoPara: terceiroNome.trim(),
        kitSeparadoParaCpf: onlyDigits(terceiroCpf),
        kitSeparadoEm: serverTimestamp(),
      })));
      setStep('sucesso');
    } catch (e) {
      console.error('Erro ao separar kits:', e);
      setErroEnvio('Não foi possível salvar agora. Tente novamente em instantes.');
    } finally {
      setEnviando(false);
    }
  };

  if (step === 'carregando') {
    return (
      <div className="endereco-page">
        <div className="endereco-loading">
          <Loader2 size={32} className="endereco-spinner" />
          <span>Carregando lista de confirmados...</span>
        </div>
        {loadError && (
          <div className="endereco-loading-erro">
            Não foi possível carregar a lista agora. <button onClick={() => window.location.reload()}>Tentar de novo</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="endereco-page">
      <div className="endereco-header">
        <button
          type="button"
          className="endereco-back"
          onClick={() => (step === 'identificacao' ? navigate('/') : setStep('identificacao'))}
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="endereco-header-titles">
          <h1>RETIRAR KITS DE OUTRAS PESSOAS</h1>
          <span>Separe com antecedência quem você vai buscar</span>
        </div>
      </div>

      {step === 'identificacao' && (
        <div className="endereco-step">
          <div className="endereco-step-icon"><User size={26} /></div>
          <h2>Quem está retirando?</h2>
          <p>Informe seu nome e CPF - você vai apresentar um documento com foto na hora da retirada.</p>

          <label className="endereco-field-label" htmlFor="terceiro-nome">Nome completo</label>
          <input
            id="terceiro-nome"
            className="endereco-input"
            value={terceiroNome}
            onChange={e => { setTerceiroNome(e.target.value); setErroIdentificacao(''); }}
            placeholder="Seu nome completo"
            autoFocus
          />

          <label className="endereco-field-label" htmlFor="terceiro-cpf" style={{ marginTop: 14 }}>Seu CPF</label>
          <input
            id="terceiro-cpf"
            className={`endereco-input ${erroIdentificacao ? 'erro' : ''}`}
            value={maskCpf(terceiroCpf)}
            onChange={e => { setTerceiroCpf(e.target.value); setErroIdentificacao(''); }}
            placeholder="000.000.000-00"
            inputMode="numeric"
            onKeyDown={e => e.key === 'Enter' && confirmarIdentificacao()}
          />
          {erroIdentificacao && <span className="endereco-field-erro">{erroIdentificacao}</span>}

          <button type="button" className="btn-start with-glow endereco-btn-primary" onClick={confirmarIdentificacao}>
            Continuar
          </button>
        </div>
      )}

      {step === 'selecionar' && (
        <div className="endereco-step">
          <div className="endereco-step-icon"><Package size={26} /></div>
          <h2>Quem você vai buscar?</h2>
          <p>Busque e marque todos os atletas cujo kit você vai retirar por eles.</p>

          <div className="endereco-search-wrap">
            <Search size={18} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Digite o nome do atleta..."
              autoFocus
              autoComplete="off"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Limpar">
                <X size={16} />
              </button>
            )}
          </div>

          {search.trim().length >= 2 && (
            <div className="endereco-resultados">
              {resultados.length === 0 ? (
                <div className="endereco-resultados-vazio">Nenhum nome encontrado. Confira a grafia.</div>
              ) : (
                resultados.map(a => {
                  const marcado = Boolean(selecionados[a.id]);
                  const jaRetirado = Boolean(a.kitRetiradoEm);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      className="endereco-resultado-item"
                      onClick={() => toggleSelecionado(a)}
                      disabled={jaRetirado}
                      style={{ opacity: jaRetirado ? 0.5 : 1, borderColor: marcado ? '#6BFF2A' : undefined }}
                    >
                      <div className="endereco-resultado-avatar">
                        {a.euVouCardUrl || a.fotoUrl ? <img src={a.euVouCardUrl || a.fotoUrl} alt="" /> : <User size={18} />}
                      </div>
                      <span>
                        {a.nome}
                        {jaRetirado && ' (já retirado)'}
                        {!jaRetirado && a.kitSeparadoPara && a.kitSeparadoPara !== terceiroNome.trim() && ` (reservado p/ ${a.kitSeparadoPara})`}
                      </span>
                      {marcado ? <CheckCircle2 size={18} color="#16a34a" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {selecionadosArr.length > 0 && (
            <div style={{ width: '100%', marginTop: 18 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', marginBottom: 10 }}>
                {selecionadosArr.length} selecionado(s)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {selecionadosArr.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(107,255,42,0.1)', border: '1px solid rgba(107,255,42,0.4)',
                    borderRadius: 10, padding: '10px 14px', color: '#fff',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{a.nome}</span>
                    <button type="button" onClick={() => toggleSelecionado(a)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {erroEnvio && <span className="endereco-field-erro" style={{ textAlign: 'center', marginTop: 8 }}>{erroEnvio}</span>}

          <button
            type="button"
            className="btn-start with-glow endereco-btn-primary"
            onClick={confirmarSeparacao}
            disabled={enviando || selecionadosArr.length === 0}
          >
            {enviando ? <Loader2 size={18} className="endereco-spinner" /> : `Confirmar ${selecionadosArr.length || ''} kit(s)`}
          </button>
        </div>
      )}

      {step === 'sucesso' && (
        <div className="endereco-step endereco-step-sucesso">
          <div className="endereco-step-icon success"><CheckCircle2 size={32} /></div>
          <h2>Separação registrada!</h2>
          <p>
            Avisamos a organização que <strong>{terceiroNome}</strong> vai retirar {selecionadosArr.length} kit(s).
            Leve um documento com foto e o CPF informado na hora da retirada.
          </p>
          <button type="button" className="btn-start with-glow endereco-btn-primary" onClick={() => navigate('/')}>
            Voltar ao início
          </button>
        </div>
      )}
    </div>
  );
}
