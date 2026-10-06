# Setup — Havelock Ticket Triage Workflow

Everything here is local. Nothing is exposed publicly.

Verified against **n8n 2.29.10** (container `n8n-local`, `http://localhost:5678`).

## The demo company

**Havelock** is a fictional company invented for this demo. It sells payroll
and bookkeeping software to small businesses (5–50 staff) — dental practices,
trades, small agencies.

It exists so the sample tickets read like they came from a real business, and
because its tickets sit far apart on urgency: a failed payroll run means staff
don't get paid tomorrow, while a CSV export request can wait a week. Telling
those two apart is the whole job of this workflow.

> Havelock is not a real company, and nothing in the workflow depends on
> the name.

---

## 1. Import the workflow

1. Open `http://localhost:5678`.
2. **Workflows → ⋯ (top right) → Import from File…**
3. Pick `workflow/ticket-triage.workflow.json`.

You should see 11 nodes. Three will show a warning triangle — the two
Google Sheets nodes and the two Claude nodes — because their credentials
aren't connected yet. That's expected; the next two steps fix it.

---

## 2. Anthropic credential

1. **Credentials → Add credential → Anthropic API**.
2. Paste your API key. Name it something like `Anthropic (triage demo)`.
3. Save.
4. Open **Classify Ticket (Claude)** and select that credential. Repeat for
   **Draft Reply (Claude)**.

Both nodes are already set to `claude-haiku-4-5` with `max_tokens` of 300
(classify) and 400 (draft), temperature 0 and 0.3. A full 7-ticket test run
costs a fraction of a cent — the budget is not a real constraint here, but
don't raise `max_tokens` without a reason.

> The key lives only in n8n's credential store. It is not in the workflow
> JSON, so the exported file is safe to commit.

---

## 3. The Google Sheet

Create a new Google Sheet. Rename the first tab to exactly **`tickets`**,
then paste this as **row 1**:

```
timestamp	ticket_id	customer_email	subject	body	topic	urgency	sentiment	summary	routed_to	draft_reply	status
```

(That's tab-separated — paste it into A1 and it will split across A1:L1.)

The column names must match exactly. The Sheets nodes use
`autoMapInputData`, which matches incoming fields to headers **by name** —
a typo in a header means that column silently stays empty.

Now grab the sheet ID from the URL:

```
https://docs.google.com/spreadsheets/d/  1AbC...xyz  /edit#gid=0
                                         ^^^^^^^^^^ this part
```

---

## 4. Google Sheets OAuth2 credential

This is the fiddliest step. It's a one-time Google Cloud setup.

**In Google Cloud Console** (`console.cloud.google.com`):

1. Create a project (or reuse one).
2. **APIs & Services → Library** → enable **Google Sheets API**.
   Also enable **Google Drive API** — n8n uses it to list your spreadsheets
   in the dropdown.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - Fill in app name / your email where required.
   - On the **Test users** step, add your own Google account. Without this
     you'll get `403: access_denied` when you try to connect.
   - You do **not** need to publish or submit for verification.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Under **Authorised redirect URIs**, add:
     ```
     http://localhost:5678/rest/oauth2-credential/callback
     ```
   - Create, then copy the **Client ID** and **Client secret**.

**In n8n:**

5. **Credentials → Add credential → Google Sheets OAuth2 API**.
6. Confirm the **OAuth Redirect URL** shown at the top of the dialog matches
   what you pasted into Google. If it differs, trust n8n's version and update
   Google to match.
7. Paste the Client ID and Client secret → **Sign in with Google** → approve.
   Google will warn that the app isn't verified; continue past it (it's your
   own client).
8. Save.

**Wire it up:** open **Sheets: Log Urgent Ticket**, choose the credential,
then set:
- **Document** → switch the selector to **By ID** and paste your sheet ID
  (it currently reads `PASTE_YOUR_GOOGLE_SHEET_ID_HERE`), or switch to
  **From list** and pick it.
- **Sheet** → `tickets`.

