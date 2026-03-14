import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import { getBalances, getExpenses, getGroups, getSettlementHistory, reverseExpense } from '../api';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

// Format a number as INR currency for UI display.
function formatInr(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Format a number as INR currency for PDF-safe text.
function formatPdfInr(value) {
  return `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Convert expense rows into accounting-style ledger debit/credit entries.
function buildLedgerEntries(expenses) {
  const rows = [];
  expenses.forEach((expense) => {
    const createdAt = new Date(expense.created_at).toLocaleString();
    if (!expense.is_reversal) {
      expense.splits.forEach((split) => {
        rows.push({
          id: `${expense.id}-${split.user_id}-debit`,
          expenseId: expense.id,
          date: createdAt,
          description: `${split.user_name} share for ${expense.title}`,
          debit: Number(split.share_amount || 0),
          credit: 0,
          status: 'ACTIVE',
          type: 'expense',
          isReversal: false,
          expense,
        });
      });
      rows.push({
        id: `${expense.id}-credit`,
        expenseId: expense.id,
        date: createdAt,
        description: `${expense.paid_by_name} paid for ${expense.title}`,
        debit: 0,
        credit: Number(expense.total_amount || 0),
        status: 'ACTIVE',
        type: 'expense',
        isReversal: false,
        expense,
      });
    } else {
      expense.splits.forEach((split) => {
        rows.push({
          id: `${expense.id}-${split.user_id}-rev`,
          expenseId: expense.id,
          date: createdAt,
          description: `Reversal for ${split.user_name} (${expense.title})`,
          debit: 0,
          credit: Math.abs(Number(split.share_amount || 0)),
          status: 'REVERSED',
          type: 'reversal',
          isReversal: true,
          expense,
        });
      });
      rows.push({
        id: `${expense.id}-debit-rev`,
        expenseId: expense.id,
        date: createdAt,
        description: `Reversal adjustment for ${expense.paid_by_name}`,
        debit: Number(expense.total_amount || 0),
        credit: 0,
        status: 'REVERSED',
        type: 'reversal',
        isReversal: true,
        expense,
      });
    }
  });

  let running = 0;
  return rows.map((row) => {
    running = Number((running + row.credit - row.debit).toFixed(2));
    return { ...row, runningBalance: running };
  });
}

// Render group ledger, summaries, and confirmed settlement history.
function Ledger() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const [groupName, setGroupName] = useState('Group Ledger');
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState('all');

  // Fetch groups, expenses, balances, and confirmed settlements.
  const loadData = async () => {
    setLoading(true);
    try {
      const [groupsRes, expensesRes, balancesRes, settlementsRes] = await Promise.all([
        getGroups(),
        getExpenses(groupId),
        getBalances(groupId),
        getSettlementHistory(groupId),
      ]);
      const group = (groupsRes.data || []).find((item) => item.id === groupId);
      setGroupName(group?.name || 'Group Ledger');
      setExpenses(expensesRes.data || []);
      setBalances(balancesRes.data || []);
      setSettlements(settlementsRes.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };

  // Reload ledger datasets whenever group context changes.
  useEffect(() => {
    loadData();
  }, [groupId]);

  // Build all ledger rows derived from expense data.
  const ledgerRows = useMemo(() => buildLedgerEntries(expenses), [expenses]);

  // Filter ledger rows by chosen tab.
  const filteredRows = useMemo(() => {
    if (filter === 'all') return ledgerRows;
    if (filter === 'expenses') return ledgerRows.filter((row) => row.type === 'expense');
    if (filter === 'reversals') return ledgerRows.filter((row) => row.type === 'reversal');
    return ledgerRows;
  }, [ledgerRows, filter]);

  // Calculate summary metrics including settled and outstanding amounts.
  const summary = useMemo(() => {
    const totalSpent = expenses.filter((item) => !item.is_reversal).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const youPaid = expenses
      .filter((item) => item.paid_by_name === user?.name && !item.is_reversal)
      .reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const yourBalance = Number(balances.find((item) => item.user_id === user?.id)?.balance || 0);
    const totalSettled = settlements.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalOwed = balances
      .filter((item) => Number(item.balance || 0) < -0.01)
      .reduce((sum, item) => sum + Math.abs(Number(item.balance || 0)), 0);
    const outstanding = Math.max(0, Number((totalOwed - totalSettled).toFixed(2)));
    return { totalSpent, youPaid, yourBalance, totalSettled, outstanding };
  }, [expenses, balances, settlements, user]);

  // Export filtered ledger rows and summary stats into a PDF report.
  const exportPdf = () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const tableCols = {
      date: { x: 12, w: 30 },
      desc: { x: 44, w: 88 },
      debit: { x: 134, w: 20 },
      credit: { x: 156, w: 20 },
      balance: { x: 178, w: 20 },
    };

    // Draw report header on each page.
    const drawPageHeader = () => {
      pdf.setFillColor(79, 70, 229);
      pdf.rect(0, 0, pageWidth, 20, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('SplitSmart', margin, 8);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text('Smart Expense Ledger Statement', margin, 14);

      pdf.setTextColor(15, 23, 42);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text(`Ledger Report: ${groupName}`, margin, 28);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, 33);
      pdf.text(`Filter: ${filter.toUpperCase()} | Records: ${filteredRows.length}`, pageWidth - margin, 33, { align: 'right' });
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, 36, pageWidth - margin, 36);
    };

    // Draw one compact metric box in summary row.
    const drawMetricCard = (x, y, w, label, value, valueColor = [15, 23, 42]) => {
      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(x, y, w, 17, 2, 2, 'FD');
      pdf.setTextColor(100, 116, 139);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.text(label, x + 2.5, y + 5.5);
      pdf.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(value, x + 2.5, y + 12.5);
    };

    // Draw column headers for the ledger table.
    const drawTableHeader = (y) => {
      pdf.setFillColor(241, 245, 249);
      pdf.rect(margin, y, pageWidth - margin * 2, 7, 'F');
      pdf.setTextColor(51, 65, 85);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.text('Date', tableCols.date.x + 1, y + 4.8);
      pdf.text('Description', tableCols.desc.x + 1, y + 4.8);
      pdf.text('Debit', tableCols.debit.x + tableCols.debit.w - 1, y + 4.8, { align: 'right' });
      pdf.text('Credit', tableCols.credit.x + tableCols.credit.w - 1, y + 4.8, { align: 'right' });
      pdf.text('Balance', tableCols.balance.x + tableCols.balance.w - 1, y + 4.8, { align: 'right' });
    };

    drawPageHeader();

    const boxGap = 4;
    const boxWidth = (pageWidth - margin * 2 - boxGap * 2) / 3;
    drawMetricCard(margin, 40, boxWidth, 'Total Group Spent', formatPdfInr(summary.totalSpent));
    drawMetricCard(margin + boxWidth + boxGap, 40, boxWidth, 'Total Settled', formatPdfInr(summary.totalSettled), [22, 163, 74]);
    drawMetricCard(margin + (boxWidth + boxGap) * 2, 40, boxWidth, 'Outstanding', formatPdfInr(summary.outstanding), [220, 38, 38]);

    let y = 62;
    drawTableHeader(y);
    y += 8;

    filteredRows.forEach((row, index) => {
      const descPrefix = row.status === 'REVERSED' ? '[REV] ' : '';
      const descLines = pdf.splitTextToSize(`${descPrefix}${row.description}`, tableCols.desc.w - 2);
      const rowHeight = Math.max(6, descLines.length * 4 + 1.5);

      if (y + rowHeight > pageHeight - 20) {
        pdf.addPage();
        drawPageHeader();
        y = 40;
        drawTableHeader(y);
        y += 8;
      }

      if (index % 2 === 0) {
        pdf.setFillColor(250, 252, 255);
        pdf.rect(margin, y - 0.5, pageWidth - margin * 2, rowHeight, 'F');
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(30, 41, 59);
      pdf.text(String(row.date).slice(0, 16), tableCols.date.x + 1, y + 3.8);
      pdf.text(descLines, tableCols.desc.x + 1, y + 3.8);
      pdf.text(row.debit ? formatPdfInr(row.debit) : '-', tableCols.debit.x + tableCols.debit.w - 1, y + 3.8, { align: 'right' });
      pdf.text(row.credit ? formatPdfInr(row.credit) : '-', tableCols.credit.x + tableCols.credit.w - 1, y + 3.8, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.text(formatPdfInr(row.runningBalance), tableCols.balance.x + tableCols.balance.w - 1, y + 3.8, { align: 'right' });
      pdf.setDrawColor(241, 245, 249);
      pdf.line(margin, y + rowHeight - 0.8, pageWidth - margin, y + rowHeight - 0.8);
      y += rowHeight;
    });

    if (y + 16 > pageHeight - 12) {
      pdf.addPage();
      drawPageHeader();
      y = 42;
    }
    pdf.setFillColor(238, 242, 255);
    pdf.roundedRect(margin, y + 4, pageWidth - margin * 2, 10, 2, 2, 'F');
    pdf.setTextColor(55, 48, 163);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text('Optimization-enabled settlement and ledger summary included.', margin + 2.5, y + 10.3);

    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
      pdf.text('Generated by SplitSmart Ledger Engine', margin, pageHeight - 8);
    }

    pdf.save(`ledger-${groupId}.pdf`);
  };

  // Reverse an expense and refresh the ledger datasets.
  const onReverseExpense = async (expenseId) => {
    try {
      await reverseExpense(expenseId);
      toast.success('Expense reversed successfully');
      await loadData();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to reverse expense');
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Ledger</h1>

        <section className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm text-gray-500">Total Group Spent</p>
            <p className="text-xl font-semibold text-gray-800">{formatInr(summary.totalSpent)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm text-gray-500">You Paid</p>
            <p className="text-xl font-semibold text-gray-800">{formatInr(summary.youPaid)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm text-gray-500">Your Net Balance</p>
            <p className={`text-xl font-semibold ${summary.yourBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatInr(summary.yourBalance)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-green-200 p-6">
            <p className="text-sm text-gray-500">Total Settled</p>
            <p className="text-xl font-semibold text-green-700">{formatInr(summary.totalSettled)}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6">
            <p className="text-sm text-gray-500">Outstanding</p>
            <p className="text-xl font-semibold text-amber-700">{formatInr(summary.outstanding)}</p>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex gap-2">
              {['all', 'expenses', 'reversals'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`px-4 py-2 rounded-xl border ${
                    filter === tab ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {tab[0].toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <button type="button" onClick={exportPdf} className="border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-xl">
              Export PDF
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500">Loading ledger...</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-gray-500">No ledger entries available for this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="py-2 pr-4">DATE</th>
                    <th className="py-2 pr-4">DESCRIPTION</th>
                    <th className="py-2 pr-4">DEBIT</th>
                    <th className="py-2 pr-4">CREDIT</th>
                    <th className="py-2 pr-4">RUNNING BALANCE</th>
                    <th className="py-2 pr-4">STATUS</th>
                    <th className="py-2">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <Fragment key={row.id}>
                      <tr className={`${row.isReversal ? 'border-l-4 border-red-400' : ''} border-b border-gray-50`}>
                        <td className="py-2 pr-4">{row.date}</td>
                        <td className="py-2 pr-4">{row.description}</td>
                        <td className="py-2 pr-4">{row.debit ? formatInr(row.debit) : '-'}</td>
                        <td className="py-2 pr-4">{row.credit ? formatInr(row.credit) : '-'}</td>
                        <td className="py-2 pr-4">{formatInr(row.runningBalance)}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-1 rounded-full text-xs ${row.status === 'ACTIVE' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => setExpanded((prev) => ({ ...prev, [row.expenseId]: !prev[row.expenseId] }))}
                            className="text-indigo-600 text-xs font-medium"
                          >
                            {expanded[row.expenseId] ? 'Hide' : 'Expand'}
                          </button>
                          {!row.expense.is_reversal ? (
                            <button
                              type="button"
                              onClick={() => onReverseExpense(row.expenseId)}
                              className="ml-2 text-red-600 text-xs font-medium"
                            >
                              Reverse
                            </button>
                          ) : null}
                        </td>
                      </tr>
                      {expanded[row.expenseId] ? (
                        <tr className="bg-gray-50">
                          <td colSpan="7" className="py-2 px-2">
                            <div className="text-xs text-gray-600 space-y-1">
                              {row.expense.splits.map((split) => (
                                <p key={`${row.expenseId}-${split.user_id}`}>
                                  {split.user_name}: {formatInr(split.share_amount)}
                                </p>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">✅ Confirmed Settlements</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading confirmed settlements...</p>
          ) : settlements.length === 0 ? (
            <p className="text-sm text-gray-500">No settled payments yet</p>
          ) : (
            <div className="space-y-3">
              {settlements.map((item) => (
                <div key={item.id} className="rounded-xl border border-green-200 border-l-4 border-l-green-500 bg-green-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-800">
                      ✅ <span className="font-semibold">{item.from_user_name}</span> paid <span className="font-semibold">{item.to_user_name}</span>{' '}
                      <span className="font-bold text-green-700">{formatInr(item.amount)}</span>
                    </p>
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">CONFIRMED</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} • Razorpay • CONFIRMED</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Ledger;
