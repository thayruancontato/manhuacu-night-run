import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { CreditCard, QrCode, Save, Settings } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';

export default function AdminFinanceiroDefinicoes() {
  const { showAlert } = useDialog();
  const [pix, setPix] = useState(true);
  const [cartao, setCartao] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'nightrun_settings', 'payment_methods'));
        if (snap.exists()) {
          const data = snap.data();
          setPix(data.pix !== false);
          setCartao(data.cartao !== false);
        }
      } catch (e) {
        console.error('Erro ao carregar métodos de pagamento', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!pix && !cartao) {
      showAlert('Pelo menos um método de pagamento precisa ficar ativo.', 'warning');
      return;
    }
    try {
      setSaving(true);
      await setDoc(doc(db, 'nightrun_settings', 'payment_methods'), {
        pix,
        cartao,
        updatedAt: new Date(),
      }, { merge: true });
      showAlert('Métodos de pagamento atualizados.', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar os métodos de pagamento.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="page-container">
      <div className="adm-page-title settings-page-title">
        <h1>Definições</h1>
        <p>Escolha quais formas de pagamento ficam disponíveis para o atleta no fechamento da inscrição.</p>
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h3><Settings size={18} /> Métodos de pagamento aceitos</h3>
        </div>
        <div className="adm-card-body">
          <div className="maintenance-switch-card">
            <div>
              <strong><QrCode size={16} style={{ marginRight: 6, verticalAlign: -3 }} />Pix</strong>
              <p>Quando desativado, o Pix deixa de aparecer como opção na tela de pagamento.</p>
            </div>
            <button
              type="button"
              className={`settings-switch ${pix ? 'on' : ''}`}
              onClick={() => setPix(value => !value)}
              aria-pressed={pix}
            >
              <span />
              <strong>{pix ? 'Ativo' : 'Inativo'}</strong>
            </button>
          </div>

          <div className="maintenance-switch-card" style={{ marginTop: 14 }}>
            <div>
              <strong><CreditCard size={16} style={{ marginRight: 6, verticalAlign: -3 }} />Cartão de crédito</strong>
              <p>Quando desativado, o botão "Cartão" some da tela de pagamento e novas cobranças por cartão são bloqueadas.</p>
            </div>
            <button
              type="button"
              className={`settings-switch ${cartao ? 'on' : ''}`}
              onClick={() => setCartao(value => !value)}
              aria-pressed={cartao}
            >
              <span />
              <strong>{cartao ? 'Ativo' : 'Inativo'}</strong>
            </button>
          </div>

          <div className="settings-footer-actions">
            <button className="settings-save-btn" onClick={handleSave} disabled={saving}>
              <Save size={18} />
              {saving ? 'Salvando...' : 'Salvar definições'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .settings-page-title {
          margin-bottom: 22px;
        }
        .maintenance-switch-card {
          border: 1px solid var(--adm-border);
          background: var(--adm-bg);
          border-radius: var(--adm-radius);
          padding: 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }
        .maintenance-switch-card strong {
          color: var(--adm-text);
          font-size: .98rem;
          display: flex;
          align-items: center;
        }
        .maintenance-switch-card p {
          margin: 6px 0 0;
          color: var(--adm-text-muted);
          font-size: .84rem;
          line-height: 1.45;
          max-width: 620px;
        }
        .settings-switch {
          width: 142px;
          height: 44px;
          border: 1px solid var(--adm-border);
          border-radius: 999px;
          background: var(--adm-surface-3);
          color: var(--adm-text-muted);
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 4px 12px 4px 5px;
          cursor: pointer;
          font-size: .76rem;
          font-weight: 900;
          text-transform: uppercase;
        }
        .settings-switch span {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: var(--adm-text-muted);
          transition: .2s ease;
        }
        .settings-switch.on {
          background: rgba(107,255,42,.13);
          border-color: var(--adm-accent);
          color: var(--adm-accent);
        }
        .settings-switch.on span {
          background: var(--adm-accent);
          transform: translateX(86px);
        }
        .settings-switch.on strong {
          transform: translateX(-34px);
        }
        .settings-switch strong {
          color: inherit;
          transition: .2s ease;
        }
        .settings-footer-actions {
          margin-top: 18px;
          display: flex;
          justify-content: flex-end;
        }
        .settings-save-btn {
          height: 48px;
          padding: 0 18px;
          border: none;
          border-radius: var(--adm-radius-sm);
          background: var(--adm-accent);
          color: #071A45;
          font-weight: 900;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          white-space: nowrap;
        }
        .settings-save-btn:disabled {
          opacity: .65;
          cursor: wait;
        }
        @media (max-width: 900px) {
          .maintenance-switch-card {
            flex-direction: column;
            align-items: stretch;
          }
          .settings-footer-actions {
            justify-content: stretch;
          }
          .settings-save-btn {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
