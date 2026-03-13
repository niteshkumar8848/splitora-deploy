import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { createSettlement, getBalances, getMembers, getSuggested } from '../api';
import DebtGraph from '../components/DebtGraph';
import Footer from '../components/Footer';
import Modal from '../components/Modal';
import Navbar from '../components/Navbar';

// Format a numeric amount to INR string.
function formatInr(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Render settlement optimization and payment actions.
function Settlement() {
  const { groupId } = useParams();
  const [members, setMembers] = useState([]);
  const [balances, setBalances] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState('');
  const [qrItem, setQrItem] = useState(null);

  // Load members, balances, and optimized suggestions.
  const loadData = async () => {
    setLoading(true);
    try {
      const [membersRes, balancesRes, suggestionsRes] = await Promise.all([
        getMembers(groupId),
        getBalances(groupId),
        getSuggested(groupId),
      ]);
      setMembers(membersRes.data || []);
      setBalances(balancesRes.data || []);
      setSuggestions(suggestionsRes.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load settlement data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch settlement data on mount.
  useEffect(() => {
    loadData();
  }, [groupId]);

  // Build a map of userId to net balance for graph view.
  const balanceMap = useMemo(() => {
    const map = {};
    balances.forEach((item) => {
      map[item.user_id] = Number(item.balance || 0);
    });
    return map;
  }, [balances]);

  // Calculate baseline and optimized transaction counts.
  const stats = useMemo(() => {
    const creditors = balances.filter((item) => Number(item.balance) > 0.01).length;
    const debtors = balances.filter((item) => Number(item.balance) < -0.01).length;
    const beforeCount = creditors * debtors;
    const afterCount = suggestions.length;
    const reduction = beforeCount > 0 ? Number((((beforeCount - afterCount) / beforeCount) * 100).toFixed(2)) : 0;
    return { beforeCount, afterCount, reduction };
  }, [balances, suggestions]);

  // Build UPI URI for direct payment QR code.
  const getUpiLink = (item) => {
    return `upi://pay?pa=${encodeURIComponent(item.to_upi_id || '')}&pn=${encodeURIComponent(item.to_user_name)}&am=${Number(item.amount).toFixed(2)}&cu=INR`;
  };

  // Open Razorpay checkout for selected settlement.
  const payNow = async (item) => {
    setPayingId(`${item.from_user_id}-${item.to_user_id}`);
    try {
      const response = await createSettlement({
        group_id: groupId,
        from_user_id: item.from_user_id,
        to_user_id: item.to_user_id,
        amount: Number(item.amount),
      });

      const orderId = response.data.razorpay_order_id;
      const key = import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!key) {
        toast.error('Razorpay key is not configured');
        return;
      }
      const options = {
        key,
        amount: Math.round(Number(item.amount) * 100),
        currency: 'INR',
        name: 'Splitora',
        description: `Settlement payment to ${item.to_user_name}`,
        order_id: orderId,
        handler: async () => {
          toast.success('Payment successful! Settlement will sync shortly.');
          await loadData();
        },
        prefill: {
          name: item.from_user_name,
        },
      };

      if (!window.Razorpay) {
        toast.error('Razorpay SDK not loaded');
        return;
      }

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to initiate payment');
    } finally {
      setPayingId('');
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">💸 Settle Up</h1>

        <section className="section-card grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">Without optimization</p>
            <p className="text-lg font-semibold text-gray-800">{stats.beforeCount} transactions needed</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">With Splitora</p>
            <p className="text-lg font-semibold text-gray-800">{stats.afterCount} transactions</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Reduction</p>
            <p className="text-lg font-semibold text-green-600">{stats.reduction.toFixed(2)}%</p>
          </div>
        </section>

        <DebtGraph members={members} balances={balanceMap} suggestions={suggestions} mode="after" />

        <section className="section-card">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Suggested Settlements</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading suggestions...</p>
          ) : suggestions.length === 0 ? (
            <p className="text-sm text-green-700">🎉 All debts cleared! Great job team.</p>
          ) : (
            <div className="space-y-3">
              {suggestions.map((item) => (
                <div key={`${item.from_user_id}-${item.to_user_id}`} className="border border-gray-100 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-700">
                      <strong>{item.from_user_name}</strong> → <strong>{item.to_user_name}</strong>
                    </p>
                    <p className="text-indigo-600 text-xl font-semibold">{formatInr(item.amount)}</p>
                    <p className="text-sm text-gray-500">UPI: {item.to_upi_id || 'Not provided'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setQrItem(item)} className="btn-secondary" disabled={!item.to_upi_id}>
                      QR Code
                    </button>
                    <button type="button" onClick={() => payNow(item)} disabled={payingId === `${item.from_user_id}-${item.to_user_id}`} className="btn-primary disabled:opacity-60">
                      {payingId === `${item.from_user_id}-${item.to_user_id}` ? 'Processing...' : 'Pay Now'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />

      <Modal isOpen={Boolean(qrItem)} title="Scan to Pay" onClose={() => setQrItem(null)}>
        {qrItem ? (
          <div className="flex flex-col items-center gap-3">
            <QRCodeSVG value={getUpiLink(qrItem)} size={220} />
            <p className="text-sm text-gray-500 text-center">
              Pay {formatInr(qrItem.amount)} to {qrItem.to_user_name}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default Settlement;
