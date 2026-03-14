import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import {
  confirmSettlementManually,
  createSettlementWithLink,
  getSuggested,
} from '../api';
import Modal from '../components/Modal';
import Navbar from '../components/Navbar';

// Format numeric values as INR currency strings.
function formatInr(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Build two-letter avatar initials from full name.
function getInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'NA';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

// Render combined-algorithm settlement suggestions with payment actions.
function Settlement() {
  const { groupId } = useParams();
  const [suggestions, setSuggestions] = useState([]);
  const [stats, setStats] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState({});
  const [pageLoading, setPageLoading] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);
  const [pendingSettlement, setPendingSettlement] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [qrModal, setQrModal] = useState({
    open: false,
    upi_id: '',
    name: '',
    amount: 0,
  });

  // Fetch optimized suggestions and optimization stats from backend.
  const fetchSettlements = async () => {
    setPageLoading(true);
    try {
      const res = await getSuggested(groupId);
      setSuggestions(res.data?.suggestions || []);
      setStats(res.data?.stats || null);
      setMessage(res.data?.message || '');
    } catch (err) {
      toast.error('Failed to load settlements');
      setSuggestions([]);
      setStats(null);
      setMessage('');
    } finally {
      setPageLoading(false);
    }
  };

  // Trigger data load when the selected group changes.
  useEffect(() => {
    fetchSettlements();
  }, [groupId]);

  // Compute saved payment count for display cards.
  const savedPayments = useMemo(() => {
    if (!stats) return 0;
    return Math.max(0, Number(stats.without_optimization || 0) - Number(stats.with_optimization || 0));
  }, [stats]);

  // Build a UPI deep-link URI for QR-based payment.
  const buildUpiLink = (toUpiId, toUserName, amount) => {
    return `upi://pay?pa=${encodeURIComponent(toUpiId || '')}&pn=${encodeURIComponent(
      toUserName || ''
    )}&am=${Number(amount || 0).toFixed(2)}&cu=INR&tn=SplitSmart`;
  };

  // Open modal with QR data for the selected settlement suggestion.
  const openQrModal = (item) => {
    setQrModal({
      open: true,
      upi_id: item.to_upi_id || '',
      name: item.to_user_name || '',
      amount: Number(item.amount || 0),
    });
  };

  // Reset QR modal state and close the modal UI.
  const closeQrModal = () => {
    setQrModal({ open: false, upi_id: '', name: '', amount: 0 });
  };

  const handlePayNow = async (suggestion) => {
    /**
     * Step 1: Create settlement record in DB
     * Step 2: Open Razorpay static link in new tab
     * Step 3: Show "I have paid" confirmation modal
     * Step 4: On confirm -> mark as CONFIRMED in DB
     * Step 5: Refresh settlement list
     */
    setLoading((prev) => ({ ...prev, [suggestion.from_user_id]: true }));

    try {
      // Step 1: Create settlement record.
      const res = await createSettlementWithLink({
        group_id: groupId,
        from_user_id: suggestion.from_user_id,
        to_user_id: suggestion.to_user_id,
        amount: suggestion.amount,
      });

      const { settlement_id, amount, payment_link } = res.data || {};

      // Store pending settlement for confirmation.
      setPendingSettlement({
        settlement_id,
        amount: Number(amount || 0),
        from_user_name: suggestion.from_user_name,
        to_user_name: suggestion.to_user_name,
      });

      // Step 2: Open Razorpay link in new tab.
      window.open(payment_link, '_blank');

      // Step 3: Show confirmation modal.
      setShowConfirmModal(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to initiate payment');
    } finally {
      setLoading((prev) => ({ ...prev, [suggestion.from_user_id]: false }));
    }
  };

  const handleConfirmPayment = async () => {
    /**
     * Called when user clicks "I Have Paid" button.
     * Marks the settlement as CONFIRMED in database.
     * Refreshes the settlement list.
     */
    if (!pendingSettlement) return;
    setConfirming(true);

    try {
      await confirmSettlementManually(pendingSettlement.settlement_id);

      toast.success(`✅ Payment of ₹${Number(pendingSettlement.amount || 0).toFixed(2)} confirmed!`);

      // Close modal and reset state.
      setShowConfirmModal(false);
      setPendingSettlement(null);

      // Refresh settlements - list will update.
      fetchSettlements();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Could not confirm payment');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancelPayment = () => {
    /**
     * User dismissed without paying.
     * Settlement stays PENDING - can retry later.
     */
    setShowConfirmModal(false);
    setPendingSettlement(null);
    toast('Payment cancelled. You can pay later.', { icon: '⚠️' });
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <Navbar />
      <main className="pt-20 bg-gray-50 min-h-screen p-6 max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Settlement</h1>

        {pageLoading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-sm text-gray-600">Loading optimized settlements...</div>
        ) : (
          <>
            {stats ? (
              <section className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6">
                <p className="text-lg font-bold text-indigo-900">⚡ SplitSmart Optimization</p>
                <div className="mt-4 space-y-2 text-sm">
                  <p className="text-red-600 line-through">
                    Without optimization: {Number(stats.without_optimization || 0)} transactions
                  </p>
                  <p className="text-indigo-700">↓ reduced to ↓</p>
                  <p className="text-gray-700">
                    Phase 1 (Mutual Netting): eliminated {Number(stats.phase1_eliminated || 0)} debts
                  </p>
                  <p className="text-gray-700">
                    Phase 2 (Greedy MCF): resolved in {Number(stats.phase2_resolved || 0)} steps
                  </p>
                  <p className="text-indigo-700">↓ reduced to ↓</p>
                  <p className="text-green-700 font-bold">
                    With SplitSmart: {Number(stats.with_optimization || 0)} transactions ✅
                  </p>
                </div>

                <p className="mt-4 text-2xl font-extrabold text-indigo-700">
                  You save {savedPayments} unnecessary payments ({Number(stats.reduction_percentage || 0).toFixed(1)}% reduction)
                </p>
                <p className="mt-2 text-xs text-gray-500 font-mono">
                  Algorithm: {stats.algorithm_used || 'Combined: Mutual Netting + Greedy MCF'}
                </p>
                {message ? <p className="mt-2 text-sm text-gray-700">{message}</p> : null}
              </section>
            ) : null}

            <section>
              <button
                type="button"
                onClick={() => setShowExplanation((prev) => !prev)}
                className="text-sm font-medium text-indigo-700 hover:text-indigo-900"
              >
                How does this work? {showExplanation ? '▲' : '▼'}
              </button>

              {showExplanation ? (
                <div className="mt-3 bg-gray-50 border rounded-xl p-4 text-sm text-gray-600 space-y-4">
                  <div>
                    <p className="font-semibold text-gray-800">Phase 1 — Mutual Debt Netting</p>
                    <p>
                      If A owes B and B owes A, we cancel the smaller and keep only the net difference. Eliminates circular debts before solving.
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">Phase 2 — Greedy Min Cash Flow</p>
                    <p>
                      Repeatedly match the biggest creditor with the biggest debtor. Settle the minimum of the two. Guarantees at most N-1 transactions for N people.
                    </p>
                  </div>
                </div>
              ) : null}
            </section>

            {suggestions.length === 0 && stats ? (
              <section className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
                <h2 className="text-2xl font-bold text-green-700">🎉 All Settled Up!</h2>
                <p className="mt-2 text-green-800">No pending payments in this group.</p>
                <p className="mt-2 text-green-700">
                  The group completed {Number(stats.with_optimization || 0)} transactions total using our optimization algorithm.
                </p>
              </section>
            ) : (
              <section className="space-y-4">
                {suggestions.map((item) => {
                  const loadKey = Boolean(loading[item.from_user_id]);
                  return (
                    <div key={`${item.from_user_id}-${item.to_user_id}`} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                      <div className="flex items-center justify-between text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                            {getInitials(item.from_user_name)}
                          </span>
                          <span className="font-semibold">{item.from_user_name}</span>
                        </div>
                        <span className="text-gray-500">→</span>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700 font-semibold">
                            {getInitials(item.to_user_name)}
                          </span>
                          <span className="font-semibold">{item.to_user_name}</span>
                        </div>
                      </div>

                      <p className="mt-4 text-center text-3xl font-bold text-indigo-700">{formatInr(item.amount)}</p>
                      <p className="mt-3 text-sm text-gray-600">UPI: {item.to_upi_id || 'Not available'}</p>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => openQrModal(item)}
                          disabled={!item.to_upi_id}
                          className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          📱 Show QR Code
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePayNow(item)}
                          disabled={loadKey}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {loadKey ? (
                            <>
                              <span className="animate-spin">⏳</span>
                              Processing...
                            </>
                          ) : (
                            <>💳 Pay ₹{Number(item.amount || 0).toFixed(2)}</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </main>

      <Modal isOpen={qrModal.open} title="UPI QR Payment" onClose={closeQrModal}>
        <div className="flex flex-col items-center gap-3">
          <QRCodeSVG value={buildUpiLink(qrModal.upi_id, qrModal.name, qrModal.amount)} size={220} />
          <p className="text-sm text-gray-600 text-center">Scan with any UPI app to pay directly</p>
          <p className="text-sm text-gray-700 font-medium">UPI ID: {qrModal.upi_id || 'Unavailable'}</p>
          <p className="text-sm text-gray-700">Amount: {formatInr(qrModal.amount)}</p>
        </div>
      </Modal>

      {showConfirmModal && pendingSettlement && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">💳</div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Complete Your Payment</h3>
              <p className="text-sm text-gray-500">A Razorpay payment page has opened in a new tab</p>
            </div>

            <div className="bg-indigo-50 rounded-xl p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">You are paying</span>
                <span className="font-bold text-indigo-600 text-lg">₹{Number(pendingSettlement.amount || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">From</span>
                <span className="text-sm font-medium text-gray-800">{pendingSettlement.from_user_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">To</span>
                <span className="text-sm font-medium text-gray-800">{pendingSettlement.to_user_name}</span>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  1
                </div>
                <span>Complete payment on the Razorpay page that opened</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  2
                </div>
                <span>Come back here and click "I Have Paid" below</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <div className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  3
                </div>
                <span>Balance updates automatically</span>
              </div>
            </div>

            <button
              onClick={() => window.open('https://rzp.io/rzp/WJbwPea', '_blank')}
              className="w-full border border-indigo-300 text-indigo-600 py-2 rounded-xl text-sm hover:bg-indigo-50 mb-3 transition-all"
            >
              🔗 Reopen Payment Page
            </button>

            <button
              onClick={handleConfirmPayment}
              disabled={confirming}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-semibold disabled:opacity-50 transition-all mb-3"
            >
              {confirming ? '⏳ Confirming...' : '✅ I Have Paid - Confirm Settlement'}
            </button>

            <button
              onClick={handleCancelPayment}
              className="w-full text-gray-400 text-sm hover:text-gray-600 py-2 transition-all"
            >
              I haven't paid yet - cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settlement;
