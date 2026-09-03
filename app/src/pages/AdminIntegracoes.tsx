import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Building2, RefreshCw, Save, Webhook } from 'lucide-react';
import { db } from '../firebase';
import { useDialog } from '../context/CustomDialogContext';

type IntegrationTab = 'bancos' | 'webhook';
type PaymentProvider = 'asaas' | 'cora';

const PROVIDER_LOGOS: Record<PaymentProvider, string> = {
  asaas: '/asaas-logo.svg',
  cora: '/cora-logo.svg',
};

export default function AdminIntegracoes() {
  const { showAlert } = useDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeIntegrationTab: IntegrationTab = searchParams.get('tab') === 'webhook' ? 'webhook' : 'bancos';
  const setActiveIntegrationTab = (tab: IntegrationTab) => {
    setSearchParams(tab === 'bancos' ? {} : { tab }, { replace: false });
  };
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('asaas');
  const [savingPaymentProvider, setSavingPaymentProvider] = useState(false);
  const [webhookTestProvider, setWebhookTestProvider] = useState<PaymentProvider>('asaas');
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const paymentSnap = await getDoc(doc(db, 'nightrun_settings', 'payment_integration'));
        if (paymentSnap.exists()) {
          const provider = paymentSnap.data().provider;
          setPaymentProvider(provider === 'cora' ? 'cora' : 'asaas');
        }
      } catch (e) {
        console.error('Erro ao carregar integração de pagamento', e);
      }
    })();
  }, []);

  const handleSavePaymentProvider = async () => {
    try {
      setSavingPaymentProvider(true);
      await setDoc(doc(db, 'nightrun_settings', 'payment_integration'), {
        provider: paymentProvider,
        updatedAt: new Date(),
      }, { merge: true });
      showAlert('Integração de pagamento salva com sucesso.', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar a integração de pagamento.', 'error');
    } finally {
      setSavingPaymentProvider(false);
    }
  };

  const handleTestWebhook = async () => {
    try {
      setTestingWebhook(true);
      setWebhookTestResult(null);
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      const res = await fetch(`${workerUrl}/webhooks/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: webhookTestProvider }),
      });
      const result = await res.json().catch(() => ({}));
      setWebhookTestResult(result);
      showAlert(result.success ? 'Webhook testado com sucesso.' : 'Webhook precisa de atenção.', result.success ? 'success' : 'warning');
    } catch (error) {
      console.error(error);
      setWebhookTestResult({ success: false, checks: [{ label: 'Teste do webhook', ok: false, detail: 'Não foi possível chamar o Worker.' }] });
      showAlert('Erro ao testar o webhook.', 'error');
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div className="page-container">
      <div className="adm-page-title settings-page-title">
        <h1>Integrações</h1>
        <p>Escolha o banco usado nos pagamentos e valide os webhooks configurados.</p>
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h3><Building2 size={18} /> Integrações de pagamento</h3>
        </div>
        <div className="adm-card-body">
          <div className="settings-inner-tabs">
            <button type="button" className={activeIntegrationTab === 'bancos' ? 'active' : ''} onClick={() => setActiveIntegrationTab('bancos')}>
              <Building2 size={16} />
              Bancos
            </button>
            <button type="button" className={activeIntegrationTab === 'webhook' ? 'active' : ''} onClick={() => setActiveIntegrationTab('webhook')}>
              <Webhook size={16} />
              Webhook
            </button>
          </div>

          {activeIntegrationTab === 'bancos' && (
            <>
              <div className="payment-provider-options settings-provider-options">
                <button type="button" className={`payment-provider-option ${paymentProvider === 'asaas' ? 'selected' : ''}`} onClick={() => setPaymentProvider('asaas')}>
                  <strong><img src={PROVIDER_LOGOS.asaas} alt="Asaas" /> Asaas</strong>
                  <span>Usa a integração já configurada. Taxa Pix: R$ 2,00.</span>
                </button>
                <button type="button" className={`payment-provider-option ${paymentProvider === 'cora' ? 'selected' : ''}`} onClick={() => setPaymentProvider('cora')}>
                  <strong><img src={PROVIDER_LOGOS.cora} alt="Cora" /> Cora</strong>
                  <span>Gera faturas Pix pela conta Cora. QR Code Pix: R$ 0,50.</span>
                </button>
              </div>
              <div className="settings-footer-actions">
                <button className="settings-save-btn" onClick={handleSavePaymentProvider} disabled={savingPaymentProvider}>
                  <Save size={18} />
                  {savingPaymentProvider ? 'Salvando...' : 'Salvar integração'}
                </button>
              </div>
            </>
          )}

          {activeIntegrationTab === 'webhook' && (
            <div className="webhook-test-panel">
              <div className="settings-row">
                <label className="settings-field">
                  <span>Banco para testar</span>
                  <select value={webhookTestProvider} onChange={e => setWebhookTestProvider(e.target.value === 'cora' ? 'cora' : 'asaas')}>
                    <option value="asaas">Asaas</option>
                    <option value="cora">Cora</option>
                  </select>
                </label>
                <button className="settings-save-btn" onClick={handleTestWebhook} disabled={testingWebhook}>
                  <RefreshCw size={18} />
                  {testingWebhook ? 'Testando...' : 'Testar webhook'}
                </button>
              </div>

              {webhookTestResult && (
                <div className={`webhook-result ${webhookTestResult.success ? 'ok' : 'fail'}`}>
                  <div className="webhook-result-head">
                    <strong>{webhookTestResult.success ? 'Webhook pronto' : 'Webhook com pendências'}</strong>
                    {webhookTestResult.webhookUrl && <small>{webhookTestResult.webhookUrl}</small>}
                  </div>
                  <div className="webhook-checks">
                    {(webhookTestResult.checks || []).map((check: any, index: number) => (
                      <div key={`${check.label}-${index}`} className={`webhook-check ${check.ok ? 'ok' : 'fail'}`}>
                        <span>{check.ok ? 'OK' : 'ERRO'}</span>
                        <div>
                          <strong>{check.label}</strong>
                          <small>{check.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        .settings-page-title {
          margin-bottom: 22px;
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
        .settings-field select {
          width: 100%;
          height: 48px;
          border-radius: var(--adm-radius-sm);
          border: 1px solid var(--adm-border);
          background: var(--adm-bg);
          color: var(--adm-text);
          padding: 0 14px;
          font-size: .96rem;
        }
        .settings-inner-tabs {
          display: inline-flex;
          gap: 6px;
          padding: 5px;
          margin-bottom: 18px;
          border: 1px solid var(--adm-border);
          border-radius: var(--adm-radius-sm);
          background: var(--adm-bg);
        }
        .settings-inner-tabs button {
          height: 38px;
          border: none;
          border-radius: 9px;
          padding: 0 14px;
          background: transparent;
          color: var(--adm-text-muted);
          font-weight: 900;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .settings-inner-tabs button.active {
          background: var(--adm-accent);
          color: #071A45;
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
        .settings-provider-options {
          display: grid;
          grid-template-columns: repeat(2, minmax(180px, 1fr));
          gap: 14px;
        }
        .payment-provider-option {
          min-height: 88px;
          border-radius: var(--adm-radius-sm);
          border: 1px solid var(--adm-border);
          background: var(--adm-bg);
          color: var(--adm-text);
          text-align: left;
          padding: 16px;
          cursor: pointer;
          display: grid;
          gap: 6px;
        }
        .payment-provider-option strong {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--adm-text);
        }
        .payment-provider-option img {
          width: 72px;
          max-height: 24px;
          object-fit: contain;
          object-position: left center;
          background: #fff;
          border-radius: 6px;
          padding: 4px 6px;
        }
        .payment-provider-option span {
          color: var(--adm-text-muted);
          font-size: .82rem;
          line-height: 1.35;
        }
        .payment-provider-option.selected {
          border-color: var(--adm-accent);
          background: rgba(107,255,42,.1);
          box-shadow: 0 12px 28px rgba(107,255,42,.08);
        }
        .settings-footer-actions {
          margin-top: 18px;
          display: flex;
          justify-content: flex-end;
        }
        .webhook-test-panel {
          display: grid;
          gap: 18px;
        }
        .webhook-result {
          border: 1px solid var(--adm-border);
          border-radius: var(--adm-radius);
          background: var(--adm-bg);
          overflow: hidden;
        }
        .webhook-result.ok {
          border-color: rgba(34,197,94,.35);
        }
        .webhook-result.fail {
          border-color: rgba(245,158,11,.4);
        }
        .webhook-result-head {
          padding: 16px;
          border-bottom: 1px solid var(--adm-border);
          display: grid;
          gap: 5px;
        }
        .webhook-result-head strong {
          color: var(--adm-text);
        }
        .webhook-result-head small {
          color: var(--adm-text-muted);
          word-break: break-all;
        }
        .webhook-checks {
          display: grid;
        }
        .webhook-check {
          padding: 14px 16px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
          border-bottom: 1px solid var(--adm-border-light);
        }
        .webhook-check:last-child {
          border-bottom: none;
        }
        .webhook-check > span {
          min-width: 48px;
          height: 24px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: .68rem;
          font-weight: 900;
        }
        .webhook-check.ok > span {
          background: rgba(34,197,94,.14);
          color: var(--adm-success);
        }
        .webhook-check.fail > span {
          background: rgba(239,68,68,.14);
          color: var(--adm-danger);
        }
        .webhook-check strong {
          display: block;
          color: var(--adm-text);
          font-size: .86rem;
        }
        .webhook-check small {
          display: block;
          margin-top: 3px;
          color: var(--adm-text-muted);
          line-height: 1.35;
        }
        @media (max-width: 900px) {
          .settings-provider-options {
            grid-template-columns: 1fr;
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
