import './app.css';

const packageSteps = [
  'Upload package.json or send dependency metadata',
  'Inspect registry response and package scripts',
  'Score the package and return a report'
];

export default function App() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Honey Badger Client</p>
          <h1>Package safety analysis before install.</h1>
          <p className="lead">
            A lightweight frontend for sending package metadata to the backend and
            reviewing the security report before anything reaches npm install.
          </p>

          <div className="hero__actions">
            <button type="button" className="primary-button">
              Start analysis
            </button>
            <button type="button" className="secondary-button">
              View report
            </button>
          </div>
        </div>

        <aside className="panel">
          <span className="panel__label">Pipeline</span>
          <ol className="steps">
            {packageSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Input</h2>
          <p>package.json, lockfile, or metadata payload from the user.</p>
        </article>
        <article className="card">
          <h2>Backend</h2>
          <p>Proxy registry lookups, normalize data, and run scoring rules.</p>
        </article>
        <article className="card">
          <h2>Output</h2>
          <p>Risk score, warnings, and a clear allow or block decision.</p>
        </article>
      </section>
    </main>
  );
}
