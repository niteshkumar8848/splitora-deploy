import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';

const Analytics = lazy(() => import('./pages/Analytics'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Settlement = lazy(() => import('./pages/Settlement'));
const AddExpense = lazy(() => import('./pages/AddExpense'));

// Configure public and protected routes for the app.
function App() {
  return (
    <Suspense fallback={<div className="page-shell flex items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/groups/:groupId"
          element={
            <PrivateRoute>
              <GroupDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/groups/:groupId/add-expense"
          element={
            <PrivateRoute>
              <AddExpense />
            </PrivateRoute>
          }
        />
        <Route
          path="/groups/:groupId/settle"
          element={
            <PrivateRoute>
              <Settlement />
            </PrivateRoute>
          }
        />
        <Route
          path="/groups/:groupId/ledger"
          element={
            <PrivateRoute>
              <Ledger />
            </PrivateRoute>
          }
        />
        <Route
          path="/groups/:groupId/analytics"
          element={
            <PrivateRoute>
              <Analytics />
            </PrivateRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default App;
