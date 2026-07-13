import { Component, type ReactNode } from 'react';

/**
 * App-wide error boundary that prevents a rendering error from blanking the entire UI.
 * Production shows a safe message without stack details; development logs the error for debugging.
 */
interface State {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown) {
    if (import.meta.env.DEV) {
      // Log only in development to avoid exposing internal details in production.
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', err);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center bg-[#020203] px-6 text-center text-white">
        <div className="max-w-sm">
          <div className="text-lg font-semibold">Something went wrong</div>
          <p className="mt-2 text-sm text-white/50">
            Your data was not affected. Refresh the page and try again. Contact an administrator if the problem continues.
          </p>
          <button
            className="btn-primary mt-5"
            onClick={() => {
              // Return to the app root while respecting subpath deployments.
              window.location.href = import.meta.env.BASE_URL || '/';
            }}
          >
            Refresh and retry
          </button>
        </div>
      </div>
    );
  }
}
