const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const hooksDir = path.join(rootDir, '.githooks');
const preCommitHook = path.join(hooksDir, 'pre-commit');

const isGitRepo = () => fs.existsSync(path.join(rootDir, '.git'));

const runGit = (args) => {
  const result = spawnSync('git', args, {
    cwd: rootDir,
    stdio: 'pipe',
    encoding: 'utf8'
  });

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
};

try {
  if (process.env.CI) {
    process.exit(0);
  }

  if (!isGitRepo() || !fs.existsSync(preCommitHook)) {
    process.exit(0);
  }

  const currentHooksPath = runGit(['config', '--local', '--get', 'core.hooksPath']);
  if (currentHooksPath !== '.githooks') {
    const setResult = spawnSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    if (setResult.error || setResult.status !== 0) {
      throw new Error('Failed to configure git hooks path');
    }

    console.log('[hooks] Configured git hooksPath -> .githooks');
  }
} catch (error) {
  console.warn(`[hooks] Skipped git hooks setup: ${error.message}`);
}
