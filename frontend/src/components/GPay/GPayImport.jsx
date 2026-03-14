import { useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { bulkImportGPay, parseGPayPDF } from '../../api';
import GPaySplitEditor from './GPaySplitEditor';
import GPayTransactionTable from './GPayTransactionTable';

export default function GPayImport({
  groupId,
  members,
  currentUserId,
  onImportSuccess,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [allTxns, setAllTxns] = useState([]);
  const [filteredTxns, setFilteredTxns] = useState([]);
  const [selectedTxns, setSelectedTxns] = useState({});
  const [editedTxns, setEditedTxns] = useState({});
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pdfSummary, setPdfSummary] = useState(null);
  const [step, setStep] = useState(1);

  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;
    if (!selectedFile.name.endsWith('.pdf')) {
      toast.error('Please upload a PDF file');
      return;
    }
    setFile(selectedFile);
  };

  const handleParsePDF = async () => {
    if (!file) {
      toast.error('Please select a PDF file first');
      return;
    }

    setParsing(true);
    try {
      const res = await parseGPayPDF(file);
      const data = res.data;
      const normalizedTxns = data.transactions.map((txn, index) => ({
        ...txn,
        txn_key: txn.upi_transaction_id || `txn-${index}-${txn.date}-${txn.time}`,
      }));
      setAllTxns(normalizedTxns);
      setFilteredTxns(normalizedTxns);
      setPdfSummary({
        total_found: data.total_found,
        total_amount: data.total_amount,
        from_date: data.from_date,
        to_date: data.to_date,
        message: data.message,
      });

      setFromDate(data.from_date);
      setToDate(data.to_date);

      const selected = {};
      normalizedTxns.forEach((txn) => {
        const key = txn.txn_key;
        selected[key] = true;
      });
      setSelectedTxns(selected);

      const edited = {};
      normalizedTxns.forEach((txn) => {
        const key = txn.txn_key;
        edited[key] = {
          title: txn.recipient,
          amount: txn.amount,
          category: guessCategoryFromName(txn.recipient),
          date: txn.date,
          paid_by: currentUserId,
          split_type: 'EQUAL',
          splits: computeEqualSplits(txn.amount, members),
        };
      });
      setEditedTxns(edited);
      setStep(2);
      toast.success(data.message);
    } catch (error) {
      toast.error(
        error?.response?.data?.detail ||
          'Failed to parse PDF. Make sure it is a valid GPay statement.'
      );
    } finally {
      setParsing(false);
    }
  };

  const getTxnKey = (txn, index = 0) =>
    txn.txn_key || txn.upi_transaction_id || `txn-${index}-${txn.date}-${txn.time}`;

  const handleDateFilter = () => {
    if (!fromDate || !toDate) {
      toast.error('Please select both dates');
      return;
    }
    if (fromDate > toDate) {
      toast.error('From date must be before To date');
      return;
    }

    const filtered = allTxns.filter((txn) => txn.date >= fromDate && txn.date <= toDate);
    setFilteredTxns(filtered);

    const nextSelected = {};
    filtered.forEach((txn, index) => {
      const key = getTxnKey(txn, index);
      nextSelected[key] = selectedTxns[key] ?? true;
    });
    setSelectedTxns(nextSelected);
    toast.success(`${filtered.length} transactions in range`);
  };

  const toggleSelect = (upiId) => {
    setSelectedTxns((prev) => ({
      ...prev,
      [upiId]: !prev[upiId],
    }));
  };

  const selectAll = () => {
    const all = {};
    filteredTxns.forEach((txn, index) => {
      all[getTxnKey(txn, index)] = true;
    });
    setSelectedTxns(all);
  };

  const deselectAll = () => {
    setSelectedTxns({});
  };

  const updateEditedField = (upiId, field, value) => {
    setEditedTxns((prev) => ({
      ...prev,
      [upiId]: { ...prev[upiId], [field]: value },
    }));
  };

  const handleProceedToSplits = () => {
    const count = Object.values(selectedTxns).filter(Boolean).length;
    if (count === 0) {
      toast.error('Please select at least one transaction');
      return;
    }
    setStep(3);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const toImport = filteredTxns
        .filter((txn, index) => selectedTxns[getTxnKey(txn, index)])
        .map((txn, index) => {
          const edited = editedTxns[getTxnKey(txn, index)];
          return {
            date: edited.date,
            title: edited.title,
            amount: Number(Number(edited.amount).toFixed(2)),
            category: edited.category,
            paid_by: edited.paid_by,
            split_type: edited.split_type,
            splits: edited.splits,
          };
        });

      const res = await bulkImportGPay(groupId, toImport);
      toast.success(res.data.message);
      onImportSuccess();

      setStep(1);
      setFile(null);
      setAllTxns([]);
      setFilteredTxns([]);
      setSelectedTxns({});
      setEditedTxns({});
      setPdfSummary(null);
      setIsOpen(false);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  function guessCategoryFromName(name) {
    const lower = String(name || '').toLowerCase();
    if (lower.includes('fitness') || lower.includes('gym')) return 'Health';
    if (lower.includes('petroleum') || lower.includes('petrol') || lower.includes('fuel')) return 'Travel';
    if (lower.includes('mobile') || lower.includes('shop')) return 'Shopping';
    if (lower.includes('restaurant') || lower.includes('food') || lower.includes('hotel')) return 'Food';
    return 'Other';
  }

  function computeEqualSplits(amount, listMembers) {
    if (!listMembers || listMembers.length === 0) return [];

    const share = Number((amount / listMembers.length).toFixed(2));
    const splits = listMembers.map((member) => ({
      user_id: member.id,
      share_amount: share,
    }));

    const total = splits.reduce((sum, item) => sum + item.share_amount, 0);
    const diff = Number((amount - total).toFixed(2));
    if (splits.length > 0) {
      splits[splits.length - 1].share_amount = Number(
        (splits[splits.length - 1].share_amount + diff).toFixed(2)
      );
    }

    return splits;
  }

  const selectedCount = Object.values(selectedTxns).filter(Boolean).length;
  const selectedTotal = filteredTxns
    .filter((txn, index) => selectedTxns[getTxnKey(txn, index)])
    .reduce((sum, txn, index) => {
      const edited = editedTxns[getTxnKey(txn, index)];
      return sum + Number(edited?.amount || txn.amount || 0);
    }, 0);

  return (
    <div className="mb-6 border border-indigo-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 bg-indigo-50 hover:bg-indigo-100 transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">📱</span>
          <div className="text-left">
            <div className="font-semibold text-indigo-700 text-sm">Import from Google Pay</div>
            <div className="text-xs text-indigo-500">Upload your GPay PDF statement to auto-fill expenses</div>
          </div>
        </div>
        <span className="text-indigo-400 text-lg">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="bg-white p-6">
          <div className="flex items-center gap-2 mb-6">
            {['Upload', 'Filter & Select', 'Set Splits', 'Import'].map((label, idx) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                    step === idx + 1
                      ? 'bg-indigo-600 text-white'
                      : step > idx + 1
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {step > idx + 1 ? '✓' : idx + 1}
                </div>
                <span className={`text-xs ${step === idx + 1 ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
                {idx < 3 && <div className="w-6 h-px bg-gray-200" />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center cursor-pointer hover:bg-indigo-50 transition-all"
              >
                <div className="text-4xl mb-3">📄</div>
                <div className="text-sm font-medium text-gray-700 mb-1">
                  {file ? `✅ ${file.name}` : 'Click to upload GPay PDF statement'}
                </div>
                <div className="text-xs text-gray-400">Only Google Pay transaction PDFs supported</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {file && (
                <button
                  onClick={handleParsePDF}
                  disabled={parsing}
                  className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-medium disabled:opacity-50 transition-all"
                >
                  {parsing ? '⏳ Reading PDF...' : '🔍 Extract Transactions'}
                </button>
              )}
            </div>
          )}

          {step === 2 && pdfSummary && (
            <div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                <div className="text-sm font-semibold text-green-700 mb-1">✅ PDF parsed successfully</div>
                <div className="text-xs text-green-600">{pdfSummary.message}</div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">📅 Filter by Date Range</div>
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">From Date</label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={(event) => setFromDate(event.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 block mb-1">To Date</label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={(event) => setToDate(event.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    onClick={handleDateFilter}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700"
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center mb-3">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-indigo-600">{selectedCount}</span> of {filteredTxns.length} selected{' '}
                  <span className="font-semibold text-green-600">₹{selectedTotal.toFixed(2)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-xs text-indigo-600 hover:underline">
                    Select all
                  </button>
                  <span className="text-gray-300">|</span>
                  <button onClick={deselectAll} className="text-xs text-gray-500 hover:underline">
                    Deselect all
                  </button>
                </div>
              </div>

              <GPayTransactionTable
                transactions={filteredTxns.map((txn, index) => ({ ...txn, upi_transaction_id: getTxnKey(txn, index) }))}
                selectedTxns={selectedTxns}
                editedTxns={editedTxns}
                onToggleSelect={toggleSelect}
                onUpdateField={updateEditedField}
                members={members}
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleProceedToSplits}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm hover:bg-indigo-700 font-medium"
                >
                  Set Splits ({selectedCount}) →
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-4">Configure how each expense is split</div>

              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {filteredTxns
                  .filter((txn, index) => selectedTxns[getTxnKey(txn, index)])
                  .map((txn, index) => {
                    const key = getTxnKey(txn, index);
                    return (
                      <GPaySplitEditor
                        key={key}
                        transaction={txn}
                        edited={editedTxns[key]}
                        members={members}
                        onUpdate={(field, value) => updateEditedField(key, field, value)}
                        computeEqualSplits={computeEqualSplits}
                      />
                    );
                  })}
              </div>

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm hover:bg-indigo-700 font-medium"
                >
                  Review Import →
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div className="bg-indigo-50 rounded-xl p-4 mb-4">
                <div className="text-sm font-semibold text-indigo-700 mb-2">Ready to import</div>
                <div className="text-2xl font-bold text-indigo-600 mb-1">{selectedCount} expenses</div>
                <div className="text-sm text-indigo-500">Total: ₹{selectedTotal.toFixed(2)}</div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                {filteredTxns
                  .filter((txn, index) => selectedTxns[getTxnKey(txn, index)])
                  .map((txn, index) => {
                    const e = editedTxns[getTxnKey(txn, index)];
                    return (
                      <div
                        key={getTxnKey(txn, index)}
                        className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm"
                      >
                        <div>
                          <span className="font-medium text-gray-800">{e?.title}</span>
                          <span className="text-gray-400 ml-2 text-xs">
                            {e?.date} · {e?.category} · {e?.split_type}
                          </span>
                        </div>
                        <span className="font-semibold text-gray-800">₹{Number(e?.amount || 0).toFixed(2)}</span>
                      </div>
                    );
                  })}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {importing ? '⏳ Importing...' : `✅ Import ${selectedCount} Expenses`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
