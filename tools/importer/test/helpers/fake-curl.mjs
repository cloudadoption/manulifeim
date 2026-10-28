/*
 * Fake curl for the da-upload.mjs regression tests (no network, no credentials).
 * State: JSON file in FAKE_DA_STATE
 *   { docs: { <url>: { status, body, lastModified } }, // served for GET / HEAD
 *     postStatus: { <url>: <status> },                   // a failing document write
 *     network: [<url>],                                  // curl exit 6 (network error)
 *     afterMediaPost: { <url>: { body, lastModified } } } // an author saves while media uploads
 * Every call is appended to FAKE_DA_LOG as JSON lines { method, url }.
 * Understands the flags da-upload.mjs uses: -s -S -w <fmt> -I -X <method> -F data=@<file>[;type=...]
 */
import { readFileSync, writeFileSync, appendFileSync } from 'fs';

const args = process.argv.slice(2);
let method = 'GET';
let head = false;
let write = null;
let form = null;
let url = '';
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '-s' || a === '-S') continue; // eslint-disable-line no-continue
  if (a === '-w') { write = args[i += 1]; continue; } // eslint-disable-line no-continue, no-plusplus
  if (a === '-I') { head = true; method = 'HEAD'; continue; } // eslint-disable-line no-continue
  if (a === '-X') { method = args[i += 1]; continue; } // eslint-disable-line no-continue
  if (a === '-F') { form = args[i += 1]; continue; } // eslint-disable-line no-continue
  url = a;
}

const stateFile = process.env.FAKE_DA_STATE;
const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
state.docs = state.docs || {};
appendFileSync(process.env.FAKE_DA_LOG, `${JSON.stringify({ method, url })}\n`);

if ((state.network || []).includes(url)) {
  process.stderr.write('curl: (6) Could not resolve host\n');
  process.exit(6);
}

const out = (body, status) => {
  process.stdout.write(write ? `${body}\n${status}` : body);
  process.exit(0);
};

if (head) {
  const d = state.docs[url];
  const status = d ? d.status : 404;
  const lm = d && d.lastModified ? `last-modified: ${new Date(d.lastModified).toUTCString()}\r\n` : '';
  process.stdout.write(`HTTP/2 ${status}\r\n${lm}\r\n`);
  process.exit(0);
}

if (method === 'POST') {
  if (url.includes('admin.hlx.page/preview/')) out('{}', 200);
  if (url.includes('/media-da/')) {
    Object.entries(state.afterMediaPost || {}).forEach(([u, d]) => {
      state.docs[u] = { status: 200, ...d };
    });
    state.afterMediaPost = {};
    writeFileSync(stateFile, JSON.stringify(state));
    out('{}', 201);
  }
  const failed = (state.postStatus || {})[url];
  if (failed) out('{"error":"fake failure"}', failed);
  const file = (form || '').replace(/^data=@/, '').split(';')[0];
  state.docs[url] = { status: 200, body: readFileSync(file, 'utf-8'), lastModified: Date.now() };
  writeFileSync(stateFile, JSON.stringify(state));
  out('{}', 201);
}

const d = state.docs[url];
if (!d) out('', 404);
out(d.body || '', d.status);
