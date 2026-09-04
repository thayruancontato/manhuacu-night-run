import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CustomDialogProvider } from './context/CustomDialogContext';
import { LoadingProvider } from './components/LoadingService';
import { AuthProvider } from './context/AuthContext';
import ClosedRegistrations from './pages/ClosedRegistrations';
import Home from './pages/Home';
import AtletasConfirmados from './pages/AtletasConfirmados';
import AdminBateu1000Preview from './pages/AdminBateu1000Preview';
import AdminDashboard from './pages/AdminDashboard';
import AdminInscritos from './pages/AdminInscritos';
import AdminFinanceiro from './pages/AdminFinanceiro';
import AdminKits from './pages/AdminKits';
import AdminMensagens from './pages/AdminMensagens';
import AdminMensagensConfig from './pages/AdminMensagensConfig';
import AdminMensagensPersonalizadas from './pages/AdminMensagensPersonalizadas';
import AdminMidias from './pages/AdminMidias';
import AdminExport from './pages/AdminExport';
import AdminCamisetas from './pages/AdminCamisetas';
import AdminUsuarios from './pages/AdminUsuarios';
import AdminSorteios from './pages/AdminSorteios';
import AdminSorteioDetalhe from './pages/AdminSorteioDetalhe';
import SorteioPublico from './pages/SorteioPublico';
import SorteioOperador from './pages/SorteioOperador';
import AdminLotes from './pages/AdminLotes';
import AdminCuponsDesconto from './pages/AdminCuponsDesconto';
import AdminLogin from './pages/AdminLogin';
import AdminLayout from './layouts/AdminLayout';
import AtletaLayout from './layouts/AtletaLayout';
import AtletaDashboard from './pages/AtletaDashboard';
import AtletaLogin from './pages/AtletaLogin';
import AtletaPerfil from './pages/AtletaPerfil';
import AtletaPagamentos from './pages/AtletaPagamentos';
import PaymentPage from './pages/PaymentPage';
import SuccessPaymentPage from './pages/SuccessPaymentPage';
import Regulamento from './pages/Regulamento';
import AdminSettings from './pages/AdminSettings';
import AdminIntegracoes from './pages/AdminIntegracoes';
import AdminModoManutencao from './pages/AdminModoManutencao';
import AdminVerificarPagamentos from './pages/AdminVerificarPagamentos';
import AdminCobrancaPendentes from './pages/AdminCobrancaPendentes';
import AdminDev from './pages/AdminDev';
import AdminAtletaDetalhes from './pages/AdminAtletaDetalhes';
import AdminModalidades from './pages/AdminModalidades';
import AdminEquipes from './pages/AdminEquipes';
import AdminPresenca from './pages/AdminPresenca';
import AdminCardEuVou from './pages/AdminCardEuVou';
import AdminContaHistorico from './pages/AdminContaHistorico';
import AdminFaturas from './pages/AdminFaturas';
import AdminFinanceiroRelatorios from './pages/AdminFinanceiroRelatorios';
import AdminFinanceiroDefinicoes from './pages/AdminFinanceiroDefinicoes';
import AdminVerificacoesManuais from './pages/AdminVerificacoesManuais';
import './App.css';

const Placeholder = ({ title }: { title: string }) => (
  <div style={{ padding: 20 }}>
    <h1>{title}</h1>
    <p>Em desenvolvimento...</p>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <LoadingProvider>
        <AuthProvider>
          <CustomDialogProvider>
            <Routes>
              {/* Public */}
              <Route path="/" element={<Home />} />
              <Route path="/atletas" element={<AtletasConfirmados />} />
              <Route path="/regulamento" element={<Regulamento />} />
              <Route path="/inscricao" element={<ClosedRegistrations />} />
              <Route path="/inscricao/pagamento/:registrationId" element={<PaymentPage />} />
              <Route path="/inscricao/confirmada/:registrationId" element={<SuccessPaymentPage />} />
              <Route path="/sorteio/:sorteioId" element={<SorteioPublico />} />
              <Route path="/sorteio/:sorteioId/operar" element={<SorteioOperador />} />
              <Route path="/admin/bateu1000" element={<AdminBateu1000Preview />} />

              {/* Shared Login */}
              <Route path="/admin/login" element={<AtletaLogin />} />
              <Route path="/atleta/login" element={<AtletaLogin />} />

              {/* Admin */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AdminDashboard />} />
                <Route path="inscritos" element={<AdminInscritos />} />
                <Route path="inscritos/:id" element={<AdminAtletaDetalhes />} />
                <Route path="inscritos/novo" element={<Placeholder title="NOVA INSCRIÇÃO" />} />
                <Route path="modalidades" element={<AdminModalidades />} />
                <Route path="equipes" element={<AdminEquipes />} />
                <Route path="financeiro" element={<AdminFinanceiro />} />
                <Route path="financeiro/faturas" element={<AdminFaturas />} />
                <Route path="financeiro/relatorios" element={<AdminFinanceiroRelatorios />} />
                <Route path="financeiro/definicoes" element={<AdminFinanceiroDefinicoes />} />
                <Route path="financeiro/:provider" element={<AdminContaHistorico />} />
                <Route path="verificar-pagamentos" element={<AdminVerificarPagamentos />} />
                <Route path="cobranca-pendentes" element={<AdminCobrancaPendentes />} />
                <Route path="financeiro/cobrancas" element={<Placeholder title="COBRANÇAS" />} />
                <Route path="kits" element={<AdminKits />} />
                <Route path="presenca" element={<AdminPresenca />} />
                <Route path="card-euvou" element={<AdminCardEuVou />} />
                <Route path="verificacoes-manuais" element={<AdminVerificacoesManuais />} />
                <Route path="mensagens" element={<AdminMensagens />} />
                <Route path="whatsapp" element={<AdminMensagensConfig />} />
                <Route path="mensagens/personalizadas" element={<AdminMensagensPersonalizadas />} />
                <Route path="midias" element={<AdminMidias />} />
                <Route path="export" element={<AdminExport />} />
                <Route path="camisetas" element={<AdminCamisetas />} />
                <Route path="usuarios" element={<AdminUsuarios />} />
                <Route path="sorteios" element={<AdminSorteios />} />
                <Route path="sorteios/:sorteioId" element={<AdminSorteioDetalhe />} />
                <Route path="lotes" element={<AdminLotes />} />
                <Route path="cupons" element={<AdminCuponsDesconto />} />
                <Route path="integracoes" element={<AdminIntegracoes />} />
                <Route path="modo-manutencao" element={<AdminModoManutencao />} />
                <Route path="configuracoes" element={<AdminSettings />} />
                <Route path="dev" element={<AdminDev />} />
              </Route>

              {/* Atleta */}
              <Route path="/atleta" element={<AtletaLayout />}>
                <Route index element={<Navigate to="dashboard" replace />} />
                <Route path="dashboard" element={<AtletaDashboard />} />
                <Route path="pagamentos" element={<AtletaPagamentos />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CustomDialogProvider>
        </AuthProvider>
      </LoadingProvider>
    </BrowserRouter>
  );
}

export default App;
