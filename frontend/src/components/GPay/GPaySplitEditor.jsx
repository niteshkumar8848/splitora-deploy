import { useEffect, useMemo, useState } from 'react';

export default function GPaySplitEditor({
  transaction,
  edited,
  members,
  onUpdate,
  computeEqualSplits,
}) {
  const amount = Number(edited?.amount || transaction.amount || 0);
  const splitType = edited?.split_type || 'EQUAL';

  const [percentages, setPercentages] = useState({});
  const [customAmounts, setCustomAmounts] = useState({});

  useEffect(() => {
    if (!members?.length) return;

    if (splitType === 'EQUAL') {
      onUpdate('splits', computeEqualSplits(amount, members));
      return;
    }

    if (splitType === 'PERCENTAGE' && Object.keys(percentages).length === 0) {
      const initial = {};
      members.forEach((member) => {
        initial[member.id] = Number((100 / members.length).toFixed(2));
      });
      setPercentages(initial);
    }

    if (splitType === 'CUSTOM' && Object.keys(customAmounts).length === 0) {
      const initial = {};
      members.forEach((member) => {
        initial[member.id] = 0;
      });
      setCustomAmounts(initial);
    }
  }, [splitType, amount, members]);

  const percentSum = useMemo(
    () => members.reduce((sum, member) => sum + Number(percentages[member.id] || 0), 0),
    [members, percentages]
  );

  const customSum = useMemo(
    () => members.reduce((sum, member) => sum + Number(customAmounts[member.id] || 0), 0),
    [members, customAmounts]
  );

  const remaining = Number((amount - customSum).toFixed(2));

  const applySplitType = (nextType) => {
    onUpdate('split_type', nextType);
    if (nextType === 'EQUAL') {
      onUpdate('splits', computeEqualSplits(amount, members));
      return;
    }

    if (nextType === 'PERCENTAGE') {
      setCustomAmounts({});
      const initial = {};
      members.forEach((member) => {
        initial[member.id] = 0;
      });
      setPercentages(initial);
      onUpdate('splits', []);
      return;
    }

    setPercentages({});
    const initial = {};
    members.forEach((member) => {
      initial[member.id] = 0;
    });
    setCustomAmounts(initial);
    onUpdate('splits', []);
  };

  const handlePercentageChange = (memberId, value) => {
    const next = {
      ...percentages,
      [memberId]: Number(Number(value || 0).toFixed(2)),
    };
    setPercentages(next);

    let allocated = 0;
    const newSplits = members.map((member, index) => {
      const percentage = Number(next[member.id] || 0);
      let share = Number(((amount * percentage) / 100).toFixed(2));
      if (index === members.length - 1) {
        share = Number((amount - allocated).toFixed(2));
      } else {
        allocated = Number((allocated + share).toFixed(2));
      }
      return { user_id: member.id, share_amount: share };
    });

    onUpdate('splits', newSplits);
  };

  const handleCustomChange = (memberId, value) => {
    const next = {
      ...customAmounts,
      [memberId]: Number(Number(value || 0).toFixed(2)),
    };
    setCustomAmounts(next);

    const newSplits = members.map((member) => ({
      user_id: member.id,
      share_amount: Number(next[member.id] || 0),
    }));
    onUpdate('splits', newSplits);
  };

  const equalPreview = members.length ? Number((amount / members.length).toFixed(2)) : 0;

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">{edited?.title || transaction.recipient}</div>
          <div className="text-xs text-gray-500">{edited?.date || transaction.date}</div>
        </div>
        <div className="text-sm font-semibold text-gray-700">₹{amount.toFixed(2)}</div>
      </div>

      <div className="flex gap-2 mb-4">
        {['EQUAL', 'PERCENTAGE', 'CUSTOM'].map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => applySplitType(type)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${
              splitType === type
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {splitType === 'EQUAL' && (
        <div className="text-sm text-gray-600 bg-indigo-50 rounded-lg p-3">
          Each of {members.length} members pays ₹{equalPreview.toFixed(2)}
        </div>
      )}

      {splitType === 'PERCENTAGE' && (
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} className="grid grid-cols-2 gap-2 items-center">
              <label className="text-sm text-gray-700">{member.name}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={percentages[member.id] ?? 0}
                onChange={(event) => handlePercentageChange(member.id, event.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div className={`text-xs ${Math.abs(percentSum - 100) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
            {percentSum.toFixed(2)}% of 100%
          </div>
        </div>
      )}

      {splitType === 'CUSTOM' && (
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.id} className="grid grid-cols-2 gap-2 items-center">
              <label className="text-sm text-gray-700">{member.name}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={customAmounts[member.id] ?? 0}
                onChange={(event) => handleCustomChange(member.id, event.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          ))}
          <div className={`text-xs ${Math.abs(remaining) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
            ₹{remaining.toFixed(2)} remaining
          </div>
        </div>
      )}
    </div>
  );
}
