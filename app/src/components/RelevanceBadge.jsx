import { useState } from 'react';

const BAND_STYLES = {
  critical: { bg: 'bg-danger/15', text: 'text-danger', ring: 'ring-danger/30', fill: '#ff6b6b' },
  high: { bg: 'bg-warning/15', text: 'text-warning', ring: 'ring-warning/30', fill: '#ffb347' },
  moderate: { bg: 'bg-info/15', text: 'text-info', ring: 'ring-info/30', fill: '#74c0fc' },
  supporting: { bg: 'bg-text-dim/10', text: 'text-text-dim', ring: 'ring-text-dim/20', fill: '#8b8fa4' },
  background: { bg: 'bg-surface-alt', text: 'text-text-dim', ring: 'ring-border', fill: '#2e3348' },
};

const FACTOR_LABELS = {
  probative: { label: 'Probative Value', desc: 'How directly it proves a core claim' },
  reliability: { label: 'Source Reliability', desc: 'Primary document vs. secondhand' },
  corroboration: { label: 'Corroboration', desc: 'Independent items supporting same point' },
  contradiction: { label: 'Contradiction Exposure', desc: 'Participates in documented conflicts' },
  materiality: { label: 'Legal Materiality', desc: 'Maps to specific legal claim elements' },
};

const FACTOR_WEIGHTS = { probative: 3, reliability: 2, corroboration: 2, contradiction: 1.5, materiality: 1.5 };

function MiniBar({ value, max = 10, color }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export default function RelevanceBadge({ score, expandable = false }) {
  const [open, setOpen] = useState(false);

  if (!score) return null;

  const style = BAND_STYLES[score.band] || BAND_STYLES.supporting;

  return (
    <div className="inline-flex flex-col">
      <button
        onClick={expandable ? () => setOpen(!open) : undefined}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ring-1 text-[11px] font-bold ${style.bg} ${style.text} ${style.ring} ${expandable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        title={`Relevance: ${score.total}/100 (${score.band})`}
      >
        <span>{score.total}</span>
        <span className="font-normal uppercase text-[9px] opacity-70">{score.band}</span>
      </button>

      {open && expandable && score.factors && (
        <div className="mt-2 bg-surface border border-border rounded-lg p-3 text-xs space-y-2 w-64">
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-text">Factor Breakdown</span>
            <span className={`font-mono font-bold ${style.text}`}>{score.total}/100</span>
          </div>
          {Object.entries(score.factors).map(([key, value]) => {
            const meta = FACTOR_LABELS[key];
            const weight = FACTOR_WEIGHTS[key];
            const contribution = Math.round(value * weight);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-text-dim">{meta?.label || key}</span>
                  <span className="font-mono text-text">
                    {value}/10 <span className="text-text-dim">(×{weight} = {contribution})</span>
                  </span>
                </div>
                <MiniBar value={value} color={style.fill} />
              </div>
            );
          })}
          <p className="text-[10px] text-text-dim pt-1 border-t border-border leading-relaxed">
            Composite Relevance Score based on Wigmore evidence analysis, Bayesian probative value, and multi-factor assessment (FRE).
          </p>
        </div>
      )}
    </div>
  );
}
