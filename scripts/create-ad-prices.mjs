/**
 * One-off: create the three advertisement Products and Prices in Stripe and
 * print the price ids for the environment.
 *
 * NOT SHIPPED. Nothing in app/, components/, hooks/ or lib/ imports this. It
 * exists because the Stripe dashboard is not available here, and creating a
 * Product through the API is the same operation the dashboard would perform.
 *
 *   TEST   node --env-file=.env.local scripts/create-ad-prices.mjs
 *   LIVE   STRIPE_SECRET_KEY=sk_live_... node scripts/create-ad-prices.mjs --live
 *
 * Note the live form does NOT use --env-file: this script reads exactly one
 * variable, and pointing it at a file full of test credentials while asking for
 * live mode is how the wrong key gets used. Pass the key explicitly.
 *
 * Plain .mjs rather than the repo-wide .tsx: Node strips types from .ts but
 * does not strip JSX from .tsx, so a .tsx file cannot be run directly. This is
 * unshipped tooling, not app code, and it is not part of the Next build.
 *
 * SAFE TO RE-RUN. Products are created with deterministic ids and prices with
 * deterministic lookup keys, so a second run finds both and creates nothing.
 * A run with nothing to create never prompts, even in live mode.
 *
 * WHAT IT REFUSES TO DO
 *
 *   - Run against a live key without --live. The default is test mode, and it
 *     is not inferred from the key: a live key with no flag is a mistake, not
 *     an instruction.
 *   - Run with --live against a test key. Saying live and meaning test is the
 *     same mistake in the other direction.
 *   - Create live prices without an interactive, typed confirmation of the
 *     three rates. Requires a TTY, so piping an answer in cannot satisfy it.
 *   - Quietly accept drift. A Stripe price is immutable in its amount, so if
 *     RATES here stops matching an existing price the two can never be
 *     reconciled by editing — the price has to be replaced and the env var
 *     repointed. The script stops and says so rather than leaving the form
 *     quoting one figure while Stripe charges another.
 */

import Stripe from "stripe";
import { createInterface } from "node:readline/promises";
import process from "node:process";

/**
 * Mirrors AD_PLACEMENTS in lib/adPricing.tsx, which is the source of truth for
 * what the form displays. Duplicated rather than imported because that file is
 * .tsx and this is a bare node script; the drift check below is what keeps the
 * copy honest, and it runs on every invocation, not just the first.
 *
 * CHANGING A RATE IS A TWO-PLACE EDIT. Update AD_PLACEMENTS as well, or the
 * form quotes one number and Stripe charges another. The drift check will stop
 * a run where this file and Stripe disagree, but nothing can detect this file
 * and lib/adPricing.tsx disagreeing — they are never both loaded at once.
 */
const RATES = [
  { placement: "feed", label: "Feed", monthlyCents: 29900 },
  { placement: "jobs_board", label: "Job board", monthlyCents: 24900 },
  { placement: "marketplace", label: "Marketplace", monthlyCents: 19900 },
];

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    "Create the three advertisement Products and Prices in Stripe.\n\n" +
      "  TEST   node --env-file=.env.local scripts/create-ad-prices.mjs\n" +
      "  LIVE   STRIPE_SECRET_KEY=sk_live_... scripts/create-ad-prices.mjs --live\n\n" +
      "  --live   Use a live key. Requires an interactive typed confirmation\n" +
      "           of the three rates before anything is created.\n" +
      "  --help   This message.\n"
  );
  process.exit(0);
}

const live = args.includes("--live");
const unknown = args.filter((a) => a !== "--live");

if (unknown.length > 0) {
  console.error("Unknown argument(s): " + unknown.join(", ") + "\nTry --help.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Key, and the mode it has to agree with
// ---------------------------------------------------------------------------

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) {
  console.error(
    "STRIPE_SECRET_KEY is not set.\n" +
      "Test: node --env-file=.env.local scripts/create-ad-prices.mjs"
  );
  process.exit(1);
}

/**
 * The flag and the key must agree, and neither is inferred from the other.
 *
 * Inferring the mode from the key prefix would mean an exported live key in a
 * shell silently turns a routine test run into a live one. Requiring both makes
 * the live path something you can only reach by saying so twice.
 *
 * Restricted keys (rk_test_ / rk_live_) are rejected by both branches. They can
 * carry the right permissions, but the prefix no longer tells you the mode, and
 * this script's only safety rail is the prefix.
 */
if (live) {
  if (!secretKey.startsWith("sk_live_")) {
    console.error(
      "Refusing to run: --live was passed but STRIPE_SECRET_KEY is not a live key.\n" +
        "Pass a live key explicitly, or drop --live to run in test mode."
    );
    process.exit(1);
  }
} else if (!secretKey.startsWith("sk_test_")) {
  console.error(
    "Refusing to run: STRIPE_SECRET_KEY is not a test key.\n" +
      "This script creates priced Products. Point it at a test key, or pass\n" +
      "--live with a live key if you intend to create real rates."
  );
  process.exit(1);
}

/**
 * Checked here, before any network call, rather than at the prompt below.
 *
 * A live run that cannot prompt is going to be refused either way; finding that
 * out after three round trips to Stripe, or worse in the middle of a release,
 * is just slower. Failing on the capability up front also means the refusal is
 * reachable in testing without a real live key.
 *
 * Requiring a TTY is what stops an answer being piped in. Without it,
 * `echo ... | node script --live` reduces the confirmation to a speed bump that
 * a CI job or an over-helpful shell history could clear.
 */
if (live && !process.stdin.isTTY) {
  console.error(
    "--live needs an interactive terminal for the rate confirmation.\n" +
      "Run it directly rather than through a pipe, a CI job or a task runner."
  );
  process.exit(1);
}

const stripe = new Stripe(secretKey);
const mode = live ? "LIVE" : "test";

/** `$299` from 29900, for console output only. */
function usd(cents) {
  return "$" + (cents / 100).toFixed(2).replace(/\.00$/, "");
}

// ---------------------------------------------------------------------------
// Inspect — read-only. Nothing below this creates anything.
// ---------------------------------------------------------------------------

async function findProduct(id) {
  try {
    return await stripe.products.retrieve(id);
  } catch (err) {
    if (err?.code === "resource_missing") return null;
    throw err;
  }
}

/**
 * What exists already, and what would have to be created.
 *
 * Separated from the creation step so the confirmation prompt can describe what
 * is actually about to happen, and so a re-run that would create nothing can
 * skip the prompt entirely. Drift is detected here, before any prompt, because
 * a drifted price is a stop rather than a decision.
 */
async function inspectPlacement({ placement, label, monthlyCents }) {
  const productId = "sparx_ad_" + placement;
  const lookupKey = "sparx_ad_" + placement + "_monthly";

  const product = await findProduct(productId);

  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
  });

  const price = existing.data[0] ?? null;
  const problems = [];

  if (price) {
    // A Price's amount cannot be edited in Stripe. If these disagree, one of
    // them is lying to a customer, and only a human can decide which.
    if (price.unit_amount !== monthlyCents) {
      problems.push(
        "amount is " + usd(price.unit_amount) + ", RATES says " + usd(monthlyCents)
      );
    }
    if (price.currency !== "usd") {
      problems.push("currency is " + price.currency + ", expected usd");
    }
    if (price.recurring) {
      problems.push(
        "price is recurring; checkout bills months as quantity on a one-time price"
      );
    }
  }

  return {
    placement,
    label,
    monthlyCents,
    productId,
    lookupKey,
    product,
    price,
    problems,
    willCreateProduct: !product,
    willCreatePrice: !price,
  };
}

const plans = [];

try {
  for (const rate of RATES) {
    plans.push(await inspectPlacement(rate));
  }
} catch (err) {
  // A bad key is the overwhelmingly likely cause, and a raw Stripe stack trace
  // buries that under forty lines of internals.
  if (err?.type === "StripeAuthenticationError") {
    console.error(
      "Stripe rejected the key (" +
        mode +
        " mode). Check STRIPE_SECRET_KEY is the right key for this mode."
    );
    process.exit(1);
  }

  console.error("Stripe request failed: " + (err?.message ?? err));
  process.exit(1);
}

const drifted = plans.filter((p) => p.problems.length > 0);

if (drifted.length > 0) {
  console.error("\nExisting prices do not match this script:\n");

  for (const p of drifted) {
    console.error("  " + p.placement + " (" + p.price.id + ")");
    for (const problem of p.problems) console.error("    - " + problem);
  }

  console.error(
    "\nStripe prices are immutable. To change a rate: archive the price, update\n" +
      "both RATES here and AD_PLACEMENTS in lib/adPricing.tsx, re-run to create a\n" +
      "new one, then repoint the STRIPE_AD_PRICE_* env var.\n"
  );
  process.exit(1);
}

