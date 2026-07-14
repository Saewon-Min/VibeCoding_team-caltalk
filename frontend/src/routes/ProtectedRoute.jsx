import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// 미인증 시 /login으로 이동시키는 UX 보조 장치일 뿐이다. 실제 신뢰 기준은
// 서버가 각 API 요청에서 반환하는 401(BR-01)이며, 이 라우트는 그 결과를
// 화면 전환으로 반영하는 역할만 한다(SC-01 E2).
export default function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
