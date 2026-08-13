const BROWSER_BASE_URL = '/api';

const DEV_SERVER_BASE_URL = 'http://localhost:3001';

const DEV_REALTIME_ORIGIN = 'http://localhost:3003';

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function requireAbsoluteUrl(value: string, name: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ConfigError(
      `${name} must be an absolute URL including the scheme, e.g. https://api.example.com — received "${value}".`,
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError(`${name} must use http or https — received "${parsed.protocol}".`);
  }
  return value.replace(/\/+$/, '');
}

function resolveServerBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configured && configured.trim() !== '') {
    return requireAbsoluteUrl(configured.trim(), 'NEXT_PUBLIC_API_BASE_URL');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new ConfigError(
      'NEXT_PUBLIC_API_BASE_URL is required in production. Without it the server would ' +
        'fall back to http://localhost:3001 and either fail at the first request or, worse, ' +
        'reach whatever else is listening on that port.',
    );
  }

  return DEV_SERVER_BASE_URL;
}

function resolveRealtimeOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_ORIGIN;

  if (configured && configured.trim() !== '') {
    return requireAbsoluteUrl(configured.trim(), 'NEXT_PUBLIC_REALTIME_ORIGIN');
  }

  if (process.env.NODE_ENV === 'production') {
    throw new ConfigError(
      'NEXT_PUBLIC_REALTIME_ORIGIN is required in production. Without it the app would ' +
        'open its WebSocket against http://localhost:3003 and real-time updates would ' +
        'silently never arrive — which looks exactly like a quiet system.',
    );
  }

  return DEV_REALTIME_ORIGIN;
}

export const API_BASE_URL: string =
  typeof window !== 'undefined' ? BROWSER_BASE_URL : resolveServerBaseUrl();

export const REALTIME_ORIGIN: string | null = (() => {
  try {
    return resolveRealtimeOrigin();
  } catch (error) {
    console.error(
      `Real-time updates are DISABLED: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
})();

export { ConfigError, requireAbsoluteUrl, resolveServerBaseUrl, resolveRealtimeOrigin };
