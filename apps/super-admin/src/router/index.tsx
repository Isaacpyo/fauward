import { Routes, Route, Navigate } from 'react-router-dom';
import { TenantsPage } from '../features/tenants/TenantsPage';

export function SuperAdminRouter() {
  return (
    <Routes>
      <Route path="/tenants" element={<TenantsPage />} />
      <Route path="*" element={<Navigate to="/tenants" replace />} />
    </Routes>
  );
}