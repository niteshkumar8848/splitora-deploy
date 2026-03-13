import { useMemo, useState } from 'react';
import ReactFlow, { Background, Controls } from 'react-flow-renderer';

// Format a number into INR string.
function formatInr(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

// Build raw debt edges for before-optimization mode.
function buildBeforeEdges(members, balances) {
  const creditors = members
    .map((m) => ({ ...m, balance: Number(balances[m.id] || 0) }))
    .filter((m) => m.balance > 0.01);
  const debtors = members
    .map((m) => ({ ...m, debt: Math.abs(Number(balances[m.id] || 0)) }))
    .filter((m) => Number(balances[m.id] || 0) < -0.01);

  const edges = [];
  debtors.forEach((debtor) => {
    creditors.forEach((creditor) => {
      const totalCreditor = creditors.reduce((sum, c) => sum + c.balance, 0);
      const share = totalCreditor > 0 ? (debtor.debt * creditor.balance) / totalCreditor : 0;
      if (share > 0.01) {
        edges.push({
          from: debtor.id,
          to: creditor.id,
          amount: Number(share.toFixed(2)),
        });
      }
    });
  });
  return edges;
}

// Build optimized debt edges from settlement suggestions.
function buildAfterEdges(suggestions) {
  return (suggestions || []).map((item) => ({
    from: item.from_user_id,
    to: item.to_user_id,
    amount: Number(item.amount || 0),
  }));
}

// Build graph nodes and edges for react-flow rendering.
function buildGraph(members, balances, suggestions, mode) {
  const before = buildBeforeEdges(members, balances);
  const after = buildAfterEdges(suggestions);
  const activeEdges = mode === 'before' ? before : after;

  const nodes = members.map((member, index) => {
    const bal = Number(balances[member.id] || 0);
    const bg = bal > 0.01 ? '#dcfce7' : bal < -0.01 ? '#fee2e2' : '#f3f4f6';
    return {
      id: member.id,
      position: { x: 100 + (index % 4) * 220, y: 60 + Math.floor(index / 4) * 180 },
      data: {
        label: (
          <div className="text-center">
            <div className="font-semibold text-gray-700">{member.name}</div>
            <div className="text-xs text-gray-500">{formatInr(bal)}</div>
          </div>
        ),
      },
      style: {
        width: 160,
        borderRadius: 16,
        border: '1px solid #d1d5db',
        background: bg,
        padding: 8,
      },
    };
  });

  const maxAmount = Math.max(...activeEdges.map((item) => item.amount), 1);
  const edges = activeEdges.map((edge, index) => ({
    id: `e-${index}`,
    source: String(edge.from),
    target: String(edge.to),
    animated: mode === 'after',
    label: formatInr(edge.amount),
    style: {
      stroke: '#4f46e5',
      strokeWidth: Math.max(1, (edge.amount / maxAmount) * 6),
    },
    labelBgStyle: { fill: '#eef2ff', color: '#1f2937', fillOpacity: 1 },
  }));

  return { nodes, edges, beforeCount: before.length, afterCount: after.length };
}

// Visualize debts before and after optimization.
function DebtGraph({ members = [], balances = {}, suggestions = [], mode = 'after' }) {
  const [viewMode, setViewMode] = useState(mode);

  const graph = useMemo(
    () => buildGraph(members, balances, suggestions, viewMode),
    [members, balances, suggestions, viewMode]
  );

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Debt Flow</h3>
          <p className="text-sm text-gray-500">
            {graph.beforeCount} debts {'->'} {graph.afterCount} transactions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode('before')}
            className={`px-4 py-2 rounded-xl border ${
              viewMode === 'before' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'
            }`}
          >
            Before
          </button>
          <button
            type="button"
            onClick={() => setViewMode('after')}
            className={`px-4 py-2 rounded-xl border ${
              viewMode === 'after' ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-600'
            }`}
          >
            After Optimization
          </button>
        </div>
      </div>
      {members.length === 0 ? (
        <div className="text-sm text-gray-500">No members available for graph.</div>
      ) : (
        <div className="h-[420px] rounded-xl border border-gray-100 overflow-hidden">
          <ReactFlow nodes={graph.nodes} edges={graph.edges} fitView>
            <Background gap={20} color="#e5e7eb" />
            <Controls />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}

export default DebtGraph;
