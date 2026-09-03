import {
  Users, DollarSign, BarChart2, Settings, Package,
  MessageSquare, Image as ImageIcon, Download, Home, Shirt, ShieldCheck, Gift,
  Flag, ClipboardList, Building2, Power, SearchCheck, BadgePercent, UsersRound
} from 'lucide-react';

export interface MenuItem {
  path: string;
  label: string;
  icon: any;
  subItems?: { to: string; label: string; badge?: any }[];
}

export const ADMIN_MENU_ITEMS: MenuItem[] = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: Home },
  { path: '/admin/inscritos', label: 'Inscritos', icon: Users },
  { path: '/admin/modalidades', label: 'Modalidades', icon: Flag },
  { path: '/admin/equipes', label: 'Equipes', icon: UsersRound },
  {
    path: '/admin/financeiro', label: 'Financeiro', icon: DollarSign,
    subItems: [
      { to: '/admin/financeiro', label: 'Visao geral' },
      { to: '/admin/financeiro/faturas', label: 'Faturas' },
      { to: '/admin/financeiro/relatorios', label: 'Relatorios' },
      { to: '/admin/financeiro/definicoes', label: 'Definições' },
    ]
  },
  { path: '/admin/verificar-pagamentos', label: 'Verificar pagamentos', icon: SearchCheck },
  { path: '/admin/kits', label: 'Kits e Camisetas', icon: Package },
  { path: '/admin/lotes', label: 'Lotes', icon: ShieldCheck },
  { path: '/admin/cupons', label: 'Cupons de desconto', icon: BadgePercent },
  { path: '/admin/presenca', label: 'Lista de Presença', icon: ClipboardList },
  { path: '/admin/card-euvou', label: 'CARD #EUVOU', icon: ImageIcon },
  { path: '/admin/sorteios', label: 'Sorteio Surpresa', icon: Gift },
  { path: '/admin/whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { path: '/admin/integracoes', label: 'Integrações', icon: Building2 },
  { path: '/admin/modo-manutencao', label: 'Modo manutenção', icon: Power },
  { path: '/admin/export', label: 'Exportar Dados', icon: Download },
  {
    path: '/admin/configuracoes', label: 'Configurações', icon: Settings,
    subItems: [
      { to: '/admin/configuracoes', label: 'Geral' },
      { to: '/admin/usuarios', label: 'Administradores' },
    ]
  }
];
