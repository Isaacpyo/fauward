import { Routes, Route, Navigate } from 'react-router-dom';
import { DriverDashboard } from '../features/driver/DriverDashboard';
import { DeliveryDetail } from '../features/driver/DeliveryDetail';
import { CapturePoD } from '../features/driver/CapturePoD';
import { ApiKeysTab } from '../features/admin/settings/tabs/ApiKeysTab';
import { WebhooksTab } from '../features/admin/webhooks/WebhooksTab';
import { EmbedWidgetTab } from '../features/admin/embed/EmbedWidgetTab';
import { CrmPipelinePage } from '../features/admin/crm/CrmPipelinePage';
import { AdminFinancePage } from '../features/admin/finance/AdminFinancePage';
import { AdminAnalyticsPage } from '../features/admin/analytics/AnalyticsPage';
import { AuditLogPage } from '../features/admin/audit/AuditLogPage';
import { AppShell } from '../components/layout/AppShell';

export function AppRouter() {
  return (
    <AppShell>
      <Routes>
        <Route path="/driver" element={<DriverDashboard />} />
        <Route path="/driver/:id" element={<DeliveryDetail />} />
        <Route path="/driver/:id/pod" element={<CapturePoD />} />

        <Route path="/admin/settings/api-keys" element={<ApiKeysTab />} />
        <Route path="/admin/settings/webhooks" element={<WebhooksTab />} />
        <Route path="/admin/settings/embed" element={<EmbedWidgetTab />} />
        <Route path="/admin/crm" element={<CrmPipelinePage />} />
        <Route path="/admin/finance" element={<AdminFinancePage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
        <Route path="/admin/audit" element={<AuditLogPage />} />

        <Route path="*" element={<Navigate to="/driver" replace />} />
      </Routes>
    </AppShell>
  );
}