import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getBalances, getExpenses, getGroups, getMembers } from '../api';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';

// Convert number to INR display string.
function formatInr(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Build initials from member full name.
function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

// Render group overview, balances, and recent activity.
function GroupDetail() {
  const navigate = useNavigate();
  const { groupId } = useParams();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [balances, setBalances] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load all group detail datasets.
  const loadData = async () => {
    setLoading(true);
    try {
      const [groupRes, membersRes, expensesRes, balancesRes] = await Promise.all([
        getGroups(),
        getMembers(groupId),
        getExpenses(groupId),
        getBalances(groupId),
      ]);
      const currentGroup = (groupRes.data || []).find((item) => item.id === groupId) || null;
      setGroup(currentGroup);
      setMembers(membersRes.data || []);
      setExpenses((expensesRes.data || []).slice(0, 5));
      setBalances(balancesRes.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load group details');
    } finally {
      setLoading(false);
    }
  };

  // Fetch data on initial render and group changes.
  useEffect(() => {
    loadData();
  }, [groupId]);

  // Compute non-reversal total spent in group.
  const spent = useMemo(() => {
    return expenses.filter((item) => !item.is_reversal).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
  }, [expenses]);

  // Return budget progress styling and percent value.
  const budgetMeta = useMemo(() => {
    const budget = Number(group?.budget || 0);
    if (!budget) {
      return { percent: 0, bar: 'bg-green-500' };
    }
    const percent = Math.min(100, Number(((spent / budget) * 100).toFixed(2)));
    if (percent < 60) return { percent, bar: 'bg-green-500' };
    if (percent <= 80) return { percent, bar: 'bg-yellow-500' };
    return { percent, bar: 'bg-red-500' };
  }, [group?.budget, spent]);

  // Resolve color class for member balance text.
  const balanceClass = (value) => {
    if (value > 0.01) return 'text-green-600';
    if (value < -0.01) return 'text-red-600';
    return 'text-gray-500';
  };

  // Copy invite code into clipboard.
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(group?.invite_code || '');
      toast.success('Invite code copied');
    } catch {
      toast.error('Unable to copy invite code');
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-sm text-gray-500">Loading group...</div>
        ) : !group ? (
          <div className="section-card">
            <p className="text-sm text-gray-500">Group not found.</p>
            <Link className="text-indigo-600 text-sm font-medium" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        ) : (
          <>
            <section className="section-card">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-bold text-gray-800">{group.name}</h1>
                <button type="button" onClick={copyInvite} className="btn-secondary">
                  Invite Code: {group.invite_code}
                </button>
              </div>
              {group.budget ? (
                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-2">
                    Spent {formatInr(spent)} of {formatInr(group.budget)} budget
                  </p>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${budgetMeta.bar}`} style={{ width: `${budgetMeta.percent}%` }} />
                  </div>
                </div>
              ) : null}
            </section>

            <section className="flex flex-wrap gap-2">
              <button onClick={() => navigate(`/groups/${groupId}/add-expense`)} type="button" className="btn-primary">➕ Add Expense</button>
              <button onClick={() => navigate(`/groups/${groupId}/settle`)} type="button" className="btn-primary">💸 Settle Up</button>
              <button onClick={() => navigate(`/groups/${groupId}/ledger`)} type="button" className="btn-secondary">📋 Ledger</button>
              <button onClick={() => navigate(`/groups/${groupId}/analytics`)} type="button" className="btn-secondary">📊 Analytics</button>
            </section>

            <section className="section-card">
              <h2 className="text-xl font-semibold text-gray-800 mb-3">Members</h2>
              {members.length === 0 ? (
                <p className="text-sm text-gray-500">No members in this group yet.</p>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {members.map((member) => {
                    const memberBalance = balances.find((item) => item.user_id === member.id)?.balance || 0;
                    return (
                      <div key={member.id} className="min-w-[140px] rounded-xl border border-gray-100 p-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center">
                          {initials(member.name)}
                        </div>
                        <p className="mt-2 text-sm font-medium text-gray-800">{member.name}</p>
                        <p className={`text-xs ${balanceClass(Number(memberBalance))}`}>{formatInr(memberBalance)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="section-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold text-gray-800">Recent Expenses</h2>
                <button type="button" onClick={() => navigate(`/groups/${groupId}/ledger`)} className="text-sm text-indigo-600 font-medium">
                  View all
                </button>
              </div>
              {expenses.length === 0 ? (
                <p className="text-sm text-gray-500">No expenses recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {expenses.map((expense) => (
                    <div key={expense.id} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{expense.paid_by_name} paid for {expense.title}</p>
                        <p className="text-xs text-gray-500">{new Date(expense.created_at).toLocaleString()}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-800">{formatInr(expense.total_amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default GroupDetail;
