import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import html2canvas from 'html2canvas';
import { AlertTriangle, ChevronDown, ChevronUp, Gift, ImageDown, Info, Plus, Save, Trash2, Users } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { AdminPageSkeleton } from '../components/Skeleton';
import '../styles/admin.css';

type DiscountType = 'fixed' | 'percent';

interface LoteDiscount {
  enabled: boolean;
  type: DiscountType;
  value: number;
}

interface Lote {
  max: number;
  price: number;
  discount?: LoteDiscount;
}

interface LoteSettings {
  adulto: Lote[];
  infantil: { price: number; discount: LoteDiscount };
  mode: 'auto' | 'manual';
  manualIndex: number;
  forceUrgencyBanner: boolean;
}

const EMPTY_DISCOUNT: LoteDiscount = { enabled: false, type: 'percent', value: 0 };

const DEFAULT_SETTINGS: LoteSettings = {
  adulto: [
    { max: 250, price: 9500 },
    { max: 500, price: 11500 },
    { max: 750, price: 13500 },
    { max: 1000, price: 14500 },
  ],
  infantil: { price: 8000, discount: { ...EMPTY_DISCOUNT } },
  mode: 'auto',
  manualIndex: 0,
  forceUrgencyBanner: false,
};

type LotePagante = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  amount: number;
  usouCupom: boolean;
  couponCode: string;
  gratuito: boolean;
  createdAt?: any;
};

