import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import logger from '@/lib/logger';

interface Props {
  children: ReactNode;
  /** Optional label so the log says which part of the app failed. */
  boundary?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which means an undefined property access in one component leaves the user
 * staring at a blank white page with no error, no navigation, and no way back
 * short of retyping the URL. This turns that into a readable message, a
 * recovery action, and — importantly — a logged report, since a crash nobody
 * reports is a crash nobody fixes.
 *
 * Must be a class: there is no hook equivalent of componentDidCatch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('React render error', error, {
      boundary: this.props.boundary ?? 'root',
      componentStack: errorInfo.componentStack,
    });
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4" role="alert">
        <div className="w-full max-w-md text-center border rounded-2xl p-8 bg-card">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={22} aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold mb-1">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mb-6">
            This page hit an unexpected error. It's been reported — you can try again, or head back to the home page.
          </p>

          {/*
            The message is shown only in development. In production it is
            whatever the runtime produced, which is meaningless to a user and
            can name internals; the full record is in the logs instead.
          */}
          {import.meta.env.DEV && (
            <pre className="text-left text-[11px] bg-muted rounded-lg p-3 mb-6 overflow-auto max-h-40">
              {error.message}
            </pre>
          )}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={this.handleReset}>
              Try again
            </Button>
            <Button className="flex-1" onClick={() => { window.location.href = '/'; }}>
              Go home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
