import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Home,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { db } from '../firebase';
import '../App.css';

type Atleta = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  sexo: string;
  dataNascimento: any;
  euVouCardUrl: string;
  enderecoPreenchidoEm: any;
  endereco?: Partial<Endereco>;
  searchNome: string;
};

// Mesmo formato ja usado em PublicForm.tsx (data.endereco: cep/rua/numero/bairro/cidade/uf/
// semCep) - a inscricao original ja tinha esse modelo de dados pronto (inclusive a mesma
// busca por CEP via ViaCEP), so nunca chegou a ter uma etapa visivel no formulario. Reusar
// os mesmos nomes de campo evita ter dois formatos de endereco diferentes na mesma coleção.
type Endereco = {
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  semCep: boolean;
};

type Step = 'carregando' | 'buscar' | 'cpf' | 'formulario' | 'sucesso';

const DIACRITICS_RE = /[̀-ͯ]/g;
const normalizeText = (value: string) => value.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase().trim();
const onlyDigits = (value: string) => value.replace(/\D/g, '');

const maskCpf = (value: string) => onlyDigits(value)
  .slice(0, 11)
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d)/, '$1.$2')
  .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

const maskCep = (value: string) => onlyDigits(value)
  .slice(0, 8)
  .replace(/(\d{5})(\d)/, '$1-$2');