const formatMoneyBR = (valueInCents: number) => (Number(valueInCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const normalizeSettings = (value: Partial<LoteSettings> = {}): LoteSettings => ({
  ...DEFAULT_SETTINGS,
  ...value,
  adulto: (Array.isArray(value.adulto) && value.adulto.length > 0 ? value.adulto : DEFAULT_SETTINGS.adulto).map(lote => ({
    ...lote,
    discount: { ...EMPTY_DISCOUNT, ...(lote.discount || {}) },
  })),
  infantil: {
    ...DEFAULT_SETTINGS.infantil,
    ...(value.infantil || {}),
    discount: { ...EMPTY_DISCOUNT, ...(value.infantil?.discount || {}) },
  },
  mode: value.mode === 'manual' ? 'manual' : 'auto',
  manualIndex: Number(value.manualIndex || 0),
  forceUrgencyBanner: Boolean(value.forceUrgencyBanner),
});

export default function AdminLotes() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<LoteSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pagantesByLote, setPagantesByLote] = useState<Record<number, LotePagante[]>>({});
  const [expandedLote, setExpandedLote] = useState<number | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const { showAlert } = useDialog();

  useEffect(() => {
    loadSettings();
    loadPagantes();
  }, []);

  const loadPagantes = async () => {
    try {
      // Todas as inscrições pagas (inclui as gratuitas por cupom 100%, que têm paymentStatus 'pago').
      const snap = await getDocs(query(collection(db, 'nightrun_registrations'), where('paymentStatus', '==', 'pago')));
      const grouped: Record<number, LotePagante[]> = {};
      snap.docs.forEach(item => {
        const data = item.data();
        if (data.loteIndex === null || data.loteIndex === undefined) return;
        const idx = Number(data.loteIndex);
        if (!Number.isInteger(idx) || idx < 0) return;
        const pagante: LotePagante = {
          id: item.id,
          nome: String(data.nome || 'Sem nome'),
          cpf: String(data.cpf || ''),
          telefone: String(data.telefone || ''),
          email: String(data.email || ''),
          amount: Number(data.amount || 0),
          usouCupom: Boolean(data.descontoCupom || data.couponCode),
          couponCode: String(data.couponCode || ''),
          gratuito: Boolean(data.gratuito),
          createdAt: data.createdAt,
        };
        grouped[idx] = [...(grouped[idx] || []), pagante];
      });
      Object.keys(grouped).forEach(key => {
        grouped[Number(key)].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      });
      setPagantesByLote(grouped);
    } catch (e) {
      console.error(e);
    }
  };

  const loadSettings = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'nightrun_settings', 'lotes'));
      if (docSnap.exists()) {
        setSettings(normalizeSettings(docSnap.data() as Partial<LoteSettings>));
      }
    } catch (e) {
      console.error(e);
      showAlert('Erro ao carregar configurações.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'nightrun_settings', 'lotes'), normalizeSettings(settings));
      showAlert('Configurações salvas com sucesso!', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateResumoImage = async () => {
    if (!summaryRef.current) return;
    try {
      setGeneratingImage(true);
      // Aguarda um frame para garantir que o card oculto esteja renderizado.
      await new Promise(resolve => setTimeout(resolve, 150));
      const canvas = await html2canvas(summaryRef.current, {
        scale: 2,
        backgroundColor: '#071A45',
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `resumo-lotes-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      showAlert('Imagem de resumo gerada.', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao gerar a imagem de resumo.', 'error');
    } finally {
      setGeneratingImage(false);
    }
  };

  const addLote = () => {
    setSettings(prev => ({
      ...prev,
      adulto: [...prev.adulto, { max: 1000, price: 15000, discount: { ...EMPTY_DISCOUNT } }],
    }));
  };

  const removeLote = (index: number) => {
    if (settings.adulto.length <= 1) return;
    const newAdulto = [...settings.adulto];
    newAdulto.splice(index, 1);
    setSettings(prev => ({ ...prev, adulto: newAdulto, manualIndex: Math.min(prev.manualIndex, newAdulto.length - 1) }));
  };

  const updateLote = (index: number, field: keyof Pick<Lote, 'max' | 'price'>, value: number) => {
    const newAdulto = [...settings.adulto];
    newAdulto[index] = { ...newAdulto[index], [field]: value };
    setSettings(prev => ({ ...prev, adulto: newAdulto }));
  };

  const updateLoteDiscount = (index: number, patch: Partial<LoteDiscount>) => {
    const newAdulto = [...settings.adulto];
    const currentDiscount = newAdulto[index].discount || EMPTY_DISCOUNT;
    newAdulto[index] = {
      ...newAdulto[index],
      discount: { ...currentDiscount, ...patch },
    };
    setSettings(prev => ({ ...prev, adulto: newAdulto }));
  };

  const updateInfantilDiscount = (patch: Partial<LoteDiscount>) => {
    setSettings(prev => ({
      ...prev,
      infantil: {
        ...prev.infantil,
        discount: { ...(prev.infantil.discount || EMPTY_DISCOUNT), ...patch },
      },
    }));
  };

  const currencyInputValue = (valueInCents: number) => Number((Number(valueInCents || 0) / 100).toFixed(2));

  if (loading) return <AdminPageSkeleton variant="table" />;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Lotes e Preços</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Defina valores, descontos e regras de cobrança por volume de inscrições.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={generateResumoImage}
            disabled={generatingImage}
            style={{ background: '#6BFF2A', color: '#071A45', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(107, 255, 42, 0.25)' }}
          >
            <ImageDown size={18} />
            {generatingImage ? 'Gerando...' : 'Gerar imagem de resumo'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)' }}
          >
            <Save size={18} />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <button onClick={addLote} style={{ background: '#f1f5f9', border: 'none', padding: '8px 16px', borderRadius: 10, color: '#071A45', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> ADICIONAR LOTE
            </button>
          </div>

          <div style={{ display: 'flex', background: '#f1f5f9', padding: 6, borderRadius: 14, marginBottom: 24, width: 'fit-content' }}>
            <button
              onClick={() => setSettings(p => ({ ...p, mode: 'auto' }))}
              style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: settings.mode === 'auto' ? '#fff' : 'transparent', color: settings.mode === 'auto' ? '#071A45' : '#64748b', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', boxShadow: settings.mode === 'auto' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none', transition: '0.2s' }}
            >
              MODO AUTOMÁTICO
            </button>
            <button
              onClick={() => setSettings(p => ({ ...p, mode: 'manual' }))}
              style={{ padding: '8px 20px', borderRadius: 10, border: 'none', background: settings.mode === 'manual' ? '#fff' : 'transparent', color: settings.mode === 'manual' ? '#071A45' : '#64748b', fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', boxShadow: settings.mode === 'manual' ? '0 2px 8px rgba(0,0,0,0.05)' : 'none', transition: '0.2s' }}
            >
              MODO MANUAL
            </button>
          </div>

          <p style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 20, lineHeight: 1.5 }}>
            {settings.mode === 'auto'
              ? 'No modo autom?tico, o sistema troca o lote baseado no n?mero de inscritos.'
              : 'No modo manual, você escolhe qual lote está ativo agora, ignorando o número de inscritos.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {settings.adulto.map((lote, idx) => {
              const start = idx === 0 ? 0 : settings.adulto[idx - 1].max;
              const discount = lote.discount || EMPTY_DISCOUNT;
              return (
                <div key={idx} style={{ display: 'grid', gap: 16, padding: 24, background: '#f8fafc', borderRadius: 20, border: '1px solid #e2e8f0', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: -10, left: 20, background: '#071A45', color: '#fff', fontSize: '0.65rem', fontWeight: 900, padding: '4px 10px', borderRadius: 6 }}>
                    LOTE {idx + 1}
                  </div>

                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Início (inscrito nº)</label>
                      <input type="number" value={start} disabled style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none', background: '#f1f5f9', color: '#64748b' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Fim (até nº)</label>
                      <input type="number" value={lote.max} onChange={e => updateLote(idx, 'max', parseInt(e.target.value || '0'))} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Valor (R$)</label>
                      <input type="number" value={currencyInputValue(lote.price)} onChange={e => updateLote(idx, 'price', Math.round(parseFloat(e.target.value || '0') * 100))} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none' }} />
                    </div>
                    {settings.mode === 'manual' && (
                      <button
                        onClick={() => setSettings(p => ({ ...p, manualIndex: idx }))}
                        style={{ background: settings.manualIndex === idx ? '#6BFF2A' : '#f1f5f9', color: '#071A45', border: 'none', padding: '8px 16px', borderRadius: 10, fontWeight: 900, fontSize: '0.7rem', cursor: 'pointer', transition: '0.2s', boxShadow: settings.manualIndex === idx ? '0 4px 12px rgba(107, 255, 42, 0.3)' : 'none' }}
                      >
                        {settings.manualIndex === idx ? 'ATIVO AGORA' : 'ATIVAR LOTE'}
                      </button>
                    )}
                    <button onClick={() => removeLote(idx)} style={{ background: '#fee2e2', border: 'none', width: 46, height: 46, borderRadius: 12, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={20} />
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(118px, .7fr) minmax(140px, .8fr) minmax(160px, 1fr)', gap: 12, alignItems: 'end', padding: 14, background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Desconto</label>
                      <button onClick={() => updateLoteDiscount(idx, { enabled: !discount.enabled })} style={{ width: '100%', height: 44, border: 'none', borderRadius: 999, background: discount.enabled ? '#6BFF2A' : '#cbd5e1', color: '#071A45', fontWeight: 900, cursor: 'pointer' }}>
                        {discount.enabled ? 'LIGADO' : 'DESLIGADO'}
                      </button>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Tipo</label>
                      <select value={discount.type} disabled={!discount.enabled} onChange={e => updateLoteDiscount(idx, { type: e.target.value === 'fixed' ? 'fixed' : 'percent', value: 0 })} style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 12, border: '1px solid #e2e8f0', background: discount.enabled ? '#fff' : '#f1f5f9', color: '#071A45', fontWeight: 800, outline: 'none' }}>
                        <option value="percent">Percentual (%)</option>
                        <option value="fixed">Valor fixo (R$)</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>
                        {discount.type === 'fixed' ? 'Valor do desconto (R$)' : 'Percentual do desconto'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={discount.type === 'percent' ? 100 : undefined}
                        value={discount.type === 'fixed' ? currencyInputValue(discount.value) : discount.value}
                        disabled={!discount.enabled}
                        onChange={e => {
                          const raw = parseFloat(e.target.value || '0');
                          updateLoteDiscount(idx, { value: discount.type === 'fixed' ? Math.round(raw * 100) : raw });
                        }}
                        style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 12, border: '1px solid #e2e8f0', background: discount.enabled ? '#fff' : '#f1f5f9', color: '#071A45', fontWeight: 800, outline: 'none' }}
                      />
                    </div>
                  </div>

                  {(() => {
                    const pagantes = pagantesByLote[idx] || [];
                    const comCupom = pagantes.filter(p => p.usouCupom).length;
                    const semCupom = pagantes.length - comCupom;
                    const isOpen = expandedLote === idx;
                    return (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
                        <button
                          onClick={() => setExpandedLote(isOpen ? null : idx)}
                          style={{ width: '100%', border: 'none', background: isOpen ? '#f8fafc' : '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Users size={18} />
                            </div>
                            <strong style={{ color: '#071A45', fontSize: '0.95rem' }}>{pagantes.length} pagantes neste lote</strong>
                            <span style={{ padding: '3px 9px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9', fontSize: '0.68rem', fontWeight: 900 }}>{comCupom} com cupom</span>
                            <span style={{ padding: '3px 9px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontSize: '0.68rem', fontWeight: 900 }}>{semCupom} sem cupom</span>
                          </div>
                          {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
                        </button>

                        {isOpen && (
                          <div style={{ borderTop: '1px solid #e2e8f0' }}>
                            {pagantes.length ? pagantes.map(p => (
                              <div
                                key={p.id}
                                onClick={() => navigate(`/admin/inscritos/${p.id}`)}
                                style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1.6fr) minmax(110px, .9fr) minmax(90px, .6fr) auto', gap: 12, alignItems: 'center', padding: '11px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <strong style={{ color: '#071A45', fontSize: '0.86rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</strong>
                                  <small style={{ color: '#64748b', fontWeight: 700 }}>{p.cpf || 'CPF não informado'}{p.telefone ? ` · ${p.telefone}` : ''}</small>
                                </div>
                                <div>
                                  {p.gratuito ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: '#ede9fe', color: '#6d28d9', fontSize: '0.66rem', fontWeight: 900 }}><Gift size={11} /> {p.couponCode || 'GRATUITO'}</span>
                                  ) : p.usouCupom ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: '#eff6ff', color: '#2563eb', fontSize: '0.66rem', fontWeight: 900 }}><Gift size={11} /> {p.couponCode || 'CUPOM'}</span>
                                  ) : (
                                    <span style={{ padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontSize: '0.66rem', fontWeight: 900 }}>SEM CUPOM</span>
                                  )}
                                </div>
                                <span style={{ color: '#071A45', fontWeight: 900, fontSize: '0.85rem' }}>{formatMoneyBR(p.amount)}</span>
                                <span style={{ color: '#2563eb', fontWeight: 900, fontSize: '0.72rem', textTransform: 'uppercase' }}>Abrir</span>
                              </div>
                            )) : (
                              <div style={{ padding: 18, textAlign: 'center', color: '#64748b', fontWeight: 700, fontSize: '0.85rem' }}>Nenhum pagamento confirmado neste lote ainda.</div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 24, padding: 18, background: '#f8fafc', borderRadius: 18, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div>
              <h4 style={{ margin: '0 0 4px', color: '#071A45', fontSize: '0.9rem', fontWeight: 900 }}>Forçar aviso de últimas vagas</h4>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem', lineHeight: 1.4 }}>
                Quando desligado, o aviso aparece automaticamente apenas com 10 vagas ou menos no lote atual.
              </p>
            </div>
            <button
              onClick={() => setSettings(prev => ({ ...prev, forceUrgencyBanner: !prev.forceUrgencyBanner }))}
              style={{ minWidth: 88, height: 42, border: 'none', borderRadius: 999, background: settings.forceUrgencyBanner ? '#6BFF2A' : '#cbd5e1', color: '#071A45', fontWeight: 900, cursor: 'pointer' }}
            >
              {settings.forceUrgencyBanner ? 'LIGADO' : 'DESLIGADO'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45', marginBottom: 20 }}>Categoria Infantil</h3>
            {(() => {
              const infantilDiscount = settings.infantil.discount || EMPTY_DISCOUNT;
              return (
                <>
            <div>
              <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Valor Fixo (R$)</label>
              <input
                type="number"
                value={currencyInputValue(settings.infantil.price)}
                onChange={e => setSettings(prev => ({ ...prev, infantil: { ...prev.infantil, price: Math.round(parseFloat(e.target.value || '0') * 100) } }))}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none' }}
              />
            </div>

            <div style={{ display: 'grid', gap: 12, marginTop: 18, padding: 14, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Desconto Kids</label>
                <button onClick={() => updateInfantilDiscount({ enabled: !infantilDiscount.enabled })} style={{ width: '100%', height: 44, border: 'none', borderRadius: 999, background: infantilDiscount.enabled ? '#6BFF2A' : '#cbd5e1', color: '#071A45', fontWeight: 900, cursor: 'pointer' }}>
                  {infantilDiscount.enabled ? 'LIGADO' : 'DESLIGADO'}
                </button>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>Tipo</label>
                <select value={infantilDiscount.type} disabled={!infantilDiscount.enabled} onChange={e => updateInfantilDiscount({ type: e.target.value === 'fixed' ? 'fixed' : 'percent', value: 0 })} style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 12, border: '1px solid #e2e8f0', background: infantilDiscount.enabled ? '#fff' : '#f1f5f9', color: '#071A45', fontWeight: 800, outline: 'none' }}>
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase' }}>
                  {infantilDiscount.type === 'fixed' ? 'Valor do desconto (R$)' : 'Percentual do desconto'}
                </label>
                <input
                  type="number"
                  min="0"
                  max={infantilDiscount.type === 'percent' ? 100 : undefined}
                  value={infantilDiscount.type === 'fixed' ? currencyInputValue(infantilDiscount.value) : infantilDiscount.value}
                  disabled={!infantilDiscount.enabled}
                  onChange={e => {
                    const raw = parseFloat(e.target.value || '0');
                    updateInfantilDiscount({ value: infantilDiscount.type === 'fixed' ? Math.round(raw * 100) : raw });
                  }}
                  style={{ width: '100%', height: 44, padding: '0 12px', borderRadius: 12, border: '1px solid #e2e8f0', background: infantilDiscount.enabled ? '#fff' : '#f1f5f9', color: '#071A45', fontWeight: 800, outline: 'none' }}
                />
              </div>
            </div>
                </>
              );
            })()}

            <div style={{ marginTop: 24, padding: 16, background: '#eff6ff', borderRadius: 16, display: 'flex', gap: 12 }}>
              <Info size={20} color="#3b82f6" style={{ flexShrink: 0 }} />
              <p style={{ fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.4, fontWeight: 500, margin: 0 }}>
                A categoria infantil possui valor base fixo e também pode receber desconto próprio.
              </p>
            </div>
          </div>

          <div style={{ padding: 20, background: '#fffbeb', borderRadius: 24, border: '1px solid #fde68a', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <AlertTriangle size={24} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <h4 style={{ color: '#92400e', fontWeight: 800, fontSize: '0.9rem', marginBottom: 4 }}>Atenção ao alterar preços!</h4>
              <p style={{ fontSize: '0.8rem', color: '#b45309', lineHeight: 1.4, fontWeight: 500, margin: 0 }}>
                As alterações entram em vigor imediatamente para novos cadastros. Inscrições existentes não serão afetadas.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Card oculto usado para gerar a imagem de resumo dos lotes */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div ref={summaryRef} style={{ width: 760, background: 'linear-gradient(160deg, #071A45 0%, #0b2560 100%)', color: '#fff', padding: 40, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, paddingBottom: 20, borderBottom: '2px solid rgba(107,255,42,0.4)' }}>
            <div>
              <div style={{ color: '#6BFF2A', fontWeight: 900, fontSize: '0.8rem', letterSpacing: 1, textTransform: 'uppercase' }}>MCU Night Run 2026</div>
              <div style={{ fontSize: '1.9rem', fontWeight: 900, marginTop: 4 }}>Resumo de Lotes</div>
            </div>
            <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.8rem' }}>
              Gerado em<br />
              <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{new Date().toLocaleDateString('pt-BR')}</strong>
            </div>
          </div>

          {(() => {
            let totalPagantes = 0, totalComCupom = 0, totalArrecadado = 0;
            const rows = settings.adulto.map((lote, idx) => {
              const pagantes = pagantesByLote[idx] || [];
              const comCupom = pagantes.filter(p => p.usouCupom).length;
              const semCupom = pagantes.length - comCupom;
              const arrecadado = pagantes.reduce((sum, p) => sum + p.amount, 0);
              totalPagantes += pagantes.length;
              totalComCupom += comCupom;
              totalArrecadado += arrecadado;
              return { idx, price: lote.price, count: pagantes.length, comCupom, semCupom, arrecadado };
            });
            const totalSemCupom = totalPagantes - totalComCupom;
            return (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {rows.map(row => (
                    <div key={row.idx} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 18 }}>
                      <div style={{ background: '#6BFF2A', color: '#071A45', fontWeight: 900, fontSize: '0.85rem', width: 58, height: 58, borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.6rem', letterSpacing: 0.5 }}>LOTE</span>
                        <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{row.idx + 1}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{row.count} <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>pagantes</span></div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <span style={{ padding: '4px 11px', borderRadius: 999, background: 'rgba(167,139,250,0.22)', color: '#c4b5fd', fontSize: '0.72rem', fontWeight: 900 }}>{row.comCupom} com cupom</span>
                          <span style={{ padding: '4px 11px', borderRadius: 999, background: 'rgba(107,255,42,0.18)', color: '#a3e635', fontSize: '0.72rem', fontWeight: 900 }}>{row.semCupom} sem cupom</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Valor do lote</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 900 }}>{formatMoneyBR(row.price)}</div>
                        <div style={{ color: '#6BFF2A', fontSize: '0.78rem', fontWeight: 800, marginTop: 2 }}>{formatMoneyBR(row.arrecadado)} arrecadado</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 22, background: '#6BFF2A', color: '#071A45', borderRadius: 18, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', opacity: 0.7 }}>Total de pagantes</span>
                    <span style={{ fontSize: '2rem', fontWeight: 900, lineHeight: 1 }}>{totalPagantes}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, marginTop: 4 }}>{totalComCupom} com cupom · {totalSemCupom} sem cupom</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', opacity: 0.7, display: 'block' }}>Total arrecadado</span>
                    <span style={{ fontSize: '1.6rem', fontWeight: 900 }}>{formatMoneyBR(totalArrecadado)}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
