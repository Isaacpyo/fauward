import { Component, type ReactNode } from "react";

type Props = { label: string; children: ReactNode; resetKey?: string };
type State = { error: Error | null };

/**
 * Catches a render error in one section (a Customer 360 tab, a dashboard card) so the rest of the page keeps working.
 * Data errors are rendered by the section itself; this only catches crashes. `resetKey` clears it on navigation.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" data-testid="section-crashed" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-semibold">The {this.props.label} section failed to display.</p>
          <p className="mt-1 text-xs">{this.state.error.message}</p>
          <button type="button" onClick={() => this.setState({ error: null })} className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold">
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
