import { useEffect, useState } from 'react';
import type React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Copy, ExternalLink, Gift, KeyRound, Link2, Radio, RefreshCw, Save, Send, Shuffle, Trash2, Trophy, UploadCloud, Users } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { AdminPageSkeleton } from '../components/Skeleton';
import { formatDateTimeBR } from '../utils/dateUtils';
import { countElegiveis, runSorteio } from '../utils/sorteioDraw';
import {
  SORTEIO_STATUS,
  buildSorteioOperatorUrl,
  buildSorteioPublicUrl,
  buildWinnerWhatsAppText,
  generateOperatorToken,
  normalizeWhatsAppPhone,
  readGanhadores,
  type SorteioGanhador,
  type SorteioStatus,
  type SorteioTipo,
} from '../utils/sorteioUtils';
import '../styles/admin.css';

export default function AdminSorteioDetalhe() {
  const { sorteioId } = useParams();
  const navigate = useNavigate();
  const { showAlert, showConfirm } = useDialog();
  const [sorteio, setSorteio] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [elegiveis, setElegiveis] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [form, setForm] = useState({
    titulo: '', descricao: '', premioNome: '', premioImagem: '', dataPrevista: '',
    tipo: 'geral' as SorteioTipo, couponCode: '', quantidadeGanhadores: 1,
  });

  useEffect(() => { load(); }, [sorteioId]);

  const load = async () => {
    if (!sorteioId) return;
    try {
      setLoading(true);
      const [snap, couponsSnap] = await Promise.all([
        getDoc(doc(db, 'nightrun_sorteios', sorteioId)),
        getDocs(query(collection(db, 'nightrun_discount_coupons'), orderBy('code'))).catch(() => null),
      ]);
      if (!snap.exists()) {
        showAlert('Sorteio não encontrado.', 'error');
        navigate('/admin/sorteios');
        return;
      }
      const data = { id: snap.id, ...snap.data() } as any;
      setSorteio(data);
      setForm({
        titulo: data.titulo || '',
        descricao: data.descricao || '',
        premioNome: data.premioNome || '',
        premioImagem: data.premioImagem || '',
        dataPrevista: data.dataPrevista || '',
        tipo: data.tipo === 'cupom' ? 'cupom' : 'geral',
        couponCode: data.couponCode || '',
        quantidadeGanhadores: Math.max(1, Number(data.quantidadeGanhadores || 1)),
      });
      if (couponsSnap) setCoupons(couponsSnap.docs.map(item => ({ id: item.id, ...item.data() })));
    } catch (error) {
      console.error(error);
      showAlert('Erro ao carregar o sorteio.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sorteio) return;
    countElegiveis(sorteio).then(setElegiveis).catch(() => setElegiveis(null));
  }, [sorteio?.tipo, sorteio?.couponCode, sorteio?.ganhadorIds?.length]);

  const patch = async (payload: Record<string, any>, successMessage?: string) => {
    if (!sorteioId) return;
    await updateDoc(doc(db, 'nightrun_sorteios', sorteioId), { ...payload, updatedAt: new Date() });
    setSorteio((prev: any) => ({ ...prev, ...payload }));
    if (successMessage) showAlert(successMessage, 'success');
  };

  const handleSave = async () => {
    if (!form.titulo.trim()) return showAlert('Informe o título do sorteio.', 'warning');
    if (!form.premioNome.trim()) return showAlert('Informe qual é o prêmio.', 'warning');
    if (form.tipo === 'cupom' && !form.couponCode) return showAlert('Selecione o cupom que dá direito a concorrer.', 'warning');
    setSaving(true);
    try {
      await patch({
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        premioNome: form.premioNome.trim(),
        premioImagem: form.premioImagem,
        dataPrevista: form.dataPrevista,
        tipo: form.tipo,
        couponCode: form.tipo === 'cupom' ? form.couponCode : '',
        quantidadeGanhadores: Math.max(1, Number(form.quantidadeGanhadores || 1)),
      }, 'Sorteio salvo.');
    } catch (error) {
      console.error(error);
      showAlert('Erro ao salvar o sorteio.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: SorteioStatus) => {
    try {
      await patch({ status, ...(status === 'acontecendo' ? { iniciadoEm: new Date() } : {}) },
        status === 'acontecendo'
          ? 'Sorteio marcado como ACONTECENDO. A página pública entrou em modo suspense.'
          : status === 'finalizado' ? 'Sorteio finalizado.' : 'Sorteio voltou para agendado.');
    } catch (error) {
      console.error(error);
      showAlert('Erro ao alterar o status.', 'error');
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) setUploadProgress((progressEvent.loaded / progressEvent.total) * 100);
    };
    xhr.onload = () => {
      try {
        const response = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && response.url) setForm(prev => ({ ...prev, premioImagem: response.url }));
        else showAlert(response.error || 'Erro no upload da imagem.', 'error');
      } catch {
        showAlert('Erro ao ler a resposta do servidor.', 'error');
      }
      setUploading(false);
      setUploadProgress(0);
    };
    xhr.onerror = () => {
      showAlert('Erro de conexão ao enviar a imagem.', 'error');
      setUploading(false);
      setUploadProgress(0);
    };
    xhr.open('POST', `${import.meta.env.VITE_WORKER_URL}/media/upload`, true);
    xhr.send(formData);
  };

  const handleDraw = async () => {
    setDrawing(true);
    try {
      const result = await runSorteio(sorteio);
      await load();
      showAlert(`Sorteio realizado entre ${result.elegiveis} inscritos. ${result.ganhadores.map(g => g.nome).join(', ')}`, 'success');
    } catch (error: any) {
      console.error(error);
      showAlert(error.message || 'Erro ao sortear.', 'error');
    } finally {
      setDrawing(false);
    }
  };

  const clearWinners = () => {
    showConfirm('Remover os ganhadores deste sorteio? Isso permite sortear novamente.', async () => {
      try {
        await patch({
          ganhadores: [], ganhadorIds: [], sorteadoEm: null, totalElegiveis: 0, status: 'agendado',
          ganhadorRegistrationId: '', ganhadorNome: '', ganhadorTelefone: '', ganhadorFotoUrl: '',
        }, 'Ganhadores removidos.');
      } catch (error) {
        console.error(error);
        showAlert('Erro ao remover os ganhadores.', 'error');
      }
    });
  };

  const handleSendWhatsApp = async (ganhador: SorteioGanhador) => {
    if (!ganhador.telefone) return showAlert('Este ganhador não possui telefone cadastrado.', 'warning');
    const phone = normalizeWhatsAppPhone(ganhador.telefone);
    const text = buildWinnerWhatsAppText(sorteio, ganhador);
    setSendingId(ganhador.registrationId);
    try {
      const res = await fetch(`${import.meta.env.VITE_WORKER_URL}/whatsapp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, text, imageUrl: sorteio.premioImagem || undefined, type: 'sorteio_ganhador', alunoNome: ganhador.nome }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) throw new Error(body.error || 'Falha no envio.');
      const atualizados = readGanhadores(sorteio).map(item => item.registrationId === ganhador.registrationId
        ? { ...item, whatsappEnviadoEm: new Date(), whatsappEnviosCount: Number(item.whatsappEnviosCount || 0) + 1 }
        : item);
      await patch({ ganhadores: atualizados });
      showAlert('Mensagem enviada para o ganhador no WhatsApp.', 'success');
    } catch (error) {
      console.error(error);
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
      showAlert('Envio automático falhou. O WhatsApp foi aberto com a mensagem pronta.', 'warning');
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = () => {
    showConfirm('Excluir este sorteio? Esta ação não pode ser desfeita.', async () => {
      try {
        await deleteDoc(doc(db, 'nightrun_sorteios', sorteioId!));
        showAlert('Sorteio excluído.', 'success');
        navigate('/admin/sorteios');
      } catch (error) {
        console.error(error);
        showAlert('Erro ao excluir o sorteio.', 'error');
      }
    });
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showAlert(`${label} copiado.`, 'success');
    } catch {
      showAlert('Não foi possível copiar.', 'warning');
    }
  };

  const regenerateToken = () => {
    showConfirm('Gerar um novo link do coordenador? O link anterior deixa de funcionar.', async () => {
      try {
        await patch({ operatorToken: generateOperatorToken() }, 'Novo link gerado.');
      } catch (error) {
        console.error(error);
        showAlert('Erro ao gerar o link.', 'error');
      }
    });
  };

  if (loading) return <AdminPageSkeleton variant="table" />;
  if (!sorteio) return null;

  const status: SorteioStatus = sorteio.status || 'agendado';
  const ganhadores = readGanhadores(sorteio);
  const publicUrl = buildSorteioPublicUrl(sorteioId || '');
  const operatorUrl = sorteio.operatorToken ? buildSorteioOperatorUrl(sorteioId || '', sorteio.operatorToken) : '';

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <button onClick={() => navigate('/admin/sorteios')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: '#64748b', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={16} /> VOLTAR PARA SORTEIOS
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: 4 }}>{sorteio.titulo || 'Sorteio sem título'}</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Configure o prêmio, controle o status e envie o resultado aos ganhadores.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnSecondary, textDecoration: 'none' }}>
            <ExternalLink size={16} /> Telão público
          </a>
          <button onClick={handleDelete} style={{ ...btnSecondary, background: '#fee2e2', color: '#dc2626' }}>
            <Trash2 size={16} /> Excluir
          </button>
        </div>
      </div>

      {/* Link do coordenador */}
      <div style={{ background: '#071A45', borderRadius: 20, padding: 22, marginBottom: 24, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <KeyRound size={18} color="#6BFF2A" />
          <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900 }}>Link do coordenador</h3>
        </div>
        <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', lineHeight: 1.5 }}>
          Quem abrir este link dispara o sorteio <strong>sem fazer login</strong> e não consegue alterar prêmio, tipo ou quantidade — só apertar o botão.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            readOnly
            value={operatorUrl || 'Gere o link para o coordenador'}
            onFocus={event => event.target.select()}
            style={{ flex: 1, minWidth: 260, height: 46, borderRadius: 12, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', padding: '0 14px', fontWeight: 700, fontSize: '0.8rem', outline: 'none' }}
          />
          {operatorUrl && (
            <>
              <button onClick={() => copy(operatorUrl, 'Link do coordenador')} style={{ ...btnPrimary, background: '#6BFF2A', color: '#071A45' }}>
                <Copy size={16} /> Copiar
              </button>
              <a href={operatorUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnPrimary, background: 'rgba(255,255,255,0.12)', textDecoration: 'none' }}>
                <Link2 size={16} /> Abrir
              </a>
            </>
          )}
          <button onClick={regenerateToken} style={{ ...btnPrimary, background: 'rgba(255,255,255,0.12)' }}>
            <RefreshCw size={16} /> {operatorUrl ? 'Gerar novo' : 'Gerar link'}
          </button>
        </div>
      </div>

      {/* Status */}
      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 22, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 900 }}>Status do sorteio</h3>
        <p style={{ margin: '0 0 16px', color: '#64748b', fontSize: '0.82rem' }}>
          Em <strong>Acontecendo</strong>, a página pública entra em modo suspense para quem estiver acompanhando.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {SORTEIO_STATUS.map(item => {
            const active = status === item.id;
            return (
              <button key={item.id} onClick={() => changeStatus(item.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none', cursor: 'pointer',
                padding: '12px 20px', borderRadius: 12, fontWeight: 900, fontSize: '0.8rem',
                background: active ? item.color : '#f1f5f9', color: active ? '#fff' : '#64748b',
                boxShadow: active ? `0 4px 12px ${item.color}55` : 'none',
              }}>
                {item.id === 'acontecendo' && <Radio size={16} />}
                {item.label.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 24 }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 900 }}>Dados e prêmio</h3>

          <Field label="Título do sorteio">
            <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} placeholder="Ex: Sorteio do Tênis Oficial" style={inputStyle} />
          </Field>

          <Field label="Descrição (aparece na página pública)">
            <textarea value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Conte como funciona este sorteio..." style={{ ...inputStyle, height: 92, padding: 12, resize: 'vertical' }} />
          </Field>

          <Field label="Qual é o prêmio">
            <input value={form.premioNome} onChange={e => setForm(p => ({ ...p, premioNome: e.target.value }))} placeholder="Ex: Tênis de corrida Nike Pegasus" style={inputStyle} />
          </Field>

          <Field label="Foto do prêmio">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 88, height: 88, borderRadius: 14, border: '1px solid #e2e8f0', flexShrink: 0, background: form.premioImagem ? `url(${form.premioImagem}) center/cover` : '#f8fafc', display: 'grid', placeItems: 'center' }}>
                {!form.premioImagem && <Gift size={30} color="#cbd5e1" />}
              </div>
              <label style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', border: '2px dashed #cbd5e1', borderRadius: 12, cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: 800, color: '#475569' }}>
                {uploading && <div style={{ position: 'absolute', inset: 0, width: `${uploadProgress}%`, background: 'rgba(107,255,42,0.3)' }} />}
                <UploadCloud size={18} style={{ position: 'relative' }} />
                <span style={{ position: 'relative' }}>{uploading ? `Enviando... ${Math.round(uploadProgress)}%` : form.premioImagem ? 'Trocar imagem' : 'Fazer upload'}</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploading} style={{ display: 'none' }} />
              </label>
            </div>
          </Field>

          <Field label="Tipo de sorteio">
            <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value === 'cupom' ? 'cupom' : 'geral' }))} style={inputStyle}>
              <option value="geral">Sorteio geral (todos os inscritos pagos)</option>
              <option value="cupom">Somente quem usou um cupom específico</option>
            </select>
          </Field>

          {form.tipo === 'cupom' && (
            <Field label="Cupom que dá direito a concorrer">
              <select value={form.couponCode} onChange={e => setForm(p => ({ ...p, couponCode: e.target.value }))} style={inputStyle}>
                <option value="">Selecione o cupom...</option>
                {coupons.map(coupon => (
                  <option key={coupon.id} value={String(coupon.code || coupon.id).toUpperCase()}>
                    {String(coupon.code || coupon.id).toUpperCase()}{coupon.description ? ` — ${coupon.description}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Quantidade de ganhadores">
              <input type="number" min="1" value={form.quantidadeGanhadores} onChange={e => setForm(p => ({ ...p, quantidadeGanhadores: Math.max(1, Number(e.target.value || 1)) }))} style={inputStyle} />
            </Field>
            <Field label="Data prevista">
              <input type="datetime-local" value={form.dataPrevista} onChange={e => setForm(p => ({ ...p, dataPrevista: e.target.value }))} style={inputStyle} />
            </Field>
          </div>

          <button onClick={handleSave} disabled={saving || uploading} style={{ ...btnPrimary, width: '100%', marginTop: 6 }}>
            <Save size={18} /> {saving ? 'Salvando...' : 'Salvar sorteio'}
          </button>
        </div>

        {/* Ganhadores */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 24 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 900 }}>
            {ganhadores.length > 1 ? 'Ganhadores' : 'Ganhador'}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: '#eff6ff', borderRadius: 12, marginBottom: 16 }}>
            <Users size={18} color="#2563eb" />
            <span style={{ color: '#1e40af', fontWeight: 800, fontSize: '0.82rem' }}>
              {elegiveis === null ? 'Calculando...' : `${elegiveis} inscritos concorrendo`}
            </span>
          </div>

          {ganhadores.length > 0 ? (
            <>
              {ganhadores.map(ganhador => (
                <div key={ganhador.registrationId} style={{ padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, overflow: 'hidden', background: '#dcfce7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      {ganhador.fotoUrl
                        ? <img src={ganhador.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <Trophy size={20} color="#16a34a" />}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '0.92rem' }}>{ganhador.nome}</strong>
                      <small style={{ color: '#64748b', fontWeight: 700 }}>{ganhador.telefone || 'Sem telefone'}</small>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 800, marginBottom: 10 }}>
                    <span style={{ color: ganhador.visualizouEm ? '#16a34a' : '#b45309' }}>
                      {ganhador.visualizouEm ? 'Já viu que ganhou' : 'Ainda não viu'}
                    </span>
                    <span style={{ color: '#64748b' }}>
                      {ganhador.whatsappEnviadoEm ? 'WhatsApp enviado' : 'Não notificado'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 8 }}>
                    <button onClick={() => handleSendWhatsApp(ganhador)} disabled={sendingId === ganhador.registrationId} style={{ ...btnPrimary, background: '#25D366', color: '#071A45', padding: '10px 12px', fontSize: '0.76rem' }}>
                      <Send size={14} /> {sendingId === ganhador.registrationId ? 'Enviando...' : 'Enviar'}
                    </button>
                    <button onClick={() => navigate(`/admin/inscritos/${ganhador.registrationId}`)} style={{ ...btnSecondary, justifyContent: 'center', padding: '10px 12px', fontSize: '0.76rem' }}>
                      Ficha
                    </button>
                  </div>
                </div>
              ))}
              {sorteio.sorteadoEm && (
                <p style={{ color: '#94a3b8', fontSize: '0.74rem', fontWeight: 700, textAlign: 'center', margin: '10px 0 0' }}>
                  Sorteado em {formatDateTimeBR(sorteio.sorteadoEm.toDate?.() || sorteio.sorteadoEm)}
                  {sorteio.totalElegiveis ? ` entre ${sorteio.totalElegiveis} inscritos` : ''}
                </p>
              )}
              <button onClick={clearWinners} style={{ ...btnSecondary, width: '100%', marginTop: 12, justifyContent: 'center', background: '#fee2e2', color: '#dc2626' }}>
                Refazer sorteio
              </button>
            </>
          ) : (
            <>
              <div style={{ padding: '26px 18px', textAlign: 'center', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 16, marginBottom: 14 }}>
                <Trophy size={28} color="#cbd5e1" />
                <p style={{ margin: '10px 0 0', color: '#64748b', fontWeight: 700, fontSize: '0.85rem' }}>Nenhum ganhador sorteado ainda.</p>
              </div>
              <p style={{ color: '#64748b', fontSize: '0.76rem', lineHeight: 1.5, marginBottom: 14 }}>
                A escolha é aleatória e imparcial (sorteio criptográfico), entre os inscritos pagos que se encaixam no tipo escolhido e que ainda não ganharam outro sorteio.
              </p>
              <button onClick={handleDraw} disabled={drawing || elegiveis === 0} style={{ ...btnPrimary, width: '100%' }}>
                <Shuffle size={18} /> {drawing ? 'Sorteando...' : 'Sortear agora'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 7, marginBottom: 18 }}>
      <span style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 46, border: '1px solid #e2e8f0', borderRadius: 12, padding: '0 14px',
  color: '#071A45', fontWeight: 700, outline: 'none', background: '#fff', fontFamily: 'inherit', fontSize: '0.9rem',
};

const btnPrimary: React.CSSProperties = {
  background: '#071A45', color: '#fff', border: 'none', padding: '13px 22px', borderRadius: 12,
  fontWeight: 900, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  background: '#f1f5f9', color: '#475569', border: 'none', padding: '11px 18px', borderRadius: 12,
  fontWeight: 800, fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
};
