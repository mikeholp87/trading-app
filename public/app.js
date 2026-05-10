const DEFAULT_WATCHLIST = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'SPY', 'QQQ', 'AMZN', 'GOOGL'];

// Utility: debounce
const debounce = (fn, wait) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

// Input validators
const validateSymbol = (str) => /^[A-Z]{1,5}$/.test(str);
const validateQty = (n) => Number.isInteger(n) && n > 0;
const validatePrice = (n) => typeof n === 'number' && !isNaN(n) && n > 0;

// Toast notification system
const showToast = (msg, type = 'info', duration = 4000) => {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span class="toast-msg">${msg}</span><button class="toast-close" aria-label="dismiss">×</button>`;
  toast.querySelector('.toast-close').onclick = () => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 250); };
  container.appendChild(toast);
  if (duration > 0) setTimeout(() => { if (toast.parentNode) { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 250); } }, duration);
};

let state = {
  account: null,
  positions: [],
  orders: [],
  activities: [],
  clock: null,
  // Multi-watchlist support
  watchlists: {}, // { "My Watchlist": ["AAPL", "TSLA"], "Tech": ["NVDA", "MSFT"] }
  activeWatchlist: 'Default',
  watchlist: [], // current active watchlist symbols (alias)
  watchlistQuotes: {},
  currentSymbol: 'SPY',
  // Symbol notes
  symbolNotes: {}, // { "AAPL": "Strong buy, earnings coming up", "TSLA": "Watch for split news" }
  timeframe: '1D',
  chartType: 'candle',
  isConnected: false,
  chart: null,
  candlestickSeries: null,
  volumeSeries: null,
  emaSeries: null,
  // Indicator series
  rsiSeries: null,
  macdLineSeries: null,
  macdSignalSeries: null,
  macdHistogramSeries: null,
  bbUpperSeries: null,
  bbMiddleSeries: null,
  bbLowerSeries: null,
  ema50Series: null,
  volumeMaSeries: null,
  // New indicator series
  sma20Series: null,
  sma50Series: null,
  atrSeries: null,
  stochasticKSeries: null,
  stochasticDSeries: null,
  vwapSeries: null,
  // Indicator state
  indicators: {
    rsi: false,
    macd: false,
    bollingerBands: false,
    ema50: false,
    volumeMa: false,
    sma20: false,
    sma50: false,
    atr: false,
    stochastic: false,
    vwap: false
  },
  // Indicator panes (for separate oscillators)
  rsiPane: null,
  macdPane: null,
  ws: null,
  loadingMore: false,
  chartDataStart: null,
  chartDataEnd: null,
  rawBars: [],
  alerts: JSON.parse(localStorage.getItem('price-alerts') || '[]'),
  alertsTriggered: new Set(),
  dailyPnL: 0,
  realizedPnL: 0
};

const formatMoney = (value) => {
  const num = parseFloat(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(num);
};

const formatPercent = (value) => {
  const num = parseFloat(value);
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
};

const formatNumber = (value, decimals = 2) => {
  return parseFloat(value).toFixed(decimals);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '--';
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
  });
};

const getTimeframeParam = (tf) => {
  const map = {
    '1D': '1Hour',
    '5D': '1Hour',
    '1M': '1Day',
    '3M': '1Day',
    '1Y': '1Day'
  };
  return map[tf] || '1Day';
};

const getStartDate = (tf) => {
  const now = new Date();
  const map = {
    '1D': new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    '5D': new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    '1M': new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000),
    '3M': new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000),
    '1Y': new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000)
  };
  return (map[tf] || map['1M']).toISOString();
};

let addSymbolDebounceTimer = null;
const initWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    console.log('[WS] Connected to server');
    setConnectionStatus(true);
    state.ws.send(JSON.stringify({
      type: 'subscribe',
      symbols: state.watchlist
    }));
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWsMessage(data);
    } catch (e) {
      console.error('[WS] Parse error:', e);
    }
  };

  state.ws.onclose = () => {
    console.log('[WS] Disconnected');
    setConnectionStatus(false);
    setTimeout(initWebSocket, 3000);
  };

  state.ws.onerror = (error) => {
    console.error('[WS] Error:', error);
    setConnectionStatus(false);
  };
};

const setConnectionStatus = (connected) => {
  state.isConnected = connected;
  const dot = document.getElementById('ws-dot');
  const status = document.getElementById('ws-status');
  
  if (connected) {
    dot.classList.add('connected');
    dot.classList.remove('disconnected');
    status.textContent = 'Live';
  } else {
    dot.classList.add('disconnected');
    dot.classList.remove('connected');
    status.textContent = 'Reconnecting...';
  }
};

const handleWsMessage = (data) => {
  if (data.type === 'quote') {
    const { S: symbol, b: bid, a: ask, p: last, c: change } = data;
    state.watchlistQuotes[symbol] = {
      bid: parseFloat(bid),
      ask: parseFloat(a),
      last: parseFloat(last),
      change: parseFloat(change)
    };
    renderWatchlist();
    checkAlerts(symbol, parseFloat(last));
    updatePositionPrices(symbol, parseFloat(last));
  } else if (data.type === 'trade') {
    const { S: symbol, p: last, v: volume } = data;
    state.watchlistQuotes[symbol] = {
      ...state.watchlistQuotes[symbol],
      last: parseFloat(last),
      volume: parseInt(volume)
    };
    renderWatchlist();
    checkAlerts(symbol, parseFloat(last));
    updatePositionPrices(symbol, parseFloat(last));
  }
};

// Update position prices in real-time from WebSocket trades
const updatePositionPrices = (symbol, price) => {
  if (!price || isNaN(price)) return;
  state.positions.forEach(pos => {
    if (pos.symbol === symbol) {
      const currentPrice = parseFloat(pos.current_price);
      if (currentPrice !== price) {
        pos.current_price = price;
        const avgEntry = parseFloat(pos.avg_entry_price);
        const qty = parseFloat(pos.qty);
        pos.unrealized_pl = (price - avgEntry) * qty;
        pos.unrealized_plpc = ((price - avgEntry) / avgEntry) * 100;
        pos.market_value = price * qty;
        renderPositions();
      }
    }
  });
};

// Check price alerts
const checkAlerts = (symbol, price) => {
  if (!price || isNaN(price)) return;
  state.alerts.forEach(alert => {
    if (alert.symbol !== symbol) return;
    const triggered = alert.condition === 'above' ? price >= alert.price : price <= alert.price;
    if (triggered && !state.alertsTriggered.has(alert.id)) {
      state.alertsTriggered.add(alert.id);
      fireAlert(alert, price);
      renderAlerts();
    }
  });
};

// Fire a browser alert notification
const fireAlert = (alert, currentPrice) => {
  const title = `${alert.symbol} Alert`;
  const body = `${alert.symbol} went ${alert.condition} ${formatMoney(alert.price)} — now ${formatMoney(currentPrice)}`;
  
  if ('Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') new Notification(title, { body });
      });
    }
  }
  
  // Play a sound
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1200;
      gain2.gain.value = 0.3;
      osc2.start();
      osc2.stop(ctx.currentTime + 0.15);
    };
  } catch (e) {}
  
  console.log('[Alert] Triggered:', alert.symbol, alert.condition, alert.price);
};

// Render alerts list
const renderAlerts = () => {
  const container = document.getElementById('alerts-list');
  container.innerHTML = '';
  
  state.alerts.forEach(alert => {
    const triggered = state.alertsTriggered.has(alert.id);
    const div = document.createElement('div');
    div.className = 'alert-item' + (triggered ? ' triggered' : '');
    div.innerHTML = `
      <span class="alert-text">${alert.symbol} ${alert.condition} ${formatMoney(alert.price)} ${triggered ? '✓ TRIGGERED' : ''}</span>
      <button class="alert-delete" data-alert-id="${alert.id}">&times;</button>
    `;
    container.appendChild(div);
  });
};

const api = {
  get: async (url) => {
    console.log('[API] GET', url);
    const response = await fetch(url);
    const data = await response.json();
    console.log('[API] Response:', data);
    return data;
  },
  post: async (url, body) => {
    console.log('[API] POST', url, body);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    console.log('[API] Response:', data);
    return data;
  },
  delete: async (url) => {
    console.log('[API] DELETE', url);
    const response = await fetch(url, { method: 'DELETE' });
    const data = await response.json();
    console.log('[API] Response:', data);
    return data;
  },
  patch: async (url, body) => {
    console.log('[API] PATCH', url, body);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    console.log('[API] Response:', data);
    return data;
  }
};

const loadAccount = async () => {
  try {
    const result = await api.get('/api/account');
    if (result.success) {
      state.account = result.data;
      renderAccount();
    }
  } catch (e) {
    console.error('Failed to load account:', e);
  }
};

const loadPositions = async () => {
  try {
    const result = await api.get('/api/positions');
    if (result.success) {
      state.positions = result.data || [];
      console.log('[API] Loaded', state.positions.length, 'positions');
      renderPositions();
    }
  } catch (e) {
    console.error('[API] Failed to load positions:', e);
  }
};

const loadOrders = async () => {
  try {
    const result = await api.get('/api/orders?status=all&limit=20');
    if (result.success) {
      state.orders = result.data || [];
      console.log('[API] Loaded', state.orders.length, 'orders');
      renderOrders();
    }
  } catch (e) {
    console.error('[API] Failed to load orders:', e);
  }
};

const loadActivities = async (type = null) => {
  try {
    let url = '/api/activities?page_size=50';
    if (type) url += `&type=${type}`;
    const result = await api.get(url);
    if (result.success) {
      state.activities = result.data || [];
      console.log('[API] Loaded', state.activities.length, 'activities');
      renderActivities();
    }
  } catch (e) {
    console.error('[API] Failed to load activities:', e);
  }
};

const deleteOrder = async (orderId) => {
  try {
    const result = await api.delete(`/api/orders/${orderId}`);
    if (result.success) {
      console.log('[API] Order cancelled:', orderId);
      loadOrders();
    } else {
      showToast(result.error || 'Failed to cancel order', 'error');
    }
  } catch (e) {
    console.error('[API] Failed to cancel order:', e);
    showToast('Failed to cancel order', 'error');
  }
};

const deleteAllOrders = async () => {
  if (!confirm('Cancel ALL open orders? This cannot be undone.')) return;
  
  try {
    console.log('[API] Deleting all orders...');
    const result = await api.delete('/api/orders');
    if (result.success) {
      console.log('[API] All orders deleted');
      loadOrders();
    } else {
      showToast(result.error || 'Failed to delete orders', 'error');
    }
  } catch (e) {
    console.error('[API] Failed to delete all orders:', e);
    showToast('Failed to delete all orders', 'error');
  }
};

const loadAccountDetails = async () => {
  try {
    const result = await api.get('/api/account');
    if (result.success) {
      state.account = result.data;
      renderAccountDetails();
    }
  } catch (e) {
    console.error('[API] Failed to load account details:', e);
  }
};

const loadSnapshots = async () => {
  try {
    const symbols = state.watchlist.join(',');
    const result = await api.get(`/api/market/snapshots?symbols=${symbols}`);
    if (result.success && result.data) {
      console.log('[API] Loaded snapshots for', Object.keys(result.data).length, 'symbols');
      
      // Update watchlist quotes from snapshots
      Object.entries(result.data).forEach(([symbol, snapshot]) => {
        if (snapshot.latestQuote) {
          const q = snapshot.latestQuote;
          const trade = snapshot.latestTrade;
          
          // Calculate change from daily bar
          let change = 0;
          if (snapshot.dailyBar && trade) {
            const prevClose = snapshot.prevDailyBar?.c || snapshot.dailyBar.o;
            change = ((trade.p - prevClose) / prevClose) * 100;
          }
          
          state.watchlistQuotes[symbol] = {
            bid: parseFloat(q.bp || 0),
            ask: parseFloat(q.ap || 0),
            last: trade ? parseFloat(trade.p) : parseFloat(q.ap || q.bp || 0),
            change: change
          };
        }
      });
      
      renderWatchlist();
    }
  } catch (e) {
    console.error('[API] Failed to load snapshots:', e);
  }
};

const renderActivities = () => {
  const tbody = document.getElementById('activities-body');
  
  if (!state.activities || state.activities.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No recent activities</td></tr>';
    console.log('[UI] No activities to display');
    return;
  }
  
  console.log('[UI] Rendering', state.activities.length, 'activities');
  tbody.innerHTML = '';
  
  state.activities.forEach(activity => {
    const row = document.createElement('tr');
    
    // Different display based on activity type
    const type = activity.activity_type || 'unknown';
    const symbol = activity.symbol || '--';
    const side = activity.side || '--';
    const qty = activity.qty || '--';
    const price = activity.price ? formatMoney(activity.price) : '--';
    const amount = activity.net_amount ? formatMoney(activity.net_amount) : 
                   activity.amount ? formatMoney(activity.amount) : '--';
    
    const dateStr = activity.date ? formatDate(activity.date) : '--';
    
    let typeClass = '';
    if (type === 'fill') typeClass = 'trade';
    else if (type === 'dividend') typeClass = 'dividend';
    else if (type === 'fee') typeClass = 'fee';
    
    row.innerHTML = `
      <td>${dateStr}</td>
      <td class="${typeClass}">${type}</td>
      <td>${symbol}</td>
      <td class="${side === 'buy' ? 'buy' : side === 'sell' ? 'sell' : ''}">${side}</td>
      <td>${qty}</td>
      <td>${price}</td>
      <td>${amount}</td>
    `;
    
    tbody.appendChild(row);
  });
};

const renderAccountDetails = () => {
  if (!state.account) return;
  
  const acc = state.account;
  
  // Add additional account info if the elements exist
  const detailsEl = document.getElementById('account-details');
  if (detailsEl) {
    detailsEl.innerHTML = `
      <div class="detail-row">
        <span>Margin Multiplier:</span>
        <span>${acc.margin_multiplier || '1'}</span>
      </div>
      <div class="detail-row">
        <span>Day Trade Count:</span>
        <span>${acc.daytrade_count || 0}</span>
      </div>
      <div class="detail-row">
        <span>Trading Status:</span>
        <span>${acc.trading_blocked ? 'Blocked' : 'Enabled'}</span>
      </div>
      <div class="detail-row">
        <span>Pattern Day Trader:</span>
        <span>${acc.pattern_day_trader ? 'Yes' : 'No'}</span>
      </div>
    `;
  }
};

const loadClock = async () => {
  try {
    const result = await api.get('/api/market/clock');
    if (result.success) {
      state.clock = result.data;
      renderClock();
    }
  } catch (e) {
    console.error('Failed to load clock:', e);
  }
};

const loadPortfolioHistory = async () => {
  try {
    const result = await api.get('/api/portfolio/history?period=1M');
    if (result.success && result.data && result.data.equity) {
      renderEquityChart(result.data);
    }
  } catch (e) {
    console.error('Failed to load portfolio history:', e);
  }
};

const renderEquityChart = (data) => {
  const container = document.getElementById('equity-chart-container');
  if (!container || !data.equity) return;
  
  // Simple sparkline using canvas
  const canvas = document.createElement('canvas');
  canvas.width = container.clientWidth || 200;
  canvas.height = 40;
  container.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  const equity = data.equity;
  const min = Math.min(...equity);
  const max = Math.max(...equity);
  const range = max - min || 1;
  
  ctx.strokeStyle = equity[equity.length - 1] >= equity[0] ? '#10b981' : '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  equity.forEach((val, i) => {
    const x = (i / (equity.length - 1)) * canvas.width;
    const y = canvas.height - ((val - min) / range) * canvas.height;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  
  ctx.stroke();
};

const loadChart = async (symbol, timeframe) => {
  console.log('[Chart] Loading chart for', symbol, 'timeframe:', timeframe);
  const param = getTimeframeParam(timeframe);
  const start = getStartDate(timeframe);

  // Reset bounds when changing symbol
  state.chartDataStart = null;
  state.chartDataEnd = null;
  state.loadedEarliest = false;
  state.rawBars = [];
  
  try {
    console.log('[Chart] Fetching from /api/market/historical/', symbol, '?timeframe=', param);
    const result = await api.get(`/api/market/historical/${symbol}?timeframe=${param}&start=${start}`);
    
    if (result.success && result.data.bars && result.data.bars.length > 0) {
      console.log('[Chart] Got', result.data.bars.length, 'bars');
      const bars = result.data.bars.map(b => ({
        time: new Date(b.t).getTime() / 1000,
        open: parseFloat(b.o),
        high: parseFloat(b.h),
        low: parseFloat(b.l),
        close: parseFloat(b.c),
        volume: parseInt(b.v)
      }));
      
      console.log('[Chart] Updating chart with', bars.length, 'candles');
      updateChart(bars, timeframe);
      
      const lastBar = bars[bars.length - 1];
      const firstBar = bars[0];
      const change = lastBar.close - firstBar.open;
      const changePercent = (change / firstBar.open) * 100;
      
      document.getElementById('chart-price').textContent = formatMoney(lastBar.close);
      const changeEl = document.getElementById('chart-change');
      changeEl.textContent = formatPercent(changePercent);
      changeEl.className = 'price-change ' + (changePercent >= 0 ? 'positive' : 'negative');
    } else {
      console.log('[Chart] No bars returned for', symbol);
    }
  } catch (e) {
    console.error('[Chart] Failed to load chart:', e);
  }
};

const initChart = () => {
  const container = document.getElementById('chart-container');
  
  requestAnimationFrame(() => {
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 460;
    
    console.log('[Chart] Initializing chart:', width, 'x', height);
    
    if (state.chart) {
      state.chart.remove();
      state.chart = null;
    }
    
    state.chart = LightweightCharts.createChart(container, {
      width: width,
      height: height,
      layout: {
        background: { type: 'solid', color: '#0f1117' },
        textColor: '#5a6078'
      },
      grid: {
        vertLines: { color: '#1e2235' },
        horzLines: { color: '#1e2235' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: '#00d4ff',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed
        },
        horzLine: {
          color: '#00d4ff',
          width: 1,
          style: LightweightCharts.LineStyle.Dashed
        }
      },
      rightPriceScale: {
        borderColor: '#1e2235'
      },
      timeScale: {
        borderColor: '#1e2235',
        timeVisible: true
      },
      handleScroll: true,
      handleScale: true
    });
    
    state.candlestickSeries = null;
    state.volumeSeries = null;
    state.emaSeries = null;

    // Reset indicator series references
    state.rsiSeries = null;
    state.macdLineSeries = null;
    state.macdSignalSeries = null;
    state.macdHistogramSeries = null;
    state.bbUpperSeries = null;
    state.bbMiddleSeries = null;
    state.bbLowerSeries = null;
    state.ema50Series = null;
    state.volumeMaSeries = null;
    state.sma20Series = null;
    state.sma50Series = null;
    state.atrSeries = null;
    state.stochasticKSeries = null;
    state.stochasticDSeries = null;
    state.vwapSeries = null;
    state.rsiPane = null;
    state.macdPane = null;

    // Reset indicator state
    state.indicators.rsi = false;
    state.indicators.macd = false;
    state.indicators.bollingerBands = false;
    state.indicators.ema50 = false;
    state.indicators.volumeMa = false;
    state.indicators.sma20 = false;
    state.indicators.sma50 = false;
    state.indicators.atr = false;
    state.indicators.stochastic = false;
    state.indicators.vwap = false;

    // Create series based on current chart type
    createSeriesForType(state.chartType);

    // Proper resize handler using ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      if (state.chart && container.clientWidth > 0 && container.clientHeight > 0) {
        state.chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight
        });
      }
    });
    
    resizeObserver.observe(container);

    // Subscribe to visible range changes for auto-loading more data
    state.chart.timeScale().subscribeVisibleRangeChange((newRange) => {
      if (!newRange || !state.currentSymbol || state.loadingMore) return;
      loadMoreOnScroll(newRange);
    });

    console.log('[Chart] Chart initialized, series ready');
  });
};

// Format bar data for the current chart type
const formatPriceData = (bars) => {
  if (state.chartType === 'line' || state.chartType === 'area') {
    return bars.map(b => ({ time: b.time, value: b.close }));
  }
  return bars;
};

// Create chart series based on type
const createSeriesForType = (type) => {
  if (!state.chart) return;

  // Volume series (always histogram)
  state.volumeSeries = state.chart.addHistogramSeries({
    color: '#26a69a',
    priceFormat: { type: 'volume' },
    priceScaleId: ''
  });
  state.volumeSeries.priceScale().applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 }
  });

  // EMA line series (always line)
  state.emaSeries = state.chart.addLineSeries({
    color: '#ffaa00',
    lineWidth: 2,
    priceLineVisible: false,
    crosshairMarkerVisible: false
  });

  // Main price series based on type
  switch (type) {
    case 'candle':
      state.candlestickSeries = state.chart.addCandlestickSeries({
        upColor: '#00ff88',
        downColor: '#ff3d5a',
        borderUpColor: '#00ff88',
        borderDownColor: '#ff3d5a',
        wickUpColor: '#00ff88',
        wickDownColor: '#ff3d5a'
      });
      break;
    case 'line':
      state.candlestickSeries = state.chart.addLineSeries({
        color: '#00d4ff',
        lineWidth: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4
      });
      break;
    case 'area':
      state.candlestickSeries = state.chart.addAreaSeries({
        topColor: 'rgba(0, 212, 255, 0.4)',
        bottomColor: 'rgba(0, 212, 255, 0.0)',
        lineColor: '#00d4ff',
        lineWidth: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4
      });
      break;
    case 'bar':
      state.candlestickSeries = state.chart.addBarSeries({
        upColor: '#00ff88',
        downColor: '#ff3d5a',
        borderUpColor: '#00ff88',
        borderDownColor: '#ff3d5a',
        borderVisible: true
      });
      break;
    default:
      state.candlestickSeries = state.chart.addCandlestickSeries({
        upColor: '#00ff88',
        downColor: '#ff3d5a',
        borderUpColor: '#00ff88',
        borderDownColor: '#ff3d5a',
        wickUpColor: '#00ff88',
        wickDownColor: '#ff3d5a'
      });
  }

  console.log('[Chart] Series created for type:', type);
};

// Switch chart type and reload data
const switchChartType = async (newType) => {
  if (!state.chart || state.chartType === newType) return;
  if (state.rawBars.length === 0) return;

  console.log('[Chart] Switching from', state.chartType, 'to', newType);

  // Remove all old series
  if (state.candlestickSeries) {
    state.chart.removeSeries(state.candlestickSeries);
    state.candlestickSeries = null;
  }
  if (state.emaSeries) {
    state.chart.removeSeries(state.emaSeries);
    state.emaSeries = null;
  }
  if (state.volumeSeries) {
    state.chart.removeSeries(state.volumeSeries);
    state.volumeSeries = null;
  }

  // Update state
  state.chartType = newType;

  // Create new series type
  createSeriesForType(newType);

  // Re-apply data to new series using stored raw bars
  const formattedData = formatPriceData(state.rawBars);
  state.candlestickSeries.setData(formattedData);

  // Re-apply volume
  const volumeData = state.rawBars.map(b => ({ time: b.time, value: b.volume || 0 }));
  state.volumeSeries.setData(volumeData);

  // Re-apply EMA
  const ema20 = calculateEMA(state.rawBars.map(b => b.close), 20);
  const emaData = state.rawBars.map((b, i) => ({
    time: b.time,
    value: ema20[i] || null
  })).filter(d => d.value !== null);
  state.emaSeries.setData(emaData);

  // Re-apply indicator data
  updateIndicatorData();

  state.chart.timeScale().fitContent();
  console.log('[Chart] Switched to', newType);
};

const updateChart = (bars, timeframe) => {
  if (!state.candlestickSeries) {
    console.log('[Chart] ERROR: candlestickSeries not initialized');
    return;
  }
  
  console.log('[Chart] Setting', bars.length, 'candles, first bar:', bars[0]);

  const formattedBars = formatPriceData(bars);
  state.candlestickSeries.setData(formattedBars);

  // Store raw OHLC bars for reformatting on chart type switch
  state.rawBars = bars;

  const volumeData = bars.map(b => ({ time: b.time, value: b.volume }));
  state.volumeSeries.setData(volumeData);

  const ema20 = calculateEMA(bars.map(b => b.close), 20);
  const emaData = bars.map((b, i) => ({
    time: b.time,
    value: ema20[i] || null
  })).filter(d => d.value !== null);
  
  state.emaSeries.setData(emaData);
  
  // Update indicator data
  updateIndicatorData();

  state.chart.timeScale().fitContent();

  // Track data bounds for infinite scroll
  state.chartDataStart = bars.length > 0 ? bars[0].time : null;
  state.chartDataEnd = bars.length > 0 ? bars[bars.length - 1].time : null;
  state.loadedEarliest = false;

  // Force resize after data load
  const container = document.getElementById('chart-container');
  setTimeout(() => {
    if (state.chart && container.clientWidth > 0 && container.clientHeight > 0) {
      state.chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight
      });
      state.chart.timeScale().fitContent();
    }
  }, 50);
  
  console.log('[Chart] Rendered, chart size:', container.clientWidth, 'x', container.clientHeight);
};

// Auto-load more data when user scrolls to data edges
const loadMoreOnScroll = async (range) => {
  if (!state.chart || !state.currentSymbol || state.loadingMore) return;
  if (!state.chartDataStart || !state.chartDataEnd) return;

  const start = state.chartDataStart;
  const end = state.chartDataEnd;
  const duration = end - start;
  if (duration <= 0) return;

  // Calculate time span of one bar based on current visible range
  const visibleRange = range.to - range.from;
  const estimatedBarCount = Math.max(50, Math.round(visibleRange / (duration / state.rawBars.length)));
  const barTimeSpan = duration / estimatedBarCount;

  // --- Scroll LEFT: load older data ---
  if (range.from <= start + barTimeSpan && !state.loadedEarliest) {
    state.loadingMore = true;
    const currentTF = state.timeframe;
    const param = getTimeframeParam(currentTF);
    const startDate = getHistoricalStart(currentTF, start);
    const endDateStr = new Date(start * 1000).toISOString();

    console.log('[Chart] Loading older data from', startDate, 'to', endDateStr);

    try {
      const result = await api.get(`/api/market/historical/${state.currentSymbol}?timeframe=${param}&start=${startDate}&end=${endDateStr}`);
      if (result.success && result.data.bars && result.data.bars.length > 0) {
        const newBars = result.data.bars.map(b => ({
          time: new Date(b.t).getTime() / 1000,
          open: parseFloat(b.o),
          high: parseFloat(b.h),
          low: parseFloat(b.l),
          close: parseFloat(b.c),
          volume: parseInt(b.v)
        }));

        state.rawBars = [...newBars, ...state.rawBars];
        state.candlestickSeries.setData(formatPriceData(state.rawBars));

        const volumeData = state.rawBars.map(b => ({ time: b.time, value: b.volume || 0 }));
        state.volumeSeries.setData(volumeData);

        const combinedCloses = state.rawBars.map(b => b.close);
        const ema20 = calculateEMA(combinedCloses, 20);
        const emaData = state.rawBars.map((b, i) => ({
          time: b.time,
          value: ema20[i] || null
        })).filter(d => d.value !== null);
        state.emaSeries.setData(emaData);

        // Update indicator data
        updateIndicatorData();

        state.chartDataStart = newBars[0].time;

        console.log('[Chart] Loaded', newBars.length, 'older bars. Total:', state.rawBars.length);
        if (newBars.length < 50) state.loadedEarliest = true;
      } else {
        state.loadedEarliest = true;
        console.log('[Chart] No older data available');
      }
    } catch (e) {
      console.error('[Chart] Failed to load older data:', e);
    }

    state.loadingMore = false;
    return;
  }

  // --- Scroll RIGHT: load newer data ---
  if (range.to >= end - barTimeSpan) {
    state.loadingMore = true;
    const currentTF = state.timeframe;
    const param = getTimeframeParam(currentTF);
    const startDate = new Date(end * 1000).toISOString();
    const endDate = new Date(end * 1000 + getForwardMs(currentTF)).toISOString();

    console.log('[Chart] Loading newer data from', startDate, 'to', endDate);

    try {
      const result = await api.get(`/api/market/historical/${state.currentSymbol}?timeframe=${param}&start=${startDate}&end=${endDate}`);
      if (result.success && result.data.bars && result.data.bars.length > 0) {
        const newBars = result.data.bars.map(b => ({
          time: new Date(b.t).getTime() / 1000,
          open: parseFloat(b.o),
          high: parseFloat(b.h),
          low: parseFloat(b.l),
          close: parseFloat(b.c),
          volume: parseInt(b.v)
        })).filter(b => b.time > end);

        if (newBars.length === 0) {
          console.log('[Chart] No newer bars available');
          state.loadingMore = false;
          return;
        }

        state.rawBars = [...state.rawBars, ...newBars];
        state.candlestickSeries.setData(formatPriceData(state.rawBars));

        const volumeData = state.rawBars.map(b => ({ time: b.time, value: b.volume || 0 }));
        state.volumeSeries.setData(volumeData);

        const combinedCloses = state.rawBars.map(b => b.close);
        const ema20 = calculateEMA(combinedCloses, 20);
        const emaData = state.rawBars.map((b, i) => ({
          time: b.time,
          value: ema20[i] || null
        })).filter(d => d.value !== null);
        state.emaSeries.setData(emaData);

        // Update indicator data
        updateIndicatorData();

        state.chartDataEnd = newBars[newBars.length - 1].time;
        console.log('[Chart] Loaded', newBars.length, 'newer bars. Total:', state.rawBars.length);
      }
    } catch (e) {
      console.error('[Chart] Failed to load newer data:', e);
    }

    state.loadingMore = false;
  }
};

// Get a start date for loading historical data before a given timestamp
const getHistoricalStart = (tf, beforeTimestamp) => {
  const before = new Date(beforeTimestamp * 1000);
  const map = {
    '1D': new Date(before.getTime() - 3 * 24 * 60 * 60 * 1000),
    '5D': new Date(before.getTime() - 10 * 24 * 60 * 60 * 1000),
    '1M': new Date(before.getTime() - 40 * 24 * 60 * 60 * 1000),
    '3M': new Date(before.getTime() - 110 * 24 * 60 * 60 * 1000),
    '1Y': new Date(before.getTime() - 420 * 24 * 60 * 60 * 1000)
  };
  return (map[tf] || map['1M']).toISOString();
};

// Get milliseconds to load forward for newer data
const getForwardMs = (tf) => {
  const map = {
    '1D': 2 * 24 * 60 * 60 * 1000,
    '5D': 8 * 24 * 60 * 60 * 1000,
    '1M': 35 * 24 * 60 * 60 * 1000,
    '3M': 100 * 24 * 60 * 60 * 1000,
    '1Y': 400 * 24 * 60 * 60 * 1000
  };
  return map[tf] || map['1M'];
};

// Resizable panel functionality
const initResizable = () => {
  const grid = document.querySelector('.dashboard-grid');
  if (!grid) return;
  
  let isResizing = false;
  let resizeType = null;
  let startPos = 0;
  let startColWidths = [];
  let startRowHeights = [];
  
  const cols = ['account-panel', 'chart-panel', 'watchlist-panel'];
  const rows = ['account-panel', 'chart-panel', 'positions-panel'];
  
  // Add right-edge resize handles to panels
  document.querySelectorAll('.panel').forEach(panel => {
    const rightHandle = document.createElement('div');
    rightHandle.className = 'panel-resize-h';
    rightHandle.title = 'Drag to resize column';
    panel.appendChild(rightHandle);
    
    rightHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      resizeType = 'col';
      startPos = e.clientX;
      
      // Get current column widths
      startColWidths = [
        parseInt(getComputedStyle(grid).gridTemplateColumns.split(' ')[0]) || 280,
        parseInt(getComputedStyle(grid).gridTemplateColumns.split(' ')[1]) || 1,
        parseInt(getComputedStyle(grid).gridTemplateColumns.split(' ')[2]) || 320
      ];
      
      document.body.style.cursor = 'col-resize';
      e.preventDefault();
    });
  });
  
  // Add bottom-edge resize handles
  ['.chart-panel', '.positions-panel', '.orders-panel'].forEach(sel => {
    const panel = document.querySelector(sel);
    if (!panel) return;
    
    const bottomHandle = document.createElement('div');
    bottomHandle.className = 'panel-resize-v';
    bottomHandle.title = 'Drag to resize row';
    bottomHandle.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:8px;cursor:row-resize;z-index:50;';
    panel.appendChild(bottomHandle);
    
    bottomHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      resizeType = 'row';
      startPos = e.clientY;
      
      startRowHeights = [
        parseInt(getComputedStyle(grid).gridTemplateRows.split(' ')[0]) || 180,
        parseInt(getComputedStyle(grid).gridTemplateRows.split(' ')[1]) || 400,
        parseInt(getComputedStyle(grid).gridTemplateRows.split(' ')[2]) || 180
      ];
      
      document.body.style.cursor = 'row-resize';
      e.preventDefault();
    });
  });
  
  const doResize = (clientPos) => {
    if (resizeType === 'col') {
      const delta = clientPos - startPos;
      const newWidths = [...startColWidths];
      
      // Find which column we're in and adjust
      newWidths[2] = Math.max(200, Math.min(500, startColWidths[2] + delta));
      grid.style.gridTemplateColumns = `${newWidths[0]}px 1fr ${newWidths[2]}px`;
    } else if (resizeType === 'row') {
      const delta = clientPos - startPos;
      const newHeights = [...startRowHeights];
      newHeights[1] = Math.max(200, startRowHeights[1] + delta);
      grid.style.gridTemplateRows = `minmax(120px, auto) minmax(${newHeights[1]}px, 1fr) minmax(120px, auto)`;
    }
  };
  
  document.addEventListener('mousemove', (e) => {
    if (isResizing) {
      doResize(resizeType === 'col' ? e.clientX : e.clientY);
    }
  });
  
  document.addEventListener('mouseup', () => {
    isResizing = false;
    resizeType = null;
    document.body.style.cursor = '';
  });
};

const calculateEMA = (prices, period) => {
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      ema.push(null);
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    let avg = sum / period;
    
    if (i === period - 1) {
      ema.push(avg);
    } else {
      ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
  }
  
  return ema;
};

// === Indicator Calculation Functions ===

// RSI (Relative Strength Index) - 14 period
const calculateRSI = (closes, period = 14) => {
  const rsi = [];
  const gains = [];
  const losses = [];

  for (let i = 0; i < closes.length; i++) {
    if (i === 0) {
      gains.push(0);
      losses.push(0);
      rsi.push(null);
      continue;
    }
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);

    if (i < period) {
      rsi.push(null);
    } else {
      const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
  }
  return rsi;
};

// MACD - returns { macdLine, signalLine, histogram }
const calculateMACD = (closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);

  const macdLine = [];
  const signalLine = [];
  const histogram = [];

  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
      signalLine.push(null);
      histogram.push(null);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  // Calculate signal line (9-period EMA of MACD line)
  const signalEMA = calculateEMAWithNull(macdLine, signalPeriod);
  for (let i = 0; i < closes.length; i++) {
    signalLine.push(signalEMA[i]);
    if (macdLine[i] !== null && signalEMA[i] !== null) {
      histogram.push(macdLine[i] - signalEMA[i]);
    } else {
      histogram.push(null);
    }
  }

  return { macdLine, signalLine, histogram };
};

// EMA that handles null values
const calculateEMAWithNull = (values, period) => {
  const result = [];
  let ema = null;
  let count = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i] === null) {
      result.push(null);
      continue;
    }

    count++;
    if (count === 1) {
      ema = values[i];
    } else {
      const multiplier = 2 / (period + 1);
      ema = (values[i] - ema) * multiplier + ema;
    }

    result.push(count >= period ? ema : null);
  }

  return result;
};

// Bollinger Bands - returns { upper, middle, lower }
const calculateBollingerBands = (closes, period = 20, stdDev = 2) => {
  const sma = [];
  const upper = [];
  const lower = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      sma.push(null);
      upper.push(null);
      lower.push(null);
      continue;
    }

    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const std = Math.sqrt(variance);

    sma.push(mean);
    upper.push(mean + stdDev * std);
    lower.push(mean - stdDev * std);
  }

  return { upper, middle: sma, lower };
};

// SMA for volumes
const calculateVolumeSMA = (volumes, period = 20) => {
  const sma = [];
  for (let i = 0; i < volumes.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      const slice = volumes.slice(i - period + 1, i + 1);
      sma.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return sma;
};

// SMA (Simple Moving Average) calculation
const calculateSMA = (values, period) => {
  const sma = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      const slice = values.slice(i - period + 1, i + 1);
      sma.push(slice.reduce((a, b) => a + b, 0) / period);
    }
  }
  return sma;
};

// ATR (Average True Range) calculation
const calculateATR = (bars, period = 14) => {
  const atr = [];
  const trueRanges = [];
  
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      trueRanges.push(bars[i].high - bars[i].low);
      atr.push(null);
    } else {
      const tr = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close)
      );
      trueRanges.push(tr);
      
      if (i < period - 1) {
        atr.push(null);
      } else if (i === period - 1) {
        const sum = trueRanges.slice(0, period).reduce((a, b) => a + b, 0);
        atr.push(sum / period);
      } else {
        atr.push((atr[i - 1] * (period - 1) + trueRanges[i]) / period);
      }
    }
  }
  return atr;
};

// Stochastic Oscillator calculation - returns { k, d }
const calculateStochastic = (bars, kPeriod = 14, dPeriod = 3) => {
  const k = [];
  const d = [];
  
  for (let i = 0; i < bars.length; i++) {
    if (i < kPeriod - 1) {
      k.push(null);
      d.push(null);
    } else {
      let highest = -Infinity;
      let lowest = Infinity;
      
      for (let j = i - kPeriod + 1; j <= i; j++) {
        highest = Math.max(highest, bars[j].high);
        lowest = Math.min(lowest, bars[j].low);
      }
      
      const range = highest - lowest;
      if (range === 0) {
        k.push(50);
      } else {
        k.push(((bars[i].close - lowest) / range) * 100);
      }
    }
  }
  
  // Calculate %D (SMA of %K)
  for (let i = 0; i < k.length; i++) {
    if (i < kPeriod - 1 + dPeriod - 1) {
      d.push(null);
    } else {
      const slice = k.slice(i - dPeriod + 1, i + 1);
      const validValues = slice.filter(v => v !== null);
      d.push(validValues.length === dPeriod ? validValues.reduce((a, b) => a + b, 0) / dPeriod : null);
    }
  }
  
  return { k, d };
};

// VWAP (Volume Weighted Average Price) calculation
const calculateVWAP = (bars) => {
  const vwap = [];
  let cumulativeTPV = 0;  // cumulative (Typical Price * Volume)
  let cumulativeVolume = 0;
  
  for (let i = 0; i < bars.length; i++) {
    const typicalPrice = (bars[i].high + bars[i].low + bars[i].close) / 3;
    cumulativeTPV += typicalPrice * (bars[i].volume || 0);
    cumulativeVolume += (bars[i].volume || 0);
    
    if (cumulativeVolume === 0) {
      vwap.push(null);
    } else {
      vwap.push(cumulativeTPV / cumulativeVolume);
    }
  }
  return vwap;
};

// === Indicator Toggle Functions ===

const toggleIndicator = (indicatorName) => {
  if (!state.chart || state.rawBars.length === 0) return;

  const enabled = !state.indicators[indicatorName];
  state.indicators[indicatorName] = enabled;

  // Update button state
  const btn = document.querySelector(`[data-indicator="${indicatorName}"]`);
  if (btn) {
    btn.classList.toggle('active', enabled);
  }

  // Add or remove the indicator
  switch (indicatorName) {
    case 'rsi':
      toggleRSI(enabled);
      break;
    case 'macd':
      toggleMACD(enabled);
      break;
    case 'bollingerBands':
      toggleBollingerBands(enabled);
      break;
    case 'ema50':
      toggleEMA50(enabled);
      break;
    case 'volumeMa':
      toggleVolumeMA(enabled);
      break;
    case 'sma20':
      toggleSMA20(enabled);
      break;
    case 'sma50':
      toggleSMA50(enabled);
      break;
    case 'atr':
      toggleATR(enabled);
      break;
    case 'stochastic':
      toggleStochastic(enabled);
      break;
    case 'vwap':
      toggleVWAP(enabled);
      break;
  }
};

// Remove all indicator series safely
const removeAllIndicators = () => {
  const seriesMap = [
    'rsiSeries', 'rsiPane',
    'macdHistogramSeries', 'macdLineSeries', 'macdSignalSeries', 'macdPane',
    'bbUpperSeries', 'bbMiddleSeries', 'bbLowerSeries',
    'ema50Series', 'volumeMaSeries',
    'sma20Series', 'sma50Series', 'atrSeries',
    'stochasticKSeries', 'stochasticDSeries', 'vwapSeries'
  ];
  seriesMap.forEach(key => {
    if (state[key]) {
      try { state.chart.removeSeries(state[key]); } catch(e) {}
      state[key] = null;
    }
  });
};

const toggleRSI = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    // Remove existing if any
    if (state.rsiSeries) {
      try { state.chart.removeSeries(state.rsiSeries); } catch(e) {}
      state.rsiSeries = null;
    }

    // Create RSI series with its own price scale (right side)
    state.rsiSeries = state.chart.addLineSeries({
      color: '#e040fb',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      scaleMargins: { top: 0.75, bottom: 0.05 }
    });

    const closes = state.rawBars.map(b => b.close);
    const rsiData = calculateRSI(closes, 14);
    const data = state.rawBars.map((b, i) => ({
      time: b.time,
      value: rsiData[i],
      color: rsiData[i] > 70 ? '#ef4444' : rsiData[i] < 30 ? '#10b981' : '#e040fb'
    })).filter(d => d.value !== null);
    state.rsiSeries.setData(data);
  } else {
    if (state.rsiSeries) {
      try { state.chart.removeSeries(state.rsiSeries); } catch(e) {}
      state.rsiSeries = null;
    }
  }
};

const toggleMACD = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    // Clean up existing
    ['macdHistogramSeries', 'macdLineSeries', 'macdSignalSeries'].forEach(k => {
      if (state[k]) { try { state.chart.removeSeries(state[k]); } catch(e) {} state[k] = null; }
    });

    // MACD histogram
    state.macdHistogramSeries = state.chart.addHistogramSeries({
      color: '#00d4ff',
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      scaleMargins: { top: 0.85, bottom: 0.1 }
    });

    // MACD line
    state.macdLineSeries = state.chart.addLineSeries({
      color: '#3b82f6',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      scaleMargins: { top: 0.85, bottom: 0.1 }
    });

    // Signal line
    state.macdSignalSeries = state.chart.addLineSeries({
      color: '#f97316',
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      scaleMargins: { top: 0.85, bottom: 0.1 }
    });

    const closes = state.rawBars.map(b => b.close);
    const macd = calculateMACD(closes);

    const histogramData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: macd.histogram[i],
      color: macd.histogram[i] >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'
    })).filter(d => d.value !== null);
    state.macdHistogramSeries.setData(histogramData);

    const lineData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: macd.macdLine[i]
    })).filter(d => d.value !== null);
    state.macdLineSeries.setData(lineData);

    const signalData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: macd.signalLine[i]
    })).filter(d => d.value !== null);
    state.macdSignalSeries.setData(signalData);
  } else {
    ['macdHistogramSeries', 'macdLineSeries', 'macdSignalSeries'].forEach(k => {
      if (state[k]) { try { state.chart.removeSeries(state[k]); } catch(e) {} state[k] = null; }
    });
  }
};

const toggleBollingerBands = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    ['bbUpperSeries', 'bbMiddleSeries', 'bbLowerSeries'].forEach(k => {
      if (state[k]) { try { state.chart.removeSeries(state[k]); } catch(e) {} state[k] = null; }
    });

    const closes = state.rawBars.map(b => b.close);
    const bb = calculateBollingerBands(closes, 20, 2);

    state.bbUpperSeries = state.chart.addLineSeries({
      color: 'rgba(168, 85, 247, 0.6)',
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    state.bbMiddleSeries = state.chart.addLineSeries({
      color: 'rgba(168, 85, 247, 0.9)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    state.bbLowerSeries = state.chart.addLineSeries({
      color: 'rgba(168, 85, 247, 0.6)',
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    state.bbUpperSeries.setData(state.rawBars.map((b, i) => ({ time: b.time, value: bb.upper[i] })).filter(d => d.value !== null));
    state.bbMiddleSeries.setData(state.rawBars.map((b, i) => ({ time: b.time, value: bb.middle[i] })).filter(d => d.value !== null));
    state.bbLowerSeries.setData(state.rawBars.map((b, i) => ({ time: b.time, value: bb.lower[i] })).filter(d => d.value !== null));
  } else {
    ['bbUpperSeries', 'bbMiddleSeries', 'bbLowerSeries'].forEach(k => {
      if (state[k]) { try { state.chart.removeSeries(state[k]); } catch(e) {} state[k] = null; }
    });
  }
};

const toggleEMA50 = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    if (state.ema50Series) { try { state.chart.removeSeries(state.ema50Series); } catch(e) {} state.ema50Series = null; }

    state.ema50Series = state.chart.addLineSeries({
      color: '#a855f7',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    const closes = state.rawBars.map(b => b.close);
    const ema50 = calculateEMA(closes, 50);
    state.ema50Series.setData(state.rawBars.map((b, i) => ({ time: b.time, value: ema50[i] })).filter(d => d.value !== null));
  } else {
    if (state.ema50Series) { try { state.chart.removeSeries(state.ema50Series); } catch(e) {} state.ema50Series = null; }
  }
};

const toggleVolumeMA = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    if (state.volumeMaSeries) { try { state.chart.removeSeries(state.volumeMaSeries); } catch(e) {} state.volumeMaSeries = null; }

    state.volumeMaSeries = state.chart.addLineSeries({
      color: '#facc15',
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    const volumes = state.rawBars.map(b => b.volume || 0);
    const volMa = calculateVolumeSMA(volumes, 20);
    state.volumeMaSeries.setData(state.rawBars.map((b, i) => ({ time: b.time, value: volMa[i] })).filter(d => d.value !== null));
  } else {
    if (state.volumeMaSeries) { try { state.chart.removeSeries(state.volumeMaSeries); } catch(e) {} state.volumeMaSeries = null; }
  }
};

// Toggle SMA 20
const toggleSMA20 = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    if (state.sma20Series) { try { state.chart.removeSeries(state.sma20Series); } catch(e) {} state.sma20Series = null; }

    state.sma20Series = state.chart.addLineSeries({
      color: '#22d3ee',
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    const closes = state.rawBars.map(b => b.close);
    const sma20 = calculateSMA(closes, 20);
    state.sma20Series.setData(state.rawBars.map((b, i) => ({ time: b.time, value: sma20[i] })).filter(d => d.value !== null));
  } else {
    if (state.sma20Series) { try { state.chart.removeSeries(state.sma20Series); } catch(e) {} state.sma20Series = null; }
  }
};

// Toggle SMA 50
const toggleSMA50 = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    if (state.sma50Series) { try { state.chart.removeSeries(state.sma50Series); } catch(e) {} state.sma50Series = null; }

    state.sma50Series = state.chart.addLineSeries({
      color: '#fb923c',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    const closes = state.rawBars.map(b => b.close);
    const sma50 = calculateSMA(closes, 50);
    state.sma50Series.setData(state.rawBars.map((b, i) => ({ time: b.time, value: sma50[i] })).filter(d => d.value !== null));
  } else {
    if (state.sma50Series) { try { state.chart.removeSeries(state.sma50Series); } catch(e) {} state.sma50Series = null; }
  }
};

// Toggle ATR
const toggleATR = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    if (state.atrSeries) { try { state.chart.removeSeries(state.atrSeries); } catch(e) {} state.atrSeries = null; }

    state.atrSeries = state.chart.addLineSeries({
      color: '#a78bfa',
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    const atr = calculateATR(state.rawBars, 14);
    state.atrSeries.setData(state.rawBars.map((b, i) => ({ time: b.time, value: atr[i] })).filter(d => d.value !== null));
  } else {
    if (state.atrSeries) { try { state.chart.removeSeries(state.atrSeries); } catch(e) {} state.atrSeries = null; }
  }
};

// Toggle Stochastic
const toggleStochastic = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    ['stochasticKSeries', 'stochasticDSeries'].forEach(k => {
      if (state[k]) { try { state.chart.removeSeries(state[k]); } catch(e) {} state[k] = null; }
    });

    state.stochasticKSeries = state.chart.addLineSeries({
      color: '#f472b6',
      lineWidth: 1,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      scaleMargins: { top: 0.85, bottom: 0.1 }
    });

    state.stochasticDSeries = state.chart.addLineSeries({
      color: '#facc15',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      scaleMargins: { top: 0.85, bottom: 0.1 }
    });

    const stoch = calculateStochastic(state.rawBars, 14, 3);

    state.stochasticKSeries.setData(state.rawBars.map((b, i) => ({
      time: b.time,
      value: stoch.k[i]
    })).filter(d => d.value !== null));

    state.stochasticDSeries.setData(state.rawBars.map((b, i) => ({
      time: b.time,
      value: stoch.d[i]
    })).filter(d => d.value !== null));
  } else {
    ['stochasticKSeries', 'stochasticDSeries'].forEach(k => {
      if (state[k]) { try { state.chart.removeSeries(state[k]); } catch(e) {} state[k] = null; }
    });
  }
};

// Toggle VWAP
const toggleVWAP = (enabled) => {
  if (!state.chart) return;

  if (enabled) {
    if (state.vwapSeries) { try { state.chart.removeSeries(state.vwapSeries); } catch(e) {} state.vwapSeries = null; }

    state.vwapSeries = state.chart.addLineSeries({
      color: '#4ade80',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });

    const vwap = calculateVWAP(state.rawBars);
    state.vwapSeries.setData(state.rawBars.map((b, i) => ({ time: b.time, value: vwap[i] })).filter(d => d.value !== null));
  } else {
    if (state.vwapSeries) { try { state.chart.removeSeries(state.vwapSeries); } catch(e) {} state.vwapSeries = null; }
  }
};


// Update indicator data when chart is updated
const updateIndicatorData = () => {
  if (state.rawBars.length === 0) return;

  const closes = state.rawBars.map(b => b.close);

  // Update RSI
  if (state.rsiSeries && state.indicators.rsi) {
    const rsiData = calculateRSI(closes, 14);
    const data = state.rawBars.map((b, i) => ({
      time: b.time,
      value: rsiData[i],
      color: rsiData[i] > 70 ? '#ef4444' : rsiData[i] < 30 ? '#10b981' : '#e040fb'
    })).filter(d => d.value !== null);
    state.rsiSeries.setData(data);
  }

  // Update MACD
  if (state.macdLineSeries && state.indicators.macd) {
    const macd = calculateMACD(closes);

    const histogramData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: macd.histogram[i],
      color: macd.histogram[i] >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'
    })).filter(d => d.value !== null);
    state.macdHistogramSeries.setData(histogramData);

    const lineData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: macd.macdLine[i]
    })).filter(d => d.value !== null);
    state.macdLineSeries.setData(lineData);

    const signalData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: macd.signalLine[i]
    })).filter(d => d.value !== null);
    state.macdSignalSeries.setData(signalData);
  }

  // Update Bollinger Bands
  if (state.bbUpperSeries && state.indicators.bollingerBands) {
    const bb = calculateBollingerBands(closes, 20, 2);

    const upperData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: bb.upper[i]
    })).filter(d => d.value !== null);
    state.bbUpperSeries.setData(upperData);

    const middleData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: bb.middle[i]
    })).filter(d => d.value !== null);
    state.bbMiddleSeries.setData(middleData);

    const lowerData = state.rawBars.map((b, i) => ({
      time: b.time,
      value: bb.lower[i]
    })).filter(d => d.value !== null);
    state.bbLowerSeries.setData(lowerData);
  }

  // Update EMA 50
  if (state.ema50Series && state.indicators.ema50) {
    const ema50 = calculateEMA(closes, 50);
    const data = state.rawBars.map((b, i) => ({
      time: b.time,
      value: ema50[i]
    })).filter(d => d.value !== null);
    state.ema50Series.setData(data);
  }

  // Update Volume MA
  if (state.volumeMaSeries && state.indicators.volumeMa) {
    const volumes = state.rawBars.map(b => b.volume);
    const sma = calculateVolumeSMA(volumes, 20);
    const data = state.rawBars.map((b, i) => ({
      time: b.time,
      value: sma[i]
    })).filter(d => d.value !== null);
    state.volumeMaSeries.setData(data);
  }

  // Update SMA 20
  if (state.sma20Series && state.indicators.sma20) {
    const sma20 = calculateSMA(closes, 20);
    const data = state.rawBars.map((b, i) => ({
      time: b.time,
      value: sma20[i]
    })).filter(d => d.value !== null);
    state.sma20Series.setData(data);
  }

  // Update SMA 50
  if (state.sma50Series && state.indicators.sma50) {
    const sma50 = calculateSMA(closes, 50);
    const data = state.rawBars.map((b, i) => ({
      time: b.time,
      value: sma50[i]
    })).filter(d => d.value !== null);
    state.sma50Series.setData(data);
  }

  // Update ATR
  if (state.atrSeries && state.indicators.atr) {
    const atr = calculateATR(state.rawBars, 14);
    const data = state.rawBars.map((b, i) => ({
      time: b.time,
      value: atr[i]
    })).filter(d => d.value !== null);
    state.atrSeries.setData(data);
  }

  // Update Stochastic
  if (state.stochasticKSeries && state.indicators.stochastic) {
    const stoch = calculateStochastic(state.rawBars, 14, 3);
    state.stochasticKSeries.setData(state.rawBars.map((b, i) => ({
      time: b.time,
      value: stoch.k[i]
    })).filter(d => d.value !== null));
    state.stochasticDSeries.setData(state.rawBars.map((b, i) => ({
      time: b.time,
      value: stoch.d[i]
    })).filter(d => d.value !== null));
  }

  // Update VWAP
  if (state.vwapSeries && state.indicators.vwap) {
    const vwap = calculateVWAP(state.rawBars);
    const data = state.rawBars.map((b, i) => ({
      time: b.time,
      value: vwap[i]
    })).filter(d => d.value !== null);
    state.vwapSeries.setData(data);
  }
};

// Disable all indicators (used when reinitializing chart)
const disableAllIndicators = () => {
  Object.keys(state.indicators).forEach(key => {
    if (state.indicators[key]) {
      toggleIndicator(key);
    }
  });
};

const renderAccount = () => {
  if (!state.account) return;
  
  const acc = state.account;
  document.getElementById('account-equity').textContent = formatMoney(acc.equity);
  document.getElementById('buying-power').textContent = formatMoney(acc.buying_power);
  document.getElementById('cash-balance').textContent = formatMoney(acc.cash);
  document.getElementById('portfolio-value').textContent = formatMoney(acc.portfolio_value);
  
  const pnl = parseFloat(acc.equity) - parseFloat(acc.cash);
  const pnlEl = document.getElementById('day-pnl');
  pnlEl.textContent = formatMoney(pnl);
  pnlEl.className = 'stat-value ' + (pnl >= 0 ? 'positive' : 'negative');
  
  document.getElementById('account-status').textContent = acc.status;
};

const renderClock = () => {
  if (!state.clock) return;
  
  const { is_open, next_open, next_close } = state.clock;
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('market-status');
  const nextMarket = document.getElementById('next-market');
  
  let status = 'CLOSED';
  dot.className = 'status-dot closed';
  
  if (is_open) {
    status = 'OPEN';
    dot.className = 'status-dot open';
  } else {
    const now = new Date();
    const openTime = new Date(next_open);
    const closeTime = new Date(next_close);
    
    if (now < openTime) {
      const preMarket = new Date(openTime.getTime() - 60 * 60 * 1000);
      if (now >= preMarket) {
        status = 'PRE-MARKET';
        dot.className = 'status-dot pre';
      } else {
        status = 'CLOSED';
      }
    } else if (now < closeTime) {
      const afterHours = new Date(closeTime.getTime() + 60 * 60 * 1000);
      if (now >= closeTime && now < afterHours) {
        status = 'AFTER-HOURS';
        dot.className = 'status-dot after';
      }
    }
  }
  
  statusText.textContent = status;
  
  if (next_close) {
    const closeDate = new Date(next_close);
    nextMarket.textContent = closeDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  }
};

// Render watchlist tabs (the selector at top)
const renderWatchlistTabs = () => {
  const container = document.getElementById('watchlist-tabs');
  if (!container) return;
  
  container.innerHTML = '';
  
  Object.keys(state.watchlists).forEach(name => {
    const tab = document.createElement('div');
    tab.className = 'wl-tab' + (name === state.activeWatchlist ? ' active' : '');
    tab.dataset.wl = name;
    tab.title = state.watchlists[name].length + ' symbols';
    
    // Show name, truncate if long
    const displayName = name.length > 12 ? name.substring(0, 10) + '...' : name;
    tab.innerHTML = `
      <span class="wl-tab-name">${displayName}</span>
      <span class="wl-tab-count">${state.watchlists[name].length}</span>
    `;
    
    container.appendChild(tab);
  });
};

const renderWatchlist = () => {
  const tbody = document.getElementById('watchlist-body');
  tbody.innerHTML = '';

  const positionsBySymbol = {};
  state.positions.forEach(p => {
    positionsBySymbol[p.symbol] = true;
  });

  state.watchlist.forEach(symbol => {
    const quote = state.watchlistQuotes[symbol] || {};
    const hasPosition = positionsBySymbol[symbol];
    const hasNote = state.symbolNotes[symbol] && state.symbolNotes[symbol].trim().length > 0;
    
    const row = document.createElement('tr');
    row.className = 'watchlist-row' + (hasPosition ? ' has-position' : '');
    row.dataset.symbol = symbol;
    row.onclick = (e) => {
      if (e.target.classList.contains('remove-wl-btn') || 
          e.target.classList.contains('note-btn')) return;
      state.currentSymbol = symbol;
      document.getElementById('chart-symbol').value = symbol;
      loadChart(symbol, state.timeframe);
    };
    row.title = 'Click to load chart';
    
    const last = quote.last || quote.bid || 0;
    const bid = quote.bid || 0;
    const ask = quote.ask || 0;
    
    row.innerHTML = `
      <td class="symbol-cell">
        <span class="remove-wl-btn" data-symbol="${symbol}" title="Remove">&times;</span>
        ${symbol}
        <span class="note-btn ${hasNote ? 'has-note' : ''}" data-symbol="${symbol}" title="${hasNote ? 'View/Edit Note' : 'Add Note'}">&#9998;</span>
      </td>
      <td>${bid ? formatNumber(bid, 2) : '--'}</td>
      <td>${ask ? formatNumber(ask, 2) : '--'}</td>
      <td>${last ? formatNumber(last, 2) : '--'}</td>
      <td class="${quote.change >= 0 ? 'positive' : 'negative'}">${quote.change !== undefined ? formatPercent(quote.change) : '--'}</td>
    `;
    
    tbody.appendChild(row);
  });

  // Bind remove buttons
  tbody.querySelectorAll('.remove-wl-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const sym = btn.dataset.symbol;
      removeFromWatchlist(sym);
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ type: 'unsubscribe', symbols: [sym] }));
      }
    };
  });
  
  // Bind note buttons
  tbody.querySelectorAll('.note-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const sym = btn.dataset.symbol;
      openNoteModal(sym);
    };
  });
};

const renderPositions = () => {
  const tbody = document.getElementById('positions-body');
  
  if (!state.positions || state.positions.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No open positions</td></tr>';
    console.log('[UI] No positions to display');
    return;
  }
  
  console.log('[UI] Rendering', state.positions.length, 'positions');
  tbody.innerHTML = '';
  
  state.positions.forEach(pos => {
    const currentPrice = parseFloat(pos.current_price);
    const avgEntry = parseFloat(pos.avg_entry_price);
    const marketValue = parseFloat(pos.market_value);
    const unrealizedPL = parseFloat(pos.unrealized_pl);
    const unrealizedPLPercent = parseFloat(pos.unrealized_plpc);
    
    const row = document.createElement('tr');
    row.dataset.symbol = pos.symbol;
    row.onclick = () => {
      state.currentSymbol = pos.symbol;
      document.getElementById('chart-symbol').value = pos.symbol;
      loadChart(pos.symbol, state.timeframe);
    };
    
    row.innerHTML = `
      <td class="symbol-cell">${pos.symbol}</td>
      <td>${pos.qty}</td>
      <td>${formatMoney(avgEntry)}</td>
      <td>${formatMoney(avgEntry * parseFloat(pos.qty))}</td>
      <td>${formatMoney(currentPrice)}</td>
      <td>${formatMoney(marketValue)}</td>
      <td class="${unrealizedPL >= 0 ? 'positive' : 'negative'}">${formatMoney(unrealizedPL)}</td>
      <td class="${unrealizedPLPercent >= 0 ? 'positive' : 'negative'}">${formatPercent(unrealizedPLPercent)}</td>
      <td><button class="close-pos-btn" data-symbol="${pos.symbol}">Close</button></td>
    `;
    
    tbody.appendChild(row);
  });
  
  // Add close position handlers
  tbody.querySelectorAll('.close-pos-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const symbol = btn.dataset.symbol;
      if (confirm(`Close position in ${symbol}?`)) {
        try {
          const result = await api.delete(`/api/positions/${symbol}`);
          if (result.success) {
            loadPositions();
            loadAccount();
          } else {
            showToast(result.error || 'Failed to close position', 'error');
          }
        } catch (e) {
          showToast('Failed to close position', 'error');
        }
      }
    };
  });
  
  renderWatchlist();
};

const renderOrders = () => {
  const tbody = document.getElementById('orders-body');
  
  if (!state.orders || state.orders.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No recent orders</td></tr>';
    console.log('[UI] No orders to display');
    return;
  }
  
  console.log('[UI] Rendering', state.orders.length, 'orders');
  tbody.innerHTML = '';
  
  state.orders.forEach(order => {
    const row = document.createElement('tr');
    const sideClass = order.side === 'buy' ? 'buy' : 'sell';
    const statusClass = 'status-' + order.status.replace('_', '_');

    let actionsHTML = '';
    const isActive = !['filled', 'cancelled', 'rejected', 'expired'].includes(order.status);
    if (isActive) {
      actionsHTML = `<button class="modify-btn" data-order-id="${order.id}" data-symbol="${order.symbol}" data-side="${order.side}" data-type="${order.type}" data-qty="${order.qty}" data-limit="${order.limit_price || ''}" data-tif="${order.time_in_force}">Modify</button>
        <button class="cancel-btn" data-order-id="${order.id}">Cancel</button>`;
    }
    
    row.innerHTML = `
      <td>${order.symbol}</td>
      <td class="${sideClass}">${order.side.toUpperCase()}</td>
      <td>${order.type.replace('_', ' ')}</td>
      <td>${order.qty}</td>
      <td>${order.filled_qty}</td>
      <td>${order.limit_price ? formatMoney(order.limit_price) : order.stop_price ? formatMoney(order.stop_price) : '--'}</td>
      <td class="${statusClass}">${order.status.replace('_', ' ')}</td>
      <td>${formatDate(order.submitted_at)}</td>
      <td>${actionsHTML}</td>
    `;
    
    tbody.appendChild(row);
  });
  
  tbody.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const orderId = btn.dataset.orderId;
      if (confirm('Cancel this order?')) {
        deleteOrder(orderId);
      }
    };
  });
};

const render = async () => {
  console.log('[App] Initializing dashboard...');
  await Promise.all([loadAccount(), loadPositions(), loadOrders(), loadClock()]);
  
  // Load portfolio history for equity chart
  loadPortfolioHistory();
  
  // Load initial quotes for watchlist using batch snapshots
  console.log('[App] Loading watchlist quotes via snapshots...');
  loadSnapshots();
  
  // Load activities
  loadActivities();
  
  console.log('[App] Loading default chart:', state.currentSymbol, state.timeframe);
  initChart();
  loadChart(state.currentSymbol, state.timeframe);
};

const addToWatchlist = () => {
  const input = document.getElementById('watchlist-add');
  const symbol = input.value.toUpperCase().trim();
  
  if (symbol && !state.watchlist.includes(symbol)) {
    state.watchlist.push(symbol);
    state.watchlists[state.activeWatchlist] = state.watchlist;
    localStorage.setItem('watchlists', JSON.stringify(state.watchlists));
    input.value = '';
    
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'subscribe',
        symbols: [symbol]
      }));
    }
    
    // Load snapshot for new symbol
    api.get(`/api/market/snapshot/${symbol}`).then(result => {
      if (result.success && result.data) {
        const snapshot = result.data;
        if (snapshot.latestQuote) {
          const q = snapshot.latestQuote;
          const trade = snapshot.latestTrade;
          
          let change = 0;
          if (snapshot.dailyBar && trade) {
            const prevClose = snapshot.prevDailyBar?.c || snapshot.dailyBar.o;
            change = ((trade.p - prevClose) / prevClose) * 100;
          }
          
          state.watchlistQuotes[symbol] = {
            bid: parseFloat(q.bp || 0),
            ask: parseFloat(q.ap || 0),
            last: trade ? parseFloat(trade.p) : parseFloat(q.ap || q.bp || 0),
            change: change
          };
        }
      }
      renderWatchlist();
    });
    
    renderWatchlist();
  }
};

const removeFromWatchlist = (symbol) => {
  const idx = state.watchlist.indexOf(symbol);
  if (idx > -1) {
    state.watchlist.splice(idx, 1);
    state.watchlists[state.activeWatchlist] = state.watchlist;
    localStorage.setItem('watchlists', JSON.stringify(state.watchlists));
    delete state.watchlistQuotes[symbol];
    renderWatchlist();
  }
};

// Switch active watchlist
const switchWatchlist = (name) => {
  if (!state.watchlists[name]) return;
  
  state.activeWatchlist = name;
  state.watchlist = state.watchlists[name];
  localStorage.setItem('activeWatchlist', name);
  
  // Update WebSocket subscription
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({
      type: 'subscribe',
      symbols: state.watchlist
    }));
  }
  
  // Clear quotes for symbols not in new watchlist
  Object.keys(state.watchlistQuotes).forEach(sym => {
    if (state.watchlist.indexOf(sym) === -1) {
      delete state.watchlistQuotes[sym];
    }
  });
  
  renderWatchlistTabs();
  renderWatchlist();
  loadSnapshots();
};

// Create new watchlist
const createWatchlist = (name) => {
  if (!name || state.watchlists[name]) return;
  
  state.watchlists[name] = [];
  localStorage.setItem('watchlists', JSON.stringify(state.watchlists));
  switchWatchlist(name);
  renderWatchlistTabs();
};

// Delete a watchlist
const deleteWatchlist = (name) => {
  if (Object.keys(state.watchlists).length <= 1) {
    showToast('Cannot delete the last watchlist', 'warning');
    return;
  }
  
  if (!confirm(`Delete watchlist "${name}"?`)) return;
  
  delete state.watchlists[name];
  localStorage.setItem('watchlists', JSON.stringify(state.watchlists));
  
  if (state.activeWatchlist === name) {
    const firstKey = Object.keys(state.watchlists)[0];
    switchWatchlist(firstKey);
  }
  
  renderWatchlistTabs();
};

// Rename a watchlist
const renameWatchlist = (oldName, newName) => {
  if (!newName || state.watchlists[newName]) return;
  if (oldName === newName) return;
  
  state.watchlists[newName] = state.watchlists[oldName];
  delete state.watchlists[oldName];
  localStorage.setItem('watchlists', JSON.stringify(state.watchlists));
  
  if (state.activeWatchlist === oldName) {
    state.activeWatchlist = newName;
    localStorage.setItem('activeWatchlist', newName);
  }
  
  renderWatchlistTabs();
};

// Save symbol note
const saveSymbolNote = (symbol, note) => {
  if (!note || !note.trim()) {
    delete state.symbolNotes[symbol];
  } else {
    state.symbolNotes[symbol] = note.trim();
  }
  localStorage.setItem('symbolNotes', JSON.stringify(state.symbolNotes));
  renderWatchlist();
};

// Open note modal for a symbol
const openNoteModal = (symbol) => {
  const modal = document.getElementById('note-modal');
  const title = document.getElementById('note-modal-title');
  const textarea = document.getElementById('note-textarea');
  const symbolInput = document.getElementById('note-symbol');
  
  if (!modal) return;
  
  title.textContent = `Note for ${symbol}`;
  symbolInput.value = symbol;
  textarea.value = state.symbolNotes[symbol] || '';
  
  modal.classList.remove('hidden');
  textarea.focus();
};

// Close note modal
const closeNoteModal = () => {
  const modal = document.getElementById('note-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
};

const bindEvents = () => {
  const chartSymbolInput = document.getElementById('chart-symbol');
  
  chartSymbolInput.addEventListener('change', (e) => {
    const symbol = e.target.value.toUpperCase();
    if (symbol) {
      console.log('[UI] Symbol changed to:', symbol);
      state.currentSymbol = symbol;
      loadChart(symbol, state.timeframe);
    }
  });
  
  chartSymbolInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const symbol = chartSymbolInput.value.toUpperCase();
      if (symbol) {
        console.log('[UI] Symbol entered:', symbol);
        state.currentSymbol = symbol;
        loadChart(symbol, state.timeframe);
      }
    }
  });
  
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.timeframe = e.target.dataset.tf;
      loadChart(state.currentSymbol, state.timeframe);
    });
  });

  // Chart type selector
  document.querySelectorAll('.ct-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const newType = e.target.dataset.ct;
      if (newType === state.chartType) return;
      document.querySelectorAll('.ct-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      switchChartType(newType);
    });
  });

  // Indicator selector
  document.querySelectorAll('.ind-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const indicatorName = e.target.dataset.indicator;
      toggleIndicator(indicatorName);
    });
  });
  
  const watchlistAdd = document.getElementById('watchlist-add');
  watchlistAdd.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
  
document.getElementById('add-symbol-btn').addEventListener('click', addToWatchlist);
  
  document.getElementById('order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const symbol = document.getElementById('order-symbol').value.toUpperCase();
    const qty = parseInt(document.getElementById('order-qty').value);
    const side = document.querySelector('.side-btn.active').dataset.side;
    const type = document.getElementById('order-type').value;
    const limitPrice = document.getElementById('limit-price').value;
    const stopPrice = document.getElementById('stop-price').value;
    const trailAmount = document.getElementById('trail-amount').value;
    const timeInForce = document.getElementById('time-in-force').value;
    const feedback = document.getElementById('order-feedback');
    
    if (!symbol || qty <= 0) {
      feedback.textContent = 'Invalid symbol or quantity';
      feedback.className = 'order-feedback error';
      return;
    }
    
    if ((type === 'limit' || type === 'stop_limit' || type === 'take_profit') && !limitPrice) {
      feedback.textContent = 'Limit price required';
      feedback.className = 'order-feedback error';
      return;
    }
    
    if ((type === 'stop' || type === 'stop_limit') && !stopPrice) {
      feedback.textContent = 'Stop price required';
      feedback.className = 'order-feedback error';
      return;
    }
    
    if (type === 'trailing_stop' && !trailAmount) {
      feedback.textContent = 'Trail amount required';
      feedback.className = 'order-feedback error';
      return;
    }
    
    const order = {
      symbol,
      qty,
      side,
      type,
      time_in_force: timeInForce
    };
    
    if (type === 'limit' || type === 'stop_limit') {
      order.limit_price = parseFloat(limitPrice);
    }
    if (type === 'stop' || type === 'stop_limit') {
      order.stop_price = parseFloat(stopPrice);
    }
    if (type === 'take_profit') {
      order.limit_price = parseFloat(limitPrice);
    }
    if (type === 'trailing_stop') {
      if (trailAmount.endsWith('%')) {
        order.trail_percent = parseFloat(trailAmount);
      } else {
        order.trail = parseFloat(trailAmount);
      }
    }
    
    feedback.textContent = 'Submitting...';
    feedback.className = 'order-feedback';
    
    try {
      const result = await api.post('/api/orders', order);
      
      if (result.success) {
        feedback.textContent = 'Order placed successfully!';
        feedback.className = 'order-feedback success';
        loadOrders();
        
        document.getElementById('order-symbol').value = '';
        document.getElementById('order-qty').value = '1';
        document.getElementById('limit-price').value = '';
        document.getElementById('stop-price').value = '';
        document.getElementById('trail-amount').value = '';
      } else {
        feedback.textContent = result.error || 'Failed to place order';
        feedback.className = 'order-feedback error';
      }
    } catch (e) {
      feedback.textContent = 'Error placing order';
      feedback.className = 'order-feedback error';
    }
    
    setTimeout(() => {
      feedback.textContent = '';
      feedback.className = 'order-feedback';
    }, 5000);
  });
  
  document.getElementById('order-type').addEventListener('change', (e) => {
    const type = e.target.value;
    const limitRow = document.querySelector('.limit-price-row');
    const stopRow = document.querySelector('.stop-price-row');
    const trailRow = document.querySelector('.trailing-amt-row');

    limitRow.classList.toggle('hidden', type !== 'limit' && type !== 'stop_limit' && type !== 'take_profit');
    stopRow.classList.toggle('hidden', type !== 'stop' && type !== 'stop_limit');
    trailRow.classList.toggle('hidden', type !== 'trailing_stop');
});

  // Update order estimate when symbol, qty, or price changes (debounced 150ms)
  const _doEstimate = () => {
    const symbol = (document.getElementById('order-symbol')?.value || '').toUpperCase();
    const qty = parseInt(document.getElementById('order-qty')?.value) || 0;
    const limitPrice = parseFloat(document.getElementById('limit-price')?.value);
    const stopPrice = parseFloat(document.getElementById('stop-price')?.value);
    const type = document.getElementById('order-type')?.value;
    const symInput = document.getElementById('order-symbol');
    if (symInput && symbol && !validateSymbol(symbol)) { symInput.style.borderColor = 'var(--red)'; }
    else if (symInput) { symInput.style.borderColor = ''; }
    let price = null;
    if (type === 'market') { const q = state.watchlistQuotes[symbol]; price = q?.last || q?.ask; }
    else if (type === 'limit' && limitPrice) { price = limitPrice; }
    else if (type === 'stop' && stopPrice) { price = stopPrice; }
    else if (type === 'stop_limit') { price = limitPrice || null; }
    else { const q = state.watchlistQuotes[symbol]; price = q?.last || q?.ask; }
    const estimate = (price && qty > 0) ? (price * qty) : 0;
    const el = document.getElementById('order-estimate');
    if (el) el.textContent = formatMoney(estimate);
  };
  const updateOrderEstimate = debounce(_doEstimate, 150);

  ['order-symbol', 'order-qty', 'limit-price', 'stop-price'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateOrderEstimate);
  });
  const orderTypeSel = document.getElementById('order-type');
  if (orderTypeSel) orderTypeSel.addEventListener('change', updateOrderEstimate);

  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });
  
  document.getElementById('refresh-positions').addEventListener('click', loadPositions);
  document.getElementById('refresh-orders').addEventListener('click', loadOrders);
  document.getElementById('refresh-activities').addEventListener('click', () => {
    const filter = document.getElementById('activity-type-filter').value;
    loadActivities(filter || null);
  });
  
  document.getElementById('activity-type-filter').addEventListener('change', (e) => {
    loadActivities(e.target.value || null);
  });
  
  document.getElementById('delete-all-orders').addEventListener('click', deleteAllOrders);
  
  document.getElementById('close-all-positions').addEventListener('click', async () => {
    if (!confirm('Close ALL open positions? This cannot be undone.')) return;
    try {
      const result = await api.delete('/api/positions');
      if (result.success) {
        loadPositions();
        loadAccount();
      } else {
        alert(result.error || 'Failed to close positions');
      }
    } catch (e) {
      alert('Failed to close positions');
    }
  });

  // Modify Order Modal
  let modifyOrderId = null;
  
  document.getElementById('orders-body').addEventListener('click', (e) => {
    const modifyBtn = e.target.closest('.modify-btn');
    if (modifyBtn) {
      e.stopPropagation();
      modifyOrderId = modifyBtn.dataset.orderId;
      
      document.getElementById('modify-symbol').value = modifyBtn.dataset.symbol;
      document.getElementById('modify-side').value = modifyBtn.dataset.side.toUpperCase();
      document.getElementById('modify-type').value = modifyBtn.dataset.type;
      document.getElementById('modify-qty').value = modifyBtn.dataset.qty;
      document.getElementById('modify-limit-price').value = modifyBtn.dataset.limit;
      document.getElementById('modify-time-in-force').value = modifyBtn.dataset.tif;
      
      document.getElementById('modify-order-modal').classList.remove('hidden');
    }
  });
  
  document.getElementById('close-modify-modal').addEventListener('click', () => {
    document.getElementById('modify-order-modal').classList.add('hidden');
    modifyOrderId = null;
  });
  
  document.getElementById('cancel-modify').addEventListener('click', () => {
    document.getElementById('modify-order-modal').classList.add('hidden');
    modifyOrderId = null;
  });
  
  document.getElementById('modify-order-modal').addEventListener('click', (e) => {
    if (e.target.id === 'modify-order-modal') {
      document.getElementById('modify-order-modal').classList.add('hidden');
      modifyOrderId = null;
    }
  });
  
  document.getElementById('modify-order-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!modifyOrderId) return;
    
    const feedback = document.getElementById('modify-feedback');
    const data = {
      qty: parseInt(document.getElementById('modify-qty').value),
      time_in_force: document.getElementById('modify-time-in-force').value
    };
    
    const limitPrice = document.getElementById('modify-limit-price').value;
    if (limitPrice) data.limit_price = parseFloat(limitPrice);
    
    feedback.textContent = 'Modifying...';
    feedback.className = 'order-feedback';
    
    try {
      const result = await api.patch(`/api/orders/${modifyOrderId}`, data);
      if (result.success) {
        feedback.textContent = 'Order modified!';
        feedback.className = 'order-feedback success';
        setTimeout(() => {
          document.getElementById('modify-order-modal').classList.add('hidden');
          modifyOrderId = null;
          loadOrders();
        }, 1000);
      } else {
        feedback.textContent = result.error || 'Failed to modify';
        feedback.className = 'order-feedback error';
      }
    } catch (e) {
      feedback.textContent = 'Error modifying order';
      feedback.className = 'order-feedback error';
    }
  });

  // Price Alerts
  document.getElementById('add-alert-btn').addEventListener('click', () => {
    const symbol = document.getElementById('alert-symbol').value.toUpperCase().trim();
    const condition = document.getElementById('alert-condition').value;
    const price = parseFloat(document.getElementById('alert-price').value);
    
    if (!symbol || isNaN(price) || price <= 0) {
      showToast('Enter a valid symbol and price', 'warning');
      return;
    }
    
    const alert = { symbol, condition, price, id: Date.now() };
    state.alerts.push(alert);
    localStorage.setItem('price-alerts', JSON.stringify(state.alerts));
    
    document.getElementById('alert-symbol').value = '';
    document.getElementById('alert-price').value = '';
    renderAlerts();
  });
  
  document.getElementById('clear-alerts').addEventListener('click', () => {
    state.alerts = [];
    state.alertsTriggered.clear();
    localStorage.setItem('price-alerts', '[]');
    renderAlerts();
  });
  
  document.getElementById('alerts-list').addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.alert-delete');
    if (deleteBtn) {
      const alertId = parseInt(deleteBtn.dataset.alertId);
      state.alerts = state.alerts.filter(a => a.id !== alertId);
      state.alertsTriggered.delete(alertId);
      localStorage.setItem('price-alerts', JSON.stringify(state.alerts));
      renderAlerts();
    }
  });

  // Theme toggle button
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Keyboard shortcuts modal
  document.getElementById('close-shortcuts-modal').addEventListener('click', closeShortcutsModal);
  document.getElementById('shortcuts-modal').addEventListener('click', (e) => {
    if (e.target.id === 'shortcuts-modal') {
      closeShortcutsModal();
    }
  });
  
  // Note modal events
  document.getElementById('close-note-modal').addEventListener('click', closeNoteModal);
  document.getElementById('note-modal').addEventListener('click', (e) => {
    if (e.target.id === 'note-modal') {
      closeNoteModal();
    }
  });
  document.getElementById('save-note-btn').addEventListener('click', () => {
    const symbol = document.getElementById('note-symbol').value;
    const note = document.getElementById('note-textarea').value;
    saveSymbolNote(symbol, note);
    closeNoteModal();
  });
  document.getElementById('delete-note-btn').addEventListener('click', () => {
    const symbol = document.getElementById('note-symbol').value;
    saveSymbolNote(symbol, '');
    closeNoteModal();
  });
  
  // Watchlist tabs events
  document.getElementById('watchlist-tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.wl-tab');
    if (tab) {
      switchWatchlist(tab.dataset.wl);
    }
  });
  
  // Create watchlist button
  document.getElementById('create-wl-btn').addEventListener('click', () => {
    const name = prompt('Enter watchlist name:');
    if (name) createWatchlist(name.trim());
  });
};

const init = async () => {
  // Load watchlists from localStorage
  const savedWatchlists = localStorage.getItem('watchlists');
  if (savedWatchlists) {
    try {
      state.watchlists = JSON.parse(savedWatchlists);
    } catch (e) {
      state.watchlists = { 'Default': DEFAULT_WATCHLIST.slice() };
    }
  } else {
    state.watchlists = { 'Default': DEFAULT_WATCHLIST.slice() };
  }
  
  // Load active watchlist name
  const savedActive = localStorage.getItem('activeWatchlist');
  state.activeWatchlist = savedActive || 'Default';
  
  // Set current watchlist symbols from active watchlist
  state.watchlist = state.watchlists[state.activeWatchlist] || [];
  
  // Initialize theme
  applyTheme(getStoredTheme());

  // Request notification permission
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  bindEvents();
  initKeyboardShortcuts();
  initWebSocket();
  initResizable();
  renderAlerts();
  renderWatchlistTabs();
  await render();
  
  setInterval(loadPositions, 10000);
  setInterval(loadOrders, 5000);
  setInterval(loadAccount, 15000);
  setInterval(loadActivities, 60000); // Refresh activities every minute
};

document.addEventListener('DOMContentLoaded', init);

// Theme Management
const getStoredTheme = () => localStorage.getItem('theme') || 'dark';
const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  updateThemeIcon(theme);
};

const updateThemeIcon = (theme) => {
  const icon = document.querySelector('.theme-icon');
  if (icon) {
    icon.innerHTML = theme === 'dark' ? '&#9790;' : '&#9728;';
  }
};

const toggleTheme = () => {
  const current = getStoredTheme();
  const newTheme = current === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
};

// Keyboard Shortcuts
const shortcutsModal = () => {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) modal.classList.remove('hidden');
};
const closeShortcutsModal = () => {
  const modal = document.getElementById('shortcuts-modal');
  if (modal) modal.classList.add('hidden');
};

// Check if focus is in an input/textarea/select element
const isInputFocused = () => {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
};

// Global keyboard handler (fires only when no input is focused)
const initKeyboardShortcuts = () => {
  document.addEventListener('keydown', (e) => {
    // Always allow closing modals with Escape
    if (e.key === 'Escape') {
      closeShortcutsModal();
      const modifyModal = document.getElementById('modify-order-modal');
      if (modifyModal && !modifyModal.classList.contains('hidden')) {
        modifyModal.classList.add('hidden');
      }
      closeNoteModal();
      return;
    }

    // Don't handle shortcuts when typing in input fields
    if (isInputFocused()) return;

    // Toggle theme
    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      toggleTheme();
      return;
    }

    // Show keyboard shortcuts
    if (e.key === '?') {
      e.preventDefault();
      shortcutsModal();
      return;
    }

    // Refresh positions
    if (e.key === 'r' || e.key === 'R') {
      if (e.shiftKey) {
        // Refresh all
        loadPositions();
        loadOrders();
        loadAccount();
        loadActivities();
        loadSnapshots();
      } else {
        loadPositions();
      }
      return;
    }

    // Refresh orders
    if (e.key === 'o' || e.key === 'O') {
      loadOrders();
      return;
    }

    // Timeframe shortcuts
    if (e.key === '1') {
      setTimeframe('1D');
      return;
    }
    if (e.key === '5') {
      setTimeframe('5D');
      return;
    }
    if (e.key === 'm' || e.key === 'M') {
      if (!e.ctrlKey && !e.metaKey) {
        setTimeframe('1M');
        return;
      }
    }
    if (e.key === '3') {
      setTimeframe('3M');
      return;
    }
    if (e.key === 'y' || e.key === 'Y') {
      setTimeframe('1Y');
      return;
    }

    // Order side shortcuts
    if (e.key === 'b' || e.key === 'B') {
      document.querySelectorAll('.side-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.side === 'buy') btn.classList.add('active');
      });
      return;
    }
    if (e.key === 's' || e.key === 'S') {
      document.querySelectorAll('.side-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.side === 'sell') btn.classList.add('active');
      });
      return;
    }
  });
};

const setTimeframe = (tf) => {
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tf === tf);
  });
  state.timeframe = tf;
  loadChartData(state.currentSymbol, tf, state.chartType);
};

// Initialize theme on load
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getStoredTheme());
});