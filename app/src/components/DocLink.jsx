import { useNavigate } from 'react-router-dom';
import { usePanel } from './EvidencePanel';
import { useCase } from '../data/useCase';

function isSourceId(id) {
  if (!id) return false;
  if (id.startsWith('AUTH-') || id.startsWith('BP-')) return true;
  return false;
}

export default function DocLink({ id, children }) {
  const { openDoc } = usePanel();
  const { lookup } = useCase();
  const navigate = useNavigate();

  const handleClick = () => {
    if (isSourceId(id) || (!lookup.evidence[id] && lookup.sources[id])) {
      navigate('/sources', { state: { highlightId: id } });
    } else {
      openDoc(id);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="font-mono text-accent hover:text-accent-hover underline underline-offset-2 decoration-accent/30 hover:decoration-accent transition-colors text-[inherit]"
    >
      {children || id}
    </button>
  );
}
