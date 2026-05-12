import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchEntities, createEntity } from '../api/client';

function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

const TYPE_COLORS = {
  district: '#6c8aff',
  department: '#ff6b6b',
  board: '#69db7c',
  agency: '#ffa94d',
  program: '#cc5de8',
  commission: '#20c997',
  county: '#339af0',
};

function EntityCard({ entity, caseId }) {
  const color = TYPE_COLORS[entity.type] || '#6c8aff';
  const memberCount = entity.members?.filter((m) => m.status === 'accepted').length || 0;
  const factCount = entity.facts?.length || 0;
  const aliasCount = entity.aliases?.length || 0;

  return (
    <Link
      to={`/cases/${caseId}/entities/${entity.id}`}
      className="block bg-surface border border-border rounded-lg transition-colors duration-200 hover:border-accent/40 hover:bg-surface-alt/40"
    >
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 uppercase"
            style={{ backgroundColor: color + '22', color }}
          >
            {entity.type?.slice(0, 3)}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-text truncate">{entity.name}</h3>
            <p className="text-xs text-text-dim mt-0.5">
              {entity.type} &middot; {entity.state}
              {entity.website && (
                <>
                  {' '}&middot;{' '}
                  <span className="text-accent">{safeHostname(entity.website)}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {entity.description && (
          <p className="text-xs text-text-dim/80 line-clamp-2 mb-3">{entity.description}</p>
        )}

        {aliasCount > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {entity.aliases.slice(0, 3).map((a, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-surface-alt rounded text-text-dim">
                {a.name}
              </span>
            ))}
            {aliasCount > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 text-text-dim">+{aliasCount - 3}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 text-[11px] text-text-dim">
          <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
          <span>{factCount} fact{factCount !== 1 ? 's' : ''}</span>
          {entity.last_researched && (
            <span className="ml-auto text-success/80">Researched</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function CreateEntityForm({ caseId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('district');
  const [state, setState] = useState('KS');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [aliasInput, setAliasInput] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const aliases = aliasInput
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean)
        .map((a) => ({ name: a, alias_type: 'acronym' }));

      const entity = await createEntity({
        name: name.trim(),
        type,
        state,
        website: website.trim() || null,
        description: description.trim(),
        aliases,
        meeting_url: meetingUrl.trim() || null,
      }, caseId);
      onCreated(entity);
      setName('');
      setType('district');
      setWebsite('');
      setDescription('');
      setAliasInput('');
      setMeetingUrl('');
      setOpen(false);
    } catch (err) {
      setError(err.message || 'Failed to create entity');
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center text-text-dim hover:border-accent/40 hover:text-accent transition-colors"
      >
        <span className="text-2xl block mb-1">+</span>
        <span className="text-sm font-medium">New Entity</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface border border-accent/30 rounded-lg p-5 space-y-3"
    >
      <h3 className="text-sm font-semibold text-text">Create Entity</h3>

      <input
        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent"
        placeholder="Entity name (e.g., USD 232)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />

      <div className="grid grid-cols-2 gap-3">
        <select
          className="px-3 py-2 bg-bg border border-border rounded text-sm text-text focus:outline-none focus:border-accent"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="district">School District</option>
          <option value="department">Department</option>
          <option value="board">Board</option>
          <option value="agency">Agency</option>
          <option value="program">Program</option>
          <option value="commission">Commission</option>
          <option value="county">County</option>
        </select>
        <input
          className="px-3 py-2 bg-bg border border-border rounded text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent"
          placeholder="State (e.g., KS)"
          value={state}
          onChange={(e) => setState(e.target.value)}
        />
      </div>

      <input
        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent"
        placeholder="Website URL (e.g., https://usd232.org)"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />

      <input
        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent"
        placeholder="Aliases (comma-separated, e.g., JCPRD, Parks & Rec)"
        value={aliasInput}
        onChange={(e) => setAliasInput(e.target.value)}
      />

      <input
        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent"
        placeholder="Meeting schedule URL (optional)"
        value={meetingUrl}
        onChange={(e) => setMeetingUrl(e.target.value)}
      />

      <textarea
        className="w-full px-3 py-2 bg-bg border border-border rounded text-sm text-text placeholder:text-text-dim/50 focus:outline-none focus:border-accent resize-none"
        rows={2}
        placeholder="Brief description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {error && (
        <p className="text-xs text-danger">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!name.trim() || loading}
          className="px-4 py-2 bg-accent text-bg text-xs font-medium rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 py-2 text-xs font-medium text-text-dim hover:text-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Entities() {
  const { caseId } = useParams();
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    fetchEntities(caseId)
      .then(setEntities)
      .finally(() => setLoading(false));
  }, [caseId]);

  function handleCreated(entity) {
    setEntities((prev) => [...prev, entity]);
  }

  const filtered = entities
    .filter((e) => {
      if (!filter) return true;
      const q = filter.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        e.aliases?.some((a) => a.name.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'type') return a.type.localeCompare(b.type);
      if (sortBy === 'recent') return new Date(b.updated_at) - new Date(a.updated_at);
      return 0;
    });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text">Entities</h2>
          <p className="text-xs text-text-dim mt-1">
            Organizations, agencies, and boards under investigation
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            className="min-h-11 w-full rounded-md border border-border bg-bg px-3 text-sm text-text placeholder:text-text-dim/60 transition-colors focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 sm:w-52"
            aria-label="Filter entities"
            placeholder="Filter entities..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="min-h-11 rounded-md border border-border bg-bg px-3 text-sm text-text transition-colors focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            aria-label="Sort entities"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name">Name</option>
            <option value="type">Type</option>
            <option value="recent">Recent</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-dim text-sm">Loading entities...</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CreateEntityForm caseId={caseId} onCreated={handleCreated} />
          {filtered.map((entity) => (
            <EntityCard key={entity.id} entity={entity} caseId={caseId} />
          ))}
        </div>
      )}
    </div>
  );
}
