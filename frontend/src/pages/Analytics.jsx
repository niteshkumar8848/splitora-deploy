import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAnomalies, getBalances, getFairness, getMembers, getSpending, reverseExpense } from '../api';
import Footer from '../components/Footer';
import FairnessScore from '../components/FairnessScore';
import Navbar from '../components/Navbar';

// Convert number to INR currency string.
function formatInr(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Compute minimum cash flow transaction count for balances.
function countMinCashFlowTransactions(balanceMap) {
  const balances = { ...balanceMap };
  const entries = Object.entries(balances).map(([id, value]) => [id, Number(value.toFixed(2))]);
  let count = 0;

  while (true) {
    const nonZero = entries.filter(([, value]) => Math.abs(value) > 0.01);
    if (!nonZero.length) break;

    let creditor = nonZero[0];
    let debtor = nonZero[0];
    nonZero.forEach((entry) => {
      if (entry[1] > creditor[1]) creditor = entry;
      if (entry[1] < debtor[1]) debtor = entry;
    });

    const settle = Math.min(creditor[1], Math.abs(debtor[1]));
    creditor[1] = Number((creditor[1] - settle).toFixed(2));
    debtor[1] = Number((debtor[1] + settle).toFixed(2));
    count += 1;
  }

  return count;
}

// Render analytics dashboard for spending, fairness, anomalies, and simulation.
function Analytics() {
  const { groupId } = useParams();
  const [spending, setSpending] = useState([]);
  const [fairness, setFairness] = useState({ score: 0, label: 'Poor', members: [], next_payer_suggestion: 'N/A' });
  const [anomalies, setAnomalies] = useState([]);
  const [members, setMembers] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simInput, setSimInput] = useState({ amount: '', category: 'Food', payer: '' });

  // Load analytics and balance datasets.
  const loadData = async () => {
    setLoading(true);
    try {
      const [spendingRes, fairnessRes, anomaliesRes, membersRes, balancesRes] = await Promise.all([
        getSpending(groupId),
        getFairness(groupId),
        getAnomalies(groupId),
        getMembers(groupId),
        getBalances(groupId),
      ]);
      const memberList = membersRes.data || [];
      setSpending(spendingRes.data || []);
      setFairness(fairnessRes.data || { score: 0, label: 'Poor', members: [], next_payer_suggestion: 'N/A' });
      setAnomalies(anomaliesRes.data || []);
      setMembers(memberList);
      setBalances(balancesRes.data || []);
      if (memberList[0]) {
        setSimInput((prev) => ({ ...prev, payer: prev.payer || memberList[0].id }));
      }
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  // Fetch analytics data on mount.
  useEffect(() => {
    loadData();
  }, [groupId]);

  // Build chart colors by expense category.
  const pieColors = {
    Food: '#f97316',
    Travel: '#3b82f6',
    Hotel: '#8b5cf6',
    Shopping: '#ec4899',
    Utilities: '#06b6d4',
    Other: '#6b7280',
  };

  // Remove an anomaly from visible list after marking legitimate.
  const markLegitimate = (expenseId) => {
    setAnomalies((prev) => prev.filter((item) => item.expense_id !== expenseId));
    toast.success('Marked as legitimate');
  };

  // Reverse an anomalous expense and reload analytics.
  const reverseAnomalyExpense = async (expenseId) => {
    try {
      await reverseExpense(expenseId);
      toast.success('Expense reversed');
      await loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to reverse expense');
    }
  };

  // Compute simulation output for hypothetical new expense.
  const simulation = useMemo(() => {
    const amount = Number(simInput.amount || 0);
    if (!amount || members.length === 0 || !simInput.payer) return null;

    const before = {};
    balances.forEach((item) => {
      before[item.user_id] = Number(item.balance || 0);
    });

    const perMember = Number((amount / members.length).toFixed(2));
    const after = { ...before };
    members.forEach((member, index) => {
      const adjustment = index === 0 ? Number((amount - perMember * members.length + perMember).toFixed(2)) : perMember;
      after[member.id] = Number((after[member.id] - adjustment).toFixed(2));
    });
    after[simInput.payer] = Number((after[simInput.payer] + amount).toFixed(2));

    const beforeCount = countMinCashFlowTransactions(before);
    const afterCount = countMinCashFlowTransactions(after);

    return { before, after, beforeCount, afterCount };
  }, [simInput, members, balances]);

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>

        {loading ? (
          <p className="text-sm text-gray-500">Loading analytics...</p>
        ) : (
          <>
            <section className="section-card">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Spending by Category</h2>
              {spending.length === 0 ? (
                <p className="text-sm text-gray-500">No spending data available yet.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={spending} dataKey="total_amount" nameKey="category" outerRadius={110} label={({ category, percentage }) => `${category} (${percentage}%)`}>
                        {spending.map((entry) => (
                          <Cell key={entry.category} fill={pieColors[entry.category] || pieColors.Other} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatInr(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="section-card">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Fairness Score</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                <FairnessScore score={fairness.score} label={fairness.label} />
                <div>
                  <p className="text-sm text-gray-500 mb-3">💡 Next expense should be paid by: <strong>{fairness.next_payer_suggestion}</strong></p>
                  {fairness.members?.length ? (
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={fairness.members}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="expected_percentage" fill="#9ca3af" name="Expected %" />
                          <Bar dataKey="paid_percentage" fill="#4f46e5" name="Actual %" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No contribution data available.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="section-card">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Anomaly Alerts</h2>
              {anomalies.length === 0 ? (
                <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-green-700 text-sm">No suspicious activity ✅</div>
              ) : (
                <div className="space-y-3">
                  {anomalies.map((item) => (
                    <div key={item.expense_id} className="border border-gray-100 rounded-xl p-4">
                      <p className="text-sm font-medium text-gray-800">⚠️ {item.title} — {item.reason}</p>
                      <p className="text-sm text-gray-500 mt-1">Amount: {formatInr(item.amount)} (Category average: {formatInr(item.category_average)})</p>
                      <div className="flex flex-wrap items-center justify-between mt-3 gap-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs ${
                            item.severity === 'HIGH'
                              ? 'bg-red-100 text-red-700'
                              : item.severity === 'MEDIUM'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {item.severity}
                        </span>
                        <div className="flex gap-2">
                          <button type="button" className="btn-secondary" onClick={() => markLegitimate(item.expense_id)}>
                            Mark Legitimate
                          </button>
                          <button type="button" className="btn-primary" onClick={() => reverseAnomalyExpense(item.expense_id)}>
                            Reverse Entry
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="section-card">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Simulation Mode</h2>
              <p className="text-sm text-gray-500 mb-4">This would NOT be saved to database</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <input className="input-field" type="number" min="0" step="0.01" placeholder="Amount" value={simInput.amount} onChange={(event) => setSimInput((prev) => ({ ...prev, amount: event.target.value }))} />
                <select className="input-field" value={simInput.category} onChange={(event) => setSimInput((prev) => ({ ...prev, category: event.target.value }))}>
                  <option>Food</option>
                  <option>Travel</option>
                  <option>Hotel</option>
                  <option>Shopping</option>
                  <option>Utilities</option>
                  <option>Other</option>
                </select>
                <select className="input-field" value={simInput.payer} onChange={(event) => setSimInput((prev) => ({ ...prev, payer: event.target.value }))}>
                  {members.map((member) => (
                    <option value={member.id} key={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-primary" onClick={() => setSimInput((prev) => ({ ...prev }))}>
                  Simulate
                </button>
              </div>
              {!simulation ? (
                <p className="text-sm text-gray-500">Enter a hypothetical expense to run simulation.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-gray-100 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Before</h3>
                    {members.map((member) => (
                      <p key={`before-${member.id}`} className="text-sm text-gray-600">
                        {member.name}: {formatInr(simulation.before[member.id] || 0)}
                      </p>
                    ))}
                    <p className="text-sm text-gray-500 mt-2">Settlement transactions: {simulation.beforeCount}</p>
                  </div>
                  <div className="border border-gray-100 rounded-xl p-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">After</h3>
                    {members.map((member) => (
                      <p key={`after-${member.id}`} className="text-sm text-gray-600">
                        {member.name}: {formatInr(simulation.after[member.id] || 0)}
                      </p>
                    ))}
                    <p className="text-sm text-gray-500 mt-2">Settlement transactions: {simulation.afterCount}</p>
                    <p className="text-sm text-gray-500">Change: {simulation.afterCount === simulation.beforeCount ? 'No change' : `${simulation.beforeCount} → ${simulation.afterCount}`}</p>
                  </div>
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

export default Analytics;
