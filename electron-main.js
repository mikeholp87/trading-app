const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let serverProcess;

const checkServer = () => {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000', () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
};

const startServer = () => {
  return new Promise((resolve, reject) => {
    serverProcess = spawn('node', ['server.js'], {
      cwd: app.getAppPath(),
      stdio: 'pipe'
    });

    serverProcess.stdout.on('data', (data) => {
      const line = data.toString();
      process.stdout.write('[Electron] ' + line);
      if (line.includes('Running on')) resolve();
    });

    serverProcess.stderr.on('data', (data) => {
      process.stderr.write('[Electron Server Error] ' + data.toString());
    });

    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) reject(new Error('Server timeout'));
    }, 15000);
  });
};

const createWindow = async () => {
  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log('[Electron] Starting server...');
    await startServer();
  } else {
    console.log('[Electron] Server already running on port 3000');
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0f1419',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL('http://localhost:3000');
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setTitle('Alpaca Trading Dashboard');
};

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});