import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Building2, CircleDollarSign, HandCoins, Layers3, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { createGroup, getGroups, joinGroup } from '../api';
import Modal from '../components/Modal';
import Navbar from '../components/Navbar';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

// Format numeric value as INR currency.
function formatInr(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Render user dashboard with group management actions.
function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState('');
  const [createForm, setCreateForm] = useState({ name: '', description: '', budget: '' });
  const [inviteCode, setInviteCode] = useState('');

  // Load all groups for current user.
  const loadGroups = async () => {
    setLoading(true);
    try {
      const response = await getGroups();
      setGroups(response.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  // Fetch groups when dashboard mounts.
  useEffect(() => {
    loadGroups();
  }, []);

  // Submit group creation and display invite code.
  const handleCreate = async (event) => {
    event.preventDefault();
    setCreateLoading(true);
    try {
      const payload = {
        name: createForm.name,
        description: createForm.description || null,
        budget: createForm.budget ? Number(createForm.budget) : null,
      };
      const response = await createGroup(payload);
      setCreatedCode(response.data.invite_code);
      toast.success('Group created successfully');
      await loadGroups();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to create group');
    } finally {
      setCreateLoading(false);
    }
  };

  // Submit invite code to join existing group.
  const handleJoin = async (event) => {
    event.preventDefault();
    setJoinLoading(true);
    try {
      await joinGroup(inviteCode.trim().toUpperCase());
      toast.success('Joined successfully');
      setShowJoin(false);
      setInviteCode('');
      await loadGroups();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to join group');
    } finally {
      setJoinLoading(false);
    }
  };

  // Resolve badge text and style by net balance value.
  const getBalanceBadge = (value) => {
    const absValue = Math.abs(value);
    if (value > 0.01) {
      return {
        text: `Receivable ${formatInr(value)}`,
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    }
    if (value < -0.01) {
      return {
        text: `Payable ${formatInr(absValue)}`,
        cls: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    }
    return {
      text: 'Balanced',
      cls: 'bg-slate-100 text-slate-600 border-slate-200',
    };
  };

  const summary = useMemo(() => {
    const totalGroups = groups.length;
    const receivable = groups.reduce((sum, group) => {
      const value = Number(group.my_balance || 0);
      return value > 0 ? sum + value : sum;
    }, 0);
    const payable = groups.reduce((sum, group) => {
      const value = Number(group.my_balance || 0);
      return value < 0 ? sum + Math.abs(value) : sum;
    }, 0);
    const balancedGroups = groups.filter((group) => Math.abs(Number(group.my_balance || 0)) <= 0.01).length;
    return { totalGroups, receivable, payable, balancedGroups };
  }, [groups]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <section className="section-card mb-6 animate-fade-in">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Workspace Overview</p>
              <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent">
                Welcome back, {user?.name || 'there'}
              </h1>
              <p className="text-[1rem] text-muted-foreground">Manage all your groups, balances, and settlements from a single professional dashboard.</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Button onClick={() => setShowCreate(true)} className="px-6">
                Create Group
              </Button>
              <Button variant="secondary" onClick={() => setShowJoin(true)} className="px-6">
                Join Group
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div className="section-card">
            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" /> Total Groups</p>
            <p className="text-2xl font-bold text-foreground">{summary.totalGroups}</p>
          </div>
          <div className="section-card">
            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-emerald-600" /> Receivable</p>
            <p className="text-2xl font-bold text-emerald-700">{formatInr(summary.receivable)}</p>
          </div>
          <div className="section-card">
            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2"><HandCoins className="h-4 w-4 text-rose-600" /> Payable</p>
            <p className="text-2xl font-bold text-rose-700">{formatInr(summary.payable)}</p>
          </div>
          <div className="section-card">
            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2"><Users className="h-4 w-4 text-slate-600" /> Balanced Groups</p>
            <p className="text-2xl font-bold text-foreground">{summary.balancedGroups}</p>
          </div>
        </section>

        {loading ? (
          <div className="section-card text-sm text-muted-foreground">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="section-card p-14 text-center max-w-3xl mx-auto animate-fade-in">
            <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-primary/15 to-accent/15 flex items-center justify-center">
              <Building2 className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-3">No Active Groups Yet</h2>
            <p className="text-[1rem] text-muted-foreground mb-8 leading-relaxed">Create your first group to start tracking shared expenses with structure and clarity.</p>
            <Button size="lg" className="px-10" onClick={() => setShowCreate(true)}>
              Create Group
            </Button>
          </div>
        ) : (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-foreground">Your Groups</h2>
              <p className="text-sm text-muted-foreground">{groups.length} active workspaces</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {groups.map((group) => {
                const badge = getBalanceBadge(Number(group.my_balance || 0));
                return (
                  <article key={group.id} className="section-card group hover:-translate-y-1 transition-all duration-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-lg text-foreground truncate">{group.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{group.description || 'No description added.'}</p>
                      </div>
                      <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/15 to-accent/20 text-primary inline-flex items-center justify-center font-semibold">
                        {group.name?.slice(0, 1)?.toUpperCase() || 'G'}
                      </span>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">{group.member_count} members</p>
                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${badge.cls}`}>
                        {badge.text}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/groups/${group.id}`)}
                      className="mt-5 w-full btn-secondary justify-between"
                    >
                      Open Group
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <Modal isOpen={showCreate} title="Create Group" onClose={() => setShowCreate(false)}>
        <form className="space-y-4" onSubmit={handleCreate}>
          <input
            className="input-field"
            placeholder="Group Name"
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            className="input-field"
            placeholder="Description (optional)"
            value={createForm.description}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <input
            className="input-field"
            type="number"
            step="0.01"
            min="0"
            placeholder="Budget (optional)"
            value={createForm.budget}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, budget: event.target.value }))}
          />
          {createdCode && (
            <div className="glass-card bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200 p-4 animate-pulse-soft">
              <p className="font-semibold text-emerald-800 mb-1">Group created successfully</p>
              <p className="text-sm text-emerald-700 flex items-center gap-2">
                <span className="font-mono bg-emerald-200 px-2 py-1 rounded-lg text-xs">{createdCode}</span>
                Share this code with your members
              </p>
            </div>
          )}
          <Button disabled={createLoading} size="lg" className="w-full shadow-glow">
            {createLoading ? 'Creating...' : 'Create Group'}
          </Button>
        </form>
      </Modal>

      <Modal isOpen={showJoin} title="Join Group" onClose={() => setShowJoin(false)}>
        <form className="space-y-4" onSubmit={handleJoin}>
          <div className="relative">
            <input
              className="input-field pl-12 pr-4 py-4"
              placeholder="Enter invite code (ABC123)"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              required
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg font-mono">🔑</span>
          </div>
          <Button disabled={joinLoading} size="lg" className="w-full shadow-glow">
            {joinLoading ? 'Joining...' : 'Join Group'}
          </Button>
        </form>
      </Modal>
    </div>
  );
}

export default Dashboard;
