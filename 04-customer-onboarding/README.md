# New Customer Onboarding

**Turns a signup form into a CRM record, a starter checklist, and a team notification — and refuses to guess when it can't tell what kind of business just signed up.**

<!-- ![The full workflow in n8n](docs/canvas.png) -->

---

## The problem

When a small business signs up for Havelock, somebody has to read what they
wrote about themselves and work out how to set them up. A restaurant with
tipped staff needs a completely different configuration from a freight company
paying twenty 1099 drivers. Get it wrong and the customer's first payroll run
is wrong.

Then that person has to tell whoever's handling onboarding this week, start a
checklist, and write a welcome email that doesn't read like a form letter.

It's four small jobs, and it's nobody's actual job. So it happens within an
hour on a quiet week and three days later on a busy one.

> The worst version isn't the slow one. It's the rushed one — a restaurant
> filed as a standard business, tip credit never set up, staff underpaid for
> a month before anyone notices.

---

## What the workflow does

A signup arrives. Within a few seconds:

1. **Reads what they wrote.** Claude works out which of four onboarding tracks
   fits, writes a one-line summary for whoever picks it up, and drafts a
   welcome email that references something the person actually said.
2. **Decides whether a person is needed.** Anything it can't place with
   confidence is flagged, with a reason.
3. **Writes the CRM record** — one row, every signup, flagged or not.
4. **Writes the starter checklist** — three or four tasks, chosen for that
   track.
5. **Notifies the onboarding team** that a signup landed and whether it needs
   a look first.

The customer sees a thank-you page and nothing else.

---

## The part that actually matters

**One event, three destinations.** That's the shape of this one.

Here's what a single signup produces:

| Destination | What lands there |
|---|---|
| `customers` sheet | 1 row — contact details, track, flag, summary, draft email |
| `onboarding_tasks` sheet | 3–4 rows — one per starter task for that track |
| Onboarding team | 1 notification — company, track, and whether it's flagged |

Six signups produced 6 CRM rows and 22 task rows. Two sheets, standing in for
two systems, both filled from the same trigger.

<!--
![One signup, two sheets](docs/fanout.png)
-->

**And it knows when to stop.** Of six test signups, four were classified
confidently. Two were not, and that's the more interesting half:

- A consultancy with nine employees in Colorado and five in Lisbon and
  Toronto. It could have filed the nine and moved on. Instead:
  *needs_review — Havelock does not run international payroll.*
- A signup whose entire description read *"Small business, looking for payroll
  software."* Eight employees and no detail. Any of the four tracks could fit.
  It said so rather than picking one.

A flagged signup costs someone five minutes. A restaurant quietly filed as a
standard business costs a month of underpaid staff.

<!--
![The onboarding tab](docs/console.png)
-->

---

## What it refuses to do

- **It never sends anything to the customer.** The welcome email is written to
  the CRM row as a draft. A person reads it and sends it. There is no path
  through this workflow that emails a customer.
- **It never forces a best-guess track.** Ambiguous, unsupported, or too thin
  to judge means flagged for a person — not the closest-looking option.
- **It never lets the customer see the decision.** The signup page gets a bare
  acknowledgement. The track, the flag and the draft are internal.
- **It never spends a model call on something a lookup answers.** Once the
  track is known, the checklist is a table in code. That's not a judgement, so
  it isn't priced like one.

---

## Built with

**n8n** (self-hosted, Docker) · **Claude Haiku 4.5** for classification and the
draft · **Google Sheets** as the CRM and task-list stand-ins · webhook intake,
no schedule

One model call per signup. Everything after it — the checklist, the fan-out,
the validation that the returned track is real — is plain code.

The validation is worth a line of its own: an unrecognised track, a flag with
no reason, or a response that isn't JSON all resolve toward a human. It was
tested against all of those before it was ever pointed at the live model.

---

*Havelock is a fictional company, created to demonstrate this workflow. The
signups, businesses and people shown are invented.*

<sub>Technical setup and configuration notes: [SETUP.md](SETUP.md)</sub>
