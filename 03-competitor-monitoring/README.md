# Competitor Pricing Monitor

**Watches a competitor's pricing page and tells the team when something that matters changes — while ignoring the marketing copy that changes every week.**

<!-- ![The full workflow in n8n](docs/canvas.png) -->

---

## The problem

Havelock competes with a handful of other small-business payroll products.
When one of them changes a price, adds a plan, or quietly drops a feature,
Havelock's team wants to know.

Today that means someone remembering to check, which means it happens for a
month and then stops.

The obvious fix is a page-change alert, and it doesn't work. Pricing pages
churn constantly: rotating testimonials, "trusted by 500+" counters ticking
up, reworded taglines, a copyright year. A tool that watches for *any* change
sends an alert most weeks, all of them noise. Within a month nobody opens
them — and that's when the real price change goes past unnoticed.

> The problem was never detecting change. It's telling which changes matter.

---

## What the workflow does

On a schedule, and on demand:

1. **Fetches the competitor's pricing page** and reduces it to plain text.
2. **Compares it to the last version it saw.** If nothing changed at all, it
   stops here — nothing to think about.
3. **When the text differs, Claude judges it.** Is this a price, a plan, a
   feature? Or is it marketing copy?
4. **Alerts only on the meaningful ones**, with a one-sentence summary of what
   actually changed.
5. **Logs every check either way**, so the log shows the monitor genuinely
   running rather than only speaking up occasionally.

<!--
![The pricing log](docs/log.png)
-->

---

## The part that actually matters

Here are two consecutive checks.

**Check one.** Six separate lines of the page changed:

- the tagline was reworded
- the testimonial was swapped for a different one
- "Trusted by 500+" became "Trusted by 650+"
- a plan description was rewritten
- "Priority email support" became "Priority support by email"
- the copyright year rolled over

Verdict: **no meaningful change.** No alert.

**Check two.** Two characters changed — `$49` became `$59`.

Verdict: **price change.** Alert, with a summary naming the plan and both
prices.

A diff tool gets this exactly backwards: it shouts about the first and treats
the second as just another edit in the pile. That gap between the two checks
is the entire product.

**On ambiguity, it flags rather than dismisses.** If a reworded line might
reflect a real change to what's offered — and the model genuinely can't tell —
it's reported as changed, with a note explaining the uncertainty. Wrongly
flagging something costs ten seconds of reading. Wrongly dismissing a
competitor's price cut costs a quarter.

---

## What it costs to run

Almost nothing, by design. The AI is only consulted when there's a judgment to
make:

| Situation | Model called? |
|---|---|
| First check | No — nothing to compare |
| Page text unchanged | No — nothing to judge |
| Page unreachable | No — logged as a failed check |
| **Page text differs** | **Yes** |

On a page that changes a few times a year, nearly every scheduled check
resolves for free. The logs from this build bear that out: a long run of
checks, almost all of them costing nothing, with the model consulted only
where the page had actually moved.

---

## What it refuses to do

- **It never guesses at an ambiguous change.** Uncertain means flagged, not
  quietly dismissed.
- **It never fails silently.** An unreachable page or an unreadable response
  is logged and alerted, not skipped. A monitor that stops working without
  saying so is worse than no monitor.
- **It never acts on a competitor's move.** It doesn't adjust Havelock's
  pricing, draft a response, or recommend anything. It tells a human what
  changed and stops.
- **It never touches a live competitor's website.** This build watches a
  controlled local copy.

---

## Built with

**n8n** (self-hosted, Docker) · **Claude Haiku 4.5** for the comparison ·
**Google Sheets** as both the log and the workflow's memory · scheduled plus
on-demand triggers

The judgment lives in the prompt, and the prompt is the product here. The rest
— fetching, extracting text, remembering last time, deciding when to escalate —
is ordinary workflow plumbing, deliberately kept boring so the interesting part
is easy to point at.

---

*Havelock is a fictional company, created to demonstrate this workflow.
Quillbeck, the competitor whose pricing page is monitored here, is also
invented — no real company's website is fetched.*

<sub>Technical setup and configuration notes: [SETUP.md](SETUP.md)</sub>
