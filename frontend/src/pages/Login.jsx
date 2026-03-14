import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMe, loginUser } from '../api';
import authBackground from '../../assets/background.jpg';
import { useAuth } from '../context/AuthContext';

// Render login form and initialize user session.
function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: '', password: '' });

  // Update controlled form values.
  const onChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  // Submit login request and route to dashboard.
  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await loginUser(form);
      const token = response.data.access_token;
      localStorage.setItem('token', token);
      const me = await getMe();
      login(token, me.data);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (error) {
      localStorage.removeItem('token');
      toast.error(error?.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="page-shell flex items-center justify-center"
      style={{
        backgroundImage: `linear-gradient(rgba(15, 23, 42, 0.58), rgba(15, 23, 42, 0.58)), url(${authBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="w-full max-w-md section-card animate-fade-in">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 text-white inline-flex items-center justify-center shadow-soft">
              <Wallet className="h-4 w-4" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Splitora</p>
          </div>
          <h1 className="text-3xl font-extrabold text-foreground mt-2">Welcome Back</h1>
          <p className="text-sm text-muted-foreground mt-1">Log in to continue managing your shared expenses.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <input className="input-field" type="email" name="email" placeholder="Email" value={form.email} onChange={onChange} required />
          <input className="input-field" type="password" name="password" placeholder="Password" value={form.password} onChange={onChange} required />

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <p className="text-sm text-muted-foreground mt-5 text-center">
          New here?{' '}
          <Link className="text-primary font-semibold" to="/register">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