const EMPTY_ENDERECO: Endereco = { cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', semCep: false };

const STEP_INDEX: Record<Step, number> = { carregando: 0, buscar: 1, cpf: 2, formulario: 3, sucesso: 4 };

export default function EnderecoAtleta() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('carregando');
  const [atletas, setAtletas] = useState<Atleta[]>([]);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState('');
  const [selecionado, setSelecionado] = useState<Atleta | null>(null);

  const [cpfInput, setCpfInput] = useState('');
  const [cpfErro, setCpfErro] = useState('');
  const [autenticando, setAutenticando] = useState(false);

  const [modoEdicao, setModoEdicao] = useState(false);
  const [endereco, setEndereco] = useState<Endereco>(EMPTY_ENDERECO);
  const [cepStatus, setCepStatus] = useState<'idle' | 'buscando' | 'ok' | 'erro'>('idle');
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [salvarErro, setSalvarErro] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => {
          const data = d.data();
          const nome = String(data.nome || '').trim();
          return {
            id: d.id,
            nome,
            cpf: onlyDigits(data.cpf || ''),
            telefone: data.telefone || '',
            sexo: data.sexo || '',
            dataNascimento: data.dataNascimento,
            euVouCardUrl: data.euVouCardUrl || '',
            enderecoPreenchidoEm: data.enderecoPreenchidoEm || null,
            endereco: data.endereco || undefined,
            searchNome: normalizeText(nome),
          } as Atleta;
        });
        list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
        setAtletas(list);
        setStep('buscar');
      } catch (e) {
        console.error('Erro ao carregar lista de confirmados:', e);
        setLoadError(true);
      }
    })();
  }, []);

  const resultados = useMemo(() => {
    const term = normalizeText(search);
    if (term.length < 2) return [];
    return atletas.filter(a => a.searchNome.includes(term)).slice(0, 8);
  }, [atletas, search]);

  const escolherAtleta = (atleta: Atleta) => {
    setSelecionado(atleta);
    setSearch(atleta.nome);
    setCpfInput('');
    setCpfErro('');
    setStep('cpf');
  };

  const voltarParaBusca = () => {
    setSelecionado(null);
    setSearch('');
    setCpfInput('');
    setCpfErro('');
    setModoEdicao(false);
    setEndereco(EMPTY_ENDERECO);
    setErros({});
    setSalvarErro('');
    setStep('buscar');
  };

  const autenticar = () => {
    if (!selecionado) return;
    const digits = onlyDigits(cpfInput);
    if (digits.length !== 11) {
      setCpfErro('Digite os 11 números do CPF.');
      return;
    }
    setAutenticando(true);
    setCpfErro('');
    window.setTimeout(() => {
      if (digits !== selecionado.cpf) {
        setCpfErro('CPF não confere com o nome selecionado. Confira e tente novamente.');
        setAutenticando(false);
        return;
      }
      setAutenticando(false);
      // "Ja preenchido" e definido pelo carimbo de data (enderecoPreenchidoEm), nao so pela
      // presenca do objeto endereco - a inscricao ja grava um endereco vazio por padrao (campo
      // que existia no formulario original mas nunca teve uma etapa visivel), entao checar so
      // "existe endereco" classificaria todo mundo como "ja preenchido" incorretamente.
      if (selecionado.enderecoPreenchidoEm) {
        setModoEdicao(true);
        setEndereco({ ...EMPTY_ENDERECO, ...selecionado.endereco });
      } else {
        setModoEdicao(false);
        setEndereco({ ...EMPTY_ENDERECO, ...selecionado.endereco });
      }
      setStep('formulario');
    }, 450);
  };

  const buscarCep = async (cepValue: string) => {
    const digits = onlyDigits(cepValue);
    if (digits.length !== 8) return;
    setCepStatus('buscando');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) {
        setCepStatus('erro');
        setErros(prev => ({ ...prev, cep: 'CEP não encontrado. Confira o número ou marque "não sei meu CEP".' }));
        return;
      }
      setEndereco(prev => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        uf: data.uf || prev.uf,
      }));
      setErros(prev => { const next = { ...prev }; delete next.cep; return next; });
      setCepStatus('ok');
    } catch (e) {
      console.error('Erro ao buscar CEP:', e);
      setCepStatus('erro');
      setErros(prev => ({ ...prev, cep: 'Não foi possível buscar o CEP agora. Preencha manualmente.' }));
    }
  };

  const validarFormulario = () => {
    const next: Record<string, string> = {};
    if (!endereco.semCep && onlyDigits(endereco.cep).length !== 8) next.cep = 'CEP inválido. Se não souber, marque a opção abaixo.';
    if (!endereco.rua.trim()) next.rua = 'Informe o logradouro.';
    if (!endereco.numero.trim()) next.numero = 'Informe o número (ou "S/N").';
    if (!endereco.bairro.trim()) next.bairro = 'Informe o bairro.';
    if (!endereco.cidade.trim()) next.cidade = 'Informe a cidade.';
    if (!endereco.uf.trim()) next.uf = 'Informe o estado (UF).';
    setErros(next);
    return Object.keys(next).length === 0;
  };

  const buildFichaText = (atleta: Atleta, end: Endereco) => {
    const dataNasc = atleta.dataNascimento ? formatDateBRSimple(atleta.dataNascimento) : '';
    const sexoLabel = atleta.sexo === 'M' ? 'Masculino' : atleta.sexo === 'F' ? 'Feminino' : '';
    const linhas = [
      '*FICHA DO ATLETA - MCU NIGHT RUN 2026*',
      '',
      `Nome: ${atleta.nome}`,
      dataNasc ? `Data de nascimento: ${dataNasc}` : '',
      sexoLabel ? `Sexo: ${sexoLabel}` : '',
      '',
      '*ENDEREÇO CONFIRMADO*',
      `${end.rua}, ${end.numero}${end.complemento ? ` - ${end.complemento}` : ''}`,
      `${end.bairro}`,
      `${end.cidade} - ${end.uf}`,
      end.semCep ? 'CEP: não informado' : `CEP: ${end.cep}`,
      '',
      'Este endereço será usado para a divisão da premiação entre moradores e não moradores da cidade.',
    ];
    return linhas.filter(Boolean).join('\n');
  };

  const salvar = async () => {
    if (!selecionado) return;
    if (!validarFormulario()) return;
    setSalvando(true);
    setSalvarErro('');
    try {
      const enderecoLimpo: Endereco = {
        cep: endereco.semCep ? '' : maskCep(endereco.cep),
        rua: endereco.rua.trim(),
        numero: endereco.numero.trim(),
        complemento: endereco.complemento.trim(),
        bairro: endereco.bairro.trim(),
        cidade: endereco.cidade.trim(),
        uf: endereco.uf.trim().toUpperCase(),
        semCep: endereco.semCep,
      };

      await updateDoc(doc(db, 'nightrun_registrations', selecionado.id), {
        endereco: enderecoLimpo,
        enderecoPreenchidoEm: new Date(),
      });

      if (selecionado.telefone) {
        try {
          const workerUrl = import.meta.env.VITE_WORKER_URL;
          const cleanPhone = onlyDigits(selecionado.telefone);
          const phone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
          await fetch(`${workerUrl}/whatsapp/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone,
              text: buildFichaText(selecionado, enderecoLimpo),
              imageUrl: selecionado.euVouCardUrl || undefined,
            }),
          });
        } catch (whatsappError) {
          console.error('Erro ao enviar ficha por WhatsApp:', whatsappError);
        }
      }

      setStep('sucesso');
    } catch (e) {
      console.error('Erro ao salvar endereço:', e);
      setSalvarErro('Não foi possível salvar agora. Tente novamente em instantes.');
    } finally {
      setSalvando(false);
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

  const progresso = step === 'sucesso' ? 4 : STEP_INDEX[step];

  return (
    <div className="endereco-page">
      <div className="endereco-header">
        <button
          type="button"
          className="endereco-back"
          onClick={() => (step === 'buscar' ? navigate('/') : voltarParaBusca())}
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="endereco-header-titles">
          <h1>MEU ENDEREÇO</h1>
          <span>Necessário para a divisão da premiação</span>
        </div>
      </div>

      {step !== 'sucesso' && (
        <div className="endereco-progress" role="progressbar" aria-valuenow={progresso} aria-valuemin={1} aria-valuemax={3}>
          {[1, 2, 3].map(n => (
            <div key={n} className={`endereco-progress-dot ${progresso >= n ? 'active' : ''}`} />
          ))}
        </div>
      )}

      {step === 'buscar' && (
        <div className="endereco-step">
          <div className="endereco-step-icon"><Search size={26} /></div>
          <h2>Encontre seu nome na lista</h2>
          <p>Digite parte do seu nome completo e selecione o registro correto.</p>

          <div className="endereco-search-wrap">
            <Search size={18} />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setSelecionado(null); }}
              placeholder="Digite seu nome..."
              autoFocus
              autoComplete="off"
            />
            {search && (
              <button type="button" onClick={() => { setSearch(''); setSelecionado(null); }} aria-label="Limpar">
                <X size={16} />
              </button>
            )}
          </div>

          {search.trim().length >= 2 && (
            <div className="endereco-resultados">
              {resultados.length === 0 ? (
                <div className="endereco-resultados-vazio">Nenhum nome encontrado. Confira a grafia.</div>
              ) : (
                resultados.map(a => (
                  <button type="button" key={a.id} className="endereco-resultado-item" onClick={() => escolherAtleta(a)}>
                    <div className="endereco-resultado-avatar">
                      {a.euVouCardUrl ? <img src={a.euVouCardUrl} alt="" /> : <User size={18} />}
                    </div>
                    <span>{a.nome}</span>
                    <ChevronRight size={18} />
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {step === 'cpf' && selecionado && (
        <div className="endereco-step">
          <div className="endereco-step-icon"><ShieldCheck size={26} /></div>
          <h2>Confirme que é você</h2>
          <p>Digite o CPF usado na inscrição de <strong>{selecionado.nome}</strong>.</p>

          <div className="endereco-selected-card">
            <div className="endereco-resultado-avatar">
              {selecionado.euVouCardUrl ? <img src={selecionado.euVouCardUrl} alt="" /> : <User size={18} />}
            </div>
            <span>{selecionado.nome}</span>
            <button type="button" onClick={voltarParaBusca}>Trocar</button>
          </div>

          <label className="endereco-field-label" htmlFor="cpf-input">CPF</label>
          <input
            id="cpf-input"
            className={`endereco-input ${cpfErro ? 'erro' : ''}`}
            value={maskCpf(cpfInput)}
            onChange={e => { setCpfInput(e.target.value); setCpfErro(''); }}
            placeholder="000.000.000-00"
            inputMode="numeric"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && autenticar()}
          />
          {cpfErro && <span className="endereco-field-erro">{cpfErro}</span>}

          <button type="button" className="btn-start with-glow endereco-btn-primary" onClick={autenticar} disabled={autenticando}>
            {autenticando ? <Loader2 size={18} className="endereco-spinner" /> : 'Confirmar identidade'}
          </button>
        </div>
      )}

      {step === 'formulario' && selecionado && (
        <div className="endereco-step">
          <div className="endereco-step-icon"><MapPin size={26} /></div>
          <h2>{modoEdicao ? 'Editar endereço' : 'Seu endereço'}</h2>

          {modoEdicao && (
            <div className="endereco-info-banner">
              <CheckCircle2 size={18} />
              <span>Você já preencheu seu endereço antes. Os dados abaixo já estão carregados — altere o que precisar.</span>
            </div>
          )}

          {!endereco.semCep && (
            <div className="endereco-form-field">
              <label className="endereco-field-label" htmlFor="cep-input">CEP</label>
              <div className="endereco-input-with-status">
                <input
                  id="cep-input"
                  className={`endereco-input ${erros.cep ? 'erro' : ''}`}
                  value={maskCep(endereco.cep)}
                  onChange={e => {
                    const masked = maskCep(e.target.value);
                    setEndereco(prev => ({ ...prev, cep: masked }));
                    setCepStatus('idle');
                    if (onlyDigits(masked).length === 8) buscarCep(masked);
                  }}
                  placeholder="00000-000"
                  inputMode="numeric"
                  autoFocus
                />
                {cepStatus === 'buscando' && <Loader2 size={18} className="endereco-spinner" />}
                {cepStatus === 'ok' && <CheckCircle2 size={18} className="endereco-status-ok" />}
              </div>
              {erros.cep && <span className="endereco-field-erro">{erros.cep}</span>}
              <span className="endereco-field-ajuda">Preenchemos o endereço automaticamente ao digitar o CEP.</span>
            </div>
          )}

          <label className="endereco-checkbox-row">
            <input
              type="checkbox"
              checked={endereco.semCep}
              onChange={e => {
                const checked = e.target.checked;
                setEndereco(prev => ({ ...prev, semCep: checked, cep: checked ? '' : prev.cep }));
                setErros(prev => { const next = { ...prev }; delete next.cep; return next; });
              }}
            />
            <span>Não sei meu CEP</span>
          </label>

          <div className="endereco-form-field">
            <label className="endereco-field-label" htmlFor="rua-input">Logradouro (rua/avenida)</label>
            <input
              id="rua-input"
              className={`endereco-input ${erros.rua ? 'erro' : ''}`}
              value={endereco.rua}
              onChange={e => setEndereco(prev => ({ ...prev, rua: e.target.value }))}
              placeholder="Rua, avenida..."
            />
            {erros.rua && <span className="endereco-field-erro">{erros.rua}</span>}
          </div>

          <div className="endereco-form-row">
            <div className="endereco-form-field">
              <label className="endereco-field-label" htmlFor="numero-input">Número</label>
              <input
                id="numero-input"
                className={`endereco-input ${erros.numero ? 'erro' : ''}`}
                value={endereco.numero}
                onChange={e => setEndereco(prev => ({ ...prev, numero: e.target.value }))}
                placeholder="Nº ou S/N"
                inputMode="numeric"
              />
              {erros.numero && <span className="endereco-field-erro">{erros.numero}</span>}
            </div>
            <div className="endereco-form-field">
              <label className="endereco-field-label" htmlFor="complemento-input">Complemento</label>
              <input
                id="complemento-input"
                className="endereco-input"
                value={endereco.complemento}
                onChange={e => setEndereco(prev => ({ ...prev, complemento: e.target.value }))}
                placeholder="Apto, bloco... (opcional)"
              />
            </div>
          </div>

          <div className="endereco-form-field">
            <label className="endereco-field-label" htmlFor="bairro-input">Bairro</label>
            <input
              id="bairro-input"
              className={`endereco-input ${erros.bairro ? 'erro' : ''}`}
              value={endereco.bairro}
              onChange={e => setEndereco(prev => ({ ...prev, bairro: e.target.value }))}
              placeholder="Bairro"
            />
            {erros.bairro && <span className="endereco-field-erro">{erros.bairro}</span>}
          </div>

          <div className="endereco-form-row">
            <div className="endereco-form-field" style={{ flex: 2 }}>
              <label className="endereco-field-label" htmlFor="cidade-input">Cidade</label>
              <input
                id="cidade-input"
                className={`endereco-input ${erros.cidade ? 'erro' : ''}`}
                value={endereco.cidade}
                onChange={e => setEndereco(prev => ({ ...prev, cidade: e.target.value }))}
                placeholder="Cidade"
              />
              {erros.cidade && <span className="endereco-field-erro">{erros.cidade}</span>}
            </div>
            <div className="endereco-form-field" style={{ flex: 1 }}>
              <label className="endereco-field-label" htmlFor="uf-input">UF</label>
              <input
                id="uf-input"
                className={`endereco-input ${erros.uf ? 'erro' : ''}`}
                value={endereco.uf}
                onChange={e => setEndereco(prev => ({ ...prev, uf: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder="MG"
                maxLength={2}
              />
              {erros.uf && <span className="endereco-field-erro">{erros.uf}</span>}
            </div>
          </div>

          {salvarErro && <span className="endereco-field-erro" style={{ textAlign: 'center', marginTop: 8 }}>{salvarErro}</span>}

          <button type="button" className="btn-start with-glow endereco-btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 size={18} className="endereco-spinner" /> : modoEdicao ? 'Salvar alterações' : 'Confirmar endereço'}
          </button>
        </div>
      )}

      {step === 'sucesso' && selecionado && (
        <div className="endereco-step endereco-step-sucesso">
          <div className="endereco-step-icon success"><CheckCircle2 size={32} /></div>
          <h2>Endereço confirmado!</h2>
          <p>Enviamos sua ficha completa com o endereço no seu WhatsApp.</p>
          <button type="button" className="btn-start with-glow endereco-btn-primary" onClick={() => navigate('/')}>
            <Home size={18} /> Voltar ao início
          </button>
        </div>
      )}
    </div>
  );
}

function formatDateBRSimple(value: any): string {
  const date = value?.toDate?.() || new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}
