import { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { CreditCard, ExternalLink, Flag, Link2, MapPin, Package, Trophy, Users } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import { useAuth } from '../context/AuthContext';
import { fetchKits, resolveKitNome, type KitRecord } from '../utils/kitsUtils';
import { formatDateBR, formatDateTimeBR } from '../utils/dateUtils';
import { formatCamisetaLabel } from '../utils/camisetaUtils';
import { buildSorteioPublicUrl, readGanhadores } from '../utils/sorteioUtils';
import { normalizePhoneDigits } from '../utils/titularidadeUtils';

const formatMoneyBR = (valueInCents: number) => (Number(valueInCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function AtletaDashboard() {
  const { atletaData: reg, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [camisetaLabel, setCamisetaLabel] = useState('');
  const [sorteiosGanhos, setSorteiosGanhos] = useState<any[]>([]);
  const [modalidade, setModalidade] = useState<any | null>(null);
  const [vinculados, setVinculados] = useState<any[]>([]);
  const [kitsCadastrados, setKitsCadastrados] = useState<KitRecord[]>([]);

  useEffect(() => {
    fetchKits().then(setKitsCadastrados).catch(e => console.error('Erro ao carregar kits', e));
  }, []);

  // Sorteios em que este atleta foi sorteado. Ao acessar, registra que ele viu que ganhou.
  useEffect(() => {
    const loadSorteiosGanhos = async () => {
      if (!reg?.id) return;
      try {
        const snap = await getDocs(query(collection(db, 'nightrun_sorteios'), where('ganhadorIds', 'array-contains', reg.id)));
        const items = snap.docs.map(item => ({ id: item.id, ...item.data() } as any));
        setSorteiosGanhos(items);

        await Promise.all(items.map(item => {
          const ganhadores = readGanhadores(item);
          const eu = ganhadores.find(g => g.registrationId === reg.id);
          if (!eu || eu.visualizouEm) return null;
          const atualizados = ganhadores.map(g => g.registrationId === reg.id ? { ...g, visualizouEm: new Date() } : g);
          return updateDoc(doc(db, 'nightrun_sorteios', item.id), { ganhadores: atualizados, updatedAt: new Date() })
            .catch(error => console.error('Erro ao registrar visualização do sorteio:', error));
        }).filter(Boolean));
      } catch (error) {
        console.error('Erro ao carregar sorteios do atleta:', error);
      }
    };

    loadSorteiosGanhos();
  }, [reg?.id]);

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

  useEffect(() => {
    const loadModalidade = async () => {
      if (!reg?.modalidadeId) return setModalidade(null);
      try {
        const snap = await getDoc(doc(db, 'nightrun_modalidades', reg.modalidadeId));
        setModalidade(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      } catch (error) {
        console.error('Erro ao carregar modalidade:', error);
        setModalidade(null);
      }
    };

    loadModalidade();
  }, [reg?.modalidadeId]);

  // Inscrições com ligação a este atleta: mesmo e-mail, ou telefone que aparece
  // como contato de emergência de um lado ou de outro.
  useEffect(() => {
    const loadVinculados = async () => {
      if (!reg?.id) return setVinculados([]);
      try {
        const snap = await getDocs(collection(db, 'nightrun_registrations'));
        const meuEmail = String(reg.email || '').trim().toLowerCase();
        const meuTelefone = normalizePhoneDigits(reg.telefone);
        const meuContatoTelefone = normalizePhoneDigits(reg.contatoEmergencia?.telefone);

        const encontrados = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(other => {
            if (other.id === reg.id) return false;
            const outroEmail = String(other.email || '').trim().toLowerCase();
            const outroTelefone = normalizePhoneDigits(other.telefone);
            const outroContatoTelefone = normalizePhoneDigits(other.contatoEmergencia?.telefone);

            const mesmoEmail = !!meuEmail && meuEmail === outroEmail;
            const souContatoDele = !!meuTelefone && meuTelefone === outroContatoTelefone;
            const eleEhMeuContato = !!meuContatoTelefone && meuContatoTelefone === outroTelefone;

            return mesmoEmail || souContatoDele || eleEhMeuContato;
          })
          .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

        setVinculados(encontrados);
      } catch (error) {
        console.error('Erro ao carregar atletas vinculados:', error);
        setVinculados([]);
      }
    };

    loadVinculados();
  }, [reg?.id, reg?.email, reg?.telefone, reg?.contatoEmergencia?.telefone]);

  if (authLoading || loading) return <PageContainer><div style={{ padding: 60, textAlign: 'center' }}>Carregando...</div></PageContainer>;
  if (!reg) return <PageContainer><div style={{ padding: 60, textAlign: 'center', color: '#999' }}>Inscrição não encontrada.</div></PageContainer>;

  const kitNomeAtual = resolveKitNome(kitsCadastrados, reg.kit, reg.kitNome);
  const isPago = reg.paymentStatus === 'pago';

  const formatDate = (val: any, onlyDate = false) => onlyDate ? formatDateBR(val) : formatDateTimeBR(val);

  const InfoRow = ({ label, value, bold }: any) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', color: '#071A45', fontWeight: bold ? 800 : 600 }}>{value || '---'}</span>
    </div>
  );

  const initials = reg.nome ? reg.nome.split(' ').map((n: any) => n[0]).join('').substring(0, 2).toUpperCase() : '';

  // Troca para o perfil vinculado clicado: reinscrição do ID selecionado + recarga completa
  // (o contexto de autenticação lê a inscrição ativa do localStorage no carregamento).
  const acessarVinculado = (regId: string) => {
    if (!regId || regId === reg.id) return;
    localStorage.setItem('nightrun_atleta_reg_id', regId);
    window.location.reload();
  };

  return (
    <div style={{ animation: 'fadeIn .4s ease-out' }}>
      {/* Sorteios ganhos por este atleta */}
      {sorteiosGanhos.map(sorteio => (
        <div
          key={sorteio.id}
          style={{
            background: 'linear-gradient(135deg, #071A45 0%, #0d2a66 100%)',
            borderRadius: 16, padding: '22px 26px', marginBottom: 24,
            border: '1px solid rgba(107,255,42,0.5)', boxShadow: '0 8px 24px rgba(7,26,69,0.24)',
            display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
          }}
        >
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(107,255,42,0.15)', color: '#6BFF2A', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Trophy size={32} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ color: '#6BFF2A', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Você ganhou!
            </div>
            <h2 style={{ margin: '4px 0 4px', color: '#fff', fontSize: '1.25rem', fontWeight: 900 }}>
              {sorteio.premioNome || 'Prêmio surpresa'}
            </h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
              {sorteio.titulo || 'Sorteio MCU Night Run'}
              {sorteio.sorteadoEm ? ` · ${formatDateTimeBR(sorteio.sorteadoEm.toDate?.() || sorteio.sorteadoEm)}` : ''}
            </p>
          </div>
          {sorteio.premioImagem && (
            <img src={sorteio.premioImagem} alt={sorteio.premioNome} style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover' }} />
          )}
          <a
            href={buildSorteioPublicUrl(sorteio.id)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#6BFF2A', color: '#071A45', padding: '12px 20px', borderRadius: 12, fontWeight: 900, fontSize: '0.8rem', textDecoration: 'none' }}
          >
            <ExternalLink size={16} /> Ver sorteio
          </a>
        </div>
      ))}

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
            <InfoRow label="WhatsApp Secundário" value={reg.telefoneSecundario} />
            <InfoRow label="Gênero" value={reg.sexo === 'M' ? 'Masculino' : 'Feminino'} />
            {reg.responsavelNome && <InfoRow label="Responsável" value={reg.responsavelNome} />}
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              <MapPin size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              ENDEREÇO
            </h3>
            <InfoRow label="Cidade / UF" value={reg.endereco?.cidade ? `${reg.endereco.cidade} / ${reg.endereco.uf || ''}` : ''} />
            <InfoRow label="Bairro" value={reg.endereco?.bairro} />
            <InfoRow label="Rua" value={reg.endereco?.rua ? `${reg.endereco.rua}${reg.endereco.numero ? `, ${reg.endereco.numero}` : ''}` : ''} />
            <InfoRow label="CEP" value={reg.endereco?.cep} />
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              <Package size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              KIT & CAMISETA
            </h3>
            <InfoRow label="Kit Selecionado" value={kitNomeAtual} bold />
            <InfoRow label="Tamanho Camiseta" value={camisetaLabel || reg.tamanhoCamiseta} />
          </section>
        </div>

        {/* Lado Direito: Prova, Pagamento & Saúde */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              <Flag size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              PROVA & EQUIPE
            </h3>
            <InfoRow label="Modalidade" value={modalidade?.nome || '---'} bold />
            <InfoRow label="Distância" value={modalidade?.distancia} />
            <InfoRow label="Categoria" value={reg.categoria === 'infantil' ? 'Infantil' : 'Adulto / adolescente'} />
            <InfoRow label="Faz parte de equipe" value={reg.integranteEquipe === 'sim' ? (reg.equipeNome || 'Sim') : 'Não'} />
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
              <CreditCard size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
              PAGAMENTO
            </h3>
            <InfoRow label="Valor da Inscrição" value={formatMoneyBR(reg.amount)} bold />
            <InfoRow label="Status" value={isPago ? 'Confirmado' : (reg.paymentStatus === 'vencido' ? 'Vencido' : 'Aguardando pagamento')} />
            <InfoRow label="Data da Inscrição" value={formatDate(reg.createdAt, true)} />
          </section>

          <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#ef4444', marginBottom: 16, borderBottom: '2px solid #ef4444', display: 'inline-block', paddingBottom: 4 }}>
              SAÚDE & EMERGÊNCIA
            </h3>
            <InfoRow label="Tipo Sanguíneo" value={reg.saude?.tipoSanguineo} />
            <InfoRow label="Condição de Saúde" value={reg.saude?.condicaoSaude || 'Nenhuma'} />
            <InfoRow label="Alergias" value={reg.saude?.alergiaDesc || 'Nenhuma'} />
            <InfoRow label="Medicamentos" value={reg.saude?.medicamentoDesc || 'Nenhum'} />
            <InfoRow label="Contato Emergência" value={reg.contatoEmergencia?.nome} />
            <InfoRow label="Parentesco" value={reg.contatoEmergencia?.parentesco} />
            <InfoRow label="Tel. Emergência" value={reg.contatoEmergencia?.telefone} />
          </section>
        </div>
      </div>

      {vinculados.length > 0 && (
        <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', marginTop: 24 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link2 size={16} color="#6BFF2A" />
            ATLETAS COM LIGAÇÃO A VOCÊ
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: 18 }}>
            Inscrições com o mesmo e-mail ou vinculadas pelo contato de emergência. Clique para acessar.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {vinculados.map(v => {
              const vInitials = v.nome ? String(v.nome).split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase() : '';
              const vPago = v.paymentStatus === 'pago';
              return (
                <div
                  key={v.id}
                  onClick={() => acessarVinculado(v.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') acessarVinculado(v.id); }}
                  style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', transition: 'border-color .15s, box-shadow .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#6BFF2A'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(7,26,69,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                    {v.fotoUrl ? (
                      <img src={v.fotoUrl} alt={v.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontWeight: 900, color: '#94a3b8', fontSize: '0.9rem' }}>{vInitials}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: '#071A45', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nome}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{
                        background: vPago ? '#dcfce7' : '#fef9c3', color: vPago ? '#166534' : '#854d0e',
                        padding: '2px 8px', borderRadius: 6, fontSize: '0.65rem', fontWeight: 800,
                      }}>
                        {vPago ? 'CONFIRMADO' : 'PENDENTE'}
                      </span>
                      {v.integranteEquipe === 'sim' && v.equipeNome && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#64748b', fontSize: '0.65rem', fontWeight: 700 }}>
                          <Users size={11} /> {v.equipeNome}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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
