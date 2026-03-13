import { useEffect, useState } from 'react';

// Render animated circular fairness score indicator.
function FairnessScore({ score = 0, label = 'Fair' }) {
  const [animatedScore, setAnimatedScore] = useState(0);

  // Animate score fill on mount and score changes.
  useEffect(() => {
    const target = Math.max(0, Math.min(100, Number(score) || 0));
    let current = 0;
    const step = target / 30;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      setAnimatedScore(Number(current.toFixed(2)));
    }, 20);
    return () => clearInterval(timer);
  }, [score]);

  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (animatedScore / 100) * circumference;

  let color = '#ef4444';
  if (animatedScore >= 80) color = '#16a34a';
  else if (animatedScore >= 60) color = '#eab308';

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
        <text x="70" y="74" textAnchor="middle" className="fill-gray-800 text-xl font-bold">
          {animatedScore.toFixed(0)}
        </text>
      </svg>
      <p className="text-sm text-gray-500 -mt-2">{label}</p>
    </div>
  );
}

export default FairnessScore;
