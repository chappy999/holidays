import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
class PlannerBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="section-shell inner-page" role="alert">
        <div className="eyebrow red-text">A SMALL DETOUR</div>
        <h1>Let’s try that again.</h1>
        <p className="page-intro">
          The planner couldn’t finish loading. Your saved plan has not been cleared. Reload to try
          again.
        </p>
        <button
          className="button button-dark"
          style={{ marginTop: 24 }}
          onClick={() => location.reload()}
        >
          Reload the planner
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PlannerBoundary>
      <App />
    </PlannerBoundary>
  </React.StrictMode>,
);
