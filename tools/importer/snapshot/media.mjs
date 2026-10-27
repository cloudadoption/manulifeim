/*
 * Image file rules shared by images.mjs (ingest), fix-media.mjs and da-upload.mjs.
 *
 * Edge Delivery (aem.live/docs/limits) accepts JPG, PNG, AVIF, WEBP and SVG, SVG up to 40 KB,
 * images up to 20 MB; a page whose image breaks a rule fails preview (409 content-bus).
 * So: the extension comes from the bytes, GIF becomes PNG, SVG over 40 KB becomes PNG at 2x.
 *
 * SVG rendering: librsvg through gdk-pixbuf-thumbnailer (ImageMagick 6 here has no rsvg
 * delegate; its internal MSVG renderer ignores <style> classes and breaks text), then
 * ImageMagick `convert` writes the final PNG. `convert` alone is the fallback.
 */
import { execFileSync } from 'child_process';
import {
  readFileSync, statSync, existsSync, unlinkSync, renameSync, mkdirSync, copyFileSync,
} from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';

export const SVG_MAX = 40 * 1024;
export const IMAGE_MAX = 20 * 1024 * 1024;
export const ALLOWED = ['jpg', 'png', 'webp', 'avif', 'svg'];
const CONVERT = existsSync('/usr/bin/convert') ? '/usr/bin/convert' : 'convert';
const THUMBNAILER = '/usr/bin/gdk-pixbuf-thumbnailer';

export const MIME = {
  jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
};

/** Image type from the first bytes: jpg | png | gif | webp | avif | svg | null. */
export function sniffType(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  const head = buf.subarray(0, 12).toString('latin1');
  if (/^GIF8[79]a/.test(head)) return 'gif';
  if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'webp';
  if (head.slice(4, 8) === 'ftyp' && /^avi[fs]$/.test(head.slice(8, 12))) return 'avif';
  const text = buf.subarray(0, 4096).toString('utf-8').replace(/^\uFEFF/, '').trimStart();
  if (text.startsWith('<') && /<svg[\s>]/i.test(text)) return 'svg';
  return null;
}

