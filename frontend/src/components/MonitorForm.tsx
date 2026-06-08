import { useState } from 'react';

// Interactive signup / unsubscribe island. Talks to the deployed httpApi
// (`POST /monitors`, `DELETE /monitors/{username}`). The API base URL is baked
// in at build time via PUBLIC_API_BASE_URL; if it is missing we surface a clear
// configuration error instead of POSTing to the wrong origin.
const API_BASE = (import.meta.env.PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{1,60}$/;

type Mode = 'register' | 'unsubscribe';

interface Status {
  kind: 'success' | 'error';
  message: string;
  details?: string[];
}

interface RegisteredMonitor {
  username: string;
  shipsFrom: string;
  destinationEmail: string;
  enabled: boolean;
  hasDiscogsToken: boolean;
}

const initialForm = {
  username: '',
  shipsFrom: '',
  destinationEmail: '',
  discogsToken: '',
};

export default function MonitorForm() {
  const [mode, setMode] = useState<Mode>('register');
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<RegisteredMonitor | null>(null);

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus(null);
    setResult(null);
  };

  const validate = (action: Mode): string[] => {
    const errors: string[] = [];
    const username = form.username.trim();

    if (!USERNAME_RE.test(username)) {
      errors.push('Enter a valid Discogs username.');
    }

    if (action === 'register') {
      if (!form.shipsFrom.trim()) {
        errors.push('Enter at least one country to watch.');
      }
      if (!EMAIL_RE.test(form.destinationEmail.trim())) {
        errors.push('Enter a valid destination email address.');
      }
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setResult(null);

    if (!API_BASE) {
      setStatus({
        kind: 'error',
        message: 'This site is not configured with an API endpoint yet.',
        details: ['Set PUBLIC_API_BASE_URL at build time and redeploy.'],
      });
      return;
    }

    const errors = validate(mode);
    if (errors.length > 0) {
      setStatus({ kind: 'error', message: 'Please fix the following:', details: errors });
      return;
    }

    setSubmitting(true);

    try {
      const username = form.username.trim();
      let response: Response;

      if (mode === 'unsubscribe') {
        response = await fetch(`${API_BASE}/monitors/${encodeURIComponent(username)}`, {
          method: 'DELETE',
        });
      } else {
        const body: Record<string, string> = {
          username,
          shipsFrom: form.shipsFrom.trim(),
          destinationEmail: form.destinationEmail.trim(),
        };
        if (form.discogsToken.trim()) {
          body.discogsToken = form.discogsToken.trim();
        }

        response = await fetch(`${API_BASE}/monitors`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus({
          kind: 'error',
          message: payload?.message ?? 'Something went wrong. Please try again.',
          details: Array.isArray(payload?.errors) ? payload.errors : undefined,
        });
        return;
      }

      if (mode === 'unsubscribe') {
        setStatus({
          kind: 'success',
          message: `Monitor for “${username}” has been removed.`,
        });
        setForm(initialForm);
      } else {
        setResult(payload?.monitor ?? null);
        setStatus({
          kind: 'success',
          message: 'You’re all set! Your monitor is registered.',
        });
      }
    } catch {
      setStatus({
        kind: 'error',
        message: 'Could not reach the monitor service. Check your connection and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-brand-border bg-brand-card/80 p-6 shadow-2xl shadow-black/40 backdrop-blur sm:p-8">
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-brand-border bg-brand-bg/50 p-1">
        {(['register', 'unsubscribe'] as Mode[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => switchMode(value)}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
              mode === value
                ? 'bg-brand-accent text-black shadow-lg shadow-brand-accent/30'
                : 'text-brand-muted hover:text-brand-text'
            }`}
          >
            {value === 'register' ? 'Register monitor' : 'Unsubscribe'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {mode === 'register' && (
          <>
            <div>
              <label htmlFor="username" className="field-label">
                Discogs username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                placeholder="your_discogs_username"
                className="field-input"
                value={form.username}
                onChange={update('username')}
              />
              <p className="field-hint">
                The account whose wantlist is scanned.
              </p>
            </div>

            <div>
              <label htmlFor="shipsFrom" className="field-label">
                Ships from
              </label>
              <input
                id="shipsFrom"
                name="shipsFrom"
                type="text"
                placeholder="Australia, New Zealand"
                className="field-input"
                value={form.shipsFrom}
                onChange={update('shipsFrom')}
              />
              <p className="field-hint">
                One or more countries, comma separated. Only listings shipping from
                these are emailed.
              </p>
            </div>

            <div>
              <label htmlFor="destinationEmail" className="field-label">
                Digest email
              </label>
              <input
                id="destinationEmail"
                name="destinationEmail"
                type="email"
                autoComplete="email"
                placeholder="you@internet.com"
                className="field-input"
                value={form.destinationEmail}
                onChange={update('destinationEmail')}
              />
              <p className="field-hint">Where your marketplace digest is sent.</p>
            </div>

            <div>
              <label htmlFor="discogsToken" className="field-label">
                Discogs token{' '}
                <span className="font-normal text-brand-muted">(optional)</span>
              </label>
              <input
                id="discogsToken"
                name="discogsToken"
                type="password"
                autoComplete="off"
                placeholder="Personal access token"
                className="field-input"
                value={form.discogsToken}
                onChange={update('discogsToken')}
              />
              <p className="field-hint">
                Only needed to read a <strong>private</strong> wantlist. Public
                wantlists work without it. Stored securely and never shown back to
                you.{' '}
                <a
                  href="https://www.discogs.com/settings/developers"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-accent underline-offset-2 hover:underline"
                >
                  Generate one →
                </a>
              </p>
            </div>
          </>
        )}

        {mode === 'unsubscribe' && (
          <div>
            <label htmlFor="username" className="field-label">
              Discogs username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="your_discogs_username"
              className="field-input"
              value={form.username}
              onChange={update('username')}
            />
            <p className="field-hint">The monitor to remove.</p>
          </div>
        )}

        {status && (
          <div
            role="status"
            className={`rounded-2xl border px-4 py-3 text-sm ${
              status.kind === 'success'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/40 bg-red-500/10 text-red-200'
            }`}
          >
            <p className="font-medium">{status.message}</p>
            {status.details && status.details.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs opacity-90">
                {status.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
            {result && (
              <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-emerald-100/90">
                <dt className="font-semibold">Username</dt>
                <dd>{result.username}</dd>
                <dt className="font-semibold">Ships from</dt>
                <dd>{result.shipsFrom}</dd>
                <dt className="font-semibold">Email</dt>
                <dd>{result.destinationEmail}</dd>
                <dt className="font-semibold">Private token</dt>
                <dd>{result.hasDiscogsToken ? 'stored' : 'not set'}</dd>
              </dl>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="group flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-bg/50 px-5 py-3.5 text-sm font-semibold text-brand-text transition hover:bg-brand-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? 'Working…'
            : mode === 'register'
              ? 'Register monitor'
              : 'Remove my monitor'}
          {!submitting && (
            <span className="transition group-hover:translate-x-0.5">→</span>
          )}
        </button>
      </form>

      <footer className="mt-8 border-t border-brand-border/30 pt-4 text-center text-xs text-brand-text/60">
        Built by <a href="https://jch254.com/" className="underline hover:text-brand-text">Jordan Hornblow</a>
      </footer>
    </div>
  );
}
