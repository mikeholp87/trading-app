const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray;
let serverProcess;

function createAppIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0d1526"/>
          <stop offset="100%" stop-color="#13233f"/>
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#bg)"/>
      <rect x="6" y="6" width="52" height="52" rx="12" fill="none" stroke="#2ecc71" stroke-width="2" opacity="0.35"/>
      <path
        d="M37.5 16.5c-2.3-1.2-5.1-1.8-8.3-1.8-3.4 0-6.2.8-8.4 2.4-2.1 1.6-3.2 3.8-3.2 6.5 0 2.2.7 4 2.2 5.4 1.4 1.4 3.7 2.6 6.8 3.5l4.1 1.2c2 .6 3.4 1.2 4.1 1.8.8.6 1.2 1.4 1.2 2.4 0 1.1-.5 2-1.5 2.7-1 .8-2.5 1.1-4.4 1.1-2 0-3.9-.4-5.7-1.2l-1.7-.8-3.2 5.2 1.4.8c2.6 1.4 5.7 2.2 9.2 2.3v5.7h5.2v-5.8c3.1-.4 5.6-1.4 7.4-3.1 2-1.8 3-4.1 3-6.9 0-2.4-.8-4.4-2.4-5.8-1.5-1.4-4-2.6-7.3-3.5l-3.8-1.1c-1.8-.5-3.1-1-3.9-1.5-.8-.5-1.1-1.2-1.1-2.1 0-.9.4-1.7 1.3-2.3.9-.6 2.2-.9 4-.9 1.7 0 3.4.3 5 .9l1.8.7 2.8-5.3-1.5-.8c-1.2-.6-2.5-1.1-3.9-1.4v-5h-5.2v5.1z"
        fill="#2ecc71"
      />
    </svg>
  `;

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  );
}

function createWindow() {
  const appIcon = createAppIcon();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0e1a',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    createTray();
  });
}

function createTray() {
  if (tray) return;
  const trayIcon = createAppIcon();
  tray = new Tray(trayIcon);
  tray.setToolTip('Alpaca Trading Dashboard');
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => { openWindow(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { cleanup(); app.quit(); } }
  ]);
  
  tray.setContextMenu(contextMenu);
  tray.on('click', () => { openWindow(); });
}

function openWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }
  
  if (tray) {
    tray.destroy();
    tray = null;
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', () => {
    mainWindow = null;
    createTray();
  });
}

function startServer() {
  const { spawn } = require('child_process');
  
  // Check if server is already running on port 3000
  const net = require('net');
  const checkPort = (port) => new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(true));
    s.once('listening', () => { s.close(); resolve(false); });
    s.listen(port);
  });

  (async () => {
    const inUse = await checkPort(3000);
    if (inUse) {
      console.log('[Server] Port 3000 already in use, skipping server start');
      createWindow();
      return;
    }

    serverProcess = spawn('node', ['server.js'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });

    serverProcess.on('error', (err) => {
      console.error('[Server] Failed to start:', err.message);
    });

    setTimeout(() => {
      createWindow();
    }, 1500);
  })();
}

function cleanup() {
  if (tray) { tray.destroy(); tray = null; }
  if (serverProcess) { serverProcess.kill(); }
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => { if (mainWindow) mainWindow.reload(); }
        },
        { type: 'separator' },
        {
          label: 'Toggle DevTools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => { if (mainWindow) mainWindow.webContents.toggleDevTools(); }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => { cleanup(); app.quit(); }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+W',
          click: () => { if (mainWindow) mainWindow.close(); }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createMenu();
  startServer();
});

app.on('window-all-closed', () => {
  // Don't quit — keep running in system tray
  createTray();
});

app.on('activate', () => {
  if (!mainWindow) openWindow();
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
