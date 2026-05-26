import { useAuthStore } from '@/stores/useAuthStore';
import { Navigate, Outlet } from 'react-router';

const ProtectedRoute = ({ allowedRoles }: { allowedRoles?: string[] }) => {
  const { accessToken, user } = useAuthStore();

  if (!accessToken) {
    return <Navigate to="/signin" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return <Outlet />
}

export default ProtectedRoute