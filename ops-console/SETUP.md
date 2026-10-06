# Setup — Havelock Ops Console

A local screen for exercising the automations without touching PowerShell.
It triggers the workflows and shows the rows they wrote.

It is **not** a project in its own right. It holds no classification or validation logic
of its own — every decision it displays was made inside a workflow.

---

## Run it

From the repository root (one level **above** this folder):

```powershell
cd <repo root>
node serve.mjs
```

Then open **<http://localhost:8000/ops-console/>**

Deep links straight to a tab:

- `http://localhost:8000/ops-console/#tickets`
- `http://localhost:8000/ops-console/#invoices`

`node serve.mjs 9000` uses a different port. Ctrl+C stops it. No install, no
build step, no dependencies.

---

## What serve.mjs does

Two jobs:

1. Serves this folder **and** each project's test data, so the "load a sample"
   pickers can read `tickets.json` and the six invoice PDFs.
2. Forwards anything under `/webhook/` to n8n on port 5678.

That second job is the reason it exists. It puts the page and the webhooks on
**one origin**, so the browser never makes a cross-origin request.

Without it, nothing works. n8n's webhook nodes in this build have no CORS
option, and a preflight request fails outright:

```
OPTIONS /webhook/ticket-triage  →  500 Internal Server Error
                                   (no Access-Control-Allow-Origin)
```

A browser would refuse the call and the page would appear to do nothing, with
the real error only in the devtools console. Serving both from one origin
removes the problem instead of negotiating with it.

It also means the invoice upload is byte-identical to `send-invoices.ps1` —
raw PDF body, `?source_file=` in the query string. No workflow changes.

---

## Before it works: three things in n8n

### 1. Both existing workflows must be **Active**

Toggle top-right in the editor. The console uses production webhook paths.
A test webhook accepts one call per click of *Test workflow*, which looks
broken on camera.

### 2. Import the read workflow

**Workflows → ⋯ → Import from File…** → `ops-console/workflow/ops-console-data.workflow.json`

Five nodes: webhook → resolve project → read sheet → shape → respond.
Read-only. It never writes.

### 3. Configure it, then activate

- Open **Resolve Project** and replace the two placeholders with your real
  spreadsheet IDs:

  ```js
  const SHEETS = {
    tickets:  { sheet_id: "PASTE_TICKET_SHEET_ID_HERE", tab: "tickets" },
    invoices: { sheet_id: "PASTE_LEDGER_SHEET_ID_HERE", tab: "ledger" },
  };
  ```

- Open **Sheets: Read Rows** and select the Google credential from project 1.
  Leave Document and Sheet alone — they are expressions fed by the node above.
- Switch the workflow **Active**.

> The sheet IDs live inside n8n on purpose. The page only ever sends
> `?project=tickets` or `?project=invoices`, so no spreadsheet ID and no
> credential ever reaches the browser. The map doubles as a whitelist —
> without it, this webhook would read any spreadsheet the Google account
> can see.

---

## Using it

**Ticket Triage** — pick a sample or type your own, hit *Send ticket*.

**Invoice Extraction** — pick one of the six test invoices, or drop your own
PDF, hit *Upload invoice*.

Either way the result appears in the panel below the button, and the table
refreshes with the new row highlighted.

No polling is needed. Both trigger workflows use `responseMode: lastNode`, so
the POST reply *is* the finished row — by the time the browser hears back, the
sheet has already been written. Ticket triage takes a few seconds, since it
makes two Claude calls.

**Click any row** to expand it: draft replies and summaries for tickets, flag
reasons and line items for invoices. They're too long for the table.

`status` renders as a coloured pill — green for `auto_processed` /
`auto_drafted`, amber for `needs_review`, so what got caught is readable at a
glance.

---

## Adding another project

One entry in the `PROJECTS` object at the top of `app.js` — label, trigger
URL, form fields, table columns, detail fields. The tab, form, table and
picker all build themselves from it.

Then add a line to the `SHEETS` map in the read workflow's **Resolve Project**
node.

---

## If something looks wrong

| Symptom | Cause |
|---|---|
| `The "Ops Console Data" workflow is not active` | Step 2/3 above — import and activate it |
| Red dot, "n8n unreachable" | `serve.mjs` is running but n8n isn't, or it's not on 5678 |
| Submit returns 404 | That project's workflow isn't Active |
| `(samples unavailable)` in the picker | Server started from the wrong folder — run it from `Havelock/`, not from `ops-console/` |
| Table empty after a successful submit | Sheet ID or tab name wrong in **Resolve Project** |
| Invoice submit fails, tickets work | Check the invoice workflow is Active; the file rides as a raw body |

Anything unexplained: open devtools (F12) → Console and Network. Every call
the page makes goes to `localhost:8000`, so a failing request there is either
the proxy or n8n behind it.

---

## Guardrails kept

- **No login.** Local only, never exposed publicly — same as every workflow.
- **No writes from the page.** It triggers workflows and reads rows. It never
  writes to a sheet directly, so nothing bypasses the validation.
- **No duplicated logic.** Classification and validation stay in n8n. The
  console is a window, not a second implementation.
- **No credentials in client code.** Everything stays in n8n's credential
  store.

---

## Changelog

**2026-09-25 — project 3 retargeted to Competitor Pricing.** The status
monitoring version was replaced; its tab, endpoint and sheet entry went with it.

- `PROJECTS.status` became `PROJECTS.pricing` — same `'button'` trigger mode,
  now a GET to `/webhook/pricing-check-now`. Tab is at `#pricing`.
- `serve.mjs`: `POST /mock-status` became `GET|POST /mock-pricing`, which swaps
  `mock-competitor-pricing.html` between four prepared variants. It copies one
  of four known files over one known file; it is not a general file-write
  endpoint. **Restart `serve.mjs` to pick this up.**
- The mock control is now generic — it takes a field name, labelled options and
  its own title from the project config, rather than hardcoding `status`.
- The read workflow's `Resolve Project` needs `pricing: { sheet_id: "...",
  tab: "pricing_log" }`. The repo copy has it; add it by hand to your live copy
  so your real sheet IDs survive.

**2026-09-24 — Status Monitoring tab added (project 3).** *(superseded by the
entry above — kept for history.)*

- New `status` entry in `app.js`'s `PROJECTS`, using a new `'button'` trigger
  mode: no form fields, one **Check now** button issuing a GET to
  `/webhook/status-check-now`.
- `serve.mjs` gained `POST /mock-status`, which rewrites `mock-status.json` —
  the file project 3's workflow polls. It accepts one of three known values
  and writes one known file; it is not a general file-write endpoint.
  **Restart `serve.mjs` to pick this up.**
- The read workflow's `Resolve Project` node needs a third entry:
  `status: { sheet_id: "...", tab: "status_log" }`. The repo copy has it; add
  it by hand to your live copy so your real sheet IDs survive.

Adding the tab was one config object and one trigger mode — the tab, table,
pills and detail rows all built themselves from it, which was the point of
the config-driven structure.
