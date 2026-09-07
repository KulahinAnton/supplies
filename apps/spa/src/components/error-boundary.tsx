import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@supplies/ui/button";

/**
 * The last line of defence: a render error anywhere below this shows a
 * sentence instead of a white page.
 *
 * A class, because catching a render error is still the one thing React has no
 * hook for. `componentDidCatch` is where the report would go if this app had
 * an error reporter; for now it goes to the console, which is where the person
 * debugging it is already looking.
 *
 * The Next app gets this from `error.tsx` per route segment. Here there is no
 * framework to provide it, which is exactly why it had to be written — an SPA
 * without one turns any bad `undefined` into a blank screen with no way back.
 *
 * `resetKey` remounts the boundary when it changes: the route path is passed
 * in, so navigating away from a broken screen clears the error rather than
 * showing the fallback forever.
 */
type Props = { children: ReactNode; resetKey?: string };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-10 text-center">
        <p className="text-sm font-medium">Щось зламалося на цьому екрані.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ваші дані не постраждали — помилка сталася вже тут, у браузері.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Спробувати ще раз
          </Button>
          <Button onClick={() => window.location.reload()}>Перезавантажити</Button>
        </div>
      </div>
    );
  }
}
