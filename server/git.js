import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Git operations layer: every project is a real Git repository.
 * Each audit event is a commit. Structured fields (actor, key, and progress)
 * are stored in commit trailers and parsed back when the log is read.
 */

function git(cwd, args, extraEnv = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
  });
}

function gitNoOutput(cwd, args, extraEnv = {}) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extraEnv },
  });
}

function publicRepoDirFor(dir) {
  const root = process.env.GIT_PUBLIC_DIR;
  if (!root) return null;
  return path.join(root, `${path.basename(dir)}.git`);
}

function syncPublicRepo(dir) {
  const publicDir = publicRepoDirFor(dir);
  if (!publicDir) return;
  try {
    fs.mkdirSync(path.dirname(publicDir), { recursive: true });
    if (!fs.existsSync(publicDir)) {
      gitNoOutput(path.dirname(publicDir), ['clone', '--bare', dir, publicDir]);
    } else {
      gitNoOutput(publicDir, ['fetch', dir, '+refs/heads/*:refs/heads/*', '--prune']);
    }
    execFileSync('git', ['--git-dir', publicDir, 'update-server-info'], {
      stdio: 'ignore',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (e) {
    console.error('[git-public] sync failed:', e.message);
  }
}

export function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  try {
    git(dir, ['init', '-b', 'main']);
  } catch {
    // Older Git versions do not support -b.
    git(dir, ['init']);
    try {
      git(dir, ['checkout', '-b', 'main']);
    } catch {
      /* Already on the default branch. */
    }
  }
  syncPublicRepo(dir);
}

export function writeFile(dir, relPath, content) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

/**
 * Commit one audit event.
 * @param {string} dir Repository directory.
 * @param {object} opts { subject, actor, keyName, progressFrom, progressTo, requestId, plainMessage, why, benefit, verification, stageIndex, nextStep }
 */
export function commit(dir, opts) {
  const {
    subject,
    actor = 'System',
    keyName = null,
    progressFrom = null,
    progressTo = null,
    requestId = null,
    plainMessage = null,
    why = null,
    benefit = null,
    verification = null,
    stageIndex = null,
    nextStep = null,
  } = opts;

  const trailers = [];
  if (keyName) trailers.push(`Key: ${keyName}`);
  if (requestId) trailers.push(`Request-Id: ${requestId}`);
  if (progressFrom !== null) trailers.push(`Progress-From: ${progressFrom}`);
  if (progressTo !== null) trailers.push(`Progress-To: ${progressTo}`);
  if (stageIndex !== null && stageIndex !== undefined) trailers.push(`Stage-Index: ${stageIndex}`);
  if (plainMessage) trailers.push(`Plain-Message: ${String(plainMessage).replace(/\n/g, ' ').slice(0, 500)}`);
  if (why) trailers.push(`Why: ${String(why).replace(/\n/g, ' ').slice(0, 500)}`);
  if (benefit) trailers.push(`Benefit: ${String(benefit).replace(/\n/g, ' ').slice(0, 500)}`);
  if (verification) trailers.push(`Verification: ${String(verification).replace(/\n/g, ' ').slice(0, 500)}`);
  if (nextStep) trailers.push(`Next-Step: ${String(nextStep).replace(/\n/g, ' ').slice(0, 500)}`);

  const message = trailers.length ? `${subject}\n\n${trailers.join('\n')}` : subject;

  git(dir, ['add', '-A']);
  git(
    dir,
    [
      '-c',
      `user.name=${actor}`,
      '-c',
      'user.email=project-os-bot@users.noreply.github.com',
      'commit',
      '--allow-empty',
      '-m',
      message,
    ],
    { GIT_AUTHOR_NAME: actor, GIT_COMMITTER_NAME: actor },
  );
  syncPublicRepo(dir);
}

const US = '\x1f'; // Field separator.
const RS = '\x1e'; // Record separator.

/** Read the Git log into structured audit events, newest first. */
export function readLog(dir) {
  let out = '';
  try {
    out = git(dir, ['log', `--pretty=format:%H${US}%an${US}%aI${US}%B${RS}`]);
  } catch {
    return [];
  }
  return out
    .split(RS)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((rec) => {
      const [hash, author, iso, body = ''] = rec.split(US);
      const lines = body.split('\n');
      const subject = lines[0] || '';
      const trailers = {};
      for (const line of lines.slice(1)) {
        const m = line.match(/^([A-Za-z-]+):\s*(.+)$/);
        if (m) trailers[m[1].toLowerCase()] = m[2].trim();
      }
      const num = (v) => (v === undefined ? null : Number(v));
      return {
        id: hash,
        at: iso,
        actor: author,
        keyName: trailers['key'] ?? null,
        requestId: trailers['request-id'] ?? null,
        message: subject,
        progressFrom: num(trailers['progress-from']),
        progressTo: num(trailers['progress-to']),
        stageIndex: num(trailers['stage-index']),
        plainMessage: trailers['plain-message'] ?? null,
        why: trailers['why'] ?? null,
        benefit: trailers['benefit'] ?? null,
        verification: trailers['verification'] ?? null,
        nextStep: trailers['next-step'] ?? null,
      };
    });
}
