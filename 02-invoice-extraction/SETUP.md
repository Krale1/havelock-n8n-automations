# Setup — Havelock Invoice Extraction

Second automation for the same fictional company as
[project 1](../01-ticket-triage/SETUP.md). Both credentials carry over — this
one needs no new Google Cloud setup.

Verified against **n8n 2.29.10** (`n8n-local`, `http://localhost:5678`).

---

## 1. Generate the test invoices

```powershell
cd 02-invoice-extraction/test-data
python generate-invoices.py
```

Writes six PDFs plus `manifest.json` into `test-data/invoices/`. Needs
`reportlab`, `pillow` and `numpy`, all already installed.

The documents are synthetic. No real vendors, no real amounts.

---

## 2. Import the workflow

**Workflows → ⋯ → Import from File…** → `workflow/invoice-extraction.workflow.json`

Five nodes, one straight path — no fork. Both branches of project 1 did
different things; here every invoice gets validated and logged the same way,
so a fork would be decoration. Filter the sheet by `status` instead.

---

## 3. Credentials (both reused)

- **Anthropic** — open *Extract Invoice Data (Claude)* and pick the same
  credential project 1 uses. Nothing new to create.
- **Google Sheets** — the OAuth2 credential from project 1 works as-is. The
  painful Google Cloud setup is already done.

---

## 4. The ledger sheet

New spreadsheet, first tab renamed to **`ledger`**, this pasted into **A1**:

```
timestamp	source_file	vendor_name	invoice_number	invoice_date	due_date	currency	subtotal	tax_amount	total_amount	line_items_json	status	flag_reason
```

Thirteen columns, tab-separated — paste into A1 and it spreads to A1:M1.
Names must match exactly; the node maps by header name.

> Two columns beyond the obvious set: `subtotal` and `tax_amount`.
> They exist because the validation reconciles line items against the subtotal
> *and* subtotal + tax against the total. Without both stored, a flagged row
> can't be checked by eye.

Paste the sheet ID into *Sheets: Append to Ledger* (currently
`PASTE_YOUR_LEDGER_SHEET_ID_HERE`), set the sheet to `ledger`, and confirm
**Mapping Column Mode** is **Map Automatically** — n8n sometimes flips this
to manual on import.

---

## 5. Test

```powershell
cd test-data
.\send-invoices.ps1 -Only invoice-05-large
```

Click **Test workflow** in n8n first; a test webhook takes one call per click.
For all six in a row, activate the workflow and use `-Production`.

The PDF goes up as the raw request body. The filename travels as
`?source_file=` because a raw body carries no filename.

**What each document is for:**

| File | Expect | Rule under test |
|---|---|---|
| `invoice-01-clean` | `auto_processed` | Baseline — nothing should fire |
| `invoice-02-multi-line` | `auto_processed` | Three items reconcile to subtotal and total |
| `invoice-03-sum-mismatch` | `needs_review` | Items sum to 605.00, invoice claims 745.00 |
| `invoice-04-missing-fields` | `needs_review` | Till receipt with no vendor name and no date |
| `invoice-05-large` | `needs_review` | Arithmetic perfect, $7,106.75 is over threshold |
| `invoice-06-poor-scan` | `needs_review` | Total and date clipped out of frame |

Each document is built to trip **one** rule, so a failure tells you which check
broke. Invoice 06 is the exception — it legitimately raises two.

---

## The five validation rules

All in the **Validate & Flag** code node. Any one firing sets
`status = needs_review` and appends to `flag_reason`.

1. **Missing fields** — `vendor_name`, `invoice_date` or `total_amount` absent
2. **Line items ≠ subtotal** — beyond 0.02 tolerance
3. **Subtotal + tax ≠ total** — beyond 0.02 tolerance
4. **Over threshold** — total above 5,000. Not an error; large amounts deserve
   a human look before they're booked
5. **Model uncertain** — Claude returned non-empty `confidence_notes`

Plus a sixth, implicit: if the model's reply isn't parseable JSON at all, the
row is flagged `extraction_unreadable`. Same fail-toward-a-human default as
project 1.

**The validation runs in code, not in the prompt.** That's the point. Claude
transcribes; n8n decides. An invoice is not trusted just because an AI read it
confidently.

---

## Two deliberate constraints

**The prompt forbids Claude from fixing arithmetic.** It's told to transcribe
numbers exactly as printed and *not* to correct line items that don't add up.
Without that, a helpful model silently reconciles invoice 03 and rule 2 never
fires — the workflow would look like it worked while its main check sat dead.

**Everything is USD.** The threshold compares a bare number, so mixing
currencies would compare €6,000 against a $5,000 limit. Single-currency test
data sidesteps it. A real build would convert before comparing.

---

## What this workflow refuses to do

It extracts and flags. Nothing else.

It does not approve invoices, schedule payments, mark anything as paid, or
push data into an accounting system. Every row lands in a ledger for a person
to act on.

That's deliberate, and it's the same theme as project 1's "never confirm what
you can't verify." An extraction model that is wrong costs a correction. An
extraction model wired to a payment run costs money.

---

## Changelog

**2026-09-23 — Ops Console added.** This project's ledger rows are now
viewable in the [Ops Console](../ops-console/SETUP.md), which can also upload
an invoice through a browser drop zone instead of `send-invoices.ps1`.

**No nodes were added to this workflow.** The read-only webhook that feeds the
console lives in its own shared workflow
(`ops-console/workflow/ops-console-data.workflow.json`) rather than being
grafted into this one — a tested automation shouldn't be modified to serve a
demo tool.

The console posts the PDF exactly as `send-invoices.ps1` does: raw body,
filename in `?source_file=`. Nothing about the intake contract changed.

Keep this workflow **Active** during demos; the console uses the production
webhook path.
