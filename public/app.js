const DEFAULT_WATCHLIST = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'SPY', 'QQQ', 'AMZN', 'GOOGL'];

let state = {
  account: null,
  positions: [],
  orders: [],
  clock: null,
  watchlist: DEFAULT_WATCHLIST.slice(),
  watchlistQuotes: {},
  currentSymbol: 'SPY',
  timeframe: '1D',
  isConnected: false,
  chart: null,
  candlestickSeries: null,
  volumeSeries: null,
  emaSeries: null,
  ws: null
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
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
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
  } else if (data.type === 'trade') {
    const { S: symbol, p: last, v: volume } = data;
    state.watchlistQuotes[symbol] = {
      ...state.watchlistQuotes[symbol],
      last: parseFloat(last),
      volume: parseInt(volume)
    };
    renderWatchlist();
  }
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

const loadChart = async (symbol, timeframe) => {
  console.log('[Chart] Loading chart for', symbol, 'timeframe:', timeframe);
  const param = getTimeframeParam(timeframe);
  const start = getStartDate(timeframe);
  
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
    
    state.candlestickSeries = state.chart.addCandlestickSeries({
      upColor: '#00ff88',
      downColor: '#ff3d5a',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff3d5a',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff3d5a'
    });
    
    state.volumeSeries = state.chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: ''
    });
    
    state.volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });
    
    state.emaSeries = state.chart.addLineSeries({
      color: '#ffaa00',
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false
    });
    
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
    console.log('[Chart] Chart initialized, series ready');
  });
};

const updateChart = (bars, timeframe) => {
  if (!state.candlestickSeries) {
    console.log('[Chart] ERROR: candlestickSeries not initialized');
    return;
  }
  
  console.log('[Chart] Setting', bars.length, 'candles, first bar:', bars[0]);
  
  state.candlestickSeries.setData(bars);
  
  const volumeData = bars.map(b => ({ time: b.time, value: b.volume }));
  state.volumeSeries.setData(volumeData);
  
  const ema20 = calculateEMA(bars.map(b => b.close), 20);
  const emaData = bars.map((b, i) => ({
    time: b.time,
    value: ema20[i] || null
  })).filter(d => d.value !== null);
  
  state.emaSeries.setData(emaData);
  
  state.chart.timeScale().fitContent();
  
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
    
    const row = document.createElement('tr');
    row.className = 'watchlist-row' + (hasPosition ? ' has-position' : '');
    row.dataset.symbol = symbol;
    row.onclick = () => {
      state.currentSymbol = symbol;
      document.getElementById('chart-symbol').value = symbol;
      loadChart(symbol, state.timeframe);
    };
    row.title = 'Click to load chart';
    
    const last = quote.last || quote.bid || 0;
    const bid = quote.bid || 0;
    const ask = quote.ask || 0;
    
    row.innerHTML = `
      <td class="symbol-cell">${symbol}</td>
      <td>${bid ? formatNumber(bid, 2) : '--'}</td>
      <td>${ask ? formatNumber(ask, 2) : '--'}</td>
      <td>${last ? formatNumber(last, 2) : '--'}</td>
      <td class="${quote.change >= 0 ? 'positive' : 'negative'}">${quote.change !== undefined ? formatPercent(quote.change) : '--'}</td>
    `;
    
    tbody.appendChild(row);
  });
};

