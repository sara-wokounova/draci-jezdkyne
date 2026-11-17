// The fail-before runners' shared part (D42, D45): copies the files a test needs into a folder of its own, outside the
// project, breaks one thing at a time there and runs the test on the copy; every mutation must make it fail (a control
// run without a mutation must pass, and so must a mutation marked `pass`: a guard against a test that fails anything).
// The copy lives in the system temp folder, or MUTATE_TMP (never inside the project; its node_modules is a link to the
// project's), and is removed at the end.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export const REPO = path.resolve(fileURLToPath(new URL('../..', import.meta.url))).replaceAll('\\', '/');

/**
 * @param {object} options
 * @param {string} options.prefix the copy folder's name prefix
 * @param {string[]} options.files repo-relative files to copy
 * @param {string} options.test the repo-relative test, run as `node <copy>/<test> <copy>`
 * @param {object} [options.env] extra environment for the test
 * @param {Array} options.mutations [name, file, from, to] (a text replaced once) or [name, file, (text) => text],
 *   optionally followed by { pass: true } for a control that must still pass
 */
export function runMutations({ prefix, files, test, env = {}, mutations }) {
  // The copy is deleted again and again: never inside the project. Checked on the path as given before anything is
  // created, then on the real paths (links, junctions and short names resolved) before anything is copied or deleted.
  const isInside = (from, to) => {
    const rel = path.relative(from, to);
    return rel === '' || (!path.isAbsolute(rel) && rel.split(/[\\/]/)[0] !== '..');
  };
  const refuse = (where) => {
    console.log(`refusing to put the copy inside the project: ${where}`);
    process.exit(1);
  };
  const BASE = path.resolve(process.env.MUTATE_TMP ?? os.tmpdir());
  if (isInside(REPO, BASE)) refuse(BASE);
  fs.mkdirSync(BASE, { recursive: true });
  const realBase = fs.realpathSync.native(BASE);
  if (isInside(fs.realpathSync.native(REPO), realBase)) refuse(realBase);
  // A folder of its own (never one that happens to be there already), removed again at the end.
  const COPY = fs.mkdtempSync(path.join(realBase, `${prefix}-`)).replaceAll('\\', '/');
  const only = process.argv[2];
  let missed = 0;
  const control = () => {
    fs.rmSync(COPY, { recursive: true, force: true });
    for (const f of [...files, test]) {
      fs.mkdirSync(`${COPY}/${f.replace(/\/[^/]+$/, '')}`, { recursive: true });
      fs.copyFileSync(`${REPO}/${f}`, `${COPY}/${f}`);
    }
    fs.symlinkSync(`${REPO}/node_modules`, `${COPY}/node_modules`, 'junction');
  };
  let lastOutput = '';
  const run = () => {
    try {
      // A run takes a few seconds; a mutation that hangs the test counts as caught (it doesn't pass) after 5 minutes.
      execFileSync(process.execPath, [`${COPY}/${test}`, COPY],
        { env: { ...process.env, ...env }, stdio: 'pipe', timeout: 5 * 60 * 1000 });
      return true;
    } catch (error) {
      lastOutput = `${error.code === 'ETIMEDOUT' ? 'TIMED OUT\n' : ''}${error.stdout ?? ''}${error.stderr ?? ''}`;
      return false;
    }
  };
  try {
    control();
    if (!run()) {
      // A module the test needs and the copy lacks (the files list) shows up here.
      console.log(`CONTROL FAILED (the test fails on the unchanged copy):\n${lastOutput}`);
      missed = 1;
    } else {
      console.log('control passes');
      for (const mutation of mutations) {
        const [name, file] = mutation;
        const fn = typeof mutation[2] === 'function' ? mutation[2] : null;
        const pass = (fn ? mutation[3] : mutation[4])?.pass === true;
        if (only && !name.includes(only)) continue;
        control();
        const text = fs.readFileSync(`${COPY}/${file}`, 'utf8').replaceAll('\r\n', '\n');
        const changed = fn ? fn(text) : text.includes(mutation[2]) ? text.replace(mutation[2], () => mutation[3]) : null;
        if (changed === null || changed === text) { console.log(`ANCHOR ${name}`); missed += 1; continue; }
        fs.writeFileSync(`${COPY}/${file}`, changed);
        const passed = run();
        console.log(`${pass ? (passed ? 'passes' : 'CONTROL FAILED') : (passed ? 'MISSED' : 'caught')} ${name}`);
        if (passed !== pass) {
          if (pass) console.log(lastOutput);
          missed += 1;
        }
      }
    }
  } finally {
    fs.rmSync(COPY, { recursive: true, force: true }); // with its link to node_modules (rmSync removes the link, not its target)
  }
  process.exit(missed ? 1 : 0);
}
