import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import Footer from './components/Footer';
import PrivateRoute from './components/PrivateRoute';

const Analytics = lazy(() => import('./pages/Analytics'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Settlement = lazy(() => import('./pages/Settlement'));
const AddExpense = lazy(() => import('./pages/AddExpense'));
const Profile = lazy(() => import('./pages/Profile'));

// Configure public and protected routes for the app.
function App() {
  const location = useLocation();

  return (
    <Suspense fallback={<div className="page-shell flex items-center justify-center text-sm text-muted-foreground">Loading...</div>}>
      <div className="min-h-screen flex flex-col">
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="page-motion"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <Routes location={location}>
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
                  path="/profile"
                  element={
                    <PrivateRoute>
                      <Profile />
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
            </motion.div>
          </AnimatePresence>
        </div>
        <Footer />
      </div>
    </Suspense>
  );
}

export default App;
