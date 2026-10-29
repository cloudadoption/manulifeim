/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax, no-continue, max-len, import/extensions, import/prefer-default-export */
/**
 * Moves the block library between Document Authoring and a local build.
 *
 *   node tools/library/upload-library.mjs fetch (--paths <file> | --variants <file>) --out <dir>
 *     Reads the DA source of the pages listed in --paths (one path per line; the select input),
 *     or of every sample page of a selection (build input). Files already in <dir> are kept.
 *   node tools/library/upload-library.mjs upload --dir <built dir> --state <file> [--dry]
 *     Writes <dir>/blocks/<block>.html to /library/blocks/<block>.html and <dir>/blocks.json to
 *     /library/blocks.json, then reads each one back and compares it with the local file.
 *
 * Upload never overwrites someone else's work. A document that doesn't exist is created with
 * If-None-Match: *. An existing one is replaced only when it still has exactly the content of our
 * last upload (sha256 in --state; for the sheet, ignoring what DA's sheet editor adds on save);
 * anything else (an author improved the library in DA) is reported and left alone. Nothing here
 * previews or publishes. The native Insert block dialog needs /library/blocks.json previewed
 * (DA sheet editor, Preview); the documents stay source-only.
 *
 * Token: DA_TOKEN, else ~/.aem/da-token.json (access_token).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ORG_SITE, fileOf } from './build-library.mjs';

const ADMIN = `https://admin.da.live/source/${ORG_SITE}`;
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const readArgs = (argv) => {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) args.flags.add(argv[i].slice(2));
    else { args[argv[i].slice(2)] = argv[i + 1]; i += 1; }
  }
  return args;
};

function token() {
  if (process.env.DA_TOKEN) return process.env.DA_TOKEN;
  const f = path.join(os.homedir(), '.aem/da-token.json');
  return JSON.parse(fs.readFileSync(f, 'utf8')).access_token;
}

/**
 * A sheet's content without what DA's sheet editor adds when it saves (column widths, an empty
 * row in an empty sheet), so a preview from the sheet editor doesn't look like an author edit.
 */
export function normalizeSheet(json) {
  const out = {};
  Object.keys(json).sort().forEach((key) => {
    const value = json[key];
    if (key === ':colWidths') return;
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
      const data = value.data.filter((row) => Object.values(row).some((v) => `${v}`.trim()));
      out[key] = { data };
    } else out[key] = value;
  });
  return out;
}

const contentSha = (buf, type) => sha(type === 'application/json'
  ? JSON.stringify(normalizeSheet(JSON.parse(buf.toString())))
  : buf);

/**
 * Decides what to do with one library file (pure, tested): create, replace, skip (already
 * equal) or hold (the DA copy is not ours).
 */
export function decide({
  remoteStatus, remoteSha, localSha, lastUploadedSha,
}) {
  if (remoteStatus === 404) return 'create';
  if (remoteStatus !== 200) return 'error';
  if (remoteSha === localSha) return 'skip';
  if (lastUploadedSha && remoteSha === lastUploadedSha) return 'replace';
  return 'hold';
}

async function fetchSources(args) {
  const pages = args.paths
    ? fs.readFileSync(args.paths, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
      .sort()
    : [...new Set(JSON.parse(fs.readFileSync(args.variants, 'utf8')).variants.flatMap((v) => v.samples.map((x) => x.page)))].sort();
  fs.mkdirSync(args.out, { recursive: true });
  const headers = { Authorization: `Bearer ${token()}` };
  let failed = 0;
  const todo = pages.filter((page) => !fs.existsSync(path.join(args.out, fileOf(page, '.html'))));
  const worker = async () => {
    while (todo.length) {
      const page = todo.shift();
      const resp = await fetch(`${ADMIN}${page}.html`, { headers });
      if (!resp.ok) { failed += 1; console.log(`${resp.status} ${page}`); continue; }
      fs.writeFileSync(path.join(args.out, fileOf(page, '.html')), Buffer.from(await resp.arrayBuffer()));
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`fetched ${pages.length - failed}/${pages.length} pages -> ${args.out}`);
  if (failed) process.exitCode = 1;
}

async function upload(args) {
  const dry = args.flags.has('dry');
  const state = fs.existsSync(args.state) ? JSON.parse(fs.readFileSync(args.state, 'utf8')) : {};
  const files = fs.readdirSync(path.join(args.dir, 'blocks'))
    .filter((f) => f.endsWith('.html'))
    .sort()
    .map((f) => ({ local: path.join(args.dir, 'blocks', f), remote: `/library/blocks/${f}`, type: 'text/html' }));
  files.push({ local: path.join(args.dir, 'blocks.json'), remote: '/library/blocks.json', type: 'application/json' });
  const headers = { Authorization: `Bearer ${token()}` };
  const counts = {};
  const problems = [];
  for (const f of files) {
    const body = fs.readFileSync(f.local);
    const localSha = contentSha(body, f.type);
    const cur = await fetch(`${ADMIN}${f.remote}`, { headers });
    const remote = cur.ok ? Buffer.from(await cur.arrayBuffer()) : null;
    const action = decide({
      remoteStatus: cur.status, remoteSha: remote && contentSha(remote, f.type), localSha, lastUploadedSha: state[f.remote],
    });
    counts[action] = (counts[action] || 0) + 1;
    if (action === 'hold' || action === 'error') { problems.push(`${f.remote}: ${action} (DA ${cur.status}; not our last upload)`); continue; }
    if (action === 'skip') { state[f.remote] = localSha; continue; }
    if (dry) { console.log(`would ${action} ${f.remote}`); continue; }
    const form = new FormData();
    form.append('data', new Blob([body], { type: f.type }));
    const put = await fetch(`${ADMIN}${f.remote}`, {
      method: 'PUT', headers: { ...headers, ...(action === 'create' ? { 'If-None-Match': '*' } : {}) }, body: form,
    });
    if (!put.ok) { problems.push(`${f.remote}: ${action} answered ${put.status}`); continue; }
    const back = await fetch(`${ADMIN}${f.remote}`, { headers });
    const backBody = back.ok ? Buffer.from(await back.arrayBuffer()) : Buffer.alloc(0);
    const same = f.type === 'application/json'
      ? contentSha(backBody, f.type) === localSha
      : backBody.toString().trim() === body.toString().trim();
    if (!same) problems.push(`${f.remote}: read back ${back.status} differs from the local file`);
    state[f.remote] = contentSha(backBody, f.type);
  }
  if (!dry) fs.writeFileSync(args.state, `${JSON.stringify(state, null, 1)}\n`);
  console.log(`upload-library: ${files.length} files ${JSON.stringify(counts)}, ${problems.length} problems`);
  problems.forEach((p) => console.log(`  ${p}`));
  if (problems.length) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = readArgs(rest);
  if (cmd === 'fetch') await fetchSources(args);
  else if (cmd === 'upload') await upload(args);
  else { console.log('usage: upload-library.mjs fetch --variants <file> --out <dir> | upload --dir <dir> --state <file> [--dry]'); process.exitCode = 1; }
}
