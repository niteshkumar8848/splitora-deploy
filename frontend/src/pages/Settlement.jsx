import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import {
  getSuggested,
  createSettlementWithLink,
  confirmSettlementManually,
  getSettlementHistory
} from '../api'

const Settlement = () => {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()

  const [suggestions, setSuggestions] = useState([])
  const [stats, setStats] = useState(null)
  const [history, setHistory] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState({})
  const [pageLoading, setPageLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('pending')
  const [showExplain, setShowExplain] = useState(false)

  const fetchAll = async () => {
    /**
     * Fetches both pending suggestions and
     * payment history simultaneously.
     */
    setPageLoading(true)
    try {
      const [sugRes, histRes] = await Promise.all([
        getSuggested(groupId),
        getSettlementHistory(groupId)
      ])

      setSuggestions(sugRes.data.suggestions || [])
      setStats(sugRes.data.stats)

      setHistory(histRes.data.history || [])
      setSummary({
        total_expenses: histRes.data.total_expenses,
        total_settled: histRes.data.total_settled,
        pending: histRes.data.pending,
        count: histRes.data.count
      })
    } catch (err) {
      toast.error('Failed to load settlement data')
    } finally {
      setPageLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [groupId])

  const handlePayNow = async (suggestion) => {
    /**
     * 1. Create settlement record (PENDING)
     * 2. Open Razorpay static link in new tab
     * 3. Auto-confirm settlement (CONFIRMED)
     * 4. Refresh all data
     */
    setLoading(prev => ({
      ...prev,
      [suggestion.from_user_id]: true
    }))

    try {
      const res = await createSettlementWithLink({
        group_id: groupId,
        from_user_id: suggestion.from_user_id,
        to_user_id: suggestion.to_user_id,
        amount: suggestion.amount
      })

      const { settlement_id, payment_link } = res.data

      window.open(payment_link, '_blank')

      await confirmSettlementManually(settlement_id)

      toast.success(
        `✅ ₹${suggestion.amount.toFixed(2)} paid ` +
        `to ${suggestion.to_user_name}!`
      )

      fetchAll()
    } catch (err) {
      toast.error(
        err.response?.data?.detail ||
        'Payment failed. Try again.'
      )
    } finally {
      setLoading(prev => ({
        ...prev,
        [suggestion.from_user_id]: false
      }))
    }
  }

  return (
    <div className="pt-20 bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto p-6">
        <button
          onClick={() => navigate(`/groups/${groupId}`)}
          className="flex items-center gap-2 text-gray-500
               hover:text-gray-700 mb-6 text-sm"
        >
          ← Back to Group
        </button>

        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          💸 Settle Up
        </h1>

        {summary && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-white rounded-2xl p-4
                      border border-gray-100 text-center">
              <div className="text-xs text-gray-500 mb-1">
                Total Expenses
              </div>
              <div className="text-lg font-bold text-gray-800">
                ₹{summary.total_expenses.toFixed(2)}
              </div>
            </div>
            <div className="bg-green-50 rounded-2xl p-4
                      border border-green-100 text-center">
              <div className="text-xs text-green-600 mb-1">
                Total Settled
              </div>
              <div className="text-lg font-bold text-green-700">
                ₹{summary.total_settled.toFixed(2)}
              </div>
            </div>
            <div className="bg-red-50 rounded-2xl p-4
                      border border-red-100 text-center">
              <div className="text-xs text-red-500 mb-1">
                Still Pending
              </div>
              <div className="text-lg font-bold text-red-600">
                ₹{summary.pending.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {stats && suggestions.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-200
                    rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚡</span>
              <span className="font-semibold text-indigo-700">
                SplitSmart Optimization
              </span>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold
                          text-red-400 line-through">
                  {stats.without_optimization}
                </div>
                <div className="text-xs text-gray-500">
                  Without optimization
                </div>
              </div>
              <div className="text-2xl text-indigo-400">→</div>
              <div className="text-center">
                <div className="text-2xl font-bold
                          text-green-600">
                  {stats.with_optimization}
                </div>
                <div className="text-xs text-gray-500">
                  With SplitSmart
                </div>
              </div>
              <div className="ml-auto bg-indigo-600 text-white
                        px-3 py-1 rounded-full text-sm
                        font-semibold">
                {stats.reduction_percentage}% less
              </div>
            </div>

            <button
              onClick={() => setShowExplain(!showExplain)}
              className="mt-3 text-xs text-indigo-500
                   hover:text-indigo-700"
            >
              How does this work? {showExplain ? '▲' : '▼'}
            </button>
            {showExplain && (
              <div className="mt-3 text-xs text-gray-600
                        bg-white rounded-xl p-3
                        border border-indigo-100">
                <p className="mb-2">
                  <strong>Phase 1 — Mutual Netting:</strong>{' '}
                  Cancels circular debts between members.
                </p>
                <p>
                  <strong>Phase 2 — Greedy MCF:</strong>{' '}
                  Matches the largest creditor with the largest
                  debtor repeatedly until all balances = zero.
                  Guarantees at most N-1 transactions for
                  N people.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-2 rounded-xl text-sm
                  font-medium transition-all
                  ${activeTab === 'pending'
              ? 'bg-indigo-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Pending {suggestions.length > 0
              ? `(${suggestions.length})`
              : ''}
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-xl text-sm
                  font-medium transition-all
                  ${activeTab === 'history'
              ? 'bg-indigo-600 text-white'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            Payment History {history.length > 0
              ? `(${history.length})`
              : ''}
          </button>
        </div>

        {activeTab === 'pending' && (
          <div>
            {pageLoading ? (
              <div className="text-center py-12 text-gray-400">
                Loading...
              </div>
            ) : suggestions.length === 0 ? (
              <div className="bg-green-50 border
                        border-green-200 rounded-2xl
                        p-10 text-center">
                <div className="text-5xl mb-3">🎉</div>
                <h3 className="text-lg font-bold
                         text-green-700 mb-1">
                  All Settled Up!
                </h3>
                <p className="text-sm text-green-600">
                  No pending payments in this group.
                </p>
                {history.length > 0 && (
                  <button
                    onClick={() => setActiveTab('history')}
                    className="mt-4 text-sm text-indigo-600
                         hover:underline"
                  >
                    View payment history →
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {suggestions.map((s, idx) => {
                  const isMyPayment =
                    s.from_user_id === currentUser?.id
                  const isLoading =
                    loading[s.from_user_id]

                  return (
                    <div
                      key={idx}
                      className={`bg-white rounded-2xl
                            border p-5 transition-all
                            ${isMyPayment
                          ? 'border-indigo-200 shadow-sm'
                          : 'border-gray-100'
                        }`}
                    >
                      {isMyPayment && (
                        <div className="mb-3">
                          <span className="bg-indigo-100
                                     text-indigo-600
                                     text-xs font-semibold
                                     px-3 py-1 rounded-full">
                            Your payment
                          </span>
                        </div>
                      )}

                      <div className="flex items-center
                                gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full
                                  bg-red-100 flex items-center
                                  justify-center font-semibold
                                  text-red-600 text-sm
                                  flex-shrink-0">
                          {s.from_user_name
                            .split(' ')
                            .map(n => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                          }
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-semibold
                                    text-gray-800">
                            {s.from_user_name}
                          </div>
                          <div className="text-xs text-gray-400">
                            pays
                          </div>
                        </div>
                        <div className="text-gray-300 text-xl">
                          →
                        </div>
                        <div className="flex-1 text-right">
                          <div className="text-sm font-semibold
                                    text-gray-800">
                            {s.to_user_name}
                          </div>
                          {s.to_upi_id && (
                            <div className="text-xs text-gray-400">
                              {s.to_upi_id}
                            </div>
                          )}
                        </div>
                        <div className="w-10 h-10 rounded-full
                                  bg-green-100 flex items-center
                                  justify-center font-semibold
                                  text-green-600 text-sm
                                  flex-shrink-0">
                          {s.to_user_name
                            .split(' ')
                            .map(n => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()
                          }
                        </div>
                      </div>

                      <div className="text-center mb-4">
                        <div className="text-3xl font-bold
                                  text-indigo-600">
                          ₹{s.amount.toFixed(2)}
                        </div>
                      </div>

                      {isMyPayment ? (
                        <button
                          onClick={() => handlePayNow(s)}
                          disabled={isLoading}
                          className="w-full bg-indigo-600
                               hover:bg-indigo-700
                               text-white py-3 rounded-xl
                               font-semibold transition-all
                               disabled:opacity-60
                               flex items-center
                               justify-center gap-2"
                        >
                          {isLoading ? (
                            <>
                              <span className="animate-spin">
                                ⏳
                              </span>
                              Processing payment...
                            </>
                          ) : (
                            <>
                              💳 Pay ₹{s.amount.toFixed(2)}
                              via Razorpay
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="w-full bg-gray-100
                                  text-gray-400 py-3
                                  rounded-xl text-sm
                                  text-center">
                          ⏳ Waiting for{' '}
                          {s.from_user_name.split(' ')[0]}
                          {' '}to pay
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {history.length === 0 ? (
              <div className="bg-white rounded-2xl border
                        border-gray-100 p-10 text-center">
                <div className="text-4xl mb-3">📋</div>
                <p className="text-gray-500 text-sm">
                  No payments made yet.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((h, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border
                         border-gray-100 p-4"
                  >
                    <div className="flex items-center
                              justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-green-500 text-lg">
                          ✅
                        </span>
                        <span className="text-sm font-semibold
                                   text-gray-800">
                          Payment Confirmed
                        </span>
                      </div>
                      <span className="text-lg font-bold
                                 text-green-600">
                        ₹{h.amount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2
                              mb-3 text-sm text-gray-600">
                      <div className="w-8 h-8 rounded-full
                                bg-red-100 text-red-600
                                flex items-center
                                justify-center text-xs
                                font-bold flex-shrink-0">
                        {h.from_user_name
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()
                        }
                      </div>
                      <span className="font-medium text-gray-800">
                        {h.from_user_name}
                      </span>
                      <span className="text-gray-400 text-xs">
                        paid
                      </span>
                      <div className="w-8 h-8 rounded-full
                                bg-green-100 text-green-600
                                flex items-center
                                justify-center text-xs
                                font-bold flex-shrink-0">
                        {h.to_user_name
                          .split(' ')
                          .map(n => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()
                        }
                      </div>
                      <span className="font-medium text-gray-800">
                        {h.to_user_name}
                      </span>
                    </div>

                    <div className="flex items-center
                              justify-between pt-3
                              border-t border-gray-100">
                      <div className="text-xs text-gray-400">
                        📅{' '}
                        {h.confirmed_at
                          ? new Date(h.confirmed_at)
                            .toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : '-'
                        }
                      </div>
                      <div className="text-xs font-mono
                                text-gray-400 bg-gray-50
                                px-2 py-1 rounded-lg">
                        {h.payment_ref}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Settlement
