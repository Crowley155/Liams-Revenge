import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PAGE_META = {
  '/trust': {
    title: 'Trust',
    description: 'USDWatch could not load the Trust page inside the app shell.',
  },
  '/ai-disclosure': {
    title: 'AI Disclosure',
    description: 'USDWatch could not load the AI Disclosure page inside the app shell.',
  },
  '/privacy': {
    title: 'Privacy',
    description: 'USDWatch could not load the Privacy page inside the app shell.',
  },
};

function normalizePagePath(path) {
  const cleaned = `/${String(path || '').replace(/^\/+|\/+$/g, '')}`;
  return cleaned === '/' ? '/' : cleaned;
}

export function extractStaticMainHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const main = doc.querySelector('main');
  if (!main) throw new Error('Static page did not include a main region.');
  return main.innerHTML;
}

export default function StaticEditorialPage({ pagePath }) {
  const navigate = useNavigate();
  const normalizedPath = normalizePagePath(pagePath);
  const meta = PAGE_META[normalizedPath] || PAGE_META['/trust'];
  const [state, setState] = useState({ status: 'loading', html: '', error: '' });

  useEffect(() => {
    const controller = new AbortController();

    async function loadPage() {
      setState({ status: 'loading', html: '', error: '' });
      try {
        const response = await fetch(`${normalizedPath}/`, {
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Page request failed with ${response.status}`);
        }
        const html = await response.text();
        setState({ status: 'ready', html: extractStaticMainHtml(html), error: '' });
      } catch (error) {
        if (error.name === 'AbortError') return;
        setState({
          status: 'error',
          html: '',
          error: error.message || meta.description,
        });
      }
    }

    loadPage();
    return () => controller.abort();
  }, [meta.description, normalizedPath]);

  const handleContentClick = (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (link.target || link.hasAttribute('download')) return;

    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    navigate(`${url.pathname}${url.search}${url.hash}`);
  };

  if (state.status === 'loading') {
    return (
      <div className="grid min-h-[40vh] place-items-center text-sm text-text-dim" role="status">
        Loading {meta.title}...
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="mx-auto max-w-3xl rounded-md border border-warning/35 bg-warning/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning">Page unavailable</p>
        <h2 className="mt-2 text-xl font-bold text-text">{meta.title} could not load</h2>
        <p className="mt-2 text-sm leading-relaxed text-text-dim">{state.error}</p>
        <a
          href={`${normalizedPath}/`}
          className="mt-4 inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-bold text-text transition-colors hover:bg-surface-alt"
        >
          Open full page
        </a>
      </section>
    );
  }

  return (
    <div
      className="static-editorial-page"
      onClick={handleContentClick}
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  );
}
