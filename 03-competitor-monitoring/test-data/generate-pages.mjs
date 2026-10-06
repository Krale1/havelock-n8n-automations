/**
 * Builds the four demo variants of the mock competitor pricing page.
 *
 * Generated from data rather than hand-written so each variant differs from
 * the one before it by exactly one thing. The demo compares each step against
 * the previous step, so a stray edit in the wrong variant would muddy which
 * change the workflow actually reacted to.
 *
 *   baseline  -> the starting page
 *   cosmetic  -> baseline + marketing copy only     (must NOT be flagged)
 *   price     -> cosmetic + Growth 49 -> 59         (must be flagged)
 *   feature   -> price + a feature removed from Pro (must be flagged)
 *
 * Quillbeck is invented. It is not a real company.
 *
 *   node generate-pages.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PAGES_DIR = join(HERE, 'pages');
const LIVE_PAGE = join(HERE, '..', '..', 'mock-competitor-pricing.html');

// --------------------------------------------------------------- page data

const base = {
  tagline: 'Payroll and books for small teams, without the spreadsheet sprawl.',
  socialProof: 'Trusted by 500+ small businesses',
  testimonial: '"We switched from spreadsheets and never looked back." — Priya, Studio Owner',
  year: 2025,
  plans: [
    {
      name: 'Starter',
      price: 19,
      blurb: 'For sole traders and very small teams.',
      features: [
        'Up to 3 employees',
        'Automated payslips',
        'Bank feed connection',
        'Email support',
      ],
    },
    {
      name: 'Growth',
      price: 49,
      blurb: 'For growing teams that need more control.',
      features: [
        'Up to 25 employees',
        'Automated payslips',
        'Bank feed connection',
        'Expense capture',
        'Multi-user access',
        'Priority email support',
      ],
    },
    {
      name: 'Pro',
      price: 99,
      blurb: 'For established businesses with an accountant.',
      features: [
        'Unlimited employees',
        'Everything in Growth',
        'Accountant collaboration',
        'Custom report builder',
        'Phone support',
      ],
    },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));

// --- variant 2: cosmetic only -------------------------------------------
// Nothing here changes what the product costs or does. A plain diff tool
// flags every one of these; the workflow must not.
const cosmetic = clone(base);
cosmetic.socialProof = 'Trusted by 650+ small businesses';
cosmetic.testimonial = '"Switching from spreadsheets was the best call we made." — Priya, Studio Owner';
cosmetic.tagline = 'Payroll and books for small teams — without the spreadsheet sprawl.';
cosmetic.year = 2026;
cosmetic.plans[0].blurb = 'Built for sole traders and very small teams.';
cosmetic.plans[1].features[5] = 'Priority support by email';   // reworded, same meaning

// --- variant 3: a real price change --------------------------------------
const price = clone(cosmetic);
price.plans[1].price = 59;

// --- variant 4: a real feature change ------------------------------------
const feature = clone(price);
feature.plans[2].features = feature.plans[2].features.filter((f) => f !== 'Phone support');

// ------------------------------------------------------------------ render

function render(data, variantName) {
  const cards = data.plans.map((p) => `
      <article class="plan">
        <h2 class="plan__name">${p.name}</h2>
        <p class="plan__price"><span class="amount">$${p.price}</span><span class="per">/month</span></p>
        <p class="plan__blurb">${p.blurb}</p>
        <ul class="plan__features">
${p.features.map((f) => `          <li>${f}</li>`).join('\n')}
        </ul>
        <a class="plan__cta" href="#">Start free trial</a>
      </article>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Which demo variant this is. Kept in a meta tag, not in the visible page:
     the workflow strips tags before comparing, so this never reaches the model
     and never shows up as a phantom change. serve.mjs reads it to report the
     current variant back to the console. -->
<meta name="x-demo-variant" content="${variantName}">
<title>Quillbeck — Pricing</title>
<style>
  :root { --ink:#1d2329; --mid:#5d666f; --line:#e4e7eb; --accent:#1f7a5a; }
  * { box-sizing:border-box; }
  body { margin:0; background:#f7f8f9; color:var(--ink);
         font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  header { background:#fff; border-bottom:1px solid var(--line); padding:18px 24px; }
  .brand { font-weight:700; letter-spacing:-.02em; font-size:18px; }
  .wrap { max-width:1000px; margin:0 auto; padding:40px 24px 60px; }
  .lede { text-align:center; margin-bottom:8px; font-size:26px; font-weight:680; letter-spacing:-.02em; }
  .sub { text-align:center; color:var(--mid); margin:0 0 6px; }
  .proof { text-align:center; color:var(--mid); font-size:13px; margin-bottom:34px; }
  .plans { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:18px; }
  .plan { background:#fff; border:1px solid var(--line); border-radius:10px; padding:22px; }
  .plan__name { margin:0 0 10px; font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--mid); }
  .plan__price { margin:0 0 10px; }
  .amount { font-size:34px; font-weight:700; letter-spacing:-.02em; }
  .per { color:var(--mid); font-size:14px; }
  .plan__blurb { color:var(--mid); margin:0 0 16px; font-size:13.5px; }
  .plan__features { list-style:none; margin:0 0 20px; padding:0; }
  .plan__features li { padding:6px 0 6px 20px; position:relative; border-top:1px solid #f1f3f5; font-size:14px; }
  .plan__features li:before { content:"✓"; position:absolute; left:0; color:var(--accent); font-weight:700; }
  .plan__cta { display:block; text-align:center; background:var(--accent); color:#fff;
               text-decoration:none; padding:9px; border-radius:6px; font-weight:600; font-size:14px; }
  blockquote { max-width:640px; margin:42px auto 0; text-align:center; color:var(--mid); font-style:italic; }
  footer { text-align:center; color:#98a1aa; font-size:12px; padding:28px 24px 44px; }
</style>
</head>
<body>
<header><div class="brand">Quillbeck</div></header>

<div class="wrap">
  <h1 class="lede">Simple pricing that grows with you</h1>
  <p class="sub">${data.tagline}</p>
  <p class="proof">${data.socialProof}</p>

  <div class="plans">
${cards}
  </div>

  <blockquote>${data.testimonial}</blockquote>
</div>

<footer>© ${data.year} Quillbeck Ltd · Fictional company, used for a demo</footer>
</body>
</html>
`;
}

// -------------------------------------------------------------------- write

mkdirSync(PAGES_DIR, { recursive: true });

const VARIANTS = [
  ['baseline', base,     'the starting page'],
  ['cosmetic', cosmetic, 'copy, testimonial, social proof, year - nothing meaningful'],
  ['price',    price,    'Growth plan $49 -> $59'],
  ['feature',  feature,  'Phone support removed from Pro'],
];

for (const [name, data, why] of VARIANTS) {
  const html = render(data, name);
  writeFileSync(join(PAGES_DIR, `${name}.html`), html);
  console.log(`  ${name.padEnd(10)} ${String(html.length).padStart(5)} bytes   ${why}`);
}

// Start the live page on the baseline.
writeFileSync(LIVE_PAGE, render(base, 'baseline'));
console.log(`\nLive page reset to baseline: ${LIVE_PAGE}`);
