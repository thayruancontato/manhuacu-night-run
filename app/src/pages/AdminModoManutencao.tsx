import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Power, Save } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';

export default function AdminModoManutencao() {
  const { showAlert } = useDialog();
  const [registrationsClosed, setRegistrationsClosed] = useState(true);
  const [savingMaintenanceMode, setSavingMaintenanceMode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const maintenanceSnap = await getDoc(doc(db, 'nightrun_settings', 'site_maintenance'));
        if (maintenanceSnap.exists()) {
          setRegistrationsClosed(maintenanceSnap.data().registrationsClosed !== false);
        }
      } catch (e) {
        console.error('Erro ao carregar modo manutenção', e);
      }
    })();
  }, []);

  const handleSaveMaintenanceMode = async () => {
    try {
      setSavingMaintenanceMode(true);
      await setDoc(doc(db, 'nightrun_settings', 'site_maintenance'), {
        registrationsClosed,
        updatedAt: new Date(),
      }, { merge: true });
      
      // Limpa o bypass de teste da sessao para permitir que o admin visualize a tela bloqueada
      sessionStorage.removeItem('nightrun:bypass-closed-screen');

      showAlert(registrationsClosed ? 'Tela de inscrições indisponíveis ativada.' : 'Inscrições liberadas no site.', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar o modo manutenção.', 'error');
    } finally {
      setSavingMaintenanceMode(false);
    }
  };

  return (
    <div className="page-container">
      <div className="adm-page-title settings-page-title">
        <h1>Modo manutenção</h1>
        <p>Ative ou desative a tela de inscrições ainda não disponíveis.</p>
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h3><Power size={18} /> Controle do site</h3>
        </div>
        <div className="adm-card-body">
          <div className="maintenance-switch-card">
            <div>
              <strong>Fechar inscrições públicas</strong>
              <p>Quando ativo, a página inicial mostra apenas o aviso de abertura em breve. Use Ctrl + Z no site para liberar a visualização temporária nesta sessão.</p>
            </div>
            <button
              type="button"
              className={`settings-switch ${registrationsClosed ? 'on' : ''}`}
              onClick={() => setRegistrationsClosed(value => !value)}
              aria-pressed={registrationsClosed}
            >
              <span />
              <strong>{registrationsClosed ? 'Ativo' : 'Inativo'}</strong>
            </button>
          </div>
          <div className="settings-footer-actions">
            <button className="settings-save-btn" onClick={handleSaveMaintenanceMode} disabled={savingMaintenanceMode}>
              <Save size={18} />
              {savingMaintenanceMode ? 'Salvando...' : 'Salvar modo'}
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
