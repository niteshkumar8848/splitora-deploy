import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { addExpense, getMembers } from '../api';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';

// Convert number into INR string format.
function formatInr(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Build equal shares ensuring rounded total consistency.
function buildEqualSplits(total, members) {
  if (!members.length) return [];
  const base = Number((total / members.length).toFixed(2));
  const remainder = Number((total - base * members.length).toFixed(2));
  return members.map((member, index) => ({
    user_id: member.id,
    share_amount: Number((base + (index === 0 ? remainder : 0)).toFixed(2)),
  }));
}

// Render expense creation form with split modes.
function AddExpense() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [form, setForm] = useState({ title: '', total_amount: '', category: 'Other', paid_by: '', split_type: 'EQUAL' });
  const [percentages, setPercentages] = useState({});
  const [customAmounts, setCustomAmounts] = useState({});

  // Load group members for split and payer selection.
  const loadMembers = async () => {
    setLoading(true);
    try {
      const response = await getMembers(groupId);
      const list = response.data || [];
      setMembers(list);
      if (list[0]) {
        setForm((prev) => ({ ...prev, paid_by: prev.paid_by || list[0].id }));
      }
      const pct = {};
      const custom = {};
      list.forEach((member) => {
        pct[member.id] = list.length ? Number((100 / list.length).toFixed(2)) : 0;
        custom[member.id] = 0;
      });
      setPercentages(pct);
      setCustomAmounts(custom);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  // Fetch members on first load.
  useEffect(() => {
    loadMembers();
  }, [groupId]);

  // Calculate split preview based on selected split mode.
  const previewSplits = useMemo(() => {
    const total = Number(form.total_amount || 0);
    if (!total || members.length === 0) return [];

    if (form.split_type === 'EQUAL') {
      return buildEqualSplits(total, members);
    }

    if (form.split_type === 'PERCENTAGE') {
      let allocated = 0;
      return members.map((member, index) => {
        const percentage = Number(percentages[member.id] || 0);
        let share = Number(((total * percentage) / 100).toFixed(2));
        if (index === members.length - 1) {
          share = Number((total - allocated).toFixed(2));
        } else {
          allocated = Number((allocated + share).toFixed(2));
        }
        return { user_id: member.id, share_amount: share };
      });
    }

    return members.map((member) => ({
      user_id: member.id,
      share_amount: Number(Number(customAmounts[member.id] || 0).toFixed(2)),
    }));
  }, [form.total_amount, form.split_type, members, percentages, customAmounts]);

  // Return aggregate validation metrics for current split inputs.
  const splitValidation = useMemo(() => {
    const total = Number(form.total_amount || 0);
    const splitSum = previewSplits.reduce((sum, item) => sum + Number(item.share_amount || 0), 0);
    const percentSum = members.reduce((sum, member) => sum + Number(percentages[member.id] || 0), 0);
    return {
      total,
      splitSum: Number(splitSum.toFixed(2)),
      percentSum: Number(percentSum.toFixed(2)),
      remaining: Number((total - splitSum).toFixed(2)),
    };
  }, [form.total_amount, previewSplits, percentages, members]);

  // Submit expense creation payload to backend.
  const onSubmit = async (event) => {
    event.preventDefault();
    if (!form.paid_by) {
      toast.error('Please select payer');
      return;
    }

    if (form.split_type === 'PERCENTAGE' && Math.abs(splitValidation.percentSum - 100) > 0.01) {
      toast.error('Percentage must total 100%');
      return;
    }

    if (Math.abs(splitValidation.total - splitValidation.splitSum) > 0.01) {
      toast.error('Split amounts must match total');
      return;
    }

    setSubmitLoading(true);
    try {
      const payload = {
        title: form.title,
        total_amount: Number(form.total_amount),
        split_type: form.split_type,
        paid_by: form.paid_by,
        category: form.category,
        splits: previewSplits,
      };
      await addExpense(groupId, payload);
      toast.success(`Expense added! ${formatInr(form.total_amount)} split among ${members.length} people`);
      navigate(`/groups/${groupId}`);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to add expense');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="section-card">
          <h1 className="text-2xl font-bold text-gray-800 mb-1">Add Expense</h1>
          <p className="text-sm text-gray-500 mb-6">Create a new expense and split it among members.</p>

          {loading ? (
            <p className="text-sm text-gray-500">Loading members...</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-gray-500">No members found in this group.</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <input className="input-field" placeholder="Title" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} required />
              <input className="input-field" type="number" step="0.01" min="0.01" placeholder="Total Amount" value={form.total_amount} onChange={(event) => setForm((prev) => ({ ...prev, total_amount: event.target.value }))} required />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <select className="input-field" value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
                  <option>Food</option>
                  <option>Travel</option>
                  <option>Hotel</option>
                  <option>Shopping</option>
                  <option>Utilities</option>
                  <option>Other</option>
                </select>
                <select className="input-field" value={form.paid_by} onChange={(event) => setForm((prev) => ({ ...prev, paid_by: event.target.value }))}>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      Paid By: {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                {['EQUAL', 'PERCENTAGE', 'CUSTOM'].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, split_type: type }))}
                    className={`px-4 py-2 rounded-xl border ${
                      form.split_type === type ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 bg-white'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {form.split_type === 'PERCENTAGE' && (
                <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                  <p className="text-sm text-gray-500">Total: {splitValidation.percentSum.toFixed(2)}%</p>
                  {members.map((member) => (
                    <div key={member.id} className="grid grid-cols-2 gap-2 items-center">
                      <label className="text-sm text-gray-700">{member.name}</label>
                      <input
                        className="input-field"
                        type="number"
                        step="0.01"
                        value={percentages[member.id] ?? 0}
                        onChange={(event) => setPercentages((prev) => ({ ...prev, [member.id]: Number(event.target.value || 0) }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {form.split_type === 'CUSTOM' && (
                <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                  <p className="text-sm text-gray-500">{formatInr(splitValidation.remaining)} remaining to allocate</p>
                  {members.map((member) => (
                    <div key={member.id} className="grid grid-cols-2 gap-2 items-center">
                      <label className="text-sm text-gray-700">{member.name}</label>
                      <input
                        className="input-field"
                        type="number"
                        step="0.01"
                        value={customAmounts[member.id] ?? 0}
                        onChange={(event) => setCustomAmounts((prev) => ({ ...prev, [member.id]: Number(event.target.value || 0) }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border border-gray-100 p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Split Preview</h2>
                <div className="space-y-2">
                  {previewSplits.map((item) => {
                    const member = members.find((m) => m.id === item.user_id);
                    return (
                      <div key={item.user_id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{member?.name || 'Member'}</span>
                        <span className="font-medium text-gray-800">{formatInr(item.share_amount)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="btn-primary disabled:opacity-60"
              >
                {submitLoading ? 'Adding expense...' : 'Add Expense'}
              </button>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export default AddExpense;
