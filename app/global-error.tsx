'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Something went wrong
        </h2>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>
          A critical error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            borderRadius: '0.375rem',
            border: '1px solid #ccc',
            background: '#fff',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
