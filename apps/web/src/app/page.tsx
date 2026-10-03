/**
 * M1 shell page: proves the web app renders and exposes the API integration
 * boundary (NEXT_PUBLIC_API_BASE_URL). Full product UI is out of scope.
 */
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720 }}>
      <h1>Forge Platform</h1>
      <p>Foundation milestone (M1) — walking skeleton.</p>
      <ul>
        <li>
          Web health: <code>/api/health</code>
        </li>
        <li>
          API base URL boundary: <code>{apiBaseUrl}</code>
        </li>
      </ul>
      <p>
        The application frontend never talks to AI providers or databases directly; all capability
        flows through the public API (ARCHITECTURE.md §2, ADR-002).
      </p>
    </main>
  );
}
