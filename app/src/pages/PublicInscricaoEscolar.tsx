import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Camera, CheckCircle2, GraduationCap, Loader2, Plus, School, Trash2, X, XCircle } from 'lucide-react';

type LinkEscolar = {
  codigo: string;
  escola: string;
  maxAlunos: number;
  usados: number;
  ativo: boolean;
};

type Modalidade = {
  id: string;
  nome: string;
  categoria?: string;
  idadeMin?: number;
  idadeMax?: number;
  ativo?: boolean;
};

type AlunoForm = {
  nome: string;
  cpf: string;
  dataNascimento: string;
  sexo: string;
  telefone: string;
  responsavelNome: string;
  responsavelCpf: string;
  cidade: string;
  uf: string;
  fotoUrl: string;
  enviandoFoto: boolean;
};

const ALUNO_VAZIO: AlunoForm = {
  nome: '', cpf: '', dataNascimento: '', sexo: 'M', telefone: '',
  responsavelNome: '', responsavelCpf: '', cidade: '', uf: '',
  fotoUrl: '', enviandoFoto: false,
};

const onlyDigits = (v: string) => (v || '').replace(/\D/g, '');
const maskCPF = (v: string) => onlyDigits(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskPhone = (v: string) => onlyDigits(v).slice(0, 11).replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
const maskDate = (v: string) => {
  const clean = onlyDigits(v).slice(0, 8);
  if (clean.length <= 2) return clean;
  if (clean.length <= 4) return `${clean.slice(0, 2)}/${clean.slice(2)}`;
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4)}`;
};

const validateCPF = (cpf: string) => {
  const clean = onlyDigits(cpf);
  if (clean.length !== 11 || /^(\d)\1+$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(clean[i]) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== Number(clean[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(clean[i]) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === Number(clean[10]);
};

const calcularIdade = (dobStr: string) => {
  if (!dobStr || dobStr.length < 10) return -1;
  const [day, month, year] = dobStr.split('/').map(Number);
  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return -1;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const gerarNumeroInscricao = () => String(Math.floor(10000000 + Math.random() * 90000000));

const inputStyle: CSSProperties = {
  width: '100%', padding: '11px 12px', borderRadius: 10, border: '1.5px solid #cbd5e1',
  fontSize: '0.88rem', boxSizing: 'border-box',
};
const labelStyle: CSSProperties = { fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 4 };

export default function PublicInscricaoEscolar() {
  const { codigo } = useParams<{ codigo: string }>();
  const [status, setStatus] = useState<'carregando' | 'invalido' | 'esgotado' | 'ok' | 'enviado'>('carregando');
  const [link, setLink] = useState<LinkEscolar | null>(null);
  const [modalidades, setModalidades] = useState<Modalidade[]>([]);
  const [alunos, setAlunos] = useState<AlunoForm[]>([{ ...ALUNO_VAZIO }]);
  const [aceite, setAceite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<{ nome: string; numeroInscricao: string }[]>([]);

  useEffect(() => {
    (async () => {
      if (!codigo) { setStatus('invalido'); return; }
      try {
        const [linkSnap, modalidadesSnap] = await Promise.all([
          getDoc(doc(db, 'nightrun_links_escolares', codigo)),
          getDocs(query(collection(db, 'nightrun_modalidades'), where('ativo', '==', true))),
        ]);
        if (!linkSnap.exists()) { setStatus('invalido'); return; }
        const linkData = { codigo: linkSnap.id, ...linkSnap.data() } as LinkEscolar;
        setLink(linkData);
        setModalidades(modalidadesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Modalidade)));
        if (!linkData.ativo) { setStatus('invalido'); return; }
        if (linkData.usados >= linkData.maxAlunos) { setStatus('esgotado'); return; }
        setStatus('ok');
      } catch (e) {
        console.error('Erro ao carregar link escolar:', e);
        setStatus('invalido');
      }
    })();
  }, [codigo]);

  const vagasRestantes = link ? Math.max(link.maxAlunos - link.usados, 0) : 0;

  const modalidadeParaIdade = (idade: number) => modalidades.find(m =>
    m.categoria === 'infantil' && typeof m.idadeMin === 'number' && typeof m.idadeMax === 'number' &&
    idade >= m.idadeMin && idade <= m.idadeMax
  );

  const setAluno = (idx: number, campo: keyof AlunoForm, valor: string) => {
    setAlunos(prev => prev.map((a, i) => i === idx ? { ...a, [campo]: valor } : a));
  };

  const setAlunoParcial = (idx: number, patch: Partial<AlunoForm>) => {
    setAlunos(prev => prev.map((a, i) => i === idx ? { ...a, ...patch } : a));
  };

  const adicionarAluno = () => {
    if (alunos.length >= vagasRestantes) return;
    setAlunos(prev => [...prev, { ...ALUNO_VAZIO }]);
  };

  const removerAluno = (idx: number) => {
    setAlunos(prev => prev.filter((_, i) => i !== idx));
  };

  const enviarFoto = async (idx: number, file: File) => {
    setAlunoParcial(idx, { enviandoFoto: true });
    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'nightrun_photos');
      const res = await fetch(`${workerUrl}/media/upload`, { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || 'Falha ao enviar foto.');
      setAlunoParcial(idx, { fotoUrl: body.url, enviandoFoto: false });
    } catch (e) {
      console.error('Erro ao enviar foto do aluno:', e);
      setErro('Não foi possível enviar a foto. Tente novamente ou continue sem foto.');
      setAlunoParcial(idx, { enviandoFoto: false });
    }
  };

  const removerFoto = (idx: number) => setAlunoParcial(idx, { fotoUrl: '' });

  const validar = (): string => {
    if (alunos.length === 0) return 'Adicione pelo menos um aluno.';
    if (alunos.length > vagasRestantes) return `Restam apenas ${vagasRestantes} vaga(s) para esta escola.`;
    if (!aceite) return 'É preciso confirmar que leu e aceita o regulamento oficial.';
    for (let i = 0; i < alunos.length; i++) {
      const a = alunos[i];
      const n = i + 1;
      if (a.enviandoFoto) return `Aluno ${n}: aguarde o envio da foto terminar.`;
      if (a.nome.trim().length < 3) return `Aluno ${n}: informe o nome completo.`;
      if (!validateCPF(a.cpf)) return `Aluno ${n}: CPF inválido.`;
      const idade = calcularIdade(a.dataNascimento);
      if (idade < 0) return `Aluno ${n}: data de nascimento inválida.`;
      if (idade >= 18) return `Aluno ${n}: esta inscrição é exclusiva para menores de 18 anos.`;
      if (!modalidadeParaIdade(idade)) return `Aluno ${n}: nenhuma modalidade kids cadastrada para ${idade} anos.`;
      if (onlyDigits(a.telefone).length < 10) return `Aluno ${n}: informe um WhatsApp válido do responsável.`;
      if (a.responsavelNome.trim().length < 3) return `Aluno ${n}: informe o nome do responsável.`;
      if (!validateCPF(a.responsavelCpf)) return `Aluno ${n}: CPF do responsável inválido.`;
      if (!a.cidade.trim() || !a.uf.trim()) return `Aluno ${n}: informe cidade e UF.`;
    }
    return '';
  };

  const enviar = async () => {
    setErro('');
    const validacao = validar();
    if (validacao) { setErro(validacao); return; }
    if (!codigo) return;
    setEnviando(true);
    try {
      const linkRef = doc(db, 'nightrun_links_escolares', codigo);
      const preparados = alunos.map(a => {
        const idade = calcularIdade(a.dataNascimento);
        const modalidade = modalidadeParaIdade(idade)!;
        return {
          ref: doc(collection(db, 'nightrun_registrations')),
          numeroInscricao: gerarNumeroInscricao(),
          nome: a.nome.trim(),
          data: {
            nome: a.nome.trim(),
            cpf: onlyDigits(a.cpf),
            dataNascimento: a.dataNascimento,
            sexo: a.sexo,
            telefone: onlyDigits(a.telefone),
            responsavelNome: a.responsavelNome.trim(),
            responsavelCpf: onlyDigits(a.responsavelCpf),
            endereco: { cidade: a.cidade.trim(), uf: a.uf.trim().toUpperCase() },
            categoria: 'infantil',
            modalidadeId: modalidade.id,
            modalidadeNome: modalidade.nome,
            fotoUrl: a.fotoUrl || '',
            kit: '',
            kitNome: 'Sem kit (cortesia escolar)',
            idadeNoCadastro: idade,
            paymentStatus: 'pago',
            gratuito: true,
            tipoInscricao: 'gratuita',
            paymentConfirmedAt: serverTimestamp(),
            amount: 0,
            registrationAmount: 0,
            paymentFee: 0,
            originalAmount: 0,
            tagEscolar: true,
            escolaNome: link?.escola || '',
            linkEscolarCodigo: codigo,
            termos: true,
            aceitouTermosResponsabilidade: true,
            regulamentoAceito: true,
            regulamentoAceitoEm: new Date().toISOString(),
            contractStatus: 'pendente',
            createdAt: serverTimestamp(),
          },
        };
      });

      await runTransaction(db, async (transaction) => {
        const linkSnap = await transaction.get(linkRef);
        if (!linkSnap.exists()) throw new Error('Link não encontrado.');
        const atual = linkSnap.data() as LinkEscolar;
        if (!atual.ativo) throw new Error('Este link foi desativado.');
        const novoUsados = atual.usados + preparados.length;
        if (novoUsados > atual.maxAlunos) {
          throw new Error(`Restam apenas ${Math.max(atual.maxAlunos - atual.usados, 0)} vaga(s) para esta escola.`);
        }
        preparados.forEach(p => transaction.set(p.ref, { ...p.data, numeroInscricao: p.numeroInscricao }));
        transaction.update(linkRef, { usados: novoUsados });
      });

      setResultado(preparados.map(p => ({ nome: p.nome, numeroInscricao: p.numeroInscricao })));
      setStatus('enviado');
    } catch (e: any) {
      console.error('Erro ao enviar inscrição escolar:', e);
      setErro(e?.message || 'Erro ao enviar as inscrições. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  };

  if (status === 'carregando') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <Loader2 size={32} color="#071A45" />
      </div>
    );
  }

  if (status === 'invalido') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 20, textAlign: 'center' }}>
        <XCircle size={48} color="#dc2626" />
        <h1 style={{ color: '#071A45', marginTop: 16, fontSize: '1.3rem' }}>Link inválido</h1>
        <p style={{ color: '#64748b', maxWidth: 380 }}>Este link de inscrição escolar não existe ou foi desativado. Fale com a organização do evento.</p>
      </div>
    );
  }

  if (status === 'esgotado') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 20, textAlign: 'center' }}>
        <School size={48} color="#dc2626" />
        <h1 style={{ color: '#071A45', marginTop: 16, fontSize: '1.3rem' }}>Vagas esgotadas</h1>
        <p style={{ color: '#64748b', maxWidth: 380 }}>Todas as vagas de cortesia desta escola já foram utilizadas.</p>
      </div>
    );
  }

  if (status === 'enviado') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', padding: 20, textAlign: 'center' }}>
        <CheckCircle2 size={48} color="#16a34a" />
        <h1 style={{ color: '#071A45', marginTop: 16, fontSize: '1.3rem' }}>Inscrições confirmadas!</h1>
        <div style={{ background: '#fff', borderRadius: 14, padding: 20, marginTop: 16, maxWidth: 420, width: '100%', textAlign: 'left' }}>
          {resultado.map(r => (
            <div key={r.numeroInscricao} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
              <strong style={{ color: '#071A45' }}>{r.nome.toUpperCase()}</strong>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Nº de inscrição: {r.numeroInscricao}</div>
            </div>
          ))}
        </div>
        <p style={{ color: '#64748b', maxWidth: 380, marginTop: 16 }}>Guarde os números de inscrição. Nos vemos no dia da corrida!</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '30px 16px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <GraduationCap size={36} color="#071A45" />
          <h1 style={{ color: '#071A45', fontSize: '1.4rem', margin: '10px 0 4px' }}>Inscrição Cortesia — {link?.escola}</h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
            {vagasRestantes} vaga(s) restante(s) de {link?.maxAlunos}. Exclusivo para alunos menores de 18 anos.
          </p>
        </div>

        <div style={{
          background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '12px 16px',
          marginBottom: 20, fontSize: '0.82rem', color: '#92400e', fontWeight: 700, textAlign: 'center',
        }}>
          Esta inscrição é cortesia e NÃO tem item incluso: sem camiseta, sem kit e sem medalha. É apenas o direito de participar da prova.
        </div>

        {alunos.map((a, idx) => (
          <div key={idx} style={{ background: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <strong style={{ color: '#071A45' }}>Aluno {idx + 1}</strong>
              {alunos.length > 1 && (
                <button type="button" onClick={() => removerAluno(idx)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700 }}>
                  <Trash2 size={14} /> REMOVER
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Nome completo do aluno</label>
                <input style={inputStyle} value={a.nome} onChange={e => setAluno(idx, 'nome', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>CPF do aluno</label>
                  <input style={inputStyle} value={a.cpf} onChange={e => setAluno(idx, 'cpf', maskCPF(e.target.value))} />
                </div>
                <div>
                  <label style={labelStyle}>Data de nascimento</label>
                  <input style={inputStyle} placeholder="dd/mm/aaaa" value={a.dataNascimento} onChange={e => setAluno(idx, 'dataNascimento', maskDate(e.target.value))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Sexo</label>
                <select style={inputStyle} value={a.sexo} onChange={e => setAluno(idx, 'sexo', e.target.value)}>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Foto do aluno (opcional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {a.fotoUrl ? (
                    <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
                      <img src={a.fotoUrl} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', border: '1px solid #cbd5e1' }} />
                      <button
                        type="button"
                        onClick={() => removerFoto(idx)}
                        title="Remover foto"
                        style={{
                          position: 'absolute', top: -6, right: -6, background: '#dc2626', color: '#fff', border: 'none',
                          borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <label style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%',
                      background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: 10, padding: '11px 12px',
                      fontSize: '0.8rem', fontWeight: 700, color: a.enviandoFoto ? '#94a3b8' : '#475569', cursor: a.enviandoFoto ? 'wait' : 'pointer',
                    }}>
                      <Camera size={16} />
                      {a.enviandoFoto ? 'Enviando...' : 'Enviar foto (opcional)'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={a.enviandoFoto}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) enviarFoto(idx, file);
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Cidade</label>
                  <input style={inputStyle} value={a.cidade} onChange={e => setAluno(idx, 'cidade', e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>UF</label>
                  <input style={inputStyle} maxLength={2} value={a.uf} onChange={e => setAluno(idx, 'uf', e.target.value.toUpperCase())} />
                </div>
              </div>
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, marginTop: 4 }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: 8 }}>Responsável pelo aluno</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Nome do responsável</label>
                    <input style={inputStyle} value={a.responsavelNome} onChange={e => setAluno(idx, 'responsavelNome', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>CPF do responsável</label>
                    <input style={inputStyle} value={a.responsavelCpf} onChange={e => setAluno(idx, 'responsavelCpf', maskCPF(e.target.value))} />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>WhatsApp do responsável</label>
                  <input style={inputStyle} value={a.telefone} onChange={e => setAluno(idx, 'telefone', maskPhone(e.target.value))} />
                </div>
              </div>
            </div>
          </div>
        ))}

        {alunos.length < vagasRestantes && (
          <button
            type="button"
            onClick={adicionarAluno}
            style={{
              width: '100%', background: '#eff6ff', color: '#2563eb', border: '1.5px dashed #93c5fd', borderRadius: 12,
              padding: '12px', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: 8, marginBottom: 16,
            }}
          >
            <Plus size={16} /> ADICIONAR OUTRO ALUNO ({alunos.length}/{vagasRestantes})
          </button>
        )}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', borderRadius: 12, padding: 14, marginBottom: 16, cursor: 'pointer', border: '1px solid #e2e8f0' }}>
          <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: '0.78rem', color: '#334155' }}>
            Confirmo que sou responsável pela escola/pelos alunos acima e que li e aceito o regulamento oficial do MCU Night Run em nome de cada um deles.
          </span>
        </label>

        {erro && (
          <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 10, padding: '12px 14px', marginBottom: 16, fontSize: '0.82rem', fontWeight: 600 }}>
            {erro}
          </div>
        )}

        <button
          type="button"
          onClick={enviar}
          disabled={enviando || alunos.some(a => a.enviandoFoto)}
          style={{
            width: '100%', background: enviando ? '#94a3b8' : '#071A45', color: '#fff', border: 'none', borderRadius: 14,
            padding: '16px', fontWeight: 900, fontSize: '0.95rem', cursor: enviando ? 'wait' : 'pointer',
          }}
        >
          {enviando ? 'ENVIANDO...' : `CONFIRMAR ${alunos.length} INSCRIÇÃO(ÕES)`}
        </button>
      </div>
    </div>
  );
}
