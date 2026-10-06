# Setup — Havelock Customer Onboarding

One signup arrives on a webhook. It fans out to **three destinations**: a CRM
row, a set of starter checklist rows, and a notification to the onboarding
team.

That fan-out is the point of this project. The first three automations all had
the same shape — one input, one judgement, one log. This one is the shape most
real "connect these systems" work actually takes.

Verified against **n8n 2.29.10** (`n8n-local`, `http://localhost:5678`).

---

## 1. The spreadsheet — two tabs

One spreadsheet, **two tabs**, because two sheets stand in for two different
systems.

**Tab 1, renamed to `customers`.** Paste into **A1** (tab-separated):

```
timestamp	signup_id	company_name	contact_name	contact_email	employee_count	business_description	onboarding_track	flag_for_human	flag_reason	internal_summary	welcome_email_draft	status
```

Thirteen columns. One row per signup, always.

**Tab 2, renamed to `onboarding_tasks`.** Paste into **A1**:

```
timestamp	signup_id	company_name	task	done
```

Five columns. Three or four rows per signup.

> **`signup_id` is on both sheets, and it is load-bearing.** It is how the ops
> console matches a signup's checklist back to the signup. The obvious
> alternative — matching on company name — breaks the first time you submit
> the same demo signup twice, which is exactly what happens while testing.
> Matching on timestamp fails for the same reason, plus the two branches
> would have to agree on the same instant.
>
> The workflow mints both `timestamp` and `signup_id` once, in
> **Normalize Signup**, and both branches reuse them.

Copy the spreadsheet ID out of the URL:

```
https://docs.google.com/spreadsheets/d/<THIS PART>/edit
```

---

## 2. Import the workflow

n8n → **Workflows** → **Import from File** →
`04-customer-onboarding/workflow/customer-onboarding.workflow.json`

Then fix the three placeholders:

| Node | What to change |
|---|---|
| **Sheets: Append Customer** | `PASTE_ONBOARDING_SHEET_ID_HERE` → your spreadsheet ID |
| **Sheets: Append Tasks** | same ID again (same spreadsheet, different tab) |
| Both Sheets nodes | pick your Google Sheets OAuth2 credential |
| **Classify Signup (Claude)** | pick your Anthropic credential |

Leave **Notify Onboarding Team (SMTP)** disabled. It has no credential and is
wired to show the third destination, not to send mail.

Hit **Publish** (this n8n build calls it Publish, not Active).

---

## 3. Teach the ops console about the two new sheets

The read workflow already in your n8n needs two more entries. You do **not**
have to re-import it and re-paste your other three sheet IDs — just edit the
node in place.

Open **Ops Console Data** → the **Resolve Project** node, and add these two
lines to the `SHEETS` map:

```js
  onboarding:       { sheet_id: "YOUR_ONBOARDING_SHEET_ID", tab: "customers" },
  onboarding_tasks: { sheet_id: "YOUR_ONBOARDING_SHEET_ID", tab: "onboarding_tasks", max_rows: 400 },
```

Both point at the same spreadsheet; only the tab differs.

`max_rows: 400` matters. `Shape Rows` caps results at 50 by default, and task
rows pile up three to four times faster than signups — at 50 the checklist
would quietly disappear from older signups while everything still *looked*
fine. The cap is now per-project; the other three keys are unaffected.

> If you'd rather re-import the updated file
> (`ops-console/workflow/ops-console-data.workflow.json`), you'll need to
> paste all four sheet IDs again.

**Publish** the read workflow again after editing.

---

## 4. Start the server

```powershell
cd <repo root>
node serve.mjs 8000
```

Three pages:

| | |
|---|---|
| `http://localhost:8000/ops-console/#onboarding` | internal — the new tab |
| `http://localhost:8000/customer-signup.html` | what a prospective customer sees |
| `http://localhost:8000/customer-support.html` | project 1's customer page |

Everything goes through the same-origin proxy, so CORS never enters the
picture.

---

## 5. Test it

**Through the page** — the realistic path:

Open `customer-signup.html`, fill it in, submit. You get a thank-you and
nothing else. Then open the console's Onboarding tab and watch the row land.

**In bulk** — to populate the sheets in one go:

```powershell
cd 04-customer-onboarding/test-data
.\send-signups.ps1 -Production
```

Six signups → 6 rows in `customers`, 22 in `onboarding_tasks`.

Expected outcomes:

| Signup | Track | Flagged? |
|---|---|---|
| Barrow & Finch Dental | `standard` | no |
| The Lamplighter | `tipped_employees` | no |
| Ridgeline Design Co | `multi_state_remote` | no |
| Halden Freight Services | `contractor_heavy` | no |
| Corvid Analytics | `needs_review` | **yes** — employees in Portugal and Canada |
| Stennet Group | `needs_review` | **yes** — description too thin to classify |

The last two are the ones that matter. Four correct classifications prove it
works; two honest refusals prove it knows when it doesn't.

---

## How it fits together

```
Webhook: New Signup
  └─ Normalize Signup          mints timestamp + signup_id, once
      └─ Classify Signup (Claude)
          └─ Parse Classification
              ├─ Build Customer Row → Sheets: Append Customer → Respond to Signup
              ├─ Expand Checklist   → Sheets: Append Tasks
              └─ Notify Onboarding Team (SMTP)   [disabled]
```

**The three branches hang off one node.** That is deliberate, and it is the
one thing in this workflow that is easy to get silently wrong.

`Expand Checklist` turns one item into four. If `Build Customer Row` sat
*downstream* of it, the customers sheet would get four identical rows per
signup. It would look fine in n8n — no error, no warning — and you'd only
notice when you opened the sheet. Keeping the CRM branch beside the expansion
rather than after it is what prevents that.

`Respond to Signup` fires after the CRM row is safely written, then the other
branches carry on. The response body is a fixed `{"received": true}` — the
track, the flag and the draft email never leave the building.

---

## Things worth knowing

**The checklist is a lookup table, not a second Claude call.** Once the track
is decided, which starter tasks belong to it is fixed knowledge. It lives in
`Expand Checklist` where you can read and change it without re-testing a
prompt. Spending a model call on it would be spending money to get a worse
answer.

**`needs_review` has its own checklist.** Without one, a flagged signup would
produce zero task rows — meaning the row that most needs someone to act on it
would be the only one that looked empty. Its list says *don't start setup, read
the flag reason, reply once the track is confirmed*.

**The parser distrusts the model on purpose.** An unrecognised track, a
missing flag reason, a `needs_review` with `flag_for_human: false`, or output
that isn't JSON at all — each resolves toward a human rather than toward a
guess. All eight cases are covered by the dry-run described below.

**Nothing is ever sent to the customer.** The welcome email is written to the
`customers` row as a draft. A person reads it and sends it. The workflow has
no path that emails a customer, and the one email node it does have is
disabled and addressed to the internal team.

---

## Verifying the logic without spending credit

The two Code nodes were dry-run before the first live call: their JavaScript
is read straight out of the workflow JSON, handed stubbed model output, and
checked. Eight cases — the six synthetic signups plus an invented track and a
non-JSON response — covering track validity, flag/reason agreement, status,
the join key, and whether the draft email leaks any internal wording.

All eight passed, as did the fan-out arithmetic: 8 signups → 8 customer rows
→ 28 task rows, no orphans.
