import { useMemo, useState } from 'react';
import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calendar, CreditCard, ExternalLink, QrCode, X } from 'lucide-react';
import AdminLineChart from './AdminLineChart';
import { SkeletonBlock } from '../Skeleton';

type FinanceCalendarProps = {
  regs: any[];
  getDate: (registration: any) => Date;
  loading: boolean;
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const fmtMoney = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCurrency = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const methodOf = (registration: any): { label: string; icon: 'pix' | 'card' } => (
  registration.creditCardAsaasPaymentId || registration.paymentMethod === 'credit_card'
    ? { label: 'CARTÃO', icon: 'card' }
    : { label: 'PIX', icon: 'pix' }
);

export default function FinanceCalendar({ regs, getDate, loading }: FinanceCalendarProps) {
  const navigate = useNavigate();
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [mode, setMode] = useState<'calendar' | 'chart'>('calendar');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Pagamentos confirmados do mês exibido, agrupados por dia.
  const byDay = useMemo(() => {
    const map = new Map<number, { total: number; items: any[] }>();
    regs.forEach(registration => {
      if (registration.paymentStatus !== 'pago') return;
      const date = getDate(registration);
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      const day = date.getDate();
      const bucket = map.get(day) || { total: 0, items: [] };
      bucket.total += Number(registration.amount || 0);
      bucket.items.push(registration);
      map.set(day, bucket);
    });
    map.forEach(bucket => bucket.items.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)));
    return map;
  }, [regs, getDate, year, month]);

  const bestDay = useMemo(() => {
    let best: number | null = null;
    byDay.forEach((bucket, day) => {
      if (best === null || bucket.total > (byDay.get(best)?.total || 0)) best = day;
    });
    return best;
  }, [byDay]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const monthLabel = `${viewDate.toLocaleDateString('pt-BR', { month: 'long' })} de ${year}`.toUpperCase();

  const changeMonth = (delta: number) => {
    setViewDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + delta); return d; });
    setSelectedDay(null);
  };

  const chartData = useMemo(() => (
    Array.from({ length: daysInMonth }, (_, index) => ({
      label: String(index + 1).padStart(2, '0'),
      value: (byDay.get(index + 1)?.total || 0) / 100,
    }))
  ), [byDay, daysInMonth]);

  const selectedBucket = selectedDay !== null ? byDay.get(selectedDay) : undefined;
  const selectedDateLabel = selectedDay !== null
    ? new Date(year, month, selectedDay).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  const openFatura = (registration: any) => {
    if (registration.invoiceUrl) window.open(registration.invoiceUrl, '_blank', 'noopener,noreferrer');
    else navigate(`/admin/inscritos/${registration.id}`);
  };

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', padding: 24, marginBottom: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
            <Calendar size={20} />
          </div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#071A45', textTransform: 'uppercase' }}>Financeiro (Recebimentos)</h3>
        </div>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 12, padding: 4 }}>
          {([['calendar', 'Calendário'], ['chart', 'Gráfico']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{
                border: 'none', padding: '8px 18px', borderRadius: 9, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer',
                background: mode === id ? '#fff' : 'transparent',
                color: mode === id ? '#16a34a' : '#64748b',
                boxShadow: mode === id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Navegação do mês */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => changeMonth(-1)} style={navBtnStyle} aria-label="Mês anterior"><ArrowLeft size={16} /></button>
          <button onClick={() => changeMonth(1)} style={navBtnStyle} aria-label="Próximo mês"><ArrowRight size={16} /></button>
        </div>
        <strong style={{ color: '#071A45', fontSize: '0.9rem', fontWeight: 900 }}>{monthLabel}</strong>
      </div>

      {loading ? (
        <SkeletonBlock height={340} width="100%" radius={18} />
      ) : mode === 'chart' ? (
        <div style={{ height: 280, paddingBottom: 16 }}>
          <AdminLineChart data={chartData} height={280} />
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
            {WEEKDAYS.map((weekday, index) => (
              <div key={index} style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 900 }}>{weekday}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {cells.map((day, index) => {
              if (day === null) return <div key={`empty-${index}`} />;
              const bucket = byDay.get(day);
              const hasPayments = Boolean(bucket && bucket.items.length);
              const isBest = hasPayments && day === bestDay;
              const isToday = isCurrentMonth && day === today.getDate();
              return (
                <button
                  key={day}
                  onClick={() => hasPayments && setSelectedDay(day)}
                  style={{
                    minHeight: 88,
                    border: isToday ? '2px solid #16a34a' : isBest ? '2px solid #f59e0b' : '1px solid #eef2f7',
                    borderRadius: 10,
                    background: isBest ? '#fffbeb' : hasPayments ? '#f2fbf6' : '#f8fafc',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '8px 4px',
                    cursor: hasPayments ? 'pointer' : 'default',
                    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                  }}
                  onMouseEnter={event => { if (hasPayments) { event.currentTarget.style.transform = 'translateY(-2px)'; event.currentTarget.style.boxShadow = '0 6px 14px rgba(15,23,42,0.1)'; } }}
                  onMouseLeave={event => { event.currentTarget.style.transform = ''; event.currentTarget.style.boxShadow = ''; }}
                >
                  <span style={{ color: isBest ? '#b45309' : isToday ? '#16a34a' : '#475569', fontWeight: 900, fontSize: '0.85rem' }}>{day}</span>
                  {hasPayments && (
                    <>
                      <span style={{
                        background: isBest ? '#f59e0b' : '#16a34a', color: isBest ? '#78350f' : '#fff',
                        borderRadius: 6, padding: '2px 7px', fontSize: '0.68rem', fontWeight: 900,
                      }}>
                        {fmtMoney(bucket!.total)}
                      </span>
                      <span style={{ color: isBest ? '#b45309' : '#16a34a', fontSize: '0.62rem', fontWeight: 900 }}>
                        {bucket!.items.length} pgto{bucket!.items.length > 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Modal: pagamentos do dia */}
      {selectedDay !== null && selectedBucket && (
        <div
          onClick={() => setSelectedDay(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1200 }}
        >
          <div onClick={event => event.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 480, maxHeight: '86vh', borderRadius: 20, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
            <div style={{ padding: '22px 24px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.15rem', fontWeight: 950, textTransform: 'uppercase' }}>Pagamentos do dia</h2>
                <span style={{ color: '#16a34a', fontWeight: 900, fontSize: '0.85rem' }}>{selectedDateLabel}</span>
                <div style={{ color: '#64748b', fontWeight: 800, fontSize: '0.74rem', marginTop: 4 }}>
                  {selectedBucket.items.length} pagamento{selectedBucket.items.length > 1 ? 's' : ''} · Total {fmtCurrency(selectedBucket.total)}
                </div>
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ border: 'none', background: '#f1f5f9', width: 36, height: 36, borderRadius: 10, color: '#64748b', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '4px 20px 12px', overflowY: 'auto', display: 'grid', gap: 10 }}>
              {selectedBucket.items.map(registration => {
                const method = methodOf(registration);
                return (
                  <div key={registration.id} style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block', color: '#071A45', fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{registration.nome || 'Atleta'}</strong>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: '0.68rem', fontWeight: 900, marginTop: 5 }}>
                        PAGO COM {method.icon === 'card' ? <CreditCard size={13} /> : <QrCode size={13} />} {method.label}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <strong style={{ display: 'block', color: '#16a34a', fontSize: '0.95rem', fontWeight: 950 }}>{fmtCurrency(Number(registration.amount || 0))}</strong>
                      <button onClick={() => openFatura(registration)} style={{ border: 'none', background: 'transparent', color: '#2563eb', fontSize: '0.68rem', fontWeight: 950, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0, marginTop: 5 }}>
                        VER FATURA <ExternalLink size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={() => setSelectedDay(null)} style={{ margin: 20, marginTop: 10, border: 'none', background: '#071A45', color: '#fff', borderRadius: 12, padding: 15, fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer', textTransform: 'uppercase' }}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 36, height: 34, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
  color: '#475569', display: 'grid', placeItems: 'center', cursor: 'pointer',
};
