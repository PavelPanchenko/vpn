import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { authStore } from '../lib/authStore';

export function ProtectedLayout() {
  const location = useLocation();
  const token = authStore.getToken();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

