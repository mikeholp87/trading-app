const { app, BrowserWindow, Menu, Tray } = require('electron');
const fs = require('fs');
const path = require('path');
const { createAppIcon } = require('./icon');

const appIcon = createAppIcon();

let mainWindow;
let tray;
let serverProcess;
let windowStateSaveTimer;

const getWindowStatePath = () => path.join(app.getPath('userData'), 'window-state.json');

const loadWindowState = () => {
  try {
    return JSON.parse(fs.readFileSync(getWindowStatePath(), 'utf8'));
  } catch (error) {
    return {};
  }
};

const saveWindowState = () => {
  if (!mainWindow) return;

  const bounds = mainWindow.getBounds();
  const windowState = {
    ...bounds,
    isMaximized: mainWindow.isMaximized(),
    isFullScreen: mainWindow.isFullScreen()
  };

  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(windowState));
  } catch (error) {
    console.error('[Window] Failed to save window state:', error.message);
  }
};

const scheduleWindowStateSave = () => {
  clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(saveWindowState, 150);
};

const getBrowserWindowOptions = () => {
  const savedState = loadWindowState();
  return {
    width: savedState.width || 1400,
    height: savedState.height || 900,
    x: typeof savedState.x === 'number' ? savedState.x : undefined,
    y: typeof savedState.y === 'number' ? savedState.y : undefined,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0e1a',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };
};

function createWindow() {
  const savedState = loadWindowState();
  mainWindow = new BrowserWindow(getBrowserWindowOptions());

  mainWindow.loadURL('http://localhost:3000');

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  if (savedState.isMaximized) {
    mainWindow.maximize();
  }
  if (savedState.isFullScreen) {
    mainWindow.setFullScreen(true);
  }

  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('maximize', scheduleWindowStateSave);
  mainWindow.on('unmaximize', scheduleWindowStateSave);
  mainWindow.on('enter-full-screen', scheduleWindowStateSave);
  mainWindow.on('leave-full-screen', scheduleWindowStateSave);
  mainWindow.on('close', saveWindowState);

  mainWindow.on('closed', () => {
    mainWindow = null;
    createTray();
  });
}

function createTray() {
  if (tray) return;
  tray = new Tray(appIcon);
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

  mainWindow = new BrowserWindow(getBrowserWindowOptions());

  mainWindow.loadURL('http://localhost:3000');

  const savedState = loadWindowState();
  if (savedState.isMaximized) {
    mainWindow.maximize();
  }
  if (savedState.isFullScreen) {
    mainWindow.setFullScreen(true);
  }

  mainWindow.on('resize', scheduleWindowStateSave);
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('maximize', scheduleWindowStateSave);
  mainWindow.on('unmaximize', scheduleWindowStateSave);
  mainWindow.on('enter-full-screen', scheduleWindowStateSave);
  mainWindow.on('leave-full-screen', scheduleWindowStateSave);
  mainWindow.on('close', saveWindowState);

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
  saveWindowState();
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
