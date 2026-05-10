import { Routes, Route, Navigate } from 'react-router-dom';

export function SuperAdminRouter() {
  return (
    <Routes>
      <Route path="/tenants" element={<Navigate to="/platform/tenants" replace />} />
      <Route path="*" element={<Navigate to="/platform/tenants" replace />} />
    </Routes>
  );
}
