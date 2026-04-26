import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchEntity, acceptEntityMember, rejectEntityMember } from '../api/client';

const PLATFORM_ICONS = {
  linkedin: '🔗',
  facebook: '📘',
  twitter: '𝕏',
  instagram: '📷',
  youtube: '▶',
  github: '⌨',
  tiktok: '♪',
};

const PLATFORM_COLORS = {
  linkedin: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  facebook: 'bg-blue-600/15 text-blue-300 border-blue-600/30',
  twitter: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  instagram: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  youtube: 'bg-red-500/15 text-red-400 border-red-500/30',
  github: 'bg-gray-500/15 text-gray-300 border-gray-500/30',
  tiktok: 'bg-pink-400/15 text-pink-300 border-pink-400/30',
};

function Initials({ name, large }) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
  return (
    <div className={`${large ? 'w-16 h-16 text-lg' : 'w-10 h-10 text-xs'} rounded-full bg-accent/15 flex items-center justify-center font-bold text-accent shrink-0`}>
      {initials}
    </div>
  );
}

function Section({ title, children, badge }) {
  return (
    <section className="animate-fade-up">
      <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
        {title}
        {badge && (
          <span className="text-xs font-normal text-text-dim bg-surface-alt px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

export default function MemberPreview() {
  const { entityId, name: encodedName } = useParams();
  const name = decodeURIComponent(encodedName);
  const navigate = useNavigate();
  const [entity, setEntity] = useState(null);
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchEntity(entityId)
      .then((ent) => {
        setEntity(ent);
        const found = (ent.members || []).find(
          (m) => m.discovered_name.toLowerCase() === name.toLowerCase()
        );
        setMember(found || null);
        if (!found) setError('Member not found on this entity');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [entityId, name]);

  async function handleAccept() {
    setActing(true);
    try {
      await acceptEntityMember(entityId, member.discovered_name);
      navigate(`/entities/${entityId}`);
    } catch (e) {
      setError(e.message);
      setActing(false);
    }
  }

  async function handleReject() {
    setActing(true);
    try {
      await rejectEntityMember(entityId, member.discovered_name);
      navigate(`/entities/${entityId}`);
    } catch (e) {
      setError(e.message);
      setActing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-danger text-sm">{error || 'Member not found'}</p>
        <Link to={`/entities/${entityId}`} className="text-accent hover:text-accent-hover text-sm">
          &larr; Back to Entity
        </Link>
      </div>
    );
  }

  const preview = member.preview_data || {};
  const socials = preview.social_profiles || [];
  const searchResults = preview.search_results || [];
  const sourceUrls = preview.source_urls || [];
  const kg = preview.knowledge_graph || {};
  const bio = preview.bio_snippet;
  const isPending = member.status === 'pending';

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-up">
      {/* Back link */}
      <Link
        to={`/entities/${entityId}`}
        className="text-xs text-text-dim hover:text-accent transition-colors inline-block"
      >
        &larr; Back to {entity?.name || 'Entity'}
      </Link>

      {/* Header */}
      <div className="bg-surface border border-border rounded-xl p-6" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-start gap-4">
          <Initials name={member.discovered_name} large />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{member.discovered_name}</h1>
            <p className="text-sm text-text-dim mt-0.5">{member.role || member.title}</p>
            {entity && (
              <p className="text-xs text-text-dim mt-1">
                {entity.name} &middot; {entity.state}
              </p>
            )}
            {bio && (
              <p className="text-sm text-text leading-relaxed mt-3 border-l-2 border-accent/40 pl-3">
                {bio}
              </p>
            )}
            {kg.title && kg.title !== member.discovered_name && (
              <p className="text-xs text-text-dim mt-2 italic">
                Knowledge Graph: {kg.title}{kg.type ? ` — ${kg.type}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        {isPending && (
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
            <button
              onClick={handleAccept}
              disabled={acting}
              className="text-sm font-medium px-5 py-2 rounded-lg bg-success/15 text-success hover:bg-success/30 disabled:opacity-50 transition-colors"
            >
              {acting ? 'Working...' : 'Accept Member'}
            </button>
            <button
              onClick={handleReject}
              disabled={acting}
              className="text-sm font-medium px-5 py-2 rounded-lg bg-text-dim/10 text-text-dim hover:bg-danger/15 hover:text-danger disabled:opacity-50 transition-colors"
            >
              Reject
            </button>
            <span className="text-xs text-text-dim ml-auto">
              Review the information below before deciding
            </span>
          </div>
        )}
        {!isPending && (
          <div className="mt-4 pt-3 border-t border-border">
            <span className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
              member.status === 'accepted'
                ? 'bg-success/15 text-success'
                : 'bg-danger/15 text-danger'
            }`}>
              {member.status}
            </span>
          </div>
        )}
      </div>

      {/* Source pages — where the name was found */}
      {sourceUrls.length > 0 && (
        <Section title="Found On" badge={`${sourceUrls.length} source${sourceUrls.length > 1 ? 's' : ''}`}>
          <div className="space-y-2">
            {sourceUrls.map((url, i) => {
              let hostname = url;
              try { hostname = new URL(url).hostname.replace('www.', ''); } catch { hostname = url; }
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-surface border border-border rounded-lg p-3 card-hover group"
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <span className="text-xs text-accent font-medium">{hostname}</span>
                  <span className="text-xs text-text-dim truncate flex-1">{url}</span>
                  <span className="text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    Open &rarr;
                  </span>
                </a>
              );
            })}
          </div>
        </Section>
      )}

      {/* Social profiles */}
      {socials.length > 0 && (
        <Section title="Social Profiles" badge={socials.length}>
          <div className="grid gap-2 sm:grid-cols-2">
            {socials.map((sp, i) => {
              const colors = PLATFORM_COLORS[sp.platform] || 'bg-surface-alt text-text-dim border-border';
              const icon = PLATFORM_ICONS[sp.platform] || '🌐';
              return (
                <a
                  key={i}
                  href={sp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 border rounded-lg p-3 card-hover ${colors}`}
                  style={{ boxShadow: 'var(--shadow-card)' }}
                >
                  <span className="text-lg">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">{sp.platform}</p>
                    {sp.username && (
                      <p className="text-xs opacity-70 truncate">@{sp.username}</p>
                    )}
                  </div>
                  {sp.source === 'knowledge_graph' && (
                    <span className="text-[10px] bg-success/15 text-success px-1.5 py-0.5 rounded-full shrink-0">
                      KG verified
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        </Section>
      )}

      {/* Search results */}
      {searchResults.length > 0 && (
        <Section title="Search Results" badge={searchResults.length}>
          <div className="space-y-2">
            {searchResults.map((sr, i) => (
              <a
                key={i}
                href={sr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-surface border border-border rounded-lg p-4 card-hover group"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <p className="text-sm font-medium text-text group-hover:text-accent transition-colors">
                  {sr.title}
                </p>
                {sr.snippet && (
                  <p className="text-xs text-text-dim leading-relaxed mt-1">{sr.snippet}</p>
                )}
                <p className="text-xs text-accent/60 mt-1.5 truncate">{sr.url}</p>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* Empty state */}
      {!bio && socials.length === 0 && searchResults.length === 0 && sourceUrls.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-text-dim">
            No preview data available for this member.
          </p>
          <p className="text-xs text-text-dim/60 mt-2">
            This can happen if the SerpAPI key wasn't configured during discovery, or no results were found.
          </p>
        </div>
      )}

      {/* Bottom action bar for long pages */}
      {isPending && (searchResults.length > 3 || socials.length > 2) && (
        <div className="sticky bottom-4 bg-surface/95 backdrop-blur border border-border rounded-xl p-4 flex items-center gap-3" style={{ boxShadow: 'var(--shadow-elevated)' }}>
          <Initials name={member.discovered_name} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{member.discovered_name}</p>
            <p className="text-xs text-text-dim">{member.role}</p>
          </div>
          <button
            onClick={handleAccept}
            disabled={acting}
            className="text-sm font-medium px-4 py-1.5 rounded-lg bg-success/15 text-success hover:bg-success/30 disabled:opacity-50 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={handleReject}
            disabled={acting}
            className="text-sm font-medium px-4 py-1.5 rounded-lg bg-text-dim/10 text-text-dim hover:bg-danger/15 hover:text-danger disabled:opacity-50 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
