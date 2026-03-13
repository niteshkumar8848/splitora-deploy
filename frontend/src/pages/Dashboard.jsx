import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createGroup, getGroups, joinGroup } from '../api';
import Footer from '../components/Footer';
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
        text: `Owes you ${formatInr(value)}`, 
        cls: 'bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 text-emerald-700 border border-emerald-200 shadow-emerald-200/50' 
      };
    }
    if (value < -0.01) {
      return { 
        text: `You owe ${formatInr(absValue)}`, 
        cls: 'bg-gradient-to-r from-red-500/10 to-red-600/10 text-red-700 border border-red-200 shadow-red-200/50' 
      };
    }
    return { 
      text: 'Balanced ✅', 
      cls: 'bg-gradient-to-r from-gray-500/10 to-gray-600/10 text-muted-foreground border border-muted shadow-sm' 
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-primary/5 to-accent/10">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-black bg-gradient-to-r from-foreground via-primary to-accent bg-clip-text text-transparent animate-fade-in">
              Hello <span className="text-primary">{user?.name || 'there'}</span> 👋
            </h1>
            <p className="text-xl text-muted-foreground max-w-md">Professional expense splitting made simple</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={() => setShowCreate(true)} className="text-lg px-8">
              ➕ Create Group
            </Button>
            <Button variant="secondary" onClick={() => setShowJoin(true)} className="text-lg px-8">
              👥 Join Group
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">Loading groups...</div>
        ) : groups.length === 0 ? (
          <div className="glass-card p-16 text-center max-w-2xl mx-auto animate-fade-in">
            <div className="w-28 h-28 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <span className="text-4xl">🎉</span>
            </div>
            <h2 className="text-3xl font-bold text-foreground mb-4">No groups yet!</h2>
            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">Create your first group to start splitting expenses with friends and family.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="px-12 shadow-glow" onClick={() => setShowCreate(true)}>➕ Create Group</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {groups.map((group) => {
              const badge = getBalanceBadge(Number(group.my_balance || 0));
              return (
                <div className="glass-card group cursor-pointer overflow-hidden hover:shadow-glow animate-fade-in hover:-translate-y-2 transition-all duration-300" onClick={() => navigate(`/groups/${group.id}`)}>
                  <div className="p-7 pb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 group-hover:scale-110 transition-transform"></div>
                      <div>
                        <h3 className="font-bold text-xl text-foreground group-hover:text-primary transition-colors">{group.name}</h3>
                        <p className="text-sm text-muted-foreground">{group.member_count} members</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-7 pb-7 pt-0">
                    <div className={`inline-flex px-4 py-2 rounded-xl text-sm font-semibold group-hover:scale-105 transition-transform ${badge.cls === 'bg-green-100 text-green-700' ? 'bg-emerald-100 text-emerald-700 shadow-md shadow-emerald-200/50' : badge.cls === 'bg-red-100 text-red-700' ? 'bg-red-100 text-red-700 shadow-md shadow-red-200/50' : 'bg-muted text-muted-foreground'}`}>
                      {badge.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Modal isOpen={showCreate} title="Create Group" onClose={() => setShowCreate(false)}>
        <form className="space-y-4" onSubmit={handleCreate}>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"
            placeholder="Group Name"
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"
            placeholder="Description (optional)"
            value={createForm.description}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
          />
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"
            type="number"
            step="0.01"
            min="0"
            placeholder="Budget (optional)"
            value={createForm.budget}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, budget: event.target.value }))}
          />
          {createdCode && (
            <div className="glass-card bg-gradient-to-r from-emerald-50 to-emerald-100 border-emerald-200 p-4 animate-pulse-soft">
              <p className="font-semibold text-emerald-800 mb-1">✅ Group created!</p>
              <p className="text-sm text-emerald-700 flex items-center gap-2">
                <span className="font-mono bg-emerald-200 px-2 py-1 rounded-lg text-xs">{createdCode}</span>
                Share this code with friends
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
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-input bg-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
      <Footer />
    </div>
  );
}

export default Dashboard;
