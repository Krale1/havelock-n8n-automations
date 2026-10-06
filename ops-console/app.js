/* Havelock Ops Console
 *
 * A window onto the n8n workflows - it triggers them and shows what they
 * wrote. It deliberately contains no classification or validation logic of
 * its own; every decision shown here was made inside a workflow.
 *
 * Adding a project means adding one entry to PROJECTS below.
 */

'use strict';

// Same origin as this page: serve.mjs forwards /webhook/* to n8n, so the
// browser never makes a cross-origin request.
const DATA_URL = '/webhook/ops-console-data';


const PROJECTS = {
  tickets: {
    label: 'Ticket Triage',
    hint: 'Posts to /webhook/ticket-triage — classified and routed by Claude.',
    submitLabel: 'Send ticket',
    trigger: { url: '/webhook/ticket-triage', mode: 'json' },

    // Tickets come from customers, via customer-support.html. Showing a submit
    // box next to the full ticket log would suggest a customer can see
    // everyone else's tickets, which is not what happens. This tab is the
    // internal view only.
    //
    // The other two tabs keep their forms: an invoice is uploaded by
    // Havelock's own bookkeeper, and a pricing check is an admin action.
    // Neither has a customer on the other end.
    hideSubmitForm: true,

    samples: {
      url: '../01-ticket-triage/test-data/tickets.json',
      label: (t) => `${t.ticket_id} — ${t.subject}`,
      note: (t) => t._expected,
      fill: (t) => ({
        customer_email: t.customer_email,
        subject: t.subject,
        body: t.body,
      }),
    },

    fields: [
      { name: 'customer_email', label: 'Customer email', type: 'email', placeholder: 'name@example.com' },
      { name: 'subject', label: 'Subject', type: 'text', placeholder: 'Short summary' },
      { name: 'body', label: 'Message', type: 'textarea', placeholder: 'What the customer wrote…' },
    ],

    columns: [
      { key: 'timestamp', label: 'Time', fmt: 'time' },
      { key: 'ticket_id', label: 'Ticket', fmt: 'mono' },
      { key: 'customer_email', label: 'Customer', fmt: 'clip' },
      { key: 'subject', label: 'Subject', fmt: 'clip' },
      { key: 'topic', label: 'Topic' },
      { key: 'urgency', label: 'Urgency' },
      { key: 'sentiment', label: 'Sentiment' },
      { key: 'status', label: 'Status', fmt: 'pill' },
      { key: 'routed_to', label: 'Routed to' },
    ],

    detail: [
      { key: 'summary', label: 'Summary' },
      { key: 'draft_reply', label: 'Draft reply' },
      { key: 'body', label: 'Original message' },
    ],

    rowKey: (r) => `${r.ticket_id || ''}|${r.timestamp || ''}`,
  },

  invoices: {
    label: 'Invoice Extraction',
    hint: 'Posts the file to /webhook/invoice-intake — extracted and validated.',
    submitLabel: 'Upload invoice',
    trigger: { url: '/webhook/invoice-intake', mode: 'file' },

    samples: {
      url: '../02-invoice-extraction/test-data/invoices/manifest.json',
      dir: '../02-invoice-extraction/test-data/invoices/',
      label: (i) => `${i.file} — expects ${i.expected_status}`,
      note: (i) => i.why,
      fileName: (i) => i.file,
    },

    columns: [
      { key: 'timestamp', label: 'Time', fmt: 'time' },
      { key: 'source_file', label: 'File', fmt: 'mono' },
      { key: 'vendor_name', label: 'Vendor', fmt: 'clip' },
      { key: 'invoice_date', label: 'Invoice date' },
      { key: 'total_amount', label: 'Total', fmt: 'money' },
      { key: 'status', label: 'Status', fmt: 'pill' },
      { key: 'flag_reason', label: 'Flags', fmt: 'clip' },
    ],

    detail: [
      { key: 'flag_reason', label: 'Why it was flagged' },
      { key: 'line_items_json', label: 'Line items', mono: true },
      { key: 'invoice_number', label: 'Invoice number' },
      { key: 'subtotal', label: 'Subtotal' },
      { key: 'tax_amount', label: 'Tax' },
    ],

    rowKey: (r) => `${r.source_file || ''}|${r.timestamp || ''}`,
  },

  pricing: {
    label: 'Competitor Pricing',
    hint: 'Runs the same check the schedule runs, immediately.',
    submitLabel: 'Check now',
    // GET, and no payload - there is nothing for anyone to type.
    trigger: { url: '/webhook/pricing-check-now', mode: 'button', method: 'GET' },

    // Instead of a sample picker, this project stages the competitor's page.
    mock: {
      url: '/mock-pricing',
      read: '/mock-pricing',
      field: 'variant',
      title: 'Competitor page',
      note: 'Swaps mock-competitor-pricing.html between prepared versions. ' +
            'Run a check after each swap.',
      options: [
        ['baseline', 'baseline — starting point'],
        ['cosmetic', 'cosmetic — copy only, should NOT flag'],
        ['price', 'price — Growth $49 → $59'],
        ['feature', 'feature — Phone support removed from Pro'],
      ],
    },

    columns: [
      { key: 'timestamp', label: 'Time', fmt: 'time' },
      { key: 'target', label: 'Target' },
      { key: 'changed', label: 'Changed', fmt: 'pill' },
      { key: 'change_type', label: 'Type' },
      { key: 'summary', label: 'What changed', fmt: 'clip' },
    ],

    detail: [
      { key: 'summary', label: 'Summary' },
      { key: 'note', label: 'How it was decided' },
      { key: 'change_type', label: 'Change type' },
    ],

    rowKey: (r) => `${r.timestamp || ''}|${r.change_type || ''}`,
  },

  onboarding: {
    label: 'Customer Onboarding',
    hint: 'Signups arrive from customer-signup.html. Each one writes a CRM row and its starter checklist.',

    // Signups are filled in by prospective customers, not by Havelock staff.
    // Same audience split as tickets: this tab is the internal view of what
    // arrived, and nothing else.
    hideSubmitForm: true,

    // The checklist lives in a second sheet, standing in for a second system.
    // Those rows are joined onto their signup and shown in its expansion
    // rather than in a table of their own - four tabs that behave the same
    // way is worth more than one tab with bespoke UI.
    //
    // The join is on signup_id, not company name: the same demo signup gets
    // submitted more than once, and company name would mix their checklists
    // together.
    related: {
      project: 'onboarding_tasks',
      joinOn: 'signup_id',
      label: 'Starter checklist',
      line: (r) => `${String(r.done).toLowerCase() === 'yes' ? '[x]' : '[ ]'} ${r.task}`,
      empty: 'No checklist rows found for this signup.',
    },

    columns: [
      { key: 'timestamp', label: 'Time', fmt: 'time' },
      { key: 'signup_id', label: 'Signup', fmt: 'mono' },
      { key: 'company_name', label: 'Company', fmt: 'clip' },
      { key: 'contact_name', label: 'Contact', fmt: 'clip' },
      { key: 'employee_count', label: 'Staff', fmt: 'num' },
      { key: 'onboarding_track', label: 'Track' },
      { key: 'status', label: 'Status', fmt: 'pill' },
      { key: 'flag_reason', label: 'Flagged because', fmt: 'clip' },
    ],

    detail: [
      { key: 'internal_summary', label: 'Summary' },
      { key: 'flag_reason', label: 'Why it was flagged' },
      { key: 'welcome_email_draft', label: 'Draft welcome email — not sent' },
      { key: 'business_description', label: 'What they wrote' },
      { key: 'contact_email', label: 'Contact email' },
    ],

    rowKey: (r) => `${r.signup_id || ''}|${r.timestamp || ''}`,
  },
};

