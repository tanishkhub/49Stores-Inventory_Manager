import { Component } from 'react';

// Catches render-time errors (most importantly failed lazy import()s) so a broken
// route shows a recovery UI instead of a blank white page.
//
// After a deploy, browsers holding an old index.html request chunks that no longer
// exist. That failure only resolves by reloading — so we auto-reload once, rate-limited
// to once per 30 s, and show the fallback below if that did not help.
const RELOAD_GUARD_KEY = 'app.chunkReloadAt';
const RELOAD_GUARD_MS = 30_000;

function isChunkLoadError(error) {
  const text = `${error?.name || ''} ${error?.message || ''}`;
  return /chunk|dynamically imported module|module script|import\(.*\)/i.test(text);
}

function maybeReloadForChunk(error) {
  if (!isChunkLoadError(error)) return;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    window.location.reload();
  } catch {
    // sessionStorage unavailable — the fallback UI below still covers the failure.
  }
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    maybeReloadForChunk(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[50vh] place-items-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">
            This page hit an unexpected error. Reloading usually fixes it — especially right after an app update.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
            <button type="button" className="btn-secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
