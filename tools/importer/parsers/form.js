/* eslint-disable */
/* global WebImporter */
/*
 * Parser: form. Live: .marketoForm (Marketo form, client-rendered; read from the rendered
 * snapshot DOM). Render-only form on EDS: no submission, no reCAPTCHA.
 * Project contract (block-authoring.md, blocks/form/form.js):
 *   | Form |
 *   | First Name | text | required |
 *   | Province | select: AB, BC, ... | required |
 *   | Submit | submit | |
 * The success text (shown on live after sending) is the last row: | Success | text |.
 */
import {
  h, block, text, norm,
} from '../utils/dom.js';

const TYPES = ['text', 'email', 'tel', 'number', 'url'];

export default function parse(element, { document }) {
  const rows = [];
  const tip = element.querySelector('.marketoForm__tip');
  const form = element.querySelector('form');
  if (form) {
    form.querySelectorAll('.mktoFormRow').forEach((row) => {
      const label = row.querySelector('label');
      const field = row.querySelector('input:not([type="hidden"]), select, textarea');
      if (!label || !field || !text(label)) return;
      if (/recaptcha/i.test(field.getAttribute('name') || '')) return;
      const name = text(label).replace(/^\*\s*/, '').replace(/:\s*$/, '');
      const required = /^\*/.test(text(label)) || field.hasAttribute('required')
        || field.getAttribute('aria-required') === 'true' || !!row.querySelector('.mktoRequiredField');
      let type;
      if (field.tagName === 'SELECT') {
        const opts = [...field.querySelectorAll('option')].map((o) => norm(o.textContent))
          .filter((o) => o && !/^select/i.test(o));
        type = `select: ${opts.join(', ')}`;
      } else if (field.tagName === 'TEXTAREA') type = 'textarea';
      else if (field.getAttribute('type') === 'checkbox') type = 'checkbox';
      else type = TYPES.includes(field.getAttribute('type')) ? field.getAttribute('type') : 'text';
      rows.push([name, type, required ? 'required' : '']);
    });
    const button = form.querySelector('.mktoButtonRow button') || form.querySelector('button[type="submit"]')
      || form.querySelector('.mktoButton');
    rows.push([text(button) || 'Submit', 'submit', '']);
  }
  if (text(tip) && !/indicates a required field/i.test(text(tip))) rows.unshift(['Tip', text(tip)]);
  // live shows the success text only after sending: a Success row, hidden until submit
  const success = element.querySelector('.marketoForm__success');
  const msg = success ? [...success.querySelectorAll('h1, h2, h3, h4, p')].filter((p) => text(p))
    .map((p) => h(document, 'p', text(p))) : [];
  if (msg.length) rows.push(['Success', msg]);
  element.replaceWith(block(document, 'Form', [], rows));
}