const GREEN = ['auto_processed', 'auto_drafted', 'ok', 'processed', 'operational', 'false'];
const AMBER = ['needs_review', 'flagged', 'review', 'degraded', 'down', 'check_failed', 'true'];

// ------------------------------------------------------------------ state

let current = 'tickets';
let samples = [];
let pendingFile = null;      // { name, blob } for the invoice project
let seenKeys = new Set();

const $ = (id) => document.getElementById(id);

// ----------------------------------------------------------------- helpers

function pillClass(v) {
  const s = String(v || '').toLowerCase();
  if (GREEN.includes(s)) return 'pill pill--ok';
  if (AMBER.includes(s)) return 'pill pill--warn';
  return 'pill';
}

function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function fmtMoney(v) {
  if (v === '' || v === null || v === undefined) return '—';
  const n = Number(v);
  return isNaN(n) ? String(v) : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cell(col, row) {
  const raw = row[col.key];
  const td = document.createElement('td');

  if (col.fmt === 'pill') {
    const span = document.createElement('span');
    span.className = pillClass(raw);
    // Careful: `changed` is a boolean, and `false || 'unknown'` would print
    // "unknown" for every routine check.
    span.textContent = raw === '' || raw === null || raw === undefined ? 'unknown' : String(raw);
    td.appendChild(span);
    return td;
  }

  if (col.fmt === 'time') { td.textContent = fmtTime(raw); td.className = 'cell--mono'; return td; }
  if (col.fmt === 'money') { td.textContent = fmtMoney(raw); td.className = 'cell--num'; return td; }
  if (col.fmt === 'mono') { td.textContent = raw || '—'; td.className = 'cell--mono'; return td; }
  if (col.fmt === 'num') { td.textContent = raw === '' || raw == null ? '—' : String(raw); td.className = 'cell--num'; return td; }

  td.textContent = raw === '' || raw === null || raw === undefined ? '—' : String(raw);
  if (col.fmt === 'clip') { td.className = 'cell--clip'; td.title = td.textContent; }
  return td;
}

function setEnv(ok, text) {
  $('env-dot').className = 'env__dot ' + (ok === null ? '' : ok ? 'env__dot--ok' : 'env__dot--bad');
  $('env-text').textContent = text;
}

// -------------------------------------------------------------------- tabs

function renderTabs() {
  const nav = $('tabs');
  nav.innerHTML = '';
  for (const [key, cfg] of Object.entries(PROJECTS)) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(key === current));
    b.textContent = cfg.label;
    b.addEventListener('click', () => selectProject(key));
    nav.appendChild(b);
  }
}

