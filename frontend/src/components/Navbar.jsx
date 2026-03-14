import { Link, useLocation } from 'react-router-dom';
import { Building2, Menu, User, LogOut, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';
import { useState } from 'react';

function Navbar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = (user?.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <nav className="glass-card border-b-0 backdrop-blur-md sticky top-0 z-50 shadow-soft">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="hidden md:flex items-center justify-between border-b border-border/60 py-2">
          <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">Urban Class Workspace</p>
          <p className="text-[0.75rem] text-muted-foreground">Structured Shared Expense Management</p>
        </div>
        <div className="flex justify-between items-center py-4 md:py-3">
          {/* Logo */}
          <Link to="/dashboard" className="group flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary-700 text-white inline-flex items-center justify-center shadow-soft">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent group-hover:scale-105 transition-transform">
                Splitora
              </h1>
              <p className="hidden md:block text-[0.74rem] text-muted-foreground -mt-1">Ledger-grade group expense app</p>
            </div>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-3">
            {location.pathname !== '/dashboard' && (
              <Link to="/dashboard" className="btn-secondary">
                Dashboard
              </Link>
            )}
            <Link to="/profile" className="flex items-center gap-2 px-2 py-1.5 rounded-xl border border-input bg-white hover:bg-muted transition-colors">
              <span className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 border border-gray-200 inline-flex items-center justify-center text-xs font-semibold text-gray-600">
                {user?.profile_image_url ? (
                  <img src={user.profile_image_url} alt={user?.name || 'Profile'} className="w-full h-full object-cover" />
                ) : (
                  initials || 'U'
                )}
              </span>
              <span className="text-sm text-muted-foreground font-medium">{user?.name}</span>
            </Link>
            <span className="hidden lg:inline-flex items-center gap-1.5 text-[0.86rem] text-muted-foreground px-2">
              <Building2 className="h-4 w-4" />
              {user?.name}
            </span>
            <Button variant="secondary" onClick={logout} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>

          {/* Mobile menu button */}
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
            <Menu className="h-6 w-6" />
          </Button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 animate-slide-up">
            <div className="flex flex-col gap-2 px-2">
              {location.pathname !== '/dashboard' && (
                <Link 
                  to="/dashboard" 
                  className="btn-secondary w-full justify-start"
                  onClick={() => setMobileOpen(false)}
                >
                  Dashboard
                </Link>
              )}
              <Link
                to="/profile"
                className="btn-secondary w-full justify-start gap-2"
                onClick={() => setMobileOpen(false)}
              >
                <span className="w-6 h-6 rounded-full overflow-hidden bg-gray-100 border border-gray-200 inline-flex items-center justify-center text-[0.65rem] font-semibold text-gray-600">
                  {user?.profile_image_url ? (
                    <img src={user.profile_image_url} alt={user?.name || 'Profile'} className="w-full h-full object-cover" />
                  ) : (
                    initials || 'U'
                  )}
                </span>
                My Profile
              </Link>
              <Button 
                variant="secondary" 
                className="w-full justify-start gap-2"
                onClick={() => {
                  logout();
                  setMobileOpen(false);
                }}
              >
                <User className="h-4 w-4" />
                {user?.name}
                <LogOut className="h-4 w-4 ml-auto" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
