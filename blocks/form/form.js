/*
 * Form block (replaces marketoForm; render only, no submission, no network calls).
 *
 * DA authoring table (one row per field):
 *
 * | Form          |                                                  |                 |
 * | First Name    | text                                             | required        |
 * | Last Name     | text                                             | required        |
 * | Email Address | email                                            | required        |
 * | Province      | select: AB, BC, MB, NB, NL, NT, NS, NU, ON, PE, QC, SK, YT | required |
 * | Message       | textarea                                         |                 |
 * | I agree …     | checkbox                                         |                 |
 * | Submit        | submit                                           |                 |
 *
 * Types: text, email, tel, number, url, textarea, select, checkbox, submit.
 * Select options: after "select:" in the type cell, or comma-separated in the third
 * cell. "required" anywhere in the type / third cell marks the field as required.
 * Optional first row `Tip | indicates a required field` overrides the tip text.
 * Submit prevents default and does nothing (static replica).
 */
import { toClassName } from '../../scripts/aem.js';

const INPUT_TYPES = ['text', 'email', 'tel', 'number', 'url', 'date', 'password'];

function parseRow(row) {
  const cells = [...row.children].map((c) => c.textContent.trim());
  const label = cells[0] || '';
  const typeCell = (cells[1] || 'text').trim();
  const extra = cells.slice(2).join(', ');
  const all = `${typeCell} ${extra}`.toLowerCase();
  const required = /\brequired\b/.test(all);
  const [rawType, ...rest] = typeCell.split(':');
  const type = toClassName(rawType) || 'text';
  let options = [];
  if (type === 'select' || type === 'radio') {
    const source = rest.join(':').trim() || extra;
    options = source.split(/[,\n]/).map((o) => o.trim())
      .filter((o) => o && o.toLowerCase() !== 'required');
  }
  return {
    label, type, required, options,
  };
}

function asterisk() {
  const span = document.createElement('span');
  span.className = 'form-asterisk';
  span.setAttribute('aria-hidden', 'true');
  span.textContent = '*';
  return span;
}

function buildField(field, uid, index) {
  const row = document.createElement('div');
  row.className = `form-row form-row-${field.type}`;
  const id = `form-${uid}-${toClassName(field.label) || 'field'}-${index}`;
  const name = toClassName(field.label) || `field-${index}`;

  if (field.type === 'submit') {
    row.className = 'form-row form-button-row';
    const button = document.createElement('button');
    button.type = 'submit';
    button.className = 'form-button';
    button.textContent = field.label || 'Submit';
    row.append(button);
    return row;
  }

  const wrap = document.createElement('div');
  wrap.className = 'form-field-wrap';
  if (field.required) wrap.classList.add('form-required');

  const label = document.createElement('label');
  label.className = 'form-label';
  label.htmlFor = id;
  if (field.required) label.append(asterisk());
  label.append(document.createTextNode(field.type === 'checkbox' ? field.label : `${field.label}:`));

  let control;
  if (field.type === 'textarea') {
    control = document.createElement('textarea');
    control.rows = 4;
  } else if (field.type === 'select') {
    control = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select...';
    control.append(placeholder);
    field.options.forEach((o) => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      control.append(opt);
    });
  } else {
    control = document.createElement('input');
    control.type = field.type === 'checkbox' || INPUT_TYPES.includes(field.type) ? field.type : 'text';
  }
  control.id = id;
  control.name = name;
  control.className = 'form-field';
  if (field.required) {
    control.required = true;
    control.setAttribute('aria-required', 'true');
  }

  if (field.type === 'checkbox') {
    wrap.classList.add('form-checkbox');
    wrap.append(control, label);
  } else if (field.type === 'select') {
    const selectWrap = document.createElement('div');
    selectWrap.className = 'form-select';
    selectWrap.append(control);
    wrap.append(label, selectWrap);
  } else {
    wrap.append(label, control);
  }
  row.append(wrap);
  return row;
}

export default function decorate(block) {
  const uid = Math.random().toString(36).slice(2, 8);
  let tipText = 'indicates a required field';
  const fields = [];
  [...block.children].forEach((row) => {
    const first = row.children[0]?.textContent.trim().toLowerCase();
    if (first === 'tip' && row.children[1]) {
      tipText = row.children[1].textContent.trim() || tipText;
      return;
    }
    const field = parseRow(row);
    if (field.label || field.type === 'submit') fields.push(field);
  });
  if (!fields.some((f) => f.type === 'submit')) {
    fields.push({
      label: 'Submit', type: 'submit', required: false, options: [],
    });
  }

  const inner = document.createElement('div');
  inner.className = 'form-inner';
  if (fields.some((f) => f.required)) {
    const tip = document.createElement('p');
    tip.className = 'form-tip';
    tip.append(asterisk(), document.createTextNode(` ${tipText}`));
    inner.append(tip);
  }
  const form = document.createElement('form');
  form.className = 'form-form';
  form.noValidate = true;
  fields.forEach((f, i) => form.append(buildField(f, uid, i)));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
  });
  inner.append(form);
  block.replaceChildren(inner);
}
