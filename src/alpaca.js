const axios = require('axios');

const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET = process.env.ALPACA_SECRET_KEY;
const BASE_URL = process.env.ALPACA_BASE_URL;
const DATA_URL = process.env.ALPACA_DATA_URL;
const USE_BASIC_AUTH = process.env.USE_BASIC_AUTH === 'true';

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

const createClient = (baseUrl = BASE_URL) => {
  return axios.create({
    baseURL: baseUrl,
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
  const { symbol, qty, side, type, limit_price, time_in_force } = orderData;
  
  const order = {
    symbol: symbol.toUpperCase(),
    qty: parseInt(qty),
    side: side.toLowerCase(),
    type: type.toLowerCase(),
    time_in_force: time_in_force || 'day'
  };

  if (type.toLowerCase() === 'limit' && limit_price) {
    order.limit_price = parseFloat(limit_price);
  }

  const response = await client.post('/v2/orders', order);
  return response.data;
};

const cancelOrder = async (orderId) => {
  const response = await client.delete(`/v2/orders/${orderId}`);
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

module.exports = {
  getAccount,
  getPositions,
  getOrders,
  placeOrder,
  cancelOrder,
  getBars,
  getLatestQuote,
  getClock,
  getHistoricalBars,
  createClient,
  createAuthHeaders
};