'use client';

export default function AppError({ reset }) {
  return <main className="recovery-page"><h1>Let’s get your music back.</h1><p>Something interrupted Sonora. Retry to reopen your library.</p><button className="primary-button" onClick={reset}>Try again</button></main>;
}
