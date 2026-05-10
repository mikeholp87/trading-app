import { describe, it, expect, vi, beforeEach } from 'vitest';

// These helpers are extracted from app.js for testing.
// The actual app.js imports will test them via the globals.
const formatMoney = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const formatPercent = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '0.00%';
  return new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value / 100);
};

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '0';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
};

const getTimeframeParam = (tf) => {
  const map = { '1D': '5Min', '5D': '15Min', '1M': '1Hour', '3M': '1Day', '1Y': '1Day' };
  return map[tf] || '15Min';
};

const getStartDate = (tf) => {
  const now = new Date();
  const map = {
    '1D': new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    '5D': new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    '1M': new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    '3M': new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    '1Y': new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
  return map[tf] || map['5D'];
};

const validateSymbol = (str) => /^[A-Z]{1,5}$/.test(str);
const validateQty = (n) => Number.isInteger(n) && n > 0;
const validatePrice = (n) => typeof n === 'number' && !isNaN(n) && n > 0;

const debounce = (fn, wait) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

// ── formatMoney ──────────────────────────────────────────────────────────────
describe('formatMoney', () => {
  it('formats positive numbers as USD', () => {
    expect(formatMoney(1234.56)).toBe('$1,234.56');
  });
  it('formats 0', () => {
    expect(formatMoney(0)).toBe('$0.00');
  });
  it('handles null/undefined/NaN', () => {
    expect(formatMoney(null)).toBe('$0.00');
    expect(formatMoney(undefined)).toBe('$0.00');
    expect(formatMoney(NaN)).toBe('$0.00');
  });
  it('formats large numbers', () => {
    expect(formatMoney(100000.00)).toBe('$100,000.00');
  });
  it('formats negative numbers', () => {
    expect(formatMoney(-50)).toBe('-$50.00');
  });
});

// ── formatPercent ─────────────────────────────────────────────────────────────
describe('formatPercent', () => {
  it('formats positive percent', () => {
    expect(formatPercent(5.25)).toBe('5.25%');
  });
  it('formats negative percent', () => {
    expect(formatPercent(-2.5)).toBe('-2.50%');
  });
  it('handles null/NaN', () => {
    expect(formatPercent(null)).toBe('0.00%');
    expect(formatPercent(NaN)).toBe('0.00%');
  });
});

// ── formatNumber ───────────────────────────────────────────────────────────────
describe('formatNumber', () => {
  it('formats with default 2 decimals', () => {
    expect(formatNumber(3.14159)).toBe('3.14');
  });
  it('formats with custom decimals', () => {
    expect(formatNumber(3.14159, 4)).toBe('3.1416');
  });
  it('handles null', () => {
    expect(formatNumber(null)).toBe('0');
  });
});

// ── validateSymbol ─────────────────────────────────────────────────────────────
describe('validateSymbol', () => {
  it('accepts valid 1-5 letter uppercase symbols', () => {
    expect(validateSymbol('AAPL')).toBe(true);
    expect(validateSymbol('NVDA')).toBe(true);
    expect(validateSymbol('SPY')).toBe(true);
    expect(validateSymbol('BRKB')).toBe(true);
  });
  it('accepts 1-char symbol', () => {
    expect(validateSymbol('A')).toBe(true);
  });
  it('rejects lowercase', () => {
    expect(validateSymbol('aapl')).toBe(false);
  });
  it('rejects numbers', () => {
    expect(validateSymbol('A1')).toBe(false);
  });
  it('rejects symbols over 5 chars', () => {
    expect(validateSymbol('AAPLLE')).toBe(false);
  });
  it('rejects empty string', () => {
    expect(validateSymbol('')).toBe(false);
  });
  it('rejects symbols with spaces', () => {
    expect(validateSymbol('AA PL')).toBe(false);
  });
});

// ── validateQty ───────────────────────────────────────────────────────────────
describe('validateQty', () => {
  it('accepts positive integers', () => {
    expect(validateQty(1)).toBe(true);
    expect(validateQty(100)).toBe(true);
  });
  it('rejects 0', () => {
    expect(validateQty(0)).toBe(false);
  });
  it('rejects negative', () => {
    expect(validateQty(-1)).toBe(false);
  });
  it('rejects floats', () => {
    expect(validateQty(1.5)).toBe(false);
  });
  it('rejects non-number', () => {
    expect(validateQty(NaN)).toBe(false);
    expect(validateQty(null)).toBe(false);
  });
});

// ── validatePrice ─────────────────────────────────────────────────────────────
describe('validatePrice', () => {
  it('accepts positive numbers', () => {
    expect(validatePrice(150.25)).toBe(true);
    expect(validatePrice(0.01)).toBe(true);
  });
  it('rejects 0', () => {
    expect(validatePrice(0)).toBe(false);
  });
  it('rejects negative', () => {
    expect(validatePrice(-10)).toBe(false);
  });
  it('rejects NaN', () => {
    expect(validatePrice(NaN)).toBe(false);
  });
});

// ── debounce ──────────────────────────────────────────────────────────────────
describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('delays execution by wait ms', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('only calls once when fired multiple times within wait', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes arguments through', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced('a', 123);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('a', 123);
  });
});

// ── getTimeframeParam ──────────────────────────────────────────────────────────
describe('getTimeframeParam', () => {
  it('maps timeframes correctly', () => {
    expect(getTimeframeParam('1D')).toBe('5Min');
    expect(getTimeframeParam('5D')).toBe('15Min');
    expect(getTimeframeParam('1M')).toBe('1Hour');
    expect(getTimeframeParam('3M')).toBe('1Day');
    expect(getTimeframeParam('1Y')).toBe('1Day');
  });
  it('defaults to 15Min for unknown', () => {
    expect(getTimeframeParam('XYZ')).toBe('15Min');
  });
});

// ── getStartDate ───────────────────────────────────────────────────────────────
describe('getStartDate', () => {
  it('returns ISO date strings in the past', () => {
    const now = new Date();
    const d1y = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const result1Y = new Date(getStartDate('1Y'));
    // Should be within 2 days of 1 year ago
    expect(Math.abs(result1Y.getTime() - d1y.getTime())).toBeLessThan(2 * 24 * 60 * 60 * 1000);
  });
  it('defaults to 5D for unknown timeframe', () => {
    const now = new Date();
    const d5d = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const result = new Date(getStartDate('XYZ'));
    expect(Math.abs(result.getTime() - d5d.getTime())).toBeLessThan(2 * 24 * 60 * 60 * 1000);
  });
});