/**
 * One-off: create the three advertisement Products and Prices in Stripe test
 * mode and print the price ids for .env.local.
 *
 * NOT SHIPPED. Nothing in app/, components/, hooks/ or lib/ imports this. It
 * exists because the Stripe dashboard is not available here, and creating a
 * Product through the API is the same operation the dashboard would perform.
 *
 *   node --env-file=.env.local scripts/create-ad-prices.mjs
 *
 * Plain .mjs rather than the repo-wide .tsx: Node strips types from .ts but
 * does not strip JSX from .tsx, so a .tsx file cannot be run directly. This is
 * unshipped tooling, not app code, and it is not part of the Next build.
 *
 * SAFE TO RE-RUN. Products are created with deterministic ids and prices with
 * deterministic lookup keys, so a second run finds both and creates nothing.
 *
 * WHAT IT REFUSES TO DO
 *
 *   - Run against a live key. The rates below are real money.
 *   - Quietly accept drift. A Stripe price is immutable in its amount, so if
 *     RATES here stops matching an existing price the two can never be
 *     reconciled by editing — the price has to be replaced and the env var
 *     repointed. The script stops and says so rather than leaving the form
 *     quoting one figure while Stripe charges another.
 */

import Stripe from "stripe";

/**
 * Mirrors AD_PLACEMENTS in lib/adPricing.tsx, which is the source of truth for
 * what the form displays. Duplicated rather than imported because that file is
 * .tsx and this is a bare node script; the mismatch check below is what keeps
 * the copy honest, and it runs on every invocation, not just the first.
 */
const RATES = [
  { placement: "feed", label: "Feed", monthlyCents: 29900 },
  { placement: "jobs_board", label: "Job board", monthlyCents: 24900 },
  { placement: "marketplace", label: "Marketplace", monthlyCents: 19900 },
];

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error(
    "STRIPE_SECRET_KEY is not set.\n" +
      "Run this as: node --env-file=.env.local scripts/create-ad-prices.mjs"
  );
  process.exit(1);
}

if (!secretKey.startsWith("sk_test_")) {
  console.error(
    "Refusing to run: STRIPE_SECRET_KEY is not a test key.\n" +
      "This script creates priced Products. Point it at a test key first."
  );
  process.exit(1);
}

const stripe = new Stripe(secretKey);

/** `$299` from 29900, for the console output only. */
function usd(cents) {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

async function findProduct(id) {
  try {
    return await stripe.products.retrieve(id);
  } catch (err) {
    if (err?.code === "resource_missing") return null;
    throw err;
  }
}

async function ensurePlacement({ placement, label, monthlyCents }) {
  const productId = `sparx_ad_${placement}`;
  const lookupKey = `sparx_ad_${placement}_monthly`;
  const name = `Advertisement — ${label}`;

  let product = await findProduct(productId);
  let productCreated = false;

  if (!product) {
    // An explicit id is what makes a re-run a no-op. Without one, Stripe
    // assigns prod_… and the only way to find it again is a name search,
    // which would happily create a second identical product.
    product = await stripe.products.create({
      id: productId,
      name,
      description: `Flat monthly sponsored placement on the ${label} surface.`,
      metadata: { placement, managed_by: "scripts/create-ad-prices.mjs" },
    });
    productCreated = true;
  }

  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });

  const price = existing.data[0];

  if (price) {
    // A Price's amount cannot be edited in Stripe. If these disagree, one of
    // them is lying to a customer, and only a human can decide which.
    const problems = [];

    if (price.unit_amount !== monthlyCents) {
      problems.push(
        `amount is ${usd(price.unit_amount)}, RATES says ${usd(monthlyCents)}`
      );
    }
    if (price.currency !== "usd") {
      problems.push(`currency is ${price.currency}, expected usd`);
    }
    if (price.recurring) {
      problems.push(
        "price is recurring; checkout bills months as quantity on a one-time price"
      );
    }

    if (problems.length > 0) {
      console.error(
        `\n${placement}: existing price ${price.id} does not match this script.\n` +
          problems.map((p) => `  - ${p}`).join("\n") +
          "\n\nStripe prices are immutable. To change the rate, archive this " +
          "price, re-run to create a new one, and update both the env var and " +
          "AD_PLACEMENTS in lib/adPricing.tsx.\n"
      );
      process.exit(1);
    }

    return { placement, priceId: price.id, monthlyCents, created: false, productCreated };
  }

  const created = await stripe.prices.create({
    product: product.id,
    // One-time, not recurring. The campaign is billed once up front for its
    // whole run, with the number of months as the line item quantity — a
    // subscription would bill again every month and never end on its own.
    unit_amount: monthlyCents,
    currency: "usd",
    lookup_key: lookupKey,
    nickname: `${label} — per month`,
    metadata: { placement, managed_by: "scripts/create-ad-prices.mjs" },
  });

  return { placement, priceId: created.id, monthlyCents, created: true, productCreated };
}

const results = [];

for (const rate of RATES) {
  const result = await ensurePlacement(rate);
  results.push(result);

  const productNote = result.productCreated ? "product created" : "product exists";
  const priceNote = result.created ? "price created" : "price exists, amount matches";
  console.log(
    `${rate.placement.padEnd(12)} ${usd(rate.monthlyCents).padEnd(6)}/mo  ` +
      `${productNote}, ${priceNote}`
  );
}

console.log("\nAdd these to .env.local:\n");

for (const { placement, priceId } of results) {
  console.log(`STRIPE_AD_PRICE_${placement.toUpperCase()}=${priceId}`);
}

console.log(
  "\nThese are server-side only — no NEXT_PUBLIC_ prefix. The checkout route " +
    "reads them;\nnothing in the browser bundle ever sees a price id."
);
