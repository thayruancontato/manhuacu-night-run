import { Fragment, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { CheckCircle, Download, Edit2, Eye, Gift, Plus, RefreshCw, Save, ToggleLeft, ToggleRight, Trash2, X } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { AdminPageSkeleton } from '../components/Skeleton';
import '../styles/admin.css';

type CouponType = 'fixed' | 'percent';

type DiscountCoupon = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  description?: string;
};

type CouponUsage = {
  id: string;
  couponCode: string;
  nome: string;
  cpf?: string;
  telefone?: string;
  amount: number;
  couponDiscountAmount: number;
  paymentStatus?: string;
  createdAt?: any;
};

const EMPTY_FORM: Omit<DiscountCoupon, 'id'> = {
  code: '',
  type: 'percent',
  value: 10,
  maxUses: 1,
  usedCount: 0,
  active: true,
  description: '',
};

const normalizeCouponCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');
const formatMoney = (valueInCents: number) => (valueInCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const discountLabel = (coupon: Pick<DiscountCoupon, 'type' | 'value'>) => (
  coupon.type === 'fixed' ? formatMoney(Number(coupon.value || 0)) : `${Number(coupon.value || 0)}%`
);

const dateMs = (value: any) => {
  const date = value?.toDate?.() || (value ? new Date(value) : new Date(0));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const statusColor = (status?: string) => (
  status === 'pago' ? '#15803d' : status === 'cancelado' ? '#b91c1c' : '#b45309'
);

const formatDate = (value: any) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return '---';
  return date.toLocaleDateString('pt-BR');
};

export default function AdminCuponsDesconto() {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState<DiscountCoupon[]>([]);
  const [couponUsages, setCouponUsages] = useState<Record<string, CouponUsage[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<DiscountCoupon, 'id'>>(EMPTY_FORM);
  const [rechargeId, setRechargeId] = useState<string | null>(null);
  const [expandedCouponId, setExpandedCouponId] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState(1);
  const { showAlert, showConfirm } = useDialog();

  const stats = useMemo(() => {
    const totalUses = coupons.reduce((sum, coupon) => sum + Number(coupon.maxUses || 0), 0);
    const used = coupons.reduce((sum, coupon) => sum + Number(coupon.usedCount || 0), 0);
    return {
      total: coupons.length,
      active: coupons.filter(coupon => coupon.active !== false).length,
      available: Math.max(totalUses - used, 0),
      used,
    };
  }, [coupons]);

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const [snap, usagesSnap] = await Promise.all([
        getDocs(query(collection(db, 'nightrun_discount_coupons'), orderBy('code'))),
        getDocs(query(collection(db, 'nightrun_registrations'), where('descontoCupom', '==', true))),
      ]);
      setCoupons(snap.docs.map(item => {
        const data = item.data();
        return {
          id: item.id,
          code: String(data.code || item.id).toUpperCase(),
          type: data.type === 'fixed' ? 'fixed' : 'percent',
          value: Number(data.value || 0),
          maxUses: Number(data.maxUses || 0),
          usedCount: Number(data.usedCount || 0),
          active: data.active !== false,
          description: String(data.description || ''),
        };
      }));
      const grouped: Record<string, CouponUsage[]> = {};
      usagesSnap.docs.forEach(item => {
        const data = item.data();
        const code = normalizeCouponCode(String(data.couponCode || data.couponId || ''));
        if (!code) return;
        const usage = {
          id: item.id,
          couponCode: code,
          nome: String(data.nome || 'Atleta sem nome'),
          cpf: data.cpf,
          telefone: data.telefone,
          amount: Number(data.amount || 0),
          couponDiscountAmount: Number(data.couponDiscountAmount || 0),
          paymentStatus: data.paymentStatus,
          createdAt: data.createdAt,
        };
        grouped[code] = [...(grouped[code] || []), usage];
      });
      Object.keys(grouped).forEach(code => {
        grouped[code].sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt));
      });
      setCouponUsages(grouped);
    } catch (error) {
      console.error(error);
      showAlert('Erro ao carregar cupons.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (coupon: DiscountCoupon) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: coupon.type === 'fixed' ? coupon.value / 100 : coupon.value,
      maxUses: coupon.maxUses,
      usedCount: coupon.usedCount,
      active: coupon.active,
      description: coupon.description || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const code = normalizeCouponCode(form.code);
    if (!code) return showAlert('Informe o codigo do cupom.', 'warning');
    if (Number(form.maxUses || 0) < Number(form.usedCount || 0)) return showAlert('A quantidade total nao pode ser menor que os usos ja consumidos.', 'warning');
    if (Number(form.value || 0) <= 0) return showAlert('Informe um desconto maior que zero.', 'warning');
    if (form.type === 'percent' && Number(form.value || 0) > 100) return showAlert('O desconto percentual nao pode passar de 100%.', 'warning');

    const targetId = editingId || code;
    const normalizedValue = form.type === 'fixed' ? Math.round(Number(form.value || 0) * 100) : Number(form.value || 0);
    const payload = {
      code,
      type: form.type,
      value: normalizedValue,
      maxUses: Math.max(Number(form.maxUses || 0), 0),
      usedCount: Math.max(Number(form.usedCount || 0), 0),
      active: form.active !== false,
      description: String(form.description || '').trim(),
      updatedAt: new Date(),
      ...(editingId ? {} : { createdAt: new Date() }),
    };

    setSaving(true);
    try {
      if (editingId && editingId !== code) {
        await deleteDoc(doc(db, 'nightrun_discount_coupons', editingId));
      }
      await setDoc(doc(db, 'nightrun_discount_coupons', targetId), payload, { merge: false });
      showAlert(editingId ? 'Cupom atualizado.' : 'Cupom criado.', 'success');
      setModalOpen(false);
      loadCoupons();
    } catch (error) {
      console.error(error);
      showAlert('Erro ao salvar cupom.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (coupon: DiscountCoupon) => {
    try {
      await updateDoc(doc(db, 'nightrun_discount_coupons', coupon.id), { active: !coupon.active, updatedAt: new Date() });
      setCoupons(prev => prev.map(item => item.id === coupon.id ? { ...item, active: !item.active } : item));
    } catch (error) {
      console.error(error);
      showAlert('Erro ao alterar status do cupom.', 'error');
    }
  };

  const deleteCoupon = (coupon: DiscountCoupon) => {
    showConfirm(`Excluir o cupom ${coupon.code}? Esta acao nao afeta inscricoes ja criadas.`, async () => {
      try {
        await deleteDoc(doc(db, 'nightrun_discount_coupons', coupon.id));
        setCoupons(prev => prev.filter(item => item.id !== coupon.id));
        showAlert('Cupom excluido.', 'success');
      } catch (error) {
        console.error(error);
        showAlert('Erro ao excluir cupom.', 'error');
      }
    });
  };

  const rechargeCoupon = async (coupon: DiscountCoupon) => {
    const amount = Math.max(Number(rechargeAmount || 0), 0);
    if (!amount) return showAlert('Informe quantos usos deseja adicionar.', 'warning');
    try {
      const nextMax = Number(coupon.maxUses || 0) + amount;
      await updateDoc(doc(db, 'nightrun_discount_coupons', coupon.id), { maxUses: nextMax, updatedAt: new Date() });
      setCoupons(prev => prev.map(item => item.id === coupon.id ? { ...item, maxUses: nextMax } : item));
      setRechargeId(null);
      setRechargeAmount(1);
      showAlert('Usos recarregados.', 'success');
    } catch (error) {
      console.error(error);
      showAlert('Erro ao recarregar cupom.', 'error');
    }
  };

  const exportCouponImage = (coupon: DiscountCoupon) => {
    const usages = couponUsages[coupon.code] || [];
    const width = 1400;
    const rowHeight = 74;
    const tableY = 320;
    const tableHeaderHeight = 56;
    const footerHeight = 96;
    const tableRowsHeight = Math.max(usages.length, 1) * rowHeight;
    const height = Math.max(620, tableY + tableHeaderHeight + tableRowsHeight + footerHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return showAlert('Nao foi possivel gerar a imagem.', 'error');

    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#071A45';
    ctx.fillRect(0, 0, width, 170);

    ctx.fillStyle = '#6BFF2A';
    ctx.font = '900 30px Inter, Arial, sans-serif';
    ctx.fillText('MCU NIGHT RUN', 64, 68);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px Inter, Arial, sans-serif';
    ctx.fillText(`Cupom ${coupon.code}`, 64, 124);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 28px Inter, Arial, sans-serif';
    ctx.fillText(`${usages.length} uso(s)`, width - 64, 78);
    ctx.font = '800 20px Inter, Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillText(`Desconto: ${discountLabel(coupon)}`, width - 64, 114);
    ctx.textAlign = 'left';

    const totalDiscount = usages.reduce((sum, usage) => sum + Number(usage.couponDiscountAmount || 0), 0);
    const totalAmount = usages.reduce((sum, usage) => sum + Number(usage.amount || 0), 0);
    const metrics = [
      ['Total de usos', String(usages.length)],
      ['Valor descontado', formatMoney(totalDiscount)],
      ['Valor final gerado', formatMoney(totalAmount)],
    ];
    metrics.forEach(([label, value], index) => {
      const x = 64 + index * 410;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, x, 190, 360, 92, 18);
      ctx.fill();
      ctx.fillStyle = '#64748b';
      ctx.font = '900 17px Inter, Arial, sans-serif';
      ctx.fillText(label.toUpperCase(), x + 24, 224);
      ctx.fillStyle = index === 1 ? '#16a34a' : '#071A45';
      ctx.font = '900 30px Inter, Arial, sans-serif';
      ctx.fillText(value, x + 24, 262);
    });

    const tableX = 64;
    const tableWidth = width - 128;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, tableX, tableY, tableWidth, Math.max(rowHeight * Math.max(usages.length, 1) + 56, 150), 18);
    ctx.fill();

    const columns = [
      { title: 'Nome', x: tableX + 28 },
      { title: 'CPF / Telefone', x: tableX + 490 },
      { title: 'Desconto', x: tableX + 790 },
      { title: 'Valor final', x: tableX + 970 },
      { title: 'Status', x: tableX + 1150 },
    ];
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(tableX, tableY, tableWidth, 56);
    ctx.fillStyle = '#475569';
    ctx.font = '900 16px Inter, Arial, sans-serif';
    columns.forEach(column => ctx.fillText(column.title.toUpperCase(), column.x, tableY + 35));

    if (!usages.length) {
      ctx.fillStyle = '#64748b';
      ctx.font = '800 24px Inter, Arial, sans-serif';
      ctx.fillText('Nenhuma inscricao usou este cupom ainda.', tableX + 28, tableY + 112);
    } else {
      usages.forEach((usage, index) => {
        const y = tableY + 56 + index * rowHeight;
        ctx.fillStyle = index % 2 === 0 ? '#ffffff' : '#f8fafc';
        ctx.fillRect(tableX, y, tableWidth, rowHeight);
        ctx.fillStyle = '#071A45';
        ctx.font = '900 21px Inter, Arial, sans-serif';
        drawClippedText(ctx, usage.nome, tableX + 28, y + 30, 410);
        ctx.fillStyle = '#64748b';
        ctx.font = '800 15px Inter, Arial, sans-serif';
        ctx.fillText(formatDate(usage.createdAt), tableX + 28, y + 54);
        ctx.fillStyle = '#071A45';
        ctx.font = '800 17px Inter, Arial, sans-serif';
        drawClippedText(ctx, `${usage.cpf || 'CPF nao informado'}${usage.telefone ? ` - ${usage.telefone}` : ''}`, tableX + 490, y + 42, 250);
        ctx.fillStyle = '#16a34a';
        ctx.font = '900 18px Inter, Arial, sans-serif';
        ctx.fillText(formatMoney(usage.couponDiscountAmount), tableX + 790, y + 42);
        ctx.fillStyle = '#071A45';
        ctx.fillText(formatMoney(usage.amount), tableX + 970, y + 42);
        ctx.fillStyle = statusColor(usage.paymentStatus);
        ctx.fillText(String(usage.paymentStatus || 'pendente').toUpperCase(), tableX + 1150, y + 42);
      });
    }

    ctx.fillStyle = '#64748b';
    ctx.font = '800 16px Inter, Arial, sans-serif';
    ctx.fillText(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 64, height - 32);

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png', 1);
    link.download = `cupom-${coupon.code}-usos.png`;
    link.click();
  };

  if (loading && coupons.length === 0) return <AdminPageSkeleton variant="table" />;

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Cupons de desconto</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Crie codigos promocionais com desconto em valor fixo ou percentual e controle os usos disponiveis.</p>
        </div>
        <button onClick={openCreate} style={{ background: '#071A45', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 800, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 4px 12px rgba(7, 26, 69, 0.2)' }}>
          <Plus size={18} /> Novo cupom
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Stat label="Cupons" value={stats.total} tone="#2563eb" />
        <Stat label="Ativos" value={stats.active} tone="#16a34a" />
        <Stat label="Usos disponiveis" value={stats.available} tone="#071A45" />
        <Stat label="Usos consumidos" value={stats.used} tone="#f59e0b" />
      </div>

      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Cupom', 'Desconto', 'Usos', 'Status', 'Acoes'].map(item => (
                <th key={item} style={{ padding: '16px 24px', fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', textAlign: item === 'Acoes' ? 'right' : 'left' }}>{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coupons.map(coupon => {
              const available = Math.max(Number(coupon.maxUses || 0) - Number(coupon.usedCount || 0), 0);
              const usages = couponUsages[coupon.code] || [];
              const isExpanded = expandedCouponId === coupon.id;
              return (
                <Fragment key={coupon.id}>
                  <tr key={coupon.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Gift size={20} /></div>
                        <div>
                          <div style={{ fontWeight: 900, color: '#071A45' }}>{coupon.code}</div>
                          {coupon.description && <small style={{ color: '#64748b', fontWeight: 700 }}>{coupon.description}</small>}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#071A45', fontWeight: 900 }}>{discountLabel(coupon)}</td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ color: '#071A45', fontWeight: 900 }}>{available} disponiveis</div>
                      <small style={{ color: '#64748b', fontWeight: 700 }}>{coupon.usedCount} usados de {coupon.maxUses}</small>
                      <button type="button" onClick={() => setExpandedCouponId(isExpanded ? null : coupon.id)} style={{ display: 'block', marginTop: 8, border: 'none', background: '#eff6ff', color: '#2563eb', borderRadius: 9, padding: '6px 10px', fontSize: '.68rem', fontWeight: 950, cursor: 'pointer' }}>
                        {isExpanded ? 'Ocultar usos' : `Ver quem usou (${usages.length})`}
                      </button>
                      {rechargeId === coupon.id && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <input type="number" min="1" value={rechargeAmount} onChange={event => setRechargeAmount(Number(event.target.value || 0))} style={{ width: 86, padding: '8px 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 800 }} />
                          <button onClick={() => rechargeCoupon(coupon)} style={{ background: '#dcfce7', border: 'none', color: '#166534', borderRadius: 10, padding: '0 12px', fontWeight: 900, cursor: 'pointer' }}>OK</button>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <span style={{ padding: '5px 10px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 900, background: coupon.active ? '#dcfce7' : '#fee2e2', color: coupon.active ? '#166534' : '#b91c1c' }}>
                        {coupon.active ? 'ATIVO' : 'INATIVO'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                        <IconButton title="Recarregar usos" onClick={() => setRechargeId(rechargeId === coupon.id ? null : coupon.id)}><RefreshCw size={16} /></IconButton>
                        <IconButton title="Exportar imagem" onClick={() => exportCouponImage(coupon)}><Download size={16} /></IconButton>
                        <IconButton title={coupon.active ? 'Desativar' : 'Ativar'} onClick={() => toggleActive(coupon)}>{coupon.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}</IconButton>
                        <IconButton title="Editar" onClick={() => openEdit(coupon)}><Edit2 size={16} /></IconButton>
                        <IconButton title="Excluir" danger onClick={() => deleteCoupon(coupon)}><Trash2 size={16} /></IconButton>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${coupon.id}-usages`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td colSpan={5} style={{ padding: '0 24px 20px' }}>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
                          {usages.length ? usages.map(usage => (
                            <div key={usage.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(120px, .8fr) minmax(120px, .8fr) minmax(120px, .8fr) auto', gap: 12, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #e2e8f0' }}>
                              <div>
                                <strong style={{ color: '#071A45', fontSize: '.88rem' }}>{usage.nome}</strong>
                                <small style={{ display: 'block', color: '#64748b', fontWeight: 700 }}>{usage.cpf || 'CPF nao informado'} {usage.telefone ? `- ${usage.telefone}` : ''}</small>
                              </div>
                              <span style={{ color: '#071A45', fontWeight: 900 }}>{formatMoney(usage.couponDiscountAmount)}</span>
                              <span style={{ color: '#071A45', fontWeight: 800 }}>{formatMoney(usage.amount)}</span>
                              <span style={{ color: statusColor(usage.paymentStatus), fontWeight: 950, textTransform: 'uppercase', fontSize: '.7rem' }}>{usage.paymentStatus || 'pendente'}</span>
                              <button type="button" onClick={() => navigate(`/admin/inscritos/${usage.id}`)} style={{ border: 'none', background: '#071A45', color: '#fff', borderRadius: 10, height: 34, padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 900, cursor: 'pointer' }}>
                                <Eye size={15} /> Abrir
                              </button>
                            </div>
                          )) : (
                            <div style={{ padding: 18, color: '#64748b', fontWeight: 800, textAlign: 'center' }}>Nenhuma inscricao usou este cupom ainda.</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {coupons.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 44, textAlign: 'center', color: '#64748b', fontWeight: 700 }}>Nenhum cupom cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1000 }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 540, borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,.24)', overflow: 'hidden' }}>
            <div style={{ padding: '24px 28px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.2rem', fontWeight: 950 }}>{editingId ? 'Editar cupom' : 'Novo cupom'}</h2>
              <button onClick={() => setModalOpen(false)} style={{ border: 'none', background: '#f1f5f9', width: 38, height: 38, borderRadius: 12, color: '#64748b', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: 28, display: 'grid', gap: 18 }}>
              <Field label="Codigo do cupom">
                <input value={form.code} onChange={event => setForm(prev => ({ ...prev, code: normalizeCouponCode(event.target.value) }))} placeholder="EX: NIGHT10" style={inputStyle} />
              </Field>
              <Field label="Descricao interna">
                <input value={form.description || ''} onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))} placeholder="Ex: promocao para equipe" style={inputStyle} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Tipo de desconto">
                  <select value={form.type} onChange={event => setForm(prev => ({ ...prev, type: event.target.value === 'fixed' ? 'fixed' : 'percent', value: 0 }))} style={inputStyle}>
                    <option value="percent">Percentual (%)</option>
                    <option value="fixed">Valor fixo (R$)</option>
                  </select>
                </Field>
                <Field label={form.type === 'fixed' ? 'Valor do desconto (R$)' : 'Percentual'}>
                  <input type="number" min="0" max={form.type === 'percent' ? 100 : undefined} value={form.value} onChange={event => setForm(prev => ({ ...prev, value: Number(event.target.value || 0) }))} style={inputStyle} />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Quantidade total de usos">
                  <input type="number" min="0" value={form.maxUses} onChange={event => setForm(prev => ({ ...prev, maxUses: Number(event.target.value || 0) }))} style={inputStyle} />
                </Field>
                <Field label="Usos ja consumidos">
                  <input type="number" min="0" value={form.usedCount} onChange={event => setForm(prev => ({ ...prev, usedCount: Number(event.target.value || 0) }))} style={inputStyle} />
                </Field>
              </div>
              <button onClick={() => setForm(prev => ({ ...prev, active: !prev.active }))} style={{ border: 'none', borderRadius: 14, padding: '13px 16px', background: form.active ? '#dcfce7' : '#fee2e2', color: form.active ? '#166534' : '#b91c1c', fontWeight: 950, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <CheckCircle size={18} /> {form.active ? 'Cupom ativo' : 'Cupom inativo'}
              </button>
            </div>
            <div style={{ padding: '0 28px 28px', display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
              <button onClick={() => setModalOpen(false)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 12, color: '#64748b', fontWeight: 900, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ border: 'none', background: '#071A45', color: '#fff', borderRadius: 12, padding: 14, fontWeight: 900, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Save size={18} /> {saving ? 'Salvando...' : 'Salvar cupom'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 18, border: '1px solid #e2e8f0', padding: 18, borderLeft: `5px solid ${tone}` }}>
      <span style={{ color: '#64748b', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ display: 'block', marginTop: 8, color: '#071A45', fontSize: '1.55rem', fontWeight: 950 }}>{value}</strong>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ color: '#64748b', fontSize: '.72rem', fontWeight: 900, textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

function IconButton({ title, children, onClick, danger = false }: { title: string; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} style={{ width: 38, height: 38, borderRadius: 11, border: 'none', background: danger ? '#fee2e2' : '#f1f5f9', color: danger ? '#dc2626' : '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      {children}
    </button>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

function drawClippedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  const value = String(text || '');
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }
  let clipped = value;
  while (clipped.length > 3 && ctx.measureText(`${clipped}...`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  ctx.fillText(`${clipped}...`, x, y);
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 46,
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '0 14px',
  color: '#071A45',
  fontWeight: 800,
  outline: 'none',
  background: '#fff',
};