const renderPositions = () => {
  const tbody = document.getElementById('positions-body');
  
  if (!state.positions || state.positions.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No open positions</td></tr>';
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
      <td>${formatMoney(currentPrice)}</td>
      <td>${formatMoney(marketValue)}</td>
      <td class="${unrealizedPL >= 0 ? 'positive' : 'negative'}">${formatMoney(unrealizedPL)}</td>
      <td class="${unrealizedPLPercent >= 0 ? 'positive' : 'negative'}">${formatPercent(unrealizedPLPercent)}</td>
    `;
    
    tbody.appendChild(row);
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
    const statusClass = order.status === 'filled' ? 'filled' :
                     order.status === 'pending' || order.status === 'new' ? 'pending' :
                     order.status === 'cancelled' || order.status === 'rejected' ? 'cancelled' : '';
    
    row.innerHTML = `
      <td>${order.symbol}</td>
      <td class="${sideClass}">${order.side.toUpperCase()}</td>
      <td>${order.type}</td>
      <td>${order.qty}</td>
      <td>${order.filled_qty}</td>
      <td>${order.limit_price ? formatMoney(order.limit_price) : '--'}</td>
      <td class="${statusClass}">${order.status}</td>
      <td>${formatDate(order.submitted_at)}</td>
      <td>${order.status === 'filled' || order.status === 'cancelled' || order.status === 'rejected' ? '' :
        `<button class="cancel-btn" data-order-id="${order.id}">Cancel</button>`}</td>
    `;
    
    tbody.appendChild(row);
  });
  
  tbody.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const orderId = btn.dataset.orderId;
      if (confirm('Cancel this order?')) {
        try {
          const result = await api.delete(`/api/orders/${orderId}`);
          if (result.success) {
            loadOrders();
          } else {
            alert(result.error || 'Failed to cancel order');
          }
        } catch (e) {
          alert('Failed to cancel order');
        }
      }
    };
  });
};

const render = async () => {
  console.log('[App] Initializing dashboard...');
  await Promise.all([loadAccount(), loadPositions(), loadOrders(), loadClock()]);
  
  // Load initial quotes for watchlist
  console.log('[App] Loading watchlist quotes...');
  for (const symbol of state.watchlist) {
    try {
      const result = await api.get(`/api/market/quote/${symbol}`);
      if (result.success && result.data && result.data.quote) {
        const q = result.data.quote;
        state.watchlistQuotes[symbol] = {
          bid: parseFloat(q.bp || 0),
          ask: parseFloat(q.ap || 0),
          last: parseFloat(q.lp || q.ap || q.bp || 0),
          change: 0
        };
      }
    } catch (e) {
      console.log('[App] Failed to load quote for', symbol);
    }
  }
  
  renderWatchlist();
  console.log('[App] Loading default chart:', state.currentSymbol, state.timeframe);
  initChart();
  loadChart(state.currentSymbol, state.timeframe);
};

const addToWatchlist = () => {
  const input = document.getElementById('watchlist-add');
  const symbol = input.value.toUpperCase().trim();
  
  if (symbol && !state.watchlist.includes(symbol)) {
    if (state.watchlist.length >= 12) {
      alert('Maximum 12 symbols allowed');
      return;
    }
    state.watchlist.push(symbol);
    input.value = '';
    localStorage.setItem('watchlist', JSON.stringify(state.watchlist));
    
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'subscribe',
        symbols: [symbol]
      }));
    }
    
    api.get(`/api/market/quote/${symbol}`).then(result => {
      if (result.success && result.data && result.data.quote) {
        const q = result.data.quote;
        state.watchlistQuotes[symbol] = {
          bid: parseFloat(q.bp || 0),
          ask: parseFloat(q.ap || 0),
          last: parseFloat(q.lp || q.ap || q.bp || 0),
          change: 0
        };
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
    delete state.watchlistQuotes[symbol];
    localStorage.setItem('watchlist', JSON.stringify(state.watchlist));
    renderWatchlist();
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
    const timeInForce = document.getElementById('time-in-force').value;
    const feedback = document.getElementById('order-feedback');
    
    if (!symbol || qty <= 0) {
      feedback.textContent = 'Invalid symbol or quantity';
      feedback.className = 'order-feedback error';
      return;
    }
    
    if (type === 'limit' && !limitPrice) {
      feedback.textContent = 'Limit price required';
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
    
    if (type === 'limit') {
      order.limit_price = parseFloat(limitPrice);
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
    const limitRow = document.querySelector('.limit-price-row');
    limitRow.classList.toggle('hidden', e.target.value !== 'limit');
  });
  
  document.querySelectorAll('.side-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });
  
  document.getElementById('refresh-positions').addEventListener('click', loadPositions);
  document.getElementById('refresh-orders').addEventListener('click', loadOrders);
};

const init = async () => {
  const saved = localStorage.getItem('watchlist');
  if (saved) {
    try {
      state.watchlist = JSON.parse(saved);
    } catch (e) {}
  }
  
  bindEvents();
  initWebSocket();
  initResizable();
  await render();
  
  setInterval(loadPositions, 10000);
  setInterval(loadOrders, 5000);
  setInterval(loadAccount, 15000);
};

document.addEventListener('DOMContentLoaded', init);