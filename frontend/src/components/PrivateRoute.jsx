import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Guard routes that require an authenticated user.
function PrivateRoute({ children }) {
  const { token, loading } = useAuth();

  if (loading) {
    return <div className="bg-gray-50 min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default PrivateRoute;
