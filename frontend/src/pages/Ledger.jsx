import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { getExpenses, getBalances } from '../api'

export default function Ledger() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()

  const [expenses, setExpenses] = useState([])
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    fetchData()
  }, [groupId])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [expRes, balRes] = await Promise.all([
        getExpenses(groupId),
        getBalances(groupId),
      ])

      setExpenses(Array.isArray(expRes?.data) ? expRes?.data : [])
      setBalances(Array.isArray(balRes?.data) ? balRes?.data : [])
    } catch (err) {
      console.error('Ledger fetch error:', err)
      setError('Failed to load ledger data.')
      toast.error('Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (val) => {
    const n = parseFloat(val)
    return Number.isNaN(n) ? '0.00' : n.toFixed(2)
  }

  const getMyShare = (expense) => {
    if (!currentUser?.id) return 0
    const splits = Array.isArray(expense?.splits) ? expense?.splits : []
    const mySplit = splits.find((s) => s?.user_id === currentUser?.id)
    return parseFloat(mySplit?.share_amount || 0)
  }

  const safeExpenses = Array.isArray(expenses) ? expenses : []

  const totalSpent = safeExpenses
    .filter((e) => !e?.is_reversal)
    .reduce((sum, e) => sum + parseFloat(e?.total_amount || 0), 0)

  const youPaid = safeExpenses
    .filter((e) => !e?.is_reversal && e?.paid_by_id === currentUser?.id)
    .reduce((sum, e) => sum + parseFloat(e?.total_amount || 0), 0)

  const myBalance = Array.isArray(balances)
    ? balances.find((b) => b?.user_id === currentUser?.id)?.balance || 0
    : 0

  const filtered = safeExpenses.filter((e) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'expenses') return !e?.is_reversal
    if (activeFilter === 'reversals') return !!e?.is_reversal
    return true
  })

  const formatDate = (dateStr) => {
    if (!dateStr) return '\u2014'
    try {
      const d = new Date(dateStr)
      if (Number.isNaN(d?.getTime?.())) return dateStr || '\u2014'
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return dateStr || '\u2014'
    }
  }

  const getInitials = (name) => {
    if (!name || typeof name !== 'string') return '?'
    return name
      .split(' ')
      .map((n) => n?.[0] || '')
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  return (
    <div className="pt-20 bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto p-6">
        <button
          onClick={() => navigate(`/groups/${groupId || ''}`)}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-6 text-sm"
        >
          {'\u2190'} Back to Group
        </button>

        <h1 className="text-2xl font-bold text-gray-800 mb-6">{'\ud83d\udccb'} Ledger</h1>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse"
              >
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <div className="text-3xl mb-2">{'\u26a0\ufe0f'}</div>
            <p className="text-red-600 text-sm mb-4">{error || 'Something went wrong.'}</p>
            <button
              onClick={fetchData}
              className="bg-red-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-red-700"
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
                <div className="text-xs text-gray-500 mb-1">Total Spent</div>
                <div className="text-base font-bold text-gray-800">₹{fmt(totalSpent || 0)}</div>
              </div>

              <div className="bg-green-50 rounded-2xl border border-green-100 p-4 text-center">
                <div className="text-xs text-green-600 mb-1">You Paid</div>
                <div className="text-base font-bold text-green-700">₹{fmt(youPaid || 0)}</div>
              </div>

              <div
                className={`rounded-2xl border p-4 text-center ${
                  parseFloat(myBalance || 0) >= 0
                    ? 'bg-green-50 border-green-100'
                    : 'bg-red-50 border-red-100'
                }`}
              >
                <div
                  className={`text-xs mb-1 ${
                    parseFloat(myBalance || 0) >= 0 ? 'text-green-600' : 'text-red-500'
                  }`}
                >
                  Your Balance
                </div>
                <div
                  className={`text-base font-bold ${
                    parseFloat(myBalance || 0) >= 0 ? 'text-green-700' : 'text-red-600'
                  }`}
                >
                  {parseFloat(myBalance || 0) >= 0 ? '+' : ''}₹
                  {fmt(Math.abs(parseFloat(myBalance || 0)) || 0)}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
              {[{ key: 'all', label: 'All' }, { key: 'expenses', label: 'Expenses' }, { key: 'reversals', label: 'Reversals' }].map((f) => (
                <button
                  key={f?.key || f?.label || Math.random()}
                  onClick={() => setActiveFilter(f?.key || 'all')}
                  className={`
                    px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0
                    ${
                      activeFilter === (f?.key || 'all')
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                    }
                  `}
                >
                  {f?.label || 'Filter'}
                  {(f?.key || '') === 'all' && (safeExpenses?.length || 0) > 0
                    ? ` (${safeExpenses?.length || 0})`
                    : ''}
                </button>
              ))}
            </div>

            {(filtered?.length || 0) === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
                <div className="text-4xl mb-3">{'\ud83d\udced'}</div>
                <p className="text-gray-500 text-sm">No expenses yet.</p>
                <button
                  onClick={() => navigate(`/groups/${groupId || ''}/add-expense`)}
                  className="mt-4 bg-indigo-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-indigo-700"
                >
                  + Add Expense
                </button>
              </div>
            )}

            <div className="space-y-3">
              {(Array.isArray(filtered) ? filtered : []).map((expense, idx) => {
                const expId = expense?.id || `exp-${idx}`
                const title = expense?.title || 'Untitled'
                const amount = parseFloat(expense?.total_amount || 0)
                const payer = expense?.paid_by_name || 'Unknown'
                const category = expense?.category || 'Other'
                const date = formatDate(expense?.created_at || '')
                const isRev = !!expense?.is_reversal
                const splits = Array.isArray(expense?.splits) ? expense?.splits : []
                const myShare = getMyShare(expense)
                const isExpanded = expandedId === expId

                return (
                  <div
                    key={expId}
                    className={`
                      bg-white rounded-2xl border overflow-hidden transition-all
                      ${isRev ? 'border-l-4 border-l-red-400 border-gray-100' : 'border-gray-100'}
                    `}
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : expId)}
                      className="w-full p-4 text-left"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 pr-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-800 text-sm">{title || 'Untitled'}</span>
                            {isRev && (
                              <span className="bg-red-100 text-red-500 text-xs px-2 py-0.5 rounded-full font-medium">
                                REVERSED
                              </span>
                            )}
                            <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                              {category || 'Other'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            {(payer || 'Unknown')} paid {'\u00b7'} {date || '\u2014'}
                          </div>
                          {myShare !== 0 && (
                            <div
                              className={`text-xs mt-1 font-medium ${
                                myShare > 0 ? 'text-red-500' : 'text-green-600'
                              }`}
                            >
                              Your share: {myShare > 0 ? ' -' : ' +'}₹
                              {fmt(Math.abs(parseFloat(myShare || 0)) || 0)}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div
                            className={`font-bold text-sm ${
                              isRev ? 'text-red-500' : 'text-gray-800'
                            }`}
                          >
                            {isRev ? '-' : ''}₹{fmt(amount || 0)}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">{isExpanded ? '\u25b2' : '\u25bc'}</div>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50 p-4">
                        <div className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
                          Split Details
                        </div>

                        {(splits?.length || 0) === 0 ? (
                          <p className="text-xs text-gray-400">No split details</p>
                        ) : (
                          <div className="space-y-2">
                            {(Array.isArray(splits) ? splits : []).map((split, si) => {
                              const isMe = split?.user_id === currentUser?.id
                              const sName = split?.user_name || split?.name || 'Member'
                              const sAmt = parseFloat(split?.share_amount || 0)

                              return (
                                <div
                                  key={si}
                                  className={`
                                    flex items-center justify-between py-2 px-3 rounded-xl text-sm
                                    ${
                                      isMe
                                        ? 'bg-indigo-50 border border-indigo-100'
                                        : 'bg-white border border-gray-100'
                                    }
                                  `}
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={`
                                        w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                                        ${
                                          isMe
                                            ? 'bg-indigo-200 text-indigo-700'
                                            : 'bg-gray-200 text-gray-600'
                                        }
                                      `}
                                    >
                                      {getInitials(sName || 'Member')}
                                    </div>
                                    <span
                                      className={isMe ? 'font-semibold text-indigo-700' : 'text-gray-700'}
                                    >
                                      {sName || 'Member'}
                                      {isMe ? ' (you)' : ''}
                                    </span>
                                  </div>
                                  <span
                                    className={`font-semibold ${
                                      sAmt < 0
                                        ? 'text-green-600'
                                        : isMe
                                          ? 'text-red-500'
                                          : 'text-gray-700'
                                    }`}
                                  >
                                    {sAmt < 0 ? '+' : '-'}₹
                                    {fmt(Math.abs(parseFloat(sAmt || 0)) || 0)}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
