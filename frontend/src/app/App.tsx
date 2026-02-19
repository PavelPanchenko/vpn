import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ServersPage } from '../pages/ServersPage';
import { UsersPage } from '../pages/UsersPage';
import { UserDetailsPage } from '../pages/UserDetailsPage';
import { SubscriptionsPage } from '../pages/SubscriptionsPage';
import { PaymentsPage } from '../pages/PaymentsPage';
import { PlansPage } from '../pages/PlansPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SupportPage } from '../pages/SupportPage';
import { BroadcastPage } from '../pages/BroadcastPage';
import { LogsPage } from '../pages/LogsPage';
import { MiniAppPage } from '../pages/MiniAppPage';
import { PrivacyPolicyPage } from '../pages/PrivacyPolicyPage';
import { TermsPage } from '../pages/TermsPage';
import { ProtectedLayout } from './ProtectedLayout';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/servers" element={<ServersPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:id" element={<UserDetailsPage />} />
        <Route path="/subscriptions" element={<SubscriptionsPage />} />
        <Route path="/payments" element={<PaymentsPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/broadcast" element={<BroadcastPage />} />
        <Route path="/logs" element={<LogsPage />} />
      </Route>

      {/* Публичный роут для Telegram Mini App (без админской авторизации) */}
      <Route path="/mini" element={<MiniAppPage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

