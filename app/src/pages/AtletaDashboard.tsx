import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CheckCircle, Clock, CreditCard, Package } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import { useAuth } from '../context/AuthContext';
import { KITS } from '../types';
import { formatDateBR, formatDateTimeBR } from '../utils/dateUtils';
import { formatCamisetaLabel } from '../utils/camisetaUtils';

export default function AtletaDashboard() {
  const { atletaData: reg, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [camisetaLabel, setCamisetaLabel] = useState('');

  useEffect(() => {
    const loadCamisetaLabel = async () => {
      if (!reg?.tamanhoCamiseta) {
        setCamisetaLabel('');
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'nightrun_camisetas', reg.tamanhoCamiseta));
        if (snap.exists()) {
          setCamisetaLabel(formatCamisetaLabel(reg.tamanhoCamiseta, { id: snap.id, ...snap.data() }));
          return;
        }
      } catch (error) {
        console.error('Erro ao carregar tamanho da camiseta:', error);
      }

      setCamisetaLabel(formatCamisetaLabel(reg.tamanhoCamiseta));
    };

    loadCamisetaLabel();
  }, [reg?.tamanhoCamiseta]);

  if (authLoading || loading) return <PageContainer><div style={{ padding: 60, textAlign: 'center' }}>Carregando...</div></PageContainer>;
  if (!reg) return <PageContainer><div style={{ padding: 60, textAlign: 'center', color: '#999' }}>Inscrição não encontrada.</div></PageContainer>;

  const kit = KITS.find(k => k.id === reg.kit);
  const isPago = reg.paymentStatus === 'pago';

  const formatDate = (val: any, onlyDate = false) => onlyDate ? formatDateBR(val) : formatDateTimeBR(val);

  const InfoRow = ({ label, value, bold }: any) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', color: '#071A45', fontWeight: bold ? 800 : 600 }}>{value || '---'}</span>
    </div>
  );

  const initials = reg.nome ? reg.nome.split(' ').map((n: any) => n[0]).join('').substring(0, 2).toUpperCase() : '';

  return (
    <div style={{ animation: 'fadeIn .4s ease-out' }}>
      {/* Hero Header */}
      <div style={{ background: '#fff', borderRadius: 16, padding: '24px 30px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 24 }}>
        {/* Foto Quadrada sem contorno */}
        <div style={{ width: 100, height: 100, background: '#f1f5f9', flexShrink: 0, overflow: 'hidden' }}>
          {reg.fotoUrl ? (
            <img src={reg.fotoUrl} alt={reg.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', fontWeight: 900, color: '#94a3b8' }}>
              {initials}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Olá, {reg.nome.split(' ')[0]}!</h1>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Acompanhe sua inscrição no evento</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ background: '#f1f5f9', color: '#475569', padding: '6px 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 800 }}>{reg.categoria.toUpperCase()}</div>
            <div style={{ 
              background: isPago ? '#dcfce7' : '#fef9c3', 
              color: isPago ? '#166534' : '#854d0e', 
              padding: '6px 16px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 800 
            }}>
              {isPago ? 'PAGAMENTO CONFIRMADO' : 'AGUARDANDO PAGAMENTO'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: 24, justifyContent: 'center' }}>
        {/* Lado Esquerdo: Identificação & Kit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              DADOS DO ATLETA
            </h3>
            <InfoRow label="Nome Completo" value={reg.nome} bold />
            <InfoRow label="Data de Nascimento" value={formatDate(reg.dataNascimento, true)} />
            <InfoRow label="CPF" value={reg.cpf} />
            <InfoRow label="E-mail" value={reg.email} />
            <InfoRow label="WhatsApp" value={reg.telefone} />
            <InfoRow label="Gênero" value={reg.sexo === 'M' ? 'Masculino' : 'Feminino'} />
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              KIT & CAMISETA
            </h3>
            <InfoRow label="Kit Selecionado" value={kit?.nome || reg.kit} bold />
            <InfoRow label="Tamanho Camiseta" value={camisetaLabel || reg.tamanhoCamiseta} />
          </section>
        </div>

        {/* Lado Direito: Saúde & Local */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#ef4444', marginBottom: 16, borderBottom: '2px solid #ef4444', display: 'inline-block', paddingBottom: 4 }}>
              SAÚDE & EMERGÊNCIA
            </h3>
            <InfoRow label="Alergias" value={reg.saude.alergiaDesc || 'Nenhuma'} />
            <InfoRow label="Medicamentos" value={reg.saude.medicamentoDesc || 'Nenhum'} />
            <InfoRow label="Contato Emergência" value={reg.contatoEmergencia.nome} />
            <InfoRow label="Tel. Emergência" value={reg.contatoEmergencia.telefone} />
          </section>

        </div>
      </div>

      {!isPago && reg.invoiceUrl && (
        <div style={{ marginTop: 24, background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 16, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontWeight: 800, color: '#92400e', marginBottom: 4 }}>Pagamento Pendente</div>
            <p style={{ fontSize: '0.85rem', color: '#b45309' }}>Sua inscrição será confirmada após o pagamento.</p>
          </div>
          <a href={reg.invoiceUrl} target="_blank" style={{ background: '#071A45', color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 800, textDecoration: 'none', fontSize: '0.85rem' }}>
            PAGAR AGORA
          </a>
        </div>
      )}
    </div>
  );
}