async function selectProject(key) {
  current = key;
  pendingFile = null;
  seenKeys = new Set();
  renderTabs();
  renderForm();
  $('submit-result').hidden = true;
  await loadSamples();
  await refresh();
}

// -------------------------------------------------------------------- form

function renderForm() {
  const cfg = PROJECTS[current];
  const form = $('trigger-form');
  form.innerHTML = '';

  // Some tabs are read-only views. Hide the whole panel and let the log take
  // the full width rather than leaving a gap where the form was.
  const hidden = !!cfg.hideSubmitForm;
  $('submit-panel').hidden = hidden;
  document.querySelector('.layout').classList.toggle('layout--full', hidden);
  if (hidden) return;

  $('trigger-hint').textContent = cfg.hint;
  $('submit-label').textContent = cfg.submitLabel;
  $('sample-field').hidden = cfg.trigger.mode === 'button';

  // Nothing to fill in - instead, a control for the synthetic provider the
  // workflow polls, so an outage can be staged without leaving the page.
  if (cfg.trigger.mode === 'button') {
    if (cfg.mock) renderMockControl(form, cfg);
    return;
  }

  if (cfg.trigger.mode === 'file') {
    const drop = document.createElement('div');
    drop.className = 'drop';
    drop.id = 'drop';
    drop.innerHTML = '<div>Drop a PDF here, or click to choose</div>';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.png,.jpg,.jpeg';
    input.hidden = true;

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drop--over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drop--over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drop--over');
      if (e.dataTransfer.files[0]) takeFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => { if (input.files[0]) takeFile(input.files[0]); });

    form.appendChild(drop);
    form.appendChild(input);
    return;
  }

  for (const f of cfg.fields) {
    const label = document.createElement('label');
    label.className = 'field';

    const span = document.createElement('span');
    span.className = 'field__label';
    span.textContent = f.label;
    label.appendChild(span);

    const el = document.createElement(f.type === 'textarea' ? 'textarea' : 'input');
    el.className = 'input';
    el.name = f.name;
    el.id = 'f-' + f.name;
    if (f.type !== 'textarea') el.type = f.type;
    if (f.placeholder) el.placeholder = f.placeholder;
    label.appendChild(el);

    form.appendChild(label);
  }
}

/**
 * Control panel for whatever synthetic thing this project watches.
 *
 * It stages the fixture; it is not part of the automation. n8n has no idea the
 * target is synthetic, which is the point - the monitoring logic is real, only
 * the thing being watched is staged.
 */
function renderMockControl(form, cfg) {
  const field = cfg.mock.field || 'status';

  const wrap = document.createElement('div');
  wrap.className = 'mock';
  wrap.innerHTML =
    `<div class="mock__head">${cfg.mock.title || 'Synthetic target'}</div>` +
    '<div class="mock__now">current: <strong id="mock-current">…</strong></div>';

  const row = document.createElement('div');
  row.className = 'mock__row';

  const select = document.createElement('select');
  select.className = 'input';
  select.id = 'mock-select';
  for (const o of cfg.mock.options) {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }

  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'btn btn--ghost';
  apply.textContent = 'Set';
  apply.addEventListener('click', async () => {
    apply.disabled = true;
    try {
      const res = await fetch(cfg.mock.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: select.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || String(res.status));
      $('mock-current').textContent = data[field];
      showResult('', 'Target set to ' + data[field],
        'Nothing has been checked yet — hit "Check now" to see how it reacts.');
    } catch (err) {
      showResult('bad', 'Could not change the target', err.message);
    } finally {
      apply.disabled = false;
    }
  });

  row.appendChild(select);
  row.appendChild(apply);
  wrap.appendChild(row);

  if (cfg.mock.note) {
    const note = document.createElement('p');
    note.className = 'mock__note';
    note.textContent = cfg.mock.note;
    wrap.appendChild(note);
  }

  form.appendChild(wrap);
  readMockState(cfg);
}

async function readMockState(cfg) {
  const field = cfg.mock.field || 'status';
  try {
    const res = await fetch(cfg.mock.read + '?t=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    const el = $('mock-current');
    const sel = $('mock-select');
    if (el) el.textContent = data[field] || 'unknown';
    if (sel && data[field]) sel.value = data[field];
  } catch {
    const el = $('mock-current');
    if (el) el.textContent = 'unreadable';
  }
}

function takeFile(file) {
  pendingFile = { name: file.name, blob: file };
  const drop = $('drop');
  if (drop) drop.innerHTML = `<div class="drop__file">${file.name}</div><div>click to change</div>`;
}

// ----------------------------------------------------------------- samples

async function loadSamples() {
  const cfg = PROJECTS[current];
  const picker = $('sample-picker');
  picker.innerHTML = '<option value="">— write your own —</option>';
  samples = [];

  // Nothing to pre-fill when there is no form, or no samples for it.
  if (cfg.hideSubmitForm || !cfg.samples) return;

  try {
    const res = await fetch(cfg.samples.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    samples = await res.json();
  } catch (err) {
    picker.innerHTML = '<option value="">(samples unavailable)</option>';
    return;
  }

  samples.forEach((s, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = cfg.samples.label(s);
    picker.appendChild(o);
  });
}

async function applySample(index) {
  const cfg = PROJECTS[current];
  const res = $('submit-result');

  if (index === '') {
    pendingFile = null;
    renderForm();
    res.hidden = true;
    return;
  }

  const sample = samples[Number(index)];
  if (!sample) return;

  if (cfg.trigger.mode === 'file') {
    const name = cfg.samples.fileName(sample);
    try {
      const r = await fetch(cfg.samples.dir + name, { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      pendingFile = { name, blob: await r.blob() };
      const drop = $('drop');
      if (drop) drop.innerHTML = `<div class="drop__file">${name}</div><div>loaded from test data</div>`;
    } catch (err) {
      showResult('bad', 'Could not load sample', `${name} — ${err.message}`);
      return;
    }
  } else {
    const values = cfg.samples.fill(sample);
    for (const [k, v] of Object.entries(values)) {
      const el = $('f-' + k);
      if (el) el.value = v;
    }
  }

  const note = cfg.samples.note(sample);
  if (note) showResult('', 'Sample loaded', note);
}

// ------------------------------------------------------------------ submit

function showResult(kind, title, note, fields) {
  const box = $('submit-result');
  box.className = 'result' + (kind ? ' result--' + kind : '');
  box.innerHTML = '';

  const h = document.createElement('div');
  h.innerHTML = `<strong>${title}</strong>`;
  box.appendChild(h);

  if (fields) {
    for (const [k, v] of fields) {
      const row = document.createElement('div');
      row.className = 'result__row';
      row.innerHTML = `<span class="result__k">${k}</span><span class="result__v">${v}</span>`;
      box.appendChild(row);
    }
  }
  if (note) {
    const n = document.createElement('div');
    n.className = 'result__note';
    n.textContent = note;
    box.appendChild(n);
  }
  box.hidden = false;
}

async function submit() {
  const cfg = PROJECTS[current];
  const btn = $('submit-btn');
  btn.disabled = true;
  showResult('', 'Working…', 'The workflow is running. This takes a few seconds.');

  try {
    let res;

    if (cfg.trigger.mode === 'button') {
      res = await fetch(cfg.trigger.url, { method: cfg.trigger.method || 'GET' });
    } else if (cfg.trigger.mode === 'file') {
      if (!pendingFile) {
        showResult('bad', 'No file selected', 'Choose a PDF or pick one of the samples.');
        return;
      }
      const url = `${cfg.trigger.url}?source_file=${encodeURIComponent(pendingFile.name)}`;
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': pendingFile.blob.type || 'application/pdf' },
        body: pendingFile.blob,
      });
    } else {
      const payload = {};
      for (const f of cfg.fields) payload[f.name] = ($('f-' + f.name) || {}).value || '';
      res = await fetch(cfg.trigger.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }

    if (!res.ok) {
      // n8n returns a clean JSON 404 for an unregistered webhook - but only
      // when the request carries no Origin header. Browsers always send one
      // on a POST, and that tips n8n's 404 path into an HTML 500. So an error
      // page here means the same thing a 404 does: the workflow isn't Active.
      let detail;
      if (data) {
        detail = data.message || data.error || data.hint;
      } else if (/<html|Internal Server Error/i.test(text)) {
        detail = 'n8n returned an error page. This almost always means the workflow is not Active — ' +
                 'switch it on with the toggle at the top right of the n8n editor.';
      } else {
        detail = text.slice(0, 300);
      }
      showResult('bad', `Workflow returned ${res.status}`, detail);
      return;
    }

    // responseMode is "lastNode", so the reply is the row the workflow wrote.
    const row = Array.isArray(data) ? data[0] : data;
    const status = row && row.status;

    if (status) {
      const kind = GREEN.includes(String(status).toLowerCase()) ? 'ok' : 'warn';
      const fields = [['status', `<span class="${pillClass(status)}">${status}</span>`]];
      if (row.urgency) fields.push(['urgency', row.urgency]);
      if (row.topic) fields.push(['topic', row.topic]);
      if (row.vendor_name) fields.push(['vendor', row.vendor_name]);
      if (row.total_amount !== undefined && row.total_amount !== '') fields.push(['total', fmtMoney(row.total_amount)]);
      showResult(kind, 'Done', row.flag_reason || row.summary || '', fields);
    } else {
      showResult('ok', 'Submitted', 'The workflow ran. See the table for the result.');
    }

    await refresh();
  } catch (err) {
    showResult('bad', 'Request failed', `${err.message} — is serve.mjs still running, and n8n up?`);
  } finally {
    btn.disabled = false;
  }
}

// ------------------------------------------------------------------ results

// Reads one project key from the read workflow. `key` is a key of that
// workflow's whitelist, which is not the same list as the tabs here - the
// onboarding checklist is readable but has no tab of its own.
async function fetchRows(key) {
  const res = await fetch(`${DATA_URL}?project=${encodeURIComponent(key)}`, { cache: 'no-store' });
  const text = await res.text();

  if (!res.ok) {
    // n8n answered, so it is up - only this one endpoint is missing. Mark the
    // error so the caller does not mislabel it as "n8n unreachable".
    let msg;
    try {
      const e = JSON.parse(text);
      msg = e.message || e.error || text;
    } catch {
      msg = text;
    }
    if (res.status === 404) {
      msg = 'The "Ops Console Data" workflow is not published in n8n yet — import it, then hit Publish.';
    }
    const err = new Error(msg.slice(0, 220));
    err.kind = 'endpoint';
    throw err;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // A 200 with an empty or non-JSON body usually means the read workflow
    // errored internally - most often because its Resolve Project node has
    // no entry for this project key.
    const err = new Error(
      `The read workflow returned an unreadable response for "${key}". ` +
      'Check that its Resolve Project node has an entry for this project.',
    );
    err.kind = 'endpoint';
    throw err;
  }

  return Array.isArray(data) ? data : (data.rows || []);
}

// Fetches the rows joined onto the main table, if this tab has any. A failure
// here must not blank the tab: the checklist is extra detail, and the CRM
// rows are the point.
async function fetchRelated(cfg) {
  if (!cfg.related) return null;
  try {
    const rows = await fetchRows(cfg.related.project);
    const map = new Map();
    for (const r of rows) {
      const k = r[cfg.related.joinOn];
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    return map;
  } catch (err) {
    console.warn('related rows unavailable:', err.message);
    return new Map();
  }
}

async function refresh() {
  const cfg = PROJECTS[current];
  const body = $('results-body');
  const head = $('results-head');
  const empty = $('results-empty');
  const btn = $('refresh-btn');

  btn.disabled = true;

  try {
    const [rows, related] = await Promise.all([fetchRows(current), fetchRelated(cfg)]);
    setEnv(true, 'n8n connected');

    head.innerHTML = '';
    const tr = document.createElement('tr');
    for (const col of cfg.columns) {
      const th = document.createElement('th');
      th.textContent = col.label;
      tr.appendChild(th);
    }
    head.appendChild(tr);

    body.innerHTML = '';

    if (!rows.length) {
      empty.textContent = 'Nothing logged yet. Submit something to see it appear here.';
      empty.hidden = false;
      $('results-hint').textContent = '0 rows';
      return;
    }
    empty.hidden = true;
    $('results-hint').textContent = `${rows.length} most recent — newest first`;

    const firstLoad = seenKeys.size === 0;

    rows.forEach((row, i) => {
      const key = cfg.rowKey(row);
      const isNew = !firstLoad && !seenKeys.has(key);

      const tr = document.createElement('tr');
      if (isNew) tr.classList.add('is-new');
      for (const col of cfg.columns) tr.appendChild(cell(col, row));

      const detail = document.createElement('tr');
      detail.className = 'detail';
      detail.hidden = true;
      const td = document.createElement('td');
      td.colSpan = cfg.columns.length;
      const grid = document.createElement('div');
      grid.className = 'detail__grid';
      for (const d of cfg.detail) {
        const v = row[d.key];
        if (v === '' || v === null || v === undefined) continue;
        const block = document.createElement('div');
        block.innerHTML =
          `<div class="detail__k">${d.label}</div>` +
          `<div class="detail__v${d.mono ? ' detail__v--mono' : ''}"></div>`;
        block.querySelector('.detail__v').textContent = String(v);
        grid.appendChild(block);
      }
      // Rows joined from the second sheet, if this tab has any.
      if (cfg.related && related) {
        const joined = related.get(row[cfg.related.joinOn]) || [];
        const block = document.createElement('div');
        block.innerHTML =
          `<div class="detail__k"></div><div class="detail__v"></div>`;
        block.querySelector('.detail__k').textContent =
          joined.length ? `${cfg.related.label} (${joined.length})` : cfg.related.label;
        block.querySelector('.detail__v').textContent = joined.length
          ? joined.map(cfg.related.line).join('\n')
          : cfg.related.empty;
        grid.appendChild(block);
      }

      if (!grid.children.length) grid.innerHTML = '<div class="detail__v">No extra detail on this row.</div>';
      td.appendChild(grid);
      detail.appendChild(td);

      tr.addEventListener('click', () => {
        detail.hidden = !detail.hidden;
        tr.classList.toggle('is-open', !detail.hidden);
      });

      body.appendChild(tr);
      body.appendChild(detail);
    });

    seenKeys = new Set(rows.map(cfg.rowKey));
  } catch (err) {
    // Distinguish "n8n is down" from "n8n is fine, this endpoint isn't live".
    setEnv(false, err.kind === 'endpoint' ? 'data feed not published' : 'n8n unreachable');
    body.innerHTML = '';
    head.innerHTML = '';
    empty.textContent = `Could not load rows: ${err.message}`;
    empty.hidden = false;
    $('results-hint').textContent = '—';
  } finally {
    btn.disabled = false;
  }
}

// --------------------------------------------------------------------- init

$('sample-picker').addEventListener('change', (e) => applySample(e.target.value));
$('submit-btn').addEventListener('click', submit);
$('refresh-btn').addEventListener('click', refresh);

// #invoices in the URL opens straight onto that tab, so a demo can start on
// the right project without a click.
function fromHash() {
  const key = location.hash.replace('#', '').trim();
  return PROJECTS[key] ? key : 'tickets';
}
window.addEventListener('hashchange', () => {
  const key = fromHash();
  if (key !== current) selectProject(key);
});

current = fromHash();
setEnv(null, 'checking n8n…');
renderTabs();
renderForm();
loadSamples().then(refresh);