export const sniffFile = (file) => sniffType(readFileSync(file));
export const extOf = (name) => (name.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase().replace('jpeg', 'jpg') || '';
export const withExt = (name, ext) => `${name.replace(/\.[a-z0-9]+$/i, '')}.${ext}`;

/**
 * What a media file needs: null when it is fine, else
 * { action: 'rename'|'gif-to-png'|'svg-to-png'|'unknown'|'too-large', type, size }.
 */
export function mediaProblem(file) {
  const buf = readFileSync(file);
  const type = sniffType(buf);
  const ext = extOf(file);
  const { size } = statSync(file);
  if (!type) return { action: 'unknown', type, size };
  if (type === 'gif') return { action: 'gif-to-png', type, size };
  if (type === 'svg' && size > SVG_MAX) return { action: 'svg-to-png', type, size };
  if (size > IMAGE_MAX) return { action: 'too-large', type, size };
  if (ext !== type) return { action: 'rename', type, size };
  return null;
}

const UNIT = {
  '': 1, px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, ex: 8,
};
const length = (v) => {
  const m = String(v || '').trim().match(/^([\d.]+)\s*(px|pt|pc|mm|cm|in|em|ex)?$/i);
  return m ? Number(m[1]) * UNIT[(m[2] || '').toLowerCase()] : 0;
};

/** Intrinsic SVG size in CSS px from width/height (units) or the viewBox. */
export function svgSize(text) {
  const tag = (text.match(/<svg\b[^>]*>/i) || [''])[0];
  const attr = (n) => (tag.match(new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1];
  const vb = (attr('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const vw = vb.length === 4 ? vb[2] : 0;
  const vh = vb.length === 4 ? vb[3] : 0;
  let w = length(attr('width'));
  let h = length(attr('height'));
  if (w && !h && vw && vh) h = (w * vh) / vw;
  if (h && !w && vw && vh) w = (h * vw) / vh;
  if (!w || !h) [w, h] = vw && vh ? [vw, vh] : [300, 150];
  return { width: w, height: h };
}

const run = (cmd, argv) => execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).toString().trim();

/** Checks a PNG: right type, expected size (±2 px), not empty / uniform, under 20 MB. */
export function verifyPng(file, expect) {
  if (!existsSync(file) || statSync(file).size === 0) return 'no output';
  if (sniffFile(file) !== 'png') return 'output is not a PNG';
  if (statSync(file).size > IMAGE_MAX) return 'PNG over 20 MB';
  const [w, h] = run('identify', ['-format', '%w %h', `${file}[0]`]).split(' ').map(Number);
  if (expect && (Math.abs(w - expect.width) > 2 || Math.abs(h - expect.height) > 2)) {
    return `size ${w}x${h}, expected ${expect.width}x${expect.height}`;
  }
  // flattened on white: an empty (fully transparent) or blank render has no variation
  const sd = Number(run(CONVERT, [file, '-background', 'white', '-alpha', 'remove', '-alpha', 'off', '-colorspace', 'gray', '-format', '%[fx:standard_deviation]', 'info:']));
  if (!(sd > 0.003)) return `blank render (std dev ${sd})`;
  return null;
}

/**
 * SVG -> PNG at `scale` x intrinsic size, transparency kept. Returns
 * { width, height, renderer } or throws with the verification error.
 */
export function rasterizeSvg(src, dest, scale = 2) {
  const size = svgSize(readFileSync(src, 'utf-8'));
  const width = Math.max(1, Math.round(size.width * scale));
  const height = Math.max(1, Math.round(size.height * scale));
  const expect = { width, height };
  const tmp = `${dest}.tmp-${process.pid}.png`;
  let renderer = 'librsvg';
  try {
    if (!existsSync(THUMBNAILER)) throw new Error('no gdk-pixbuf-thumbnailer');
    run(THUMBNAILER, ['-s', String(Math.max(width, height)), pathToFileURL(resolve(src)).href, tmp]);
    run(CONVERT, [tmp, '-strip', '-define', 'png:compression-level=9', `PNG32:${dest}`]);
    const err = verifyPng(dest, expect);
    if (err) throw new Error(err);
  } catch (e) {
    renderer = 'imagemagick-msvg';
    run(CONVERT, ['-background', 'none', '-density', String(96 * scale), src, '-resize', `${width}x${height}!`, '-strip', `PNG32:${dest}`]);
    const err = verifyPng(dest, expect);
    if (err) {
      if (existsSync(dest)) unlinkSync(dest);
      throw new Error(`${err} (librsvg: ${e.message})`);
    }
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
  return { width, height, renderer };
}

/** GIF -> PNG (first frame), same size. */
export function gifToPng(src, dest) {
  const [width, height] = run('identify', ['-format', '%w %h', `${src}[0]`]).split(' ').map(Number);
  run(CONVERT, [`${src}[0]`, '-strip', `PNG32:${dest}`]);
  const err = verifyPng(dest, { width, height });
  if (err) {
    if (existsSync(dest)) unlinkSync(dest);
    throw new Error(err);
  }
  return { width, height, renderer: 'imagemagick' };
}

/**
 * Applies the rules to content/media-da/<name> in place. Returns null when the file is fine,
 * else { from, to, action, type, bytes, newBytes?, width?, height?, renderer?, error? }.
 * keepDir: converted originals are copied there before they are removed.
 * `to` differs from `from` when the file got a new name (references must follow).
 */
export function fixMediaFile(dir, name, { dryRun = false, keepDir = null } = {}) {
  const file = join(dir, name);
  const p = mediaProblem(file);
  if (!p) return null;
  const rec = {
    from: name, action: p.action, type: p.type, bytes: p.size,
  };
  if (p.action === 'unknown' || p.action === 'too-large') {
    rec.error = p.action === 'unknown' ? 'not an image (bytes match no known format)' : 'over 20 MB';
    return rec;
  }
  rec.to = withExt(name, p.action === 'rename' ? p.type : 'png');
  if (dryRun) return rec;
  const target = join(dir, rec.to);
  if (p.action === 'rename') {
    if (existsSync(target)) {
      if (!readFileSync(target).equals(readFileSync(file))) {
        rec.error = `${rec.to} exists with other content`;
        delete rec.to;
        return rec;
      }
      unlinkSync(file);
      rec.note = 'duplicate of existing file, removed';
    } else renameSync(file, target);
    return rec;
  }
  const tmp = `${target}.new-${process.pid}.png`;
  try {
    Object.assign(rec, p.action === 'gif-to-png' ? gifToPng(file, tmp) : rasterizeSvg(file, tmp));
  } catch (e) {
    rec.error = e.message;
    delete rec.to;
    return rec;
  }
  if (keepDir) {
    // keep the original bytes (SVG / GIF) next to the reports
    mkdirSync(keepDir, { recursive: true });
    copyFileSync(file, join(keepDir, name));
  }
  unlinkSync(file);
  renameSync(tmp, target);
  rec.newBytes = statSync(target).size;
  return rec;
}
