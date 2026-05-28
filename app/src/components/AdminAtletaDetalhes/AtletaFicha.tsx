import React from 'react';
import { ClipboardList } from 'lucide-react';

interface AtletaFichaProps {
  reg: any;
}

export const AtletaFicha: React.FC<AtletaFichaProps & { 
  categoriaLabel: string;
  sexoLabel: string;
  kitNome: string;
  tamanhoCamiseta: string;
  pagamentoLabel: string;
  statusLabel: string;
  formattedCreatedAt: string;
  nascimentoFormatado: string;
}> = ({ reg, categoriaLabel, sexoLabel, kitNome, tamanhoCamiseta, pagamentoLabel, statusLabel, formattedCreatedAt, nascimentoFormatado }) => {
  return (
    <div className="atleta-ficha-container">
      <div className="ficha-header">
        <ClipboardList size={20} />
        <h2>FICHA DE INSCRIÇÃO — DADOS DO ATLETA</h2>
      </div>

      <div className="ficha-content compact-ficha">
        <div className="ficha-grid-dense">
          {/* ROW 1: INSCRIÇÃO (4 + 4 + 2 + 2 = 12) */}
          <div className="ficha-field highlight" style={{ gridColumn: 'span 4' }}><label>MODALIDADE</label><div className="field-value">{categoriaLabel} ({sexoLabel})</div></div>
          <div className="ficha-field highlight" style={{ gridColumn: 'span 4' }}><label>KIT / TAMANHO</label><div className="field-value">{kitNome} — {tamanhoCamiseta}</div></div>
          <div className="ficha-field highlight" style={{ gridColumn: 'span 2' }}><label>PAGAMENTO</label><div className="field-value">{pagamentoLabel}</div></div>
          <div className="ficha-field highlight" style={{ gridColumn: 'span 2' }}><label>DATA</label><div className="field-value">{formattedCreatedAt}</div></div>

          {/* ROW 2: IDENTIFICAÇÃO (6 + 3 + 3 = 12) */}
          <div className="ficha-field" style={{ gridColumn: 'span 6' }}><label>NOME COMPLETO</label><div className="field-value">{reg.nome || '---'}</div></div>
          <div className="ficha-field" style={{ gridColumn: 'span 3' }}><label>CPF</label><div className="field-value">{reg.cpf || '---'}</div></div>
          <div className="ficha-field" style={{ gridColumn: 'span 3' }}><label>NASCIMENTO</label><div className="field-value">{nascimentoFormatado || '---'}</div></div>
          
          {/* ROW 3: CONTATO (6 + 3 + 3 = 12) */}
          <div className="ficha-field" style={{ gridColumn: 'span 6' }}><label>E-MAIL</label><div className="field-value">{reg.email || '---'}</div></div>
          <div className="ficha-field" style={{ gridColumn: 'span 3' }}><label>WHATSAPP</label><div className="field-value">{reg.telefone || '---'}</div></div>
          <div className="ficha-field" style={{ gridColumn: 'span 3' }}><label>GÊNERO</label><div className="field-value">{sexoLabel || '---'}</div></div>
          
          {/* ROW 4: LOCAL & SAÚDE (4 + 2 + 6 = 12) */}
          <div className="ficha-field" style={{ gridColumn: 'span 4' }}><label>CIDADE/UF</label><div className="field-value">{reg.endereco.cidade || '---'}/{reg.endereco.uf || '--'}</div></div>
          <div className="ficha-field" style={{ gridColumn: 'span 8' }}><label>ALERGIAS</label><div className="field-value">{reg.saude.alergiaDesc || 'Nenhuma'}</div></div>
          
          {/* ROW 5: SAÚDE 2 & EMERGÊNCIA (4 + 5 + 3 = 12) */}
          <div className="ficha-field" style={{ gridColumn: 'span 4' }}><label>MEDICAMENTOS</label><div className="field-value">{reg.saude.medicamentoDesc || 'Nenhum'}</div></div>
          <div className="ficha-field" style={{ gridColumn: 'span 5' }}><label>CONTATO EMERGÊNCIA</label><div className="field-value">{reg.contatoEmergencia.nome || '---'} ({reg.contatoEmergencia.parentesco || ''})</div></div>
          <div className="ficha-field" style={{ gridColumn: 'span 3' }}><label>TEL. EMERGÊNCIA</label><div className="field-value">{reg.contatoEmergencia.telefone || '---'}</div></div>
        </div>
      </div>
    </div>
  );
};
