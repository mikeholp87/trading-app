import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('alpaca client URL configuration', () => {
  const loadAlpaca = () => {
    delete require.cache[require.resolve('../src/alpaca')];
    return require('../src/alpaca');
  };

  it('falls back to Alpaca defaults when env vars are missing', () => {
    vi.stubEnv('ALPACA_BASE_URL', '');
    vi.stubEnv('ALPACA_DATA_URL', '');
    vi.stubEnv('ALPACA_API_KEY', '');
    vi.stubEnv('ALPACA_SECRET_KEY', '');
    vi.stubEnv('USE_BASIC_AUTH', 'false');

    const alpaca = loadAlpaca();

    expect(alpaca.createClient().defaults.baseURL).toBe('https://paper-api.alpaca.markets');
    expect(alpaca.createClient(process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets').defaults.baseURL).toBe('https://data.alpaca.markets');
  });

  it('fails fast on malformed URLs with a clear error', () => {
    vi.stubEnv('ALPACA_BASE_URL', 'not-a-url');
    vi.stubEnv('ALPACA_DATA_URL', 'https://data.alpaca.markets');
    vi.stubEnv('ALPACA_API_KEY', '');
    vi.stubEnv('ALPACA_SECRET_KEY', '');
    vi.stubEnv('USE_BASIC_AUTH', 'false');

    expect(() => loadAlpaca()).toThrow(/ALPACA_BASE_URL must be a valid http\(s\) URL/);
  });

  it('reports missing Alpaca credentials at startup', () => {
    vi.stubEnv('ALPACA_BASE_URL', '');
    vi.stubEnv('ALPACA_DATA_URL', '');
    vi.stubEnv('ALPACA_API_KEY', '');
    vi.stubEnv('ALPACA_SECRET_KEY', '');
    vi.stubEnv('USE_BASIC_AUTH', 'false');

    const alpaca = loadAlpaca();

    expect(alpaca.getConfigWarnings()).toEqual([
      'ALPACA_API_KEY is not set.',
      'ALPACA_SECRET_KEY is not set.'
    ]);
  });
});
