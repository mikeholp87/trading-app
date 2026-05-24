const axios = require('axios');

const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET = process.env.ALPACA_SECRET_KEY;
const DEFAULT_BASE_URL = 'https://paper-api.alpaca.markets';
const DEFAULT_DATA_URL = 'https://data.alpaca.markets';
const BASE_URL = process.env.ALPACA_BASE_URL || DEFAULT_BASE_URL;
const DATA_URL = process.env.ALPACA_DATA_URL || DEFAULT_DATA_URL;
const USE_BASIC_AUTH = process.env.USE_BASIC_AUTH === 'true';

const normalizeBaseUrl = (value, fallback, name) => {
  const candidate = (value || fallback || '').trim();

  if (!candidate) {
    throw new Error(`${name} is not configured`);
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error();
    }

    return url.toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be a valid http(s) URL. Received: ${candidate}`);
  }
};

const createAuthHeaders = () => {
  if (USE_BASIC_AUTH) {
    const credentials = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
    return { 'Authorization': `Basic ${credentials}` };
  }
  return {
    'APCA-API-KEY-ID': API_KEY,
    'APCA-API-SECRET-KEY': API_SECRET
  };
};

const getConfigWarnings = () => {
  const warnings = [];

  if (!API_KEY) {
    warnings.push('ALPACA_API_KEY is not set.');
  }

  if (!API_SECRET) {
    warnings.push('ALPACA_SECRET_KEY is not set.');
  }

  return warnings;
};

const createClient = (baseUrl = BASE_URL) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, DEFAULT_BASE_URL, 'ALPACA_BASE_URL');
  return axios.create({
    baseURL: normalizedBaseUrl,
    headers: {
      'Content-Type': 'application/json',
      ...createAuthHeaders()
    }
  });
};

const client = createClient();
const dataClient = createClient(DATA_URL);

const getAccount = async () => {
  const response = await client.get('/v2/account');
  return response.data;
};

const getPositions = async () => {
  const response = await client.get('/v2/positions');
  return response.data;
};

const getOrders = async (status = 'all', limit = 20) => {
  const response = await client.get('/v2/orders', {
    params: { status, limit }
  });
  return response.data;
};

const placeOrder = async (orderData) => {
  const {
    symbol,
    qty,
    notional,
    side,
    type,
    order_class,
    limit_price,
    stop_price,
    trail_price,
    trail_percent,
    time_in_force,
    extended_hours,
    take_profit,
    stop_loss
  } = orderData;
  
  const order = {
    symbol: symbol.toUpperCase(),
    side: side.toLowerCase(),
    type: type.toLowerCase(),
    time_in_force: time_in_force || 'day'
  };

  if (qty !== undefined && qty !== null && qty !== '') {
    order.qty = parseFloat(qty);
  }

  if (notional !== undefined && notional !== null && notional !== '') {
    order.notional = parseFloat(notional);
  }

  if (order_class) {
    order.order_class = order_class.toLowerCase();
  }

  if (limit_price !== undefined && limit_price !== null && limit_price !== '') {
    order.limit_price = parseFloat(limit_price);
  }

  if (stop_price !== undefined && stop_price !== null && stop_price !== '') {
    order.stop_price = parseFloat(stop_price);
  }

  if (trail_price !== undefined && trail_price !== null && trail_price !== '') {
    order.trail_price = parseFloat(trail_price);
  }

  if (trail_percent !== undefined && trail_percent !== null && trail_percent !== '') {
    order.trail_percent = parseFloat(trail_percent);
  }

  if (typeof extended_hours === 'boolean') {
    order.extended_hours = extended_hours;
  }

  if (take_profit && typeof take_profit === 'object') {
    const tp = {};
    if (take_profit.limit_price !== undefined && take_profit.limit_price !== null && take_profit.limit_price !== '') {
      tp.limit_price = parseFloat(take_profit.limit_price);
    }
    if (Object.keys(tp).length) {
      order.take_profit = tp;
    }
  }

  if (stop_loss && typeof stop_loss === 'object') {
    const sl = {};
    if (stop_loss.stop_price !== undefined && stop_loss.stop_price !== null && stop_loss.stop_price !== '') {
      sl.stop_price = parseFloat(stop_loss.stop_price);
    }
    if (stop_loss.limit_price !== undefined && stop_loss.limit_price !== null && stop_loss.limit_price !== '') {
      sl.limit_price = parseFloat(stop_loss.limit_price);
    }
    if (Object.keys(sl).length) {
      order.stop_loss = sl;
    }
  }

  const response = await client.post('/v2/orders', order);
  return response.data;
};

const cancelOrder = async (orderId) => {
  const response = await client.delete(`/v2/orders/${orderId}`);
  return response.data;
};

const replaceOrder = async (orderId, orderData) => {
  const response = await client.patch(`/v2/orders/${orderId}`, orderData);
  return response.data;
};

const closePosition = async (symbol) => {
  const response = await client.delete(`/v2/positions/${symbol}`);
  return response.data;
};

const closeAllPositions = async () => {
  const response = await client.delete('/v2/positions');
  return response.data;
};

const getPortfolioHistory = async (start, end, period, timeframe) => {
  const params = {};
  if (start) params.start = start;
  if (end) params.end = end;
  if (period) params.period = period;
  if (timeframe) params.timeframe = timeframe;
  
  const response = await client.get('/v2/account/portfolio/history', { params });
  return response.data;
};

const getAssets = async (status = 'active', asset_class = 'us_equity') => {
  const response = await client.get('/v2/assets', {
    params: { status, asset_class }
  });
  return response.data;
};

const getAsset = async (symbol) => {
  const response = await client.get(`/v2/assets/${symbol}`);
  return response.data;
};

const getBars = async (symbol, timeframe = '1Day', start = null, end = null, limit = 100) => {
  const params = {
    timeframe,
    limit
  };
  
  if (start) params.start = start;
  if (end) params.end = end;

  const response = await dataClient.get(`/v2/stocks/${symbol.toUpperCase()}/bars`, {
    params
  });
  return response.data;
};

const getLatestQuote = async (symbol) => {
  const response = await dataClient.get(`/v2/stocks/${symbol.toUpperCase()}/quotes/latest`);
  return response.data;
};

const getClock = async () => {
  const response = await client.get('/v2/clock');
  return response.data;
};

const getHistoricalBars = async (symbol, timeframe, start, end) => {
  const params = {
    timeframe,
    start,
    end,
    limit: 500
  };

  const response = await dataClient.get(`/v2/stocks/${symbol.toUpperCase()}/bars`, {
    params
  });
  return response.data;
};

const deleteAllOrders = async () => {
  const response = await client.delete('/v2/orders');
  return response.data;
};

const getActivities = async ({ type, after, until, page_size, page_token } = {}) => {
  const params = {};
  if (type) params.type = type;
  if (after) params.after = after;
  if (until) params.until = until;
  if (page_size) params.page_size = page_size;
  if (page_token) params.page_token = page_token;
  
  const response = await client.get('/v2/account/activities', { params });
  return response.data;
};

const getLatestTrade = async (symbol) => {
  const response = await dataClient.get(`/v2/stocks/${symbol.toUpperCase()}/trades/latest`);
  return response.data;
};

const getSnapshot = async (symbol) => {
  const response = await dataClient.get(`/v2/stocks/${symbol.toUpperCase()}/snapshot`);
  return response.data;
};

const getNews = async ({ symbols, start, end, limit = 10, include_content = false, sort = 'desc' } = {}) => {
  const params = {
    limit,
    include_content,
    sort
  };

  if (symbols) {
    params.symbols = Array.isArray(symbols) ? symbols.join(',') : symbols;
  }
  if (start) params.start = start;
  if (end) params.end = end;

  const response = await dataClient.get('/v1beta1/news', { params });
  return response.data;
};

const getSnapshots = async (symbols) => {
  const symbolsParam = Array.isArray(symbols) ? symbols.join(',') : symbols;
  const response = await dataClient.get('/v2/stocks/snapshots', {
    params: { symbols: symbolsParam }
  });
  return response.data;
};

const getMovers = async (marketType = 'stocks', top = 10) => {
  const response = await dataClient.get(`/v1beta1/screener/${marketType}/movers`, {
    params: { top }
  });
  return response.data;
};

module.exports = {
  getAccount,
  getPositions,
  getOrders,
  placeOrder,
  cancelOrder,
  replaceOrder,
  closePosition,
  closeAllPositions,
  getPortfolioHistory,
  getAssets,
  getAsset,
  getBars,
  getLatestQuote,
  getClock,
  getHistoricalBars,
  deleteAllOrders,
  getActivities,
  getLatestTrade,
  getSnapshot,
  getNews,
  getSnapshots,
  getMovers,
  createClient,
  createAuthHeaders,
  getConfigWarnings
};
