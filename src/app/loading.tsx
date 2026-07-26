export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite" className="app-loading" id="main-content">
      <section className="app-loading-card">
        <span className="sr-only">Loading Nexus Support</span>
        <div className="app-loading-bar app-loading-bar-short" />
        <div className="app-loading-bar app-loading-bar-title" />
        <div className="app-loading-grid">
          <div className="app-loading-panel" />
          <div className="app-loading-panel" />
          <div className="app-loading-panel" />
        </div>
      </section>
    </main>
  );
}
