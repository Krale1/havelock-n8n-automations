# Havelock — n8n AI Automation Portfolio

Four self-directed demo workflows built with [n8n](https://n8n.io) (self-hosted
via Docker) and Claude, for a fictional payroll and bookkeeping SaaS called
**Havelock** that sells to small businesses with 5–50 staff. Each one takes a
real operational problem — triaging support tickets, reading supplier
invoices, watching a competitor's pricing, onboarding a new customer — and
automates the mechanical part of it while leaving the decisions to a person.

**Havelock does not exist.** It was invented for these demos. Every ticket,
invoice, signup and competitor page in this repository is synthetic, and no
real company's website is ever fetched.

<!-- ![Ops console](docs/ops-console.png) -->

---

## The four workflows

| Project | What it does | |
|---|---|---|
| **Ticket Triage** | Classifies incoming support tickets by topic, urgency and tone, escalates genuine emergencies to a person and drafts replies for the rest | [README](01-ticket-triage/README.md) |
| **Invoice Extraction** | Reads a supplier invoice PDF, pulls out the numbers, checks the arithmetic in code, and flags anything that needs a human before it's booked | [README](02-invoice-extraction/README.md) |
| **Competitor Pricing Monitor** | Watches a pricing page and reports price, plan and feature changes while ignoring the marketing copy that churns every week | [README](03-competitor-monitoring/README.md) |
| **Customer Onboarding** | Turns one signup into a CRM record, a starter checklist and a team notification, and refuses to guess when it can't classify the business | [README](04-customer-onboarding/README.md) |

<!-- ![Ticket triage console](docs/ticket-triage-console.png) -->

---

## Design principles

The same four rules shaped all of them.

- **The AI classifies or drafts; a person decides.** Claude reads documents and
  judges ambiguity. It never approves an invoice, schedules a payment, adjusts
  a price or completes an onboarding.
- **Nothing is sent to a customer automatically.** Replies and welcome emails
  are written as drafts into a sheet. A person reads them and sends them. The
  outbound email nodes that exist are disabled and addressed to internal teams.
- **Ambiguity and failure route to a human.** Unparseable model output, an
  unrecognised category, a missing field, an unreachable page — each one is
  logged and flagged, never silently resolved to a plausible-looking default.
  Wrongly flagging something costs a few seconds of reading; wrongly dismissing
  it costs more.
- **Plain code for lookups, AI only for judgement.** Arithmetic validation,
  routing thresholds and checklist selection are JavaScript inside the
  workflow, where they're readable and testable. A model call is spent only
  where there is a genuine judgement to make.

---

## Repo layout

| Item | What it is |
|---|---|
| `01-ticket-triage/` | Project folder: `README.md`, `SETUP.md`, exported workflow JSON, test data |
| `02-invoice-extraction/` | As above, plus a generator that produces the synthetic invoice PDFs |
| `03-competitor-monitoring/` | As above, plus a generator for the four mock pricing-page variants |
| `04-customer-onboarding/` | As above, with two sheets rather than one |
| `ops-console/` | Internal read-only dashboard. One tab per project, showing the rows each workflow wrote. It holds no classification logic of its own |
| `customer-support.html` | Customer-facing demo form — what someone submitting a support ticket sees |
| `customer-signup.html` | Customer-facing demo form — what a prospective customer signing up sees |
| `serve.mjs` | Zero-dependency local server. Serves the pages and proxies `/webhook/*` to n8n on port 5678, so pages and webhooks share an origin and CORS never applies |
| `mock-competitor-pricing.html` | The local mock page project 3 fetches, in place of any real competitor site |

Each project folder keeps its own `SETUP.md` with the configuration detail for
that workflow.

<!-- ![Workflow canvas](docs/workflow-canvas.png) -->

---

## Run it yourself

You'll need n8n self-hosted (Docker), an Anthropic API key, and a Google
account for Sheets.

1. **Start n8n** in Docker and open `http://localhost:5678`.
2. **Import the workflow JSON** for whichever project you want, from that
   project's `workflow/` folder. The shared read-only workflow in
   `ops-console/workflow/` feeds the dashboard.
3. **Follow that project's `SETUP.md`.** It lists the sheet tabs and column
   headers the workflow expects.
4. **Replace the `PASTE_..._HERE` placeholders** in the Google Sheets nodes
   with your own spreadsheet IDs.
5. **Add your own credentials in n8n** — an Anthropic credential and a Google
   Sheets OAuth2 credential. No keys are stored in this repository; the
   workflow exports contain none.
6. **Start the local server** from the repository root:

   ```
   node serve.mjs 8000
   ```

   Then open `http://localhost:8000/ops-console/`.

Everything runs locally. No webhook is exposed publicly, and the workflows are
not designed to be.

---

*Havelock, its customers, its suppliers and the competitor in project 3 are all
fictional. The sample documents are generated, not collected.*