const toCreate = plans.filter((p) => p.willCreateProduct || p.willCreatePrice);

// ---------------------------------------------------------------------------
// Report, then confirm if there is anything to do in live mode
// ---------------------------------------------------------------------------

console.log("\nMode: " + mode + "\n");

for (const p of plans) {
  const productNote = p.willCreateProduct ? "product MISSING" : "product exists";
  const priceNote = p.willCreatePrice
    ? "price MISSING"
    : "price exists, amount matches";

  console.log(
    "  " +
      p.placement.padEnd(12) +
      (usd(p.monthlyCents) + "/mo").padEnd(9) +
      productNote +
      ", " +
      priceNote
  );
}

if (toCreate.length === 0) {
  console.log("\nNothing to create. Existing price ids:\n");
  for (const p of plans) {
    console.log("STRIPE_AD_PRICE_" + p.placement.toUpperCase() + "=" + p.price.id);
  }
  process.exit(0);
}

if (live) {
  // The TTY capability was confirmed before any network call; see above.
  console.log(
    "\n" +
      "────────────────────────────────────────────────────────────\n" +
      "  LIVE MODE — these become the real rates customers pay.\n" +
      "────────────────────────────────────────────────────────────\n"
  );

  for (const p of toCreate) {
    console.log("  " + p.label.padEnd(14) + usd(p.monthlyCents) + " per month");
  }

  console.log(
    "\nA Stripe price cannot be edited after it is created. A wrong figure here\n" +
      "has to be archived and replaced, and AD_PLACEMENTS in lib/adPricing.tsx\n" +
      "must already match these numbers.\n"
  );

  const expected = toCreate.map((p) => String(p.monthlyCents / 100)).join(" ");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Typing the rates back, rather than "yes", is the point: it cannot be
  // answered without having read the figures above.
  const answer = await rl.question(
    "Type the " +
      toCreate.length +
      " monthly rates in the order listed, separated by spaces, to continue:\n> "
  );

  rl.close();

  // Forgiving about $ signs, commas and spacing; strict about the numbers.
  const normalised = answer.replace(/[$,]/g, "").trim().split(/\s+/).join(" ");

  if (normalised !== expected) {
    console.error("\nThat did not match. Nothing was created.");
    process.exit(1);
  }

  console.log("");
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function applyPlan(plan) {
  let product = plan.product;

  if (!product) {
    // An explicit id is what makes a re-run a no-op. Without one, Stripe
    // assigns prod_… and the only way to find it again is a name search, which
    // would happily create a second identical product.
    product = await stripe.products.create({
      id: plan.productId,
      name: "Advertisement — " + plan.label,
      description:
        "Flat monthly sponsored placement on the " + plan.label + " surface.",
      metadata: {
        placement: plan.placement,
        managed_by: "scripts/create-ad-prices.mjs",
      },
    });
  }

  let price = plan.price;

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      // One-time, not recurring. The campaign is billed once up front for its
      // whole run, with the number of months as the line item quantity — a
      // subscription would bill again every month and never end on its own.
      unit_amount: plan.monthlyCents,
      currency: "usd",
      lookup_key: plan.lookupKey,
      nickname: plan.label + " — per month",
      metadata: {
        placement: plan.placement,
        managed_by: "scripts/create-ad-prices.mjs",
      },
    });
  }

  return { placement: plan.placement, priceId: price.id };
}

const results = [];

for (const plan of plans) {
  results.push(await applyPlan(plan));
}

console.log("Done (" + mode + " mode).\n");
console.log(
  live
    ? "Set these in the Vercel Production environment:\n"
    : "Add these to .env.local:\n"
);

for (const { placement, priceId } of results) {
  console.log("STRIPE_AD_PRICE_" + placement.toUpperCase() + "=" + priceId);
}

console.log(
  "\nThese are server-side only — no NEXT_PUBLIC_ prefix. The checkout route\n" +
    "reads them; nothing in the browser bundle ever sees a price id."
);

if (live) {
  console.log(
    "\nThe secret key, the price ids and the webhook secret must all be in the\n" +
      "same mode. A live price id with a test key fails as 'No such price'."
  );
}
