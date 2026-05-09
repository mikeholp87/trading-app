const WebSocket = require('ws');
const alpaca = require('./alpaca');

let serverWs = null;
let alpacaWs = null;
let clients = new Set();
let subscribedSymbols = new Set(['AAPL', 'TSLA', 'NVDA', 'MSFT', 'SPY', 'QQQ', 'AMZN', 'GOOGL']);
let isAuthenticated = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

const connectToAlpaca = () => {
  const API_KEY = process.env.ALPACA_API_KEY;
  const API_SECRET = process.env.ALPACA_SECRET_KEY;
  
  const wsUrl = 'wss://stream.data.alpaca.markets/v2/iex';
  alpacaWs = new WebSocket(wsUrl);

  alpacaWs.on('open', () => {
    console.log('[WS] Connected to Alpaca data stream');
    reconnectAttempts = 0;
    authenticate();
  });

  alpacaWs.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === 'success' && message.msg === 'authenticated') {
        isAuthenticated = true;
        console.log('[WS] Authenticated with Alpaca');
        subscribeToSymbols();
      } else if (message.type === 'quote' || message.type === 'trade') {
        broadcastToClients(message);
      }
    } catch (e) {
      console.error('[WS] Parse error:', e.message);
    }
  });

  alpacaWs.on('close', () => {
    console.log('[WS] Disconnected from Alpaca');
    isAuthenticated = false;
    attemptReconnect();
  });

  alpacaWs.on('error', (error) => {
    console.error('[WS] Error:', error.message);
  });
};

const authenticate = () => {
  const API_KEY = process.env.ALPACA_API_KEY;
  const API_SECRET = process.env.ALPACA_SECRET_KEY;
  
  if (alpacaWs && alpacaWs.readyState === WebSocket.OPEN) {
    alpacaWs.send(JSON.stringify({
      action: 'auth',
      key: API_KEY,
      secret: API_SECRET
    }));
  }
};

const subscribeToSymbols = () => {
  if (!isAuthenticated || alpacaWs.readyState !== WebSocket.OPEN) return;
  
  const symbols = Array.from(subscribedSymbols);
  
  alpacaWs.send(JSON.stringify({
    action: 'subscribe',
    trades: symbols.map(s => s),
    quotes: symbols.map(s => s)
  }));
  
  console.log('[WS] Subscribed to:', symbols.join(', '));
};

const unsubscribeFromSymbol = (symbol) => {
  if (!isAuthenticated || alpacaWs.readyState !== WebSocket.OPEN) return;
  
  alpacaWs.send(JSON.stringify({
    action: 'unsubscribe',
    trades: [symbol],
    quotes: [symbol]
  }));
};

const broadcastToClients = (message) => {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

const attemptReconnect = () => {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.error('[WS] Max reconnect attempts reached');
    return;
  }
  
  reconnectAttempts++;
  const delay = RECONNECT_DELAY * Math.pow(2, reconnectAttempts - 1);
  console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
  
  setTimeout(() => {
    connectToAlpaca();
  }, delay);
};

const initWebSocketServer = (server) => {
  serverWs = new WebSocket.Server({ server, path: '/ws' });

  serverWs.on('connection', (ws) => {
    console.log('[WS] Client connected');
    clients.add(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'subscribe') {
          if (data.symbols) {
            data.symbols.forEach(s => subscribedSymbols.add(s.toUpperCase()));
            subscribeToSymbols();
          }
        } else if (data.type === 'unsubscribe') {
          if (data.symbols) {
            data.symbols.forEach(s => {
              subscribedSymbols.delete(s.toUpperCase());
              unsubscribeFromSymbol(s);
            });
          }
        }
      } catch (e) {
        console.error('[WS] Client message error:', e.message);
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('[WS] Client error:', error.message);
    });
  });

  connectToAlpaca();
  console.log('[WS] Server initialized');
};

const updateSubscriptions = (symbols) => {
  symbols.forEach(s => subscribedSymbols.add(s.toUpperCase()));
  if (isAuthenticated) {
    subscribeToSymbols();
  }
};

const getSubscribedSymbols = () => {
  return Array.from(subscribedSymbols);
};

const closeWebSocket = () => {
  if (alpacaWs) {
    alpacaWs.close();
    alpacaWs = null;
  }
  if (serverWs) {
    serverWs.close();
    serverWs = null;
  }
  clients.clear();
};

module.exports = {
  initWebSocketServer,
  updateSubscriptions,
  getSubscribedSymbols,
  closeWebSocket
};