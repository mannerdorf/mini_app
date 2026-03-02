import { useEffect, useState } from 'react';
import './pnl.css';
import {
  LayoutDashboard, FileText, TrendingUp, BarChart3, Bell,
  BookOpen, DollarSign, FileUp, Truck, SlidersHorizontal, CreditCard, PenLine,
} from 'lucide-react';

import { DashboardView } from './DashboardView';
import { PlReportView } from './PlReportView';
import { UnitEconomicsView } from './UnitEconomicsView';
import { PerKgView } from './PerKgView';
import { AlertsView } from './AlertsView';
import { OperationsView } from './OperationsView';
import { CreditsView } from './CreditsView';
import { EntryView } from './EntryView';
import { SettingsView } from './SettingsView';
import { UploadBankView } from './UploadBankView';
import { UploadSalesView } from './UploadSalesView';
import { UploadStatementView } from './UploadStatementView';
import { UploadExpensesView } from './UploadExpensesView';
import { RefExpensesView } from './RefExpensesView';
import { RefIncomeView } from './RefIncomeView';
type PnlView =
  | 'dashboard' | 'pl' | 'unit-economics' | 'per-kg' | 'alerts'
  | 'operations' | 'credits' | 'entry' | 'settings'
  | 'upload-bank' | 'upload-sales' | 'upload-statement' | 'upload-expenses'
  | 'ref-expenses' | 'ref-income';

type ExpenseCategoryPrefill = {
  requestId: string;
  expenseCategoryId?: string;
  categoryName?: string;
  subdivision?: string;
  type?: 'COGS' | 'OPEX' | 'CAPEX';
};

const navMain = [
  { id: 'dashboard' as PnlView, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pl' as PnlView, label: 'P&L отчёт', icon: FileText },
  { id: 'unit-economics' as PnlView, label: 'Юнит-экономика', icon: TrendingUp },
  { id: 'per-kg' as PnlView, label: '1 кг логистики', icon: BarChart3 },
  { id: 'alerts' as PnlView, label: 'Алерты', icon: Bell },
];

const navIncome = [
  { id: 'upload-sales' as PnlView, label: 'Доходы', icon: TrendingUp },
];

const navExpenses = [
  { id: 'ref-expenses' as PnlView, label: 'Справочник расходов', icon: BookOpen },
  { id: 'upload-statement' as PnlView, label: 'Загрузка выписки', icon: FileUp },
  { id: 'upload-expenses' as PnlView, label: 'Расходы', icon: Truck },
];

const navOther = [
  { id: 'credits' as PnlView, label: 'Кредиты', icon: CreditCard },
  { id: 'entry' as PnlView, label: 'Ручной ввод', icon: PenLine },
  { id: 'operations' as PnlView, label: 'Операции', icon: FileText },
  { id: 'upload-bank' as PnlView, label: 'Загрузка выписки (банк)', icon: FileUp },
  { id: 'settings' as PnlView, label: 'Настройки', icon: SlidersHorizontal },
];

function NavItem({ id, label, icon: Icon, active, onClick }: { id: PnlView; label: string; icon: any; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8,
        fontSize: '0.85rem', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
        background: active ? '#2563eb' : 'transparent',
        color: active ? '#fff' : '#cbd5e1',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#fff'; } }}
      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; } }}
    >
      <Icon style={{ width: 20, height: 20, flexShrink: 0 }} />
      {label}
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: '6px 12px', fontSize: '0.68rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
      {label}
    </div>
  );
}

function Divider() {
  return <div style={{ margin: '12px 0', borderTop: '1px solid #334155' }} />;
}

export function PnlSection({
  initialView = 'dashboard',
  expenseCategoryPrefill = null,
}: {
  initialView?: PnlView;
  expenseCategoryPrefill?: ExpenseCategoryPrefill | null;
}) {
  const [view, setView] = useState<PnlView>(initialView);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (expenseCategoryPrefill) setView('ref-expenses');
  }, [expenseCategoryPrefill]);

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <DashboardView />;
      case 'pl': return <PlReportView />;
      case 'unit-economics': return <UnitEconomicsView />;
      case 'per-kg': return <PerKgView />;
      case 'alerts': return <AlertsView />;
      case 'operations': return <OperationsView />;
      case 'credits': return <CreditsView />;
      case 'entry': return <EntryView />;
      case 'settings': return <SettingsView />;
      case 'upload-bank': return <UploadBankView />;
      case 'upload-sales': return <UploadSalesView />;
      case 'upload-statement': return <UploadStatementView />;
      case 'upload-expenses': return <UploadExpensesView />;
      case 'ref-expenses': return <RefExpensesView initialPrefill={expenseCategoryPrefill} />;
      case 'ref-income': return <RefIncomeView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="pnl-section" style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 256, background: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column',
        flexShrink: 0, overflowY: 'auto',
      }}>
        <div style={{ padding: '24px', borderBottom: '1px solid #334155' }}>
          <h1 style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff', margin: 0 }}>P&L + Unit Economics</h1>
        </div>
        <nav style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navMain.map((item) => <NavItem key={item.id} {...item} active={view === item.id} onClick={() => setView(item.id)} />)}
          <Divider />
          <SectionLabel label="Доходы" />
          {navIncome.map((item) => <NavItem key={item.id} {...item} active={view === item.id} onClick={() => setView(item.id)} />)}
          <Divider />
          <SectionLabel label="Расходы" />
          {navExpenses.map((item) => <NavItem key={item.id} {...item} active={view === item.id} onClick={() => setView(item.id)} />)}
          <Divider />
          <SectionLabel label="Прочее" />
          {navOther.map((item) => <NavItem key={item.id} {...item} active={view === item.id} onClick={() => setView(item.id)} />)}
        </nav>
      </aside>
      <main style={{ flex: 1, padding: 24, overflowY: 'auto', background: '#f8fafc' }}>
        {renderView()}
      </main>
    </div>
  );
}
