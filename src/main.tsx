import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

/** Shows a recoverable message instead of a blank window if part of the UI fails. */
class Boundary extends Component<{ children: ReactNode }, { err?: string }> {
  state: { err?: string } = {};
  static getDerivedStateFromError(e: unknown) {
    return { err: String((e as any)?.message ?? e) };
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="empty" style={{ height: '100%' }}>
        <h3>Something went wrong on this screen</h3>
        <p>{this.state.err}</p>
        <button className="btn primary" onClick={() => { location.hash = ''; location.reload(); }}>Reload Lumen</button>
      </div>
    );
  }
}
import { App } from './App';
import { LumenProvider } from './lib/store';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <Boundary>
    <LumenProvider>
      <App />
    </LumenProvider>
  </Boundary>
);
