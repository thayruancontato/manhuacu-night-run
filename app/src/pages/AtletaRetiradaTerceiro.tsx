import { Download, FileSignature, ListChecks } from 'lucide-react';
import PageContainer from '../components/PageContainer';

const CHECKLIST = [
  'Esta autorização assinada',
  'Cópia do documento do atleta',
  'Documento com foto do terceiro',
  'Comprovante de inscrição',
  'Documentação específica da categoria, quando exigida pelo regulamento',
];

export default function AtletaRetiradaTerceiro() {
  return (
    <PageContainer>
      <div style={{ animation: 'fadeIn .4s ease-out' }}>
        <div style={{
          background: '#fff', borderRadius: 16, padding: '24px 30px', border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'rgba(7,26,69,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <FileSignature size={28} color="#071A45" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>
              Retirada de kit por terceiro
            </h1>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
              Não vai poder retirar seu kit pessoalmente? Autorize outra pessoa a retirar por você.
            </p>
          </div>
        </div>

        <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16, borderBottom: '2px solid #6BFF2A', display: 'inline-block', paddingBottom: 4 }}>
            COMO FUNCIONA
          </h3>
          <ol style={{ margin: 0, paddingLeft: 20, color: '#334155', fontSize: '0.9rem', lineHeight: 1.9 }}>
            <li>Baixe o documento de autorização abaixo.</li>
            <li>Preencha os seus dados e os da pessoa que vai retirar o kit por você.</li>
            <li>Assine o documento (a assinatura precisa ser do(a) atleta ou responsável legal).</li>
            <li>Entregue o documento assinado, impresso, para a pessoa autorizada.</li>
          </ol>
        </section>

        <section style={{
          background: 'linear-gradient(135deg, #071A45 0%, #0d2a66 100%)',
          borderRadius: 16, padding: '24px 26px', marginBottom: 24,
          border: '1px solid rgba(107,255,42,0.5)', boxShadow: '0 8px 24px rgba(7,26,69,0.24)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Documento oficial
            </div>
            <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 800 }}>
              Autorização para retirada de kit por terceiro
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', marginTop: 2 }}>
              PDF · MCU Night Run 2026
            </div>
          </div>
          <a
            href="/autorizacao-retirada-kit-terceiro.pdf"
            download="autorizacao-retirada-kit-terceiro-mcu-night-run-2026.pdf"
            style={{
              background: '#6BFF2A', color: '#071A45', border: 'none', borderRadius: 40,
              padding: '14px 26px', fontSize: '0.85rem', fontWeight: 900,
              display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.5px',
              boxShadow: '0 4px 14px rgba(107,255,42,0.3)', whiteSpace: 'nowrap',
            }}
          >
            <Download size={18} />
            Baixar autorização
          </a>
        </section>

        <section style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
          <h3 style={{
            fontSize: '0.85rem', fontWeight: 900, color: '#071A45', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <ListChecks size={16} color="#6BFF2A" />
            DOCUMENTOS A APRESENTAR NO ATO DA RETIRADA
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CHECKLIST.map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5, border: '2px solid #cbd5e1',
                  flexShrink: 0, marginTop: 2,
                }} />
                <span style={{ fontSize: '0.88rem', color: '#334155' }}>{item}</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 18, fontSize: '0.78rem', color: '#94a3b8' }}>
            Base regulamentar: item 7.3 do Regulamento Oficial da MCU Night Run 2026.
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
