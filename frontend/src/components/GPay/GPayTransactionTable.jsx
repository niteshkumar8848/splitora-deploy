const CATEGORIES = [
  'Food',
  'Travel',
  'Hotel',
  'Shopping',
  'Entertainment',
  'Health',
  'Utilities',
  'Other',
];

export default function GPayTransactionTable({
  transactions,
  selectedTxns,
  editedTxns,
  onToggleSelect,
  onUpdateField,
  members,
}) {
  if (!transactions || transactions.length === 0) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500">
        No transactions found in this date range
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {transactions.map((txn) => {
        const edited = editedTxns[txn.upi_transaction_id] || {};
        const isSelected = !!selectedTxns[txn.upi_transaction_id];

        return (
          <div
            key={`${txn.upi_transaction_id}-${txn.date}-${txn.time}`}
            className={`border rounded-xl p-3 transition-all ${
              isSelected
                ? 'bg-indigo-50 border-indigo-200 border-l-4 border-l-indigo-400'
                : 'bg-white opacity-60 border-gray-200'
            } hover:bg-gray-50`}
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
              <div className="md:col-span-1 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSelect(txn.upi_transaction_id)}
                  className="w-4 h-4"
                />
              </div>

              <div className="md:col-span-2 text-xs text-gray-600">
                <div>{txn.date}</div>
                <div className="text-gray-400">{txn.time}</div>
              </div>

              <div className="md:col-span-3">
                <input
                  type="text"
                  value={edited.title ?? txn.recipient}
                  onChange={(event) =>
                    onUpdateField(txn.upi_transaction_id, 'title', event.target.value)
                  }
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={edited.amount ?? txn.amount}
                  onChange={(event) =>
                    onUpdateField(
                      txn.upi_transaction_id,
                      'amount',
                      Number(Number(event.target.value || 0).toFixed(2))
                    )
                  }
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <select
                  value={edited.category ?? 'Other'}
                  onChange={(event) =>
                    onUpdateField(txn.upi_transaction_id, 'category', event.target.value)
                  }
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <select
                  value={edited.paid_by ?? ''}
                  onChange={(event) =>
                    onUpdateField(txn.upi_transaction_id, 'paid_by', event.target.value)
                  }
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
              <span>UPI ID: {txn.upi_transaction_id || 'N/A'}</span>
              <span className="font-semibold text-gray-700">₹{Number(edited.amount ?? txn.amount).toFixed(2)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
