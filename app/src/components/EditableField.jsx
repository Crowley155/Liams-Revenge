import { useState, useEffect } from 'react';

export default function EditableField({ label, value, onSave, placeholder = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');

  useEffect(() => { setDraft(value || ''); }, [value]);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="text-xs text-text-dim w-28 shrink-0">{label}</span>
        <span className="text-sm text-text flex-1 truncate">{value || <span className="italic text-text-dim/50">—</span>}</span>
        <button onClick={() => setEditing(true)} className="text-[10px] text-accent hover:text-accent-hover transition-colors">edit</button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-text-dim w-28 shrink-0">{label}</span>
      <input
        autoFocus
        className="flex-1 text-sm bg-surface-alt border border-border rounded px-2 py-1 text-text focus:border-accent focus:outline-none"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { onSave(draft); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
      />
      <button onClick={() => { onSave(draft); setEditing(false); }} className="text-[10px] text-success hover:text-success/80">save</button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-text-dim hover:text-danger">cancel</button>
    </div>
  );
}
