import { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { CalendarDays, CheckCircle, Database, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';
import { useLoading } from '../components/LoadingService';

export default function AdminSettings() {
  const { showAlert, showConfirm } = useDialog();
  const { showLoading, hideLoading } = useLoading();
  const [success, setSuccess] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [savingEventDate, setSavingEventDate] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const eventSnap = await getDoc(doc(db, 'nightrun_settings', 'evento'));
        if (eventSnap.exists()) setEventDate(eventSnap.data().eventDate || '');
      } catch (e) {
        console.error('Erro ao carregar configurações', e);
      }
    })();
  }, []);

  const handleSaveEventDate = async () => {
    if (!eventDate) {
      showAlert('Informe a data e o horário do evento.', 'warning');
      return;
    }

    try {
      setSavingEventDate(true);
      await setDoc(doc(db, 'nightrun_settings', 'evento'), { eventDate }, { merge: true });
      showAlert('Data do evento salva com sucesso.', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar a data do evento.', 'error');
    } finally {
      setSavingEventDate(false);
    }
  };

  const handleDeleteAll = () => {
    showConfirm(
      'EXCLUIR TODAS AS INSCRIÇÕES Esta ação é IRREVERSÍVEL. Todos os dados de atletas, pagamentos e kits serão apagados permanentemente.',
      async () => {
        try {
          showLoading(0, 'Excluindo inscrições...');
          const snap = await getDocs(collection(db, 'nightrun_registrations'));

          if (snap.empty) {
            showAlert('Não há inscrições para excluir.', 'info');
            hideLoading();
            return;
          }

          const chunks = [];
          const docs = snap.docs;
          for (let i = 0; i < docs.length; i += 500) {
            chunks.push(docs.slice(i, i + 500));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(item => batch.delete(item.ref));
            await batch.commit();
          }

          setSuccess(true);
          showAlert(`${snap.size} inscrições foram excluídas com sucesso.`, 'success');
        } catch (e) {
          console.error(e);
          showAlert('Erro ao excluir inscrições.', 'error');
        } finally {
          hideLoading();
        }
      }
    );
  };

  return (
    <div className="page-container">
      <div className="adm-page-title settings-page-title">
        <h1>Configurações do Sistema</h1>
        <p>Gerencie preferências gerais e operações sensíveis do painel.</p>
      </div>

      <div className="settings-stack">
        <div className="adm-card">
          <div className="adm-card-header">
            <h3><CalendarDays size={18} /> Data do Evento</h3>
          </div>
          <div className="adm-card-body">
            <div className="settings-row">
              <label className="settings-field">
                <span>Data e horário da corrida</span>
                <input type="datetime-local" value={eventDate} onChange={e => setEventDate(e.target.value)} />
              </label>
              <button className="settings-save-btn" onClick={handleSaveEventDate} disabled={savingEventDate}>
                <Save size={18} />
                {savingEventDate ? 'Salvando...' : 'Salvar data'}
              </button>
            </div>
          </div>
        </div>

        <div className="adm-card danger-zone">
          <div className="adm-card-header">
            <h3><ShieldAlert size={18} /> Manutenção</h3>
          </div>
          <div className="adm-card-body">
            <div className="danger-item">
              <div className="danger-info">
                <h4>Excluir todas as inscrições</h4>
                <p>Remove definitivamente todos os registros de atletas, pagamentos e kits cadastrados.</p>
              </div>
              <button onClick={handleDeleteAll} className="btn-danger-outline">
                <Trash2 size={18} />
                Excluir tudo
              </button>
            </div>
          </div>
        </div>

        {success && (
          <div className="adm-card">
            <div className="adm-card-header">
              <h3><Database size={18} /> Banco atualizado</h3>
            </div>
            <div className="adm-card-body">
              <div className="success-alert">
                <CheckCircle size={18} />
                Operação concluída.
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .settings-page-title {
          margin-bottom: 22px;
        }
        .settings-stack {
          display: grid;
          gap: 16px;
        }
        .settings-row {
          display: flex;
          gap: 14px;
          align-items: end;
          flex-wrap: wrap;
        }
        .settings-field {
          flex: 1;
          min-width: 260px;
          display: grid;
          gap: 8px;
        }
        .settings-field span {
          color: var(--adm-text-muted);
          font-size: .76rem;
          font-weight: 900;
          text-transform: uppercase;
        }
        .settings-field input {
          width: 100%;
          height: 48px;
          border-radius: var(--adm-radius-sm);
          border: 1px solid var(--adm-border);
          background: var(--adm-bg);
          color: var(--adm-text);
          padding: 0 14px;
          font-size: .96rem;
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
        .danger-zone {
          border-color: rgba(239,68,68,.24);
        }
        .danger-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px;
          background: rgba(239,68,68,.05);
          border: 1px solid rgba(239,68,68,.14);
          border-radius: var(--adm-radius-sm);
          gap: 20px;
        }
        .danger-info h4 {
          color: var(--adm-danger);
          margin: 0 0 5px;
          font-size: .98rem;
        }
        .danger-info p {
          color: var(--adm-text-muted);
          margin: 0;
          font-size: .84rem;
        }
        .btn-danger-outline {
          background: transparent;
          border: 1px solid var(--adm-danger);
          color: var(--adm-danger);
          padding: 11px 16px;
          border-radius: var(--adm-radius-sm);
          font-weight: 900;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          cursor: pointer;
          white-space: nowrap;
        }
        .btn-danger-outline:hover {
          background: var(--adm-danger);
          color: #fff;
        }
        .success-alert {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--adm-success);
          background: rgba(34,197,94,.1);
          padding: 12px;
          border-radius: var(--adm-radius-sm);
          font-size: .88rem;
          font-weight: 700;
        }
        @media (max-width: 900px) {
          .settings-save-btn {
            width: 100%;
          }
          .danger-item {
            flex-direction: column;
            align-items: stretch;
          }
          .btn-danger-outline {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
