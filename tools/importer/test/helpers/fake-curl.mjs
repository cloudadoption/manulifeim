/*
 * Fake curl for the da-upload.mjs regression tests (no network, no credentials).
 * State: JSON file in FAKE_DA_STATE
 *   { docs: { <url>: { status, body, lastModified } }, // served for GET / HEAD
 *     postStatus: { <url>: <status> },                   // a failing document write
 *     network: [<url>],                                  // curl exit 6 (network error)
 *     afterMediaPost: { <url>: { body, lastModified } }, // an author saves while media uploads
 *     atPost: { <url>: { body } },                       // an author saves as our document POST arrives
 *     storeTransform: { <url>: [from, to] },             // DA keeps different bytes than were sent
 *     noEtag: true,                                      // write responses carry no ETag
 *     deleteAtPost: [<url>] }                            // object deleted as our document POST arrives
 * Document writes get an ETag (written with -D <file>) and honour preconditions like da-admin:
 * If-None-Match: * fails (412) when the document exists; a specific If-Match fails when the
 * document exists with another ETag (when it is absent the write proceeds, as in da-admin).
 * Every call is appended to FAKE_DA_LOG as JSON lines { method, url, headers }.
 * Understands the flags da-upload.mjs uses: -s -S -w <fmt> -I -X <method> -F data=@<file>[;type=...]
 * -H <header> -D <file>
 */
import { readFileSync, writeFileSync, appendFileSync } from 'fs';

const args = process.argv.slice(2);
let method = 'GET';
let head = false;
let write = null;
let form = null;
let dump = null;
const headers = {};
let url = '';
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '-s' || a === '-S') continue; // eslint-disable-line no-continue
  if (a === '-w') { write = args[i += 1]; continue; } // eslint-disable-line no-continue, no-plusplus
  if (a === '-I') { head = true; method = 'HEAD'; continue; } // eslint-disable-line no-continue
  if (a === '-X') { method = args[i += 1]; continue; } // eslint-disable-line no-continue
  if (a === '-F') { form = args[i += 1]; continue; } // eslint-disable-line no-continue
  if (a === '-D') { dump = args[i += 1]; continue; } // eslint-disable-line no-continue
  if (a === '-H') {
    const [k, ...v] = args[i += 1].split(':');
    headers[k.trim().toLowerCase()] = v.join(':').trim();
    continue; // eslint-disable-line no-continue
  }
  url = a;
}

const stateFile = process.env.FAKE_DA_STATE;
const state = JSON.parse(readFileSync(stateFile, 'utf-8'));
state.docs = state.docs || {};
appendFileSync(process.env.FAKE_DA_LOG, `${JSON.stringify({ method, url, headers })}\n`);

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
  state.etagSeq = (state.etagSeq || 0) + 1;
  const author = (state.atPost || {})[url];
  if (author) {
    state.docs[url] = {
      status: 200, body: author.body, lastModified: Date.now(), etag: `"author-${state.etagSeq}"`,
    };
    delete state.atPost[url];
  }
  // deleteAtPost: the object is deleted as our document POST arrives (before the precondition check)
  if ((state.deleteAtPost || []).includes(url)) {
    delete state.docs[url];
    state.deleteAtPost = state.deleteAtPost.filter((u) => u !== url);
  }
  const current = state.docs[url];
  const exists = current && current.status === 200;
  const precondition = (headers['if-none-match'] === '*' && exists)
    || (headers['if-match'] && headers['if-match'] !== '*' && exists && headers['if-match'] !== current.etag)
    || (headers['if-match'] === '*' && !exists);
  if (precondition) {
    writeFileSync(stateFile, JSON.stringify(state));
    out('{"error":"precondition failed"}', 412);
  }
  const file = (form || '').replace(/^data=@/, '').split(';')[0];
  let body = readFileSync(file, 'utf-8');
  const transform = (state.storeTransform || {})[url];
  if (transform) body = body.split(transform[0]).join(transform[1]);
  const etag = `"e${state.etagSeq}"`;
  state.docs[url] = {
    status: 200, body, lastModified: Date.now(), etag,
  };
  writeFileSync(stateFile, JSON.stringify(state));
  // noEtag: a write response without an ETag header (no usable precondition for later updates)
  if (dump) writeFileSync(dump, `HTTP/2 201\r\n${state.noEtag ? '' : `etag: ${etag}\r\n`}\r\n`);
  out('{}', 201);
}

const d = state.docs[url];
if (!d) out('', 404);
out(d.body || '', d.status);
