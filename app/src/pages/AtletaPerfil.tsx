import { useAuth } from '../context/AuthContext';
import PageContainer from '../components/PageContainer';
import { User, Mail, Phone, Calendar, Heart, ShieldAlert, Thermometer } from 'lucide-react';
import { formatDateBR } from '../utils/dateUtils';

export default function AtletaPerfil() {
  const { atletaData: reg, loading } = useAuth();

  if (loading) return <PageContainer><div style={{ padding: 60, textAlign: 'center' }}>Carregando...</div></PageContainer>;
  if (!reg) return <PageContainer><div style={{ padding: 60, textAlign: 'center', color: '#999' }}>Inscrição não encontrada.</div></PageContainer>;

  const nascimento = reg.dataNascimento ? formatDateBR(reg.dataNascimento) : '---';

  const InfoRow = ({ icon: Icon, label, value }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ color: 'var(--adm-accent)', opacity: 0.8 }}><Icon size={18} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px' }}>{label}</div>
        <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>{value || '---'}</div>
      </div>
    </div>
  );

  return (
    <div style={{ animation: 'fadeInUp 0.4s ease-out' }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
          <User size={20} /> MEU PERFIL
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>Dados cadastrados na sua ficha de inscrição.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* IDENTIFICAÇÃO */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--adm-accent)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={14} /> IDENTIFICAÇÃO
          </h3>
          <InfoRow icon={User} label="Nome Completo" value={reg.nome} />
          <InfoRow icon={Calendar} label="Data de Nascimento" value={nascimento} />
          <InfoRow icon={ShieldAlert} label="CPF" value={reg.cpf} />
          <InfoRow icon={Mail} label="E-mail" value={reg.email} />
          <InfoRow icon={Phone} label="WhatsApp" value={reg.telefone} />
        </div>

        {/* SAÚDE & EMERGÊNCIA */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.05)' }}>
          <h3 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#ff4d4d', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Heart size={14} /> SAÚDE & EMERGÊNCIA
          </h3>
          <InfoRow icon={Thermometer} label="Tipo Sanguíneo" value={reg.saude.tipoSanguineo} />
          <InfoRow icon={ShieldAlert} label="Alergias" value={reg.saude.alergiaDesc || 'Nenhuma'} />
          <InfoRow icon={User} label="Contato de Emergência" value={`${reg.contatoEmergencia.nome} (${reg.contatoEmergencia.parentesco})`} />
          <InfoRow icon={Phone} label="Tel. Emergência" value={reg.contatoEmergencia.telefone} />
        </div>
      </div>
    </div>
  );
}
