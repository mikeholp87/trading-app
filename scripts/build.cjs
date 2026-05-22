const { spawnSync } = require('child_process');
const path = require('path');

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

const isVercel = Boolean(process.env.VERCEL);

if (isVercel) {
  console.log('[build] Vercel detected, skipping Electron packaging');
  run(process.execPath, ['--check', 'server.js']);
  run(process.execPath, ['--check', 'public/app.js']);
  run(process.execPath, ['--check', 'src/alpaca.js']);
  run(process.execPath, ['--check', 'src/routes/orders.js']);
  run(process.execPath, ['--check', 'src/routes/market.js']);
  run(process.execPath, ['--check', 'electron/main.js']);
  process.exit(0);
}

run(process.execPath, ['scripts/generate-icons.cjs']);
run('electron-builder', []);
