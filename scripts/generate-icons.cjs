const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const assetsDir = path.join(rootDir, 'assets');
const sourceSvg = path.join(assetsDir, 'icon.svg');
const outputPng = path.join(assetsDir, 'icon.png');
const outputIco = path.join(assetsDir, 'icon.ico');

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`);
  }
};

const findBrowser = () => {
  const candidates = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser'
  ];

  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], {
      cwd: rootDir,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    });

    if (!result.error && result.status === 0) {
      return cmd;
    }
  }

  throw new Error(
    'Google Chrome or Chromium is required to regenerate the app icons.'
  );
};

const findImageMagick = () => {
  const candidates = ['magick', 'convert'];

  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['-version'], {
      cwd: rootDir,
      encoding: 'utf8',
      shell: process.platform === 'win32'
    });

    if (!result.error && result.status === 0) {
      return cmd;
    }
  }

  throw new Error(
    'ImageMagick is required to build the ICO. Install `magick` or `convert` and try again.'
  );
};

const generateIcons = () => {
  if (!fs.existsSync(sourceSvg)) {
    throw new Error(`Missing source SVG icon at ${sourceSvg}`);
  }

  fs.mkdirSync(assetsDir, { recursive: true });

  const browser = findBrowser();

  // Generate a transparent PNG from the SVG using Chrome's renderer.
  run(browser, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--default-background-color=00000000',
    `--screenshot=${outputPng}`,
    '--window-size=512,512',
    `file://${sourceSvg}`
  ]);

  // Build a multi-resolution ICO for Windows packaging.
  const imageMagick = findImageMagick();
  run(imageMagick, [
    outputPng,
    '-define',
    'icon:auto-resize=256,128,64,48,32,16',
    outputIco
  ]);

  console.log(`[icons] Generated ${path.relative(rootDir, outputPng)} and ${path.relative(rootDir, outputIco)}`);
};

try {
  generateIcons();
} catch (error) {
  console.error(`[icons] Failed to generate icons: ${error.message}`);
  process.exit(1);
}
