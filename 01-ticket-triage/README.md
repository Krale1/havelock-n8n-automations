# AI Support Ticket Triage

**Reads every incoming support ticket, works out how urgent it really is, and routes it — escalating the ones that need a person, drafting replies for the ones that don't.**

<!-- ![The full workflow in n8n](docs/canvas.png) -->

---

## The problem

Havelock sells payroll and bookkeeping software to small businesses. Four
people on support. Around 90 tickets a day, arriving by email and an in-app form.

Tickets get worked roughly in the order they land. Which means:

> A customer whose payroll run just failed — staff unpaid tomorrow morning —
> waits behind someone asking for a new export button.

Nobody decided that should happen. It's just what a queue does when nothing
sorts it.

---

## What the workflow does

Within a few seconds of a ticket arriving:

1. **Reads it.** Claude classifies the topic, how urgent it is, and whether the
   customer is upset — plus a one-line summary.
2. **Decides.** Genuine emergencies, and angry customers with a real problem,
   get flagged for a human straight away.
3. **Routes it.** Urgent tickets alert the on-call team with no automatic reply.
   Everything else gets a reply drafted and queued.
4. **Logs it.** Every ticket lands in a helpdesk sheet with its classification,
   its draft reply, and the reason it was routed the way it was.

Support staff open the sheet to find the queue already sorted and most replies
already written.

<!--
![A triaged ticket in the helpdesk sheet](docs/sheet-row.png)
-->

---

## The part that actually matters

Most automation connects app A to app B. This one makes judgement calls — and
the interesting question is where the line sits.

| Ticket | Outcome | Why |
|---|---|---|
| "Payroll failed — 12 staff not paid tomorrow" | **Escalated to a human** | Money, and a deadline |
| "I've been charged twice, I want my money back" | **Escalated to a human** | Money left the account in error |
| "Honestly disappointed, this is frustrating" | Reply drafted | Unhappy — but nobody is blocked |
| "Bank feed hasn't synced since Tuesday" | Reply drafted | Urgent, but calm, and no deadline |

**The bottom two rows are the whole point.**

An angry tone on its own doesn't escalate — otherwise every frustrated customer
jumps the queue and the urgent flag stops meaning anything. A serious technical
fault doesn't escalate either, unless someone is genuinely about to go unpaid.

Those thresholds are written in plain English and tuned per business.

**And when the AI fails:** if a ticket can't be classified for any reason, it is
marked urgent and sent to a person. A ticket the system didn't understand is
never answered automatically.

<!--
![The routing logic](docs/routing-logic.png)
-->

---

## What it refuses to do

Havelock handles other people's money, so the reply drafter has no access to any
live system — and is explicitly forbidden from:

- confirming that a refund, payment, or cancellation went through
- claiming a payroll run has been fixed or re-run
- giving tax, accounting, or compliance advice
- inventing amounts, dates, reference numbers, or deadlines

Every reply is a **draft**. A person reads it and sends it. Nothing reaches a
customer unreviewed.

---

## Built with

**n8n** (self-hosted, Docker) · **Claude Haiku 4.5** via the Anthropic API ·
**Google Sheets** as the helpdesk · webhook intake

Two Claude calls per ticket — one to classify, one to draft. Runs at a fraction
of a penny per ticket.

---

*Havelock is a fictional company, created to demonstrate this workflow. The
sample tickets are written examples, not real customer data.*

<sub>Technical setup and configuration notes: [SETUP.md](SETUP.md)</sub>
