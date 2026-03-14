import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { getMe, registerUser } from '../api';
import authBackground from '../assets/auth-bg.svg';
import { useAuth } from '../context/AuthContext';

// Render registration form and create an authenticated session.
function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', upi_id: '' });

  // Update controlled form field values.
  const onChange = (event) => {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  };

  // Submit registration request and redirect on success.
  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await registerUser(form);
      const token = response.data.access_token;
      localStorage.setItem('token', token);
      const me = await getMe();
      login(token, me.data);
      toast.success('Welcome to Splitora! 🎉');
      navigate('/dashboard');
    } catch (error) {
      localStorage.removeItem('token');
      toast.error(error?.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen px-4 py-8 md:px-8 flex items-center justify-center"
      style={{ backgroundImage: `linear-gradient(135deg, rgba(15,76,129,0.08), rgba(196,138,42,0.08)), url(${authBackground})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="w-full max-w-6xl glass-card overflow-hidden grid grid-cols-1 lg:grid-cols-2 animate-fade-in">
        <div className="p-6 md:p-10 lg:p-12 bg-white/95">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-9 w-9 rounded-lg bg-gradient-to-br from-primary to-primary-700 text-white inline-flex items-center justify-center shadow-soft">
                <Wallet className="h-4 w-4" />
              </span>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Splitora</p>
            </div>
            <h1 className="text-3xl font-extrabold text-foreground mt-2">Create Account</h1>
            <p className="text-sm text-muted-foreground mt-1">Start splitting expenses with a secure shared ledger.</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <input className="input-field" name="name" placeholder="Full Name" value={form.name} onChange={onChange} required />
            <input className="input-field" type="email" name="email" placeholder="Email" value={form.email} onChange={onChange} required />
            <input className="input-field" name="phone" placeholder="Phone" value={form.phone} onChange={onChange} required />
            <input className="input-field" type="password" name="password" placeholder="Password" value={form.password} onChange={onChange} required />
            <input className="input-field" name="upi_id" placeholder="UPI ID (optional)" value={form.upi_id} onChange={onChange} />

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating account...' : 'Register'}
            </button>
          </form>

          <p className="text-sm text-muted-foreground mt-5 text-center">
            Already have an account?{' '}
            <Link className="text-primary font-semibold" to="/login">
              Login
            </Link>
          </p>
        </div>
        <div className="hidden lg:flex p-10 bg-gradient-to-br from-slate-900/85 to-primary/75 text-white flex-col justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">Urban Class Finance</p>
            <h2 className="text-4xl font-extrabold leading-tight">Build Better Money Habits Together.</h2>
            <p className="text-white/80 text-[0.98rem]">Create your workspace and start splitting with clear balances, quick settlements, and smart analytics.</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm"><Building2 className="h-4 w-4 text-accent" /> Designed for roommates, trips, and startup teams</div>
            <div className="flex items-center gap-3 text-sm"><ShieldCheck className="h-4 w-4 text-accent" /> Secure credentials with encrypted password hashing</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Register;
