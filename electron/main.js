const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray;
let serverProcess;

function createWindow() {
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
  
  // Create a simple 16x16 icon in memory
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 26;     // R
    canvas[i * 4 + 1] = 42; // G
    canvas[i * 4 + 2] = 74;  // B
    canvas[i * 4 + 3] = 255; // A
  }
  
  const trayIcon = nativeImage.createFromBuffer(canvas, { width: size, height: size });
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