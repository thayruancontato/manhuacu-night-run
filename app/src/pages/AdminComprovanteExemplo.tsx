import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { db } from '../firebase';
import { generateComprovanteInscricaoPdf } from '../utils/comprovanteInscricaoUtils';
import { MOCK_ATLETA_REG, MOCK_MODALIDADE, MOCK_CAMISETA_LABEL, MOCK_KIT_NOME } from '../utils/mockAtletaExemplo';

// Página só de referência pro admin: gera o comprovante com dados fictícios seguindo
// exatamente o mesmo gerador (comprovanteInscricaoUtils.ts) usado no acesso real do
// atleta - qualquer ajuste de layout feito lá se reflete aqui automaticamente.
export default function AdminComprovanteExemplo() {
  const navigate = useNavigate();
  const [gerando, setGerando] = useState(false);

  const handleDownload = async () => {
    setGerando(true);
    try {
      const eventoSnap = await getDoc(doc(db, 'nightrun_settings', 'evento'));
      const eventDateRaw = eventoSnap.exists() ? eventoSnap.data().eventDate : '';
      const eventDateFmt = eventDateRaw
        ? new Date(eventDateRaw).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : '';

      await generateComprovanteInscricaoPdf({
        nome: MOCK_ATLETA_REG.nome,
        cpf: MOCK_ATLETA_REG.cpf,
        dataNascimento: MOCK_ATLETA_REG.dataNascimento,
        sexo: MOCK_ATLETA_REG.sexo,
        telefone: MOCK_ATLETA_REG.telefone,
        email: MOCK_ATLETA_REG.email,
        categoria: MOCK_ATLETA_REG.categoria,
        integranteEquipe: MOCK_ATLETA_REG.integranteEquipe,
        equipeNome: MOCK_ATLETA_REG.equipeNome,
        modalidadeNome: MOCK_MODALIDADE.nome,
        modalidadeDistancia: MOCK_MODALIDADE.distancia,
        kitNome: MOCK_KIT_NOME,
        tamanhoCamisetaLabel: MOCK_CAMISETA_LABEL,
        createdAt: MOCK_ATLETA_REG.createdAt,
        amount: MOCK_ATLETA_REG.amount,
        isPago: MOCK_ATLETA_REG.paymentStatus === 'pago',
        paymentStatus: MOCK_ATLETA_REG.paymentStatus,
        numeroInscricao: MOCK_ATLETA_REG.numeroInscricao,
        titularidadeRecebida: MOCK_ATLETA_REG.titularidadeRecebida,
        titularidadeRecebidaDeNome: MOCK_ATLETA_REG.titularidadeRecebidaDeNome,
        endereco: MOCK_ATLETA_REG.endereco,
        fotoUrl: MOCK_ATLETA_REG.fotoUrl,
        eventDateFmt,
        fileName: 'comprovante-inscricao-exemplo.pdf',
      });
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar o comprovante de exemplo.');
    } finally {
      setGerando(false);
    }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#071A45', marginBottom: 6 }}>Comprovante de Inscrição</h1>
      <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 28 }}>
        Baixe um comprovante com dados fictícios ou acesse o perfil de um atleta de exemplo,
        exatamente no mesmo padrão visual usado pelos atletas de verdade.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#eef2ff', color: '#071A45', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <FileText size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#071A45' }}>Comprovante de exemplo (PDF)</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Gera o PDF com o nome, foto e dados fictícios de "{MOCK_ATLETA_REG.nome}", usando o gerador oficial do comprovante.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={gerando}
            style={{
              background: '#071A45', color: '#fff', border: '1px solid rgba(107,255,42,0.5)',
              borderRadius: 12, padding: '12px 20px', fontSize: '0.85rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 8, cursor: gerando ? 'wait' : 'pointer',
              opacity: gerando ? 0.7 : 1, whiteSpace: 'nowrap',
            }}
          >
            <Download size={16} color="#6BFF2A" />
            {gerando ? 'GERANDO...' : 'BAIXAR EXEMPLO'}
          </button>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#eef2ff', color: '#071A45', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ExternalLink size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#071A45' }}>Perfil de atleta de exemplo</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              Veja a tela de acesso do atleta (dashboard) como ela aparece pra um inscrito confirmado, com dados fictícios.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/perfil-exemplo')}
            style={{
              background: '#fff', color: '#071A45', border: '1px solid #071A45',
              borderRadius: 12, padding: '12px 20px', fontSize: '0.85rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <ExternalLink size={16} />
            VER PERFIL DE EXEMPLO
          </button>
        </div>
      </div>
    </div>
  );
}
