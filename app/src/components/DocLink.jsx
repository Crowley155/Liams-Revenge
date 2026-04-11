import { usePanel } from './EvidencePanel';

export default function DocLink({ id, children }) {
  const { openDoc } = usePanel();

  return (
    <button
      onClick={() => openDoc(id)}
      className="font-mono text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors text-[inherit]"
    >
      {children || id}
    </button>
  );
}
