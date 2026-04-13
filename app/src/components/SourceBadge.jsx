const SOURCE_COLORS = {
  serpapi_kg: 'bg-blue-400/15 text-blue-400',
  serpapi_organic: 'bg-blue-300/15 text-blue-300',
  pdl: 'bg-purple-400/15 text-purple-400',
  maigret: 'bg-orange-400/15 text-orange-400',
  linkedin_scrape: 'bg-sky-400/15 text-sky-400',
  facebook_scrape: 'bg-indigo-400/15 text-indigo-400',
  twitter_scrape: 'bg-cyan-400/15 text-cyan-400',
  manual: 'bg-success/15 text-success',
};

export default function SourceBadge({ source }) {
  if (!source) return null;
  return (
    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${SOURCE_COLORS[source] || 'bg-text-dim/15 text-text-dim'}`}>
      {source}
    </span>
  );
}
