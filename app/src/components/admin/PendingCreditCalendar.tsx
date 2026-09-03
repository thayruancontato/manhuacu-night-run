import { useMemo, useState } from 'react';
import type React from 'react';
import { ArrowLeft, ArrowRight, Calendar, CreditCard, ExternalLink, X } from 'lucide-react';
import { toDateValue } from '../../utils/dateUtils';

type PendingCreditItem = {
  id: string;
  customer: string;
  valueCents: number;
  netValueCents: number;
  status: string;
  billingType: string;
  estimatedCreditDate: string;
  invoiceUrl: string;
};

type PendingCreditCalendarProps = {
  items: PendingCreditItem[];
  onClose: () => void;
};

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const fmtMoney = (cents: number) => (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCurrency = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function PendingCreditCalendar({ items, onClose }: PendingCreditCalendarProps) {
  // Itens sem data estimada (a Asaas às vezes não devolve isso pra alguns métodos/casos) ficam
  // fora do calendário, mas ainda contam no total - mostrados à parte.
  const dated = useMemo(() => items
    .map(item => ({ item, date: toDateValue(item.estimatedCreditDate) }))
    .filter((entry): entry is { item: PendingCreditItem; date: Date } => !!entry.date), [items]);
  const undated = useMemo(() => items.filter(item => !toDateValue(item.estimatedCreditDate)), [items]);

  const firstDated = dated.length > 0 ? dated.reduce((min, entry) => (entry.date < min ? entry.date : min), dated[0].date) : new Date();
  const [viewDate, setViewDate] = useState(() => { const d = new Date(firstDated); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const byDay = useMemo(() => {
    const map = new Map<number, { totalNet: number; totalGross: number; items: PendingCreditItem[] }>();
    dated.forEach(({ item, date }) => {
      if (date.getFullYear() !== year || date.getMonth() !== month) return;
      const day = date.getDate();
      const bucket = map.get(day) || { totalNet: 0, totalGross: 0, items: [] };
      bucket.totalNet += Number(item.netValueCents || 0);
      bucket.totalGross += Number(item.valueCents || 0);
      bucket.items.push(item);
      map.set(day, bucket);
    });
    map.forEach(bucket => bucket.items.sort((a, b) => b.netValueCents - a.netValueCents));
    return map;
  }, [dated, year, month]);

  const monthTotal = useMemo(() => {
    let total = 0;
    byDay.forEach(bucket => { total += bucket.totalNet; });
    return total;
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

  const selectedBucket = selectedDay !== null ? byDay.get(selectedDay) : undefined;
  const selectedDateLabel = selectedDay !== null
    ? new Date(year, month, selectedDay).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1300 }}>
      <div onClick={event => event.stopPropagation()} style={{ background: '#fff', width: '100%', maxWidth: 720, maxHeight: '90vh', borderRadius: 24, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
        <div style={{ padding: '22px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#fff7ed', color: '#c2410c', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Calendar size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.1rem', fontWeight: 950, textTransform: 'uppercase' }}>Calendário de créditos (Asaas)</h2>
              <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.78rem' }}>Cartão confirmado, ainda não creditado na conta</span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 36, height: 36, borderRadius: 10, color: '#64748b', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 24px 0', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => changeMonth(-1)} style={navBtnStyle} aria-label="Mês anterior"><ArrowLeft size={16} /></button>
              <button onClick={() => changeMonth(1)} style={navBtnStyle} aria-label="Próximo mês"><ArrowRight size={16} /></button>
              <strong style={{ color: '#071A45', fontSize: '0.9rem', fontWeight: 900, alignSelf: 'center', marginLeft: 6 }}>{monthLabel}</strong>
            </div>
            <span style={{ background: '#fff7ed', color: '#c2410c', padding: '7px 12px', borderRadius: 8, fontWeight: 900, fontSize: '0.78rem' }}>
              A creditar no mês: {fmtCurrency(monthTotal)}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
            {WEEKDAYS.map((weekday, index) => (
              <div key={index} style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 900 }}>{weekday}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 20 }}>
            {cells.map((day, index) => {
              if (day === null) return <div key={`empty-${index}`} />;
              const bucket = byDay.get(day);
              const hasCredits = Boolean(bucket && bucket.items.length);
              const isToday = isCurrentMonth && day === today.getDate();
              return (
                <button
                  key={day}
                  onClick={() => hasCredits && setSelectedDay(day)}
                  style={{
                    minHeight: 78,
                    border: isToday ? '2px solid #16a34a' : '1px solid #eef2f7',
                    borderRadius: 10,
                    background: hasCredits ? '#fff7ed' : '#f8fafc',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    padding: '6px 4px',
                    cursor: hasCredits ? 'pointer' : 'default',
                  }}
                >
                  <span style={{ color: isToday ? '#16a34a' : '#475569', fontWeight: 900, fontSize: '0.82rem' }}>{day}</span>
                  {hasCredits && (
                    <>
                      <span style={{ background: '#c2410c', color: '#fff', borderRadius: 6, padding: '2px 6px', fontSize: '0.64rem', fontWeight: 900 }}>
                        {fmtMoney(bucket!.totalNet)}
                      </span>
                      <span style={{ color: '#c2410c', fontSize: '0.6rem', fontWeight: 900 }}>
                        {bucket!.items.length} pgto{bucket!.items.length > 1 ? 's' : ''}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {undated.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: '10px 14px', marginBottom: 20, fontSize: '0.76rem', color: '#64748b', fontWeight: 700 }}>
              {undated.length} pagamento(s) sem data estimada de crédito informada pela Asaas — totalizando {fmtCurrency(undated.reduce((s, i) => s + Number(i.netValueCents || 0), 0))}. Não aparecem no calendário acima.
            </div>
          )}
        </div>

        {selectedDay !== null && selectedBucket && (
          <div style={{ borderTop: '1px solid #f1f5f9', padding: '16px 24px', maxHeight: '38vh', overflowY: 'auto', background: '#fafbfc' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div>
                <strong style={{ display: 'block', color: '#071A45', fontSize: '0.9rem', fontWeight: 950 }}>Créditos de {selectedDateLabel}</strong>
                <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.74rem' }}>
                  {selectedBucket.items.length} pagamento{selectedBucket.items.length > 1 ? 's' : ''} · Líquido {fmtCurrency(selectedBucket.totalNet)}
                </span>
              </div>
              <button onClick={() => setSelectedDay(null)} style={{ border: 'none', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 900 }}>FECHAR</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {selectedBucket.items.map(item => (
                <div key={item.id} style={{ background: '#fff', border: '1px solid #eef2f7', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CreditCard size={14} color="#c2410c" style={{ flexShrink: 0 }} />
                    <strong style={{ display: 'block', color: '#071A45', fontSize: '0.84rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.customer || 'Cliente Asaas'}</strong>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <strong style={{ display: 'block', color: '#c2410c', fontSize: '0.88rem', fontWeight: 950 }}>{fmtCurrency(item.netValueCents)}</strong>
                    {item.invoiceUrl && (
                      <a href={item.invoiceUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: '0.66rem', fontWeight: 950, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        VER FATURA <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={onClose} style={{ margin: 20, marginTop: selectedDay !== null ? 0 : 20, border: 'none', background: '#071A45', color: '#fff', borderRadius: 12, padding: 15, fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer', textTransform: 'uppercase' }}>
          Fechar
        </button>
      </div>
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 36, height: 34, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff',
  color: '#475569', display: 'grid', placeItems: 'center', cursor: 'pointer',
};