Repeat for **Sheets: Log Standard Ticket**. Both write to the same tab; only
the `status` and `routed_to` values differ.

> **Google OAuth taking too long?** Airtable works as a drop-in alternative:
> swap the two Sheets nodes for Airtable nodes using the same field names. A
> personal access token is much less setup than Google OAuth.

---

## 5. Test run

The Notify On-Call node is **disabled on purpose** — there's no SMTP
credential, and a disabled node passes data straight through instead of
failing the branch. It stays visible on the canvas so the escalation
pattern is part of the picture. If you want it live, add an SMTP credential
and re-enable it.

**Single ticket, watching it run:**

1. Open the workflow, click **Test workflow** (it now waits for one call).
2. In PowerShell:
   ```powershell
   cd test-data
   .\send-tickets.ps1 -Only TKT-1004
   ```
3. Watch the canvas light up, then check the sheet.

A test webhook only accepts **one** call per click of *Test workflow*. To
send all six in a row, activate the workflow (toggle top-right) and use the
production path:

```powershell
.\send-tickets.ps1 -Production
```

**What each ticket is for** — 1004 and 1005 are the interesting ones:

| Ticket | Expected route | Why it's in the set |
|---|---|---|
| TKT-1001 double charge, angry | `needs_review` | Money taken in error → critical |
| TKT-1002 password reset | `auto_drafted` | Plain low-urgency question |
| TKT-1003 CSV export idea | `auto_drafted` | Feature request, neutral |
| TKT-1004 vague disappointment | `auto_drafted` | **Borderline.** Negative tone, nobody blocked — should *not* escalate on tone alone |
| TKT-1005 bank feed not syncing | `auto_drafted` | **Threshold check.** High urgency but neutral tone → `high + neutral` misses the `high + negative` rule |
| TKT-1006 thank-you note | `auto_drafted` | Not really a ticket; shouldn't break anything |
| TKT-1007 payroll failed, staff unpaid | `needs_review` | Clearest critical case |

If TKT-1004 or TKT-1005 escalate, the urgency thresholds in the classify
node's system prompt are the thing to tune — not the IF node.

---

## Routing logic, in one place

The IF node **Needs Human Review?** ORs two conditions:

```
urgency == "critical"
  OR
(sentiment == "negative" AND urgency == "high")
```

The second is a single boolean expression because n8n's IF node can't nest
`A OR (B AND C)` in its flat condition list.

There's a third rule in **Parse Classification**: if Claude's response can't
be parsed as JSON, the ticket is forced to `critical` and sent to a human,
with `route_reason = classification_failed_fail_safe_to_human`. Failing toward
a person is the right default — auto-replying to a ticket you couldn't read is
the worse outcome.

---

## What the draft-reply prompt refuses to do

Because Havelock handles other people's money, the draft-reply node has no
access to any live system and is told so explicitly. It must never:

- confirm a refund, credit, cancellation, or subscription change was made
- state that a payroll run has been corrected, re-run, or completed
- confirm a payment, bank sync, or statutory filing has gone through
- give tax, accounting, payroll-compliance, or financial advice
- invent amounts, dates, reference numbers, deadlines, or policy details
- promise a specific resolution time

Anything involving account access or money movement gets "a specialist will
review this and follow up" instead of an answer.

These limits are deliberate. Wiring two systems together is the easy part;
deciding where the model must stop is what keeps an automation safe to run
against real money.

---

## Changelog

**2026-09-23 — Ops Console added.** This project's rows are now viewable in
the [Ops Console](../ops-console/SETUP.md), which can also submit tickets
through a browser form instead of `send-tickets.ps1`.

**No nodes were added to this workflow.** The read-only webhook that feeds the
console lives in its own shared workflow
(`ops-console/workflow/ops-console-data.workflow.json`) rather than being
grafted into this one — a tested automation shouldn't be modified to serve a
demo tool.

This workflow must be **Published** for the console to reach it; the console
uses the production webhook path.
