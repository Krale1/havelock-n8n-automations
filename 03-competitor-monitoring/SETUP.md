# Setup — Havelock Competitor Pricing Monitor

Watches a competitor's pricing page and tells the product team when something
**meaningful** changes — a price, a plan, a feature — while ignoring the
marketing copy that churns constantly.

That distinction is the entire product. A diff tool flags every changed pixel.
This decides whether the change matters.

Verified against **n8n 2.29.10** (`n8n-local`, `http://localhost:5678`).

---

## 1. Generate the mock page

```powershell
cd 03-competitor-monitoring/test-data
node generate-pages.mjs
```

Writes four variants into `test-data/pages/` and resets the live page at
`Havelock/mock-competitor-pricing.html` to the baseline.

They're generated from one data structure rather than hand-written, so each
variant differs from the one before it by **exactly one idea**:

| Variant | Differs from previous by | Should the workflow flag it? |
|---|---|---|
| `baseline` | — | — |
| `cosmetic` | Tagline, testimonial, "500+"→"650+", a blurb, a reworded feature bullet, the copyright year | **No** |
| `price` | Growth plan `$49` → `$59` | **Yes** — `price_change` |
| `feature` | "Phone support" removed from Pro | **Yes** — `feature_change` |

Quillbeck is invented. It is not a real company, and no real competitor's site
is ever fetched.

---

## 2. The pricing log sheet

New spreadsheet, first tab renamed to **`pricing_log`**, this pasted into **A1**:

```
timestamp	target	changed	change_type	summary	note	snapshot
```

Seven columns, tab-separated.

> **`snapshot` is a seventh column the workflow cannot work without.** Claude has to compare *old* against *new*, so the
> previous version of the page text has to be stored somewhere. This is it.
> It holds extracted text, not HTML — a page is around 850 characters that
> way, comfortably inside Sheets' 50,000-character cell limit.

---

## 3. Import and configure

**Workflows → ⋯ → Import from File…** → `workflow/competitor-pricing.workflow.json`

Eleven nodes, two triggers. Then:

- **Read Pricing Log** and **Append Log Row** — both need the Google
  credential from project 1 and the sheet ID in place of
  `PASTE_YOUR_PRICING_SHEET_ID_HERE`. **Two nodes, same ID.**
- **Judge Change (Claude)** — pick the Anthropic credential from project 1.
- Confirm **Append Log Row**'s *Mapping Column Mode* is **Map Automatically**.
- **Publish.**

---

## 4. Ops console

Add the pricing sheet to the read workflow's map. Open **Ops Console Data →
Resolve Project**:

```js
const SHEETS = {
  tickets:  { sheet_id: "...", tab: "tickets" },
  invoices: { sheet_id: "...", tab: "ledger" },
  pricing:  { sheet_id: "YOUR_PRICING_SHEET_ID", tab: "pricing_log" },   // add this
};
```

Save and re-publish. Add the line by hand rather than re-importing, so the
sheet IDs already configured in your copy are preserved.

**Restart `serve.mjs`** — it gained a `/mock-pricing` endpoint:

```powershell
cd <repo root>
node serve.mjs
```

Third tab: <http://localhost:8000/ops-console/#pricing>

---

## 5. The demo

The dropdown swaps the page; the button runs a check. You never leave the page.

| Step | Set page to | Hit | Expect |
|---|---|---|---|
| 1 | `baseline` | Check now | Baseline captured, `changed = false`, no model call |
| 2 | `cosmetic` | Check now | **`changed = false`** — the model looked and said it doesn't matter |
| 3 | `price` | Check now | **`changed = true`, `price_change`**, summary naming $49 → $59 |
| 4 | `feature` | Check now | `changed = true`, `feature_change` |

**Steps 2 and 3 back to back are the point.** Step 2 changes six separate
lines of text — tagline, testimonial, social proof, a blurb, a reworded feature
bullet, the copyright year. Any diff tool on earth flags that. This one doesn't.
Then step 3 changes two characters and it fires.

That contrast is the whole pitch, and it only lands if you show them in
sequence.

---

## Where the money goes

Only step 2 onward costs anything. The workflow settles three of four outcomes
before the model is involved:

| Situation | Model called? |
|---|---|
| First ever check | No — nothing to compare against |
| Page text identical to last snapshot | No — nothing to judge |
| Fetch failed | No — logged as `check_failed` |
| **Page text differs** | **Yes** — this is the only case needing judgement |

On a page that changes monthly, almost every scheduled check is free. The
schedule is set to 15 minutes; a pricing page doesn't change by the minute, and
each check that *does* differ costs a Haiku call on about 1,700 characters.

---

## What it's verified to do

15 checks against the real node code, run before any of it touched n8n:

- Extraction keeps prices and features legible — 850 characters, 34 lines
- First run, identical text, and failed fetch all skip the model correctly
- Cosmetic and price edits both correctly *reach* the model
- A failed fetch keeps the previous snapshot, so one bad check doesn't erase
  the baseline and make the next check look like a first run
- An unparseable model reply flags `check_failed` rather than passing silently
- Fenced ```` ```json ```` replies still parse

One bug that pass caught: the generated pages originally carried
`variant: price` in the footer, which leaked the answer into the text Claude
sees and added a phantom change line to every comparison. The marker now lives
in a `<meta>` tag, which the extraction strips.

---

## What this workflow refuses to do

- **Never guesses at ambiguous changes.** If the model can't tell whether a
  reworded line reflects a real change, it's told to flag it as changed and
  say why — not to quietly decide it doesn't matter. Same instinct as project
  2's "don't let Claude fix arithmetic that looks wrong."
- **Never fails silently.** A dead page, unreadable text, or a malformed model
  reply all log a row and alert as `check_failed`.
- **Never acts on a competitor's move.** It doesn't change Havelock's pricing,
  draft a response, or recommend anything. It tells a human what changed.
- **Never touches a real competitor's site.** Local mock only.

---

## One production caveat

Every check reads the whole log sheet to find the last snapshot, and every row
carries a full copy of the page text. That grows fast.

Fine at demo scale. A real build would keep the current snapshot in its own
single-row table and store only a hash in the log. Worth saying out loud rather
than pretending it scales as-is.
