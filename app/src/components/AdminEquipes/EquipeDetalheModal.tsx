import { useMemo, useState } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';
import html2canvas from 'html2canvas';
import {
  X, Edit2, Check, Trash2, ShieldCheck, Download, ImageDown, GitMerge,
  ExternalLink, MessageCircle, Wallet, Users, Search,
} from 'lucide-react';
import { useDialog } from '../../context/CustomDialogContext';
import { exportToCSV } from '../../utils/exportUtils';
import type { EquipeGroup, EquipeStats } from './equipesTypes';

const normalizePhone = (phone: string) => {
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean) return '';
  return clean.startsWith('55') ? clean : `55${clean}`;
};

const formatMoneyBR = (valueInCents: number) => (Number(valueInCents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Props = {
  group: EquipeGroup;
  allGroups: EquipeGroup[];
  stats: EquipeStats;
  onClose: () => void;
  onOficializar: () => void;
  onRenomear: (novoNome: string) => void;
  onMesclarEm: (destinoKey: string) => void;
  onExcluirOficial: () => void;
  onOpenFicha: (registrationId: string) => void;
  saving: boolean;
};

export default function EquipeDetalheModal({
  group, allGroups, stats, onClose, onOficializar, onRenomear, onMesclarEm, onExcluirOficial, onOpenFicha, saving,
}: Props) {
  const { showAlert, showConfirm } = useDialog();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.nome);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');
  const [generatingImg, setGeneratingImg] = useState(false);

  const membrosOrdenados = useMemo(() => [...group.membros].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')), [group.membros]);

  const membrosFiltrados = useMemo(() => {
    const term = rosterSearch.trim().toLowerCase();
    if (!term) return membrosOrdenados;
    return membrosOrdenados.filter(m => [m.nome, m.telefone, m.cpf].some(v => String(v || '').toLowerCase().includes(term)));
  }, [membrosOrdenados, rosterSearch]);

  const outrasEquipes = allGroups.filter(g => g.key !== group.key);

  const saveRename = () => {
    const nome = nameDraft.trim();
    if (nome.length < 2) return showAlert('Informe um nome válido.', 'warning');
    onRenomear(nome);
    setEditingName(false);
  };

  const openMemberWhatsApp = (membro: any) => {
    const phone = normalizePhone(membro.telefone);
    if (!phone) return showAlert('Telefone não encontrado.', 'warning');
    window.open(`https://wa.me/${phone}`, '_blank', 'noopener,noreferrer');
  };


  const handleExportCsv = () => {
    if (group.membros.length === 0) return showAlert('Esta equipe ainda não tem inscritos.', 'warning');
    exportToCSV(membrosOrdenados, `equipe_${group.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, [
      { header: 'Nome', key: 'nome' },
      { header: 'CPF', key: 'cpf' },
      { header: 'Telefone', key: 'telefone' },
      { header: 'E-mail', key: 'email' },
      { header: 'Kit', key: 'kit' },
      { header: 'Camiseta', key: 'tamanhoCamiseta' },
      { header: 'Valor (R$)', key: 'amount', transform: v => (Number(v || 0) / 100).toFixed(2) },
    ]);
  };

  const handleGenerateImage = async () => {
    setGeneratingImg(true);
    try {
      const node = document.getElementById('equipe-resumo-hidden-card');
      if (!node) throw new Error('Card de resumo não encontrado.');
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#071A45', useCORS: true, logging: false });
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.href = dataUrl;
      const safeName = group.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      link.download = `equipe-${safeName}-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      showAlert('Imagem de resumo gerada.', 'success');
    } catch (error) {
      console.error('[EquipeDetalhe] gerar imagem', error);
      showAlert('Erro ao gerar a imagem de resumo.', 'error');
    } finally {
      setGeneratingImg(false);
    }
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 1600 }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column', borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,.3)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '22px 26px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditingName(false); }}
                  style={{ flex: 1, height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontWeight: 900, fontSize: '1rem', color: '#071A45', outline: 'none' }}
                />
                <button onClick={saveRename} style={{ background: '#071A45', border: 'none', color: '#fff', borderRadius: 10, padding: '0 14px', fontWeight: 900, cursor: 'pointer' }}><Check size={16} /></button>
                <button onClick={() => { setEditingName(false); setNameDraft(group.nome); }} style={{ background: '#f1f5f9', border: 'none', color: '#64748b', borderRadius: 10, padding: '0 14px', cursor: 'pointer' }}><X size={16} /></button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, color: '#071A45', fontSize: '1.2rem', fontWeight: 950 }}>{group.nome}</h2>
                <button onClick={() => setEditingName(true)} title="Renomear" style={{ background: '#f1f5f9', border: 'none', width: 30, height: 30, borderRadius: 8, color: '#64748b', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                  <Edit2 size={13} />
                </button>
                <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '.68rem', fontWeight: 900, background: group.oficial ? '#eff6ff' : '#f1f5f9', color: group.oficial ? '#2563eb' : '#94a3b8' }}>
                  {group.oficial ? 'CADASTRADA' : 'NÃO CADASTRADA'}
                </span>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 36, height: 36, borderRadius: 10, color: '#64748b', cursor: 'pointer', flexShrink: 0 }}><X size={18} /></button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: '16px 26px', borderBottom: '1px solid #f1f5f9' }}>
          <MiniStat icon={<Users size={15} />} label="Membros confirmados" value={String(stats.total)} tone="#16a34a" />
          <MiniStat icon={<Wallet size={15} />} label="Arrecadado" value={formatMoneyBR(stats.arrecadado)} tone="#16a34a" />
        </div>

        {/* Ações */}
        <div style={{ padding: '14px 26px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!group.oficial && (
            <ActionButton icon={<ShieldCheck size={14} />} label="Cadastrar oficialmente" onClick={onOficializar} disabled={saving} tone="blue" />
          )}
          <ActionButton icon={<ImageDown size={14} />} label={generatingImg ? 'Gerando...' : 'Gerar imagem'} onClick={handleGenerateImage} disabled={generatingImg} tone="green" />
          <ActionButton icon={<Download size={14} />} label="Exportar CSV" onClick={handleExportCsv} disabled={group.membros.length === 0} tone="neutral" />
          {outrasEquipes.length > 0 && (
            <ActionButton icon={<GitMerge size={14} />} label="Mesclar em outra" onClick={() => setShowMerge(v => !v)} tone="neutral" />
          )}
          {group.oficial && (
            <ActionButton icon={<Trash2 size={14} />} label="Remover cadastro" onClick={onExcluirOficial} tone="red" />
          )}
        </div>

        {showMerge && (
          <div style={{ padding: '14px 26px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#64748b', fontWeight: 800, fontSize: '.8rem' }}>Mesclar "{group.nome}" dentro de:</span>
            <select
              value={mergeTarget}
              onChange={e => setMergeTarget(e.target.value)}
              style={{ height: 38, padding: '0 10px', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 800, color: '#071A45', flex: 1, minWidth: 180 }}
            >
              <option value="">Selecione a equipe destino...</option>
              {outrasEquipes.map(g => <option key={g.key} value={g.key}>{g.nome} ({g.membros.length})</option>)}
            </select>
            <button
              onClick={() => {
                if (!mergeTarget) return showAlert('Selecione a equipe destino.', 'warning');
                showConfirm(`Todos os ${group.membros.length} membro(s) de "${group.nome}" passarão a fazer parte da equipe selecionada. Confirmar?`, () => {
                  onMesclarEm(mergeTarget);
                  setShowMerge(false);
                });
              }}
              disabled={saving || !mergeTarget}
              style={{ background: '#071A45', color: '#fff', border: 'none', borderRadius: 10, padding: '0 16px', height: 38, fontWeight: 900, fontSize: '.78rem', cursor: 'pointer' }}
            >
              Confirmar mescla
            </button>
          </div>
        )}

        {/* Roster */}
        <div style={{ padding: '14px 26px 0', flex: 1, overflowY: 'auto' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={rosterSearch}
              onChange={e => setRosterSearch(e.target.value)}
              placeholder="Buscar integrante..."
              style={{ width: '100%', height: 38, padding: '0 12px 0 36px', borderRadius: 10, border: '1px solid #e2e8f0', fontWeight: 700, fontSize: '.85rem', color: '#071A45', outline: 'none' }}
            />
          </div>

          {membrosFiltrados.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>
              {group.membros.length === 0 ? 'Esta equipe ainda não tem inscritos.' : 'Nenhum integrante encontrado.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 18 }}>
              {membrosFiltrados.map(membro => {
                return (
                  <div key={membro.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: 'block', color: '#071A45', fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{membro.nome || 'Sem nome'}</strong>
                      <small style={{ color: '#64748b', fontWeight: 700 }}>{membro.telefone || 'Sem telefone'}{membro.amount ? ` · ${formatMoneyBR(membro.amount)}` : ''}</small>
                    </div>
                    <button onClick={() => openMemberWhatsApp(membro)} title="WhatsApp" style={{ background: '#dcfce7', border: 'none', width: 32, height: 32, borderRadius: 9, color: '#166534', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <MessageCircle size={14} />
                    </button>
                    <button onClick={() => onOpenFicha(membro.id)} title="Abrir ficha" style={{ background: '#eff6ff', border: 'none', width: 32, height: 32, borderRadius: 9, color: '#2563eb', cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <ExternalLink size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Card oculto usado para gerar a imagem de resumo da equipe */}
      <div style={{ position: 'fixed', left: -99999, top: 0, pointerEvents: 'none' }} aria-hidden="true">
        <div id="equipe-resumo-hidden-card" style={{ width: 700, background: 'linear-gradient(160deg, #071A45 0%, #0b2560 100%)', color: '#fff', padding: 40, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, paddingBottom: 20, borderBottom: '2px solid rgba(107,255,42,0.4)' }}>
            <div>
              <div style={{ color: '#6BFF2A', fontWeight: 900, fontSize: '0.8rem', letterSpacing: 1, textTransform: 'uppercase' }}>MCU Night Run 2026</div>
              <div style={{ fontSize: '1.9rem', fontWeight: 900, marginTop: 4 }}>{group.nome}</div>
            </div>
            <div style={{ textAlign: 'right', color: 'rgba(255,255,255,0.6)', fontWeight: 700, fontSize: '0.8rem' }}>
              Gerado em<br />
              <strong style={{ color: '#fff', fontSize: '0.95rem' }}>{new Date().toLocaleDateString('pt-BR')}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#6BFF2A' }}>{stats.total}</div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Confirmados</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900 }}>{formatMoneyBR(stats.arrecadado)}</div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }}>Arrecadado</div>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '18px 20px' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14, color: 'rgba(255,255,255,0.75)' }}>
              Integrantes confirmados (ordem alfabética)
            </div>
            {membrosOrdenados.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: '0.85rem' }}>Nenhum inscrito confirmado ainda.</div>
            ) : (
              <div style={{ columnCount: membrosOrdenados.length > 30 ? 3 : membrosOrdenados.length > 12 ? 2 : 1, columnGap: 22 }}>
                {membrosOrdenados.map((membro, index) => (
                  <div key={membro.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', breakInside: 'avoid' }}>
                    <span style={{ color: '#6BFF2A', fontWeight: 900, fontSize: '0.78rem', minWidth: 24 }}>{String(index + 1).padStart(2, '0')}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.82rem', flex: 1 }}>{String(membro.nome || '').toUpperCase()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MiniStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ color: tone }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: '#071A45', fontSize: '.9rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
        <div style={{ color: '#94a3b8', fontSize: '.6rem', fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, onClick, disabled, tone }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; tone: 'blue' | 'amber' | 'green' | 'neutral' | 'red' }) {
  const palette = {
    blue: { bg: '#eff6ff', color: '#2563eb' },
    amber: { bg: '#fffbeb', color: '#b45309' },
    green: { bg: '#f0fdf4', color: '#16a34a' },
    neutral: { bg: '#f1f5f9', color: '#475569' },
    red: { bg: '#fef2f2', color: '#b91c1c' },
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 10, padding: '9px 14px',
        background: palette.bg, color: palette.color, fontWeight: 900, fontSize: '.74rem', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {icon} {label}
    </button>
  );
}
