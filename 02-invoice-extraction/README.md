# Invoice & Receipt Data Extraction

**Reads a supplier invoice, pulls out the numbers, checks the arithmetic, and flags anything a person should look at before it's booked.**

<!-- ![The full workflow in n8n](docs/canvas.png) -->

---

## The problem

Havelock's customers are small businesses — dental practices, trades, small
agencies. Every supplier invoice they receive gets typed into their books by
hand: vendor, date, amount, line items.

It's slow, and it's the kind of slow nobody notices. An office manager loses an
afternoon a week to it. And typing is where the errors come from: a
transposed figure in an invoice total doesn't announce itself, it just quietly
sits in the books until someone reconciles the month and can't work out why
it won't balance.

---

## What the workflow does

A customer forwards or uploads an invoice. Within a few seconds:

1. **Reads it.** The PDF goes straight to Claude, which extracts the vendor,
   dates, currency, subtotal, tax, total and line items.
2. **Checks the arithmetic.** Not by asking the AI — in code. Do the line
   items add up to the subtotal? Does subtotal plus tax equal the total?
3. **Flags what needs a person.** Missing fields, sums that don't reconcile,
   anything over the review threshold, or anything the model said it wasn't
   sure about.
4. **Logs it.** Every invoice lands in a ledger with its status and, when
   flagged, exactly which check failed and by how much.

Clean invoices come through ready to book. The rest arrive with a note saying
what's wrong with them.

<!--
![The ledger](docs/ledger.png)
-->

---

## The part that actually matters

**The AI reads. The workflow decides.** That separation is the whole design.

Claude is good at pulling numbers off a page and bad at being trusted about
them. So it transcribes, and it's explicitly forbidden from correcting
anything — if the line items don't add up to the stated subtotal, it reports
both exactly as printed. Then code does the checking.

| Invoice | Outcome | Why |
|---|---|---|
| Clean, one line item | **Booked** | Everything reconciles |
| Three line items, tax, all correct | **Booked** | Both checks pass |
| Items total £605, invoice says £745 | **Flagged** | Off by £140 — found by arithmetic, not by an AI's opinion |
| Till receipt, no vendor, no date | **Flagged** | Required fields missing |
| £7,106 refurbishment, perfectly correct | **Flagged** | Nothing is wrong with it. Large amounts get a human look before they're booked |
| Photographed at an angle, total cut off | **Flagged** | The model said it couldn't read the total — so it didn't guess one |

The fifth row is a deliberate choice: a rule that flags correct invoices. Above
a threshold, "the maths is right" isn't enough on its own.

**Tested against a genuine supplier invoice, too** — a real document the
system had never seen, in a layout it was never built for. It extracted
correctly, and where the tax section was blank it recorded no tax and said so,
rather than inferring a figure. That's the behaviour that matters: it reported
what it couldn't see. (That document is not included here; the invoices in
this repo are all synthetic.)

**And when the AI fails entirely:** if the response can't be read at all, the
invoice is flagged for a person. An invoice the system didn't understand is
never quietly booked.

---

## What it refuses to do

This workflow extracts and flags. Nothing else.

- **It never approves an invoice**, schedules a payment, or marks anything as
  paid. Those stay human decisions.
- **It never invents a missing value.** An unreadable field comes back empty
  with a note explaining why, never a plausible guess.
- **It never corrects arithmetic that looks wrong.** Spotting the mismatch is
  the product; silently fixing it would destroy the product.

The reasoning is simple. An extraction that's wrong costs a correction. An
extraction wired into a payment run costs money.

---

## Built with

**n8n** (self-hosted, Docker) · **Claude Haiku 4.5** reading PDFs directly, no
OCR step · **Google Sheets** as the ledger · webhook intake

One Claude call per invoice. Validation runs in JavaScript inside the
workflow — the rules are readable, testable, and don't depend on a model
behaving consistently.

---

*Havelock is a fictional company, created to demonstrate this workflow. The
sample invoices are synthetic and the vendors on them do not exist.*

<sub>Technical setup and configuration notes: [SETUP.md](SETUP.md)</sub>
