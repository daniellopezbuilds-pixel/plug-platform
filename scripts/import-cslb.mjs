/**
 * Import the CSLB Master List of California Licensed Contractors.
 *
 * NOT SHIPPED. Nothing in app/, components/, hooks/ or lib/ imports this.
 *
 *   node --env-file=.env.local scripts/import-cslb.mjs --as-of 9/19/2026
 *
 * or, pointing somewhere explicitly rather than trusting whatever is in a
 * dotenv file:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://fhdnzbuafxncbqpqovhx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/import-cslb.mjs --as-of 9/19/2026
 *
 * Plain .mjs rather than the repo-wide .tsx, matching seed-demo.mjs and
 * create-ad-prices.mjs: Node strips types from .ts but does not strip JSX from
 * .tsx, so a .tsx file cannot be run directly.
 *
 *
 * WHERE THE FILE COMES FROM
 *
 * https://www.cslb.ca.gov/About_Us/Library/Licensing_Classifications/ ->
 * the Master List download. CSV, regenerated weekly, no registration. Save it
 * to scripts/data/cslb-license-master.csv. That directory is gitignored: the
 * file is ~78MB and changes every week, and a committed copy would be both
 * enormous and instantly out of date.
 *
 *
 * --as-of IS REQUIRED AND IS NOT GUESSED
 *
 * It is the date CSLB generated the file, printed beside the download link.
 * It becomes source_as_of on every row and on the ledger entry, and the
 * 30-day staleness guard measures it.
 *
 * It is deliberately not defaulted to the file's mtime. mtime is when the file
 * was written to this disk, which a copy, a restore, a sync or a re-download of
 * the same old file all change -- and every one of those would make stale data
 * look fresh, which is the exact failure the staleness guard exists to catch.
 * Nothing in the file's contents carries its generation date either; LastUpdate
 * is per-licence and its maximum trails the file by weeks.
 *
 *
 * WHY THE SERVICE ROLE KEY
 *
 * cslb_licenses has RLS enabled and no policies at all -- nothing reachable
 * from the browser may read 29,000 contractor records, and nothing but this
 * script may write them. service_role is what gets past that. The same key is
 * what lets cslb_commit_import() and cslb_recheck_all() be called; EXECUTE on
 * both is revoked from anon and authenticated.
 *
 *
 * THE FILE IS RAW AND IT IS MESSY. This parser assumes nothing has been
 * cleaned up by hand, because next week's file will not be either. Confirmed
 * against the 2026-09-19 download, 244,519 rows:
 *
 *   - CRLF line endings, no BOM, valid UTF-8
 *   - 4,423 rows use RFC-4180 quoting -- business names containing commas
 *   - 244,416 rows have at least one whitespace-padded value (" 01/31/2025")
 *   - dates are MM/DD/YYYY
 *   - one row has an empty Classifications(s)
 *   - classifications are pipe-delimited and inconsistently written:
 *     "C10", "C-6", "A| B| C10| C36"
 *
 * No embedded newlines appeared in that file. The parser handles them anyway --
 * a quoted field may legally contain one, and the first week it does is not the
 * week to discover the importer cannot read it.
 *
 *
 * SAFE TO RE-RUN? YES. It replaces the table rather than adding to it, and the
 * replacement is one transaction inside cslb_commit_import() -- so a run that
 * dies half way leaves the previous import in place, untouched. See the
 * row-count guard below.
 */

import { createReadStream, existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_FILE = "scripts/data/cslb-license-master.csv";

/**
 * Columns kept out of the file's 52. Everything else -- workers' comp, bonds,
 * addresses, phone numbers, discipline case fields -- is dropped at parse time
 * rather than imported and ignored. The table answers one question and holding
 * the rest of a contractor's record to answer it would be a choice to store
 * personal data with no use.
 *
 * Keyed by the file's own header spelling, including the misspelled
 * "Classifications(s)", which is what CSLB actually publishes.
 */
const COLUMNS = {
  license_no: "LicenseNo",
  business_name: "BusinessName",
  full_business_name: "FullBusinessName",
  city: "City",
  county: "County",
  state: "State",
  expiration_date: "ExpirationDate",
  primary_status: "PrimaryStatus",
  secondary_status: "SecondaryStatus",
  classifications: "Classifications(s)",
  last_update: "LastUpdate",
};

/** Rows per insert. ~2,000 x ~200 bytes keeps each request around 400KB. */
const BATCH_SIZE = 2000;

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { minRatio: 0.9, force: false, prod: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--as-of") args.asOf = argv[++i];
    else if (arg === "--file") args.file = argv[++i];
    else if (arg === "--min-ratio") args.minRatio = Number(argv[++i]);
    else if (arg === "--force") args.force = true;
    else if (arg === "--prod") args.prod = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else die(`Unknown argument: ${arg}`);
  }

  return args;
}

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/**
 * --as-of accepted as either YYYY-MM-DD or the M/D/YYYY the CSLB site prints
 * beside the download, normalised to ISO.
 *
 * A future date is refused rather than warned about. source_as_of is what the
 * staleness guard subtracts from today, so a date ahead of today makes stale
 * data report as negative days old and the guard silently stops guarding.
 */
function normaliseAsOf(value) {
  if (!value) {
    die(
      "--as-of is required. It is the file's generation date, printed beside " +
        "the download on the CSLB site.\n  e.g. --as-of 9/19/2026"
    );
  }

  let iso = null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const usMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);

  if (isoMatch) {
    iso = value;
  } else if (usMatch) {
    const [, m, d, y] = usMatch;
    iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  } else {
    die(`--as-of must be YYYY-MM-DD or M/D/YYYY, got "${value}"`);
  }

  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) die(`--as-of is not a real date: ${value}`);

  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  if (iso > todayIso) {
    die(
      `--as-of ${iso} is in the future. source_as_of is what the 30-day ` +
        "staleness guard measures; a future date turns it off."
    );
  }

  return iso;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * Streaming RFC-4180 parser, yielding one array of fields per record.
 *
 * Character at a time over a read stream, because the file is ~78MB and
 * splitting it on newlines first is both a second full copy in memory and
 * wrong: a newline inside a quoted field is data, not a record boundary.
 *
 * Two deliberate leniencies, for a file nobody cleans:
 *
 *   - A quote only opens a quoted field when the field is still empty.
 *     'AB"CD' keeps its quote as data rather than swallowing the rest of the
 *     line, which is what a strict parser would do with it.
 *   - A closing quote followed by anything other than a quote or a delimiter
 *     ends the quoted section and the rest is read as plain text. Malformed,
 *     but it recovers within the field instead of derailing every row after it.
 *
 * CR is dropped outside quotes (CRLF) and kept inside them, where it is data.
 */
async function* csvRecords(stream) {
  let field = "";
  let row = [];
  let inQuotes = false;
  let quoteJustClosed = false;

  for await (const chunk of stream) {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i];

      if (quoteJustClosed) {
        quoteJustClosed = false;

        if (c === '"') {
          field += '"'; // "" inside a quoted field is one literal quote
          continue;
        }

        inQuotes = false; // real close; fall through and handle c normally
      }

      if (inQuotes) {
        if (c === '"') quoteJustClosed = true;
        else field += c;
        continue;
      }

      if (c === '"' && field === "") {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        field = "";
        yield row;
        row = [];
      } else if (c !== "\r") {
        field += c;
      }
    }
  }

  // A final record with no trailing newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    yield row;
  }
}

/**
 * Classifications, parsed.
 *
 * Split on |, trim, strip hyphens, upper case. Matching is EXACT against the
 * resulting array and never a substring, which is the whole point: "C100"
 * contains "C10" and is a different classification.
 */
function parseClassifications(raw) {
  return (raw ?? "")
    .split("|")
    .map((part) => part.trim().replace(/-/g, "").toUpperCase())
    .filter(Boolean);
}

/** MM/DD/YYYY -> YYYY-MM-DD. Null for blank or unparseable. */
function parseDate(raw) {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const [, m, d, y] = match;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Licence number reduced to digits -- mirrors cslb_normalise_license() in SQL. */
function normaliseLicense(raw) {
  const digits = (raw ?? "").replace(/[^0-9]/g, "");
  return digits === "" ? null : digits;
}

// ---------------------------------------------------------------------------
// Target
// ---------------------------------------------------------------------------

/**
 * The production project ref, read from package.json rather than written here.
 *
 * CLAUDE.md: "the project refs live in package.json and nowhere else". This
 * script needs to recognise production for the same reason there is
 * deliberately no bare `db:link` -- the one target that should never be
 * reachable by a command that does not say so.
 */
function productionRef() {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const link = pkg.scripts?.["db:link:prod"] ?? "";
  return /--project-ref\s+(\S+)/.exec(link)?.[1] ?? null;
}

function projectRefFromUrl(url) {
  return /https?:\/\/([a-z0-9]+)\.supabase\./.exec(url ?? "")?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // --dry-run parses the file and reports, touching no database and needing no
  // credentials. Worth running on a fresh download before the real import: a
  // CSLB format change shows up as a missing column or a collapsed C-10 count
  // here, where nothing is at stake.
  const asOf = args.dryRun && !args.asOf ? null : normaliseAsOf(args.asOf);

  if (!Number.isFinite(args.minRatio) || args.minRatio <= 0 || args.minRatio > 1) {
    die(`--min-ratio must be between 0 and 1, got "${args.minRatio}"`);
  }

  const filePath = resolve(args.file ?? DEFAULT_FILE);
  if (!existsSync(filePath)) {
    die(
      `No file at ${filePath}\n  Download the Master List from CSLB and save ` +
        `it to ${DEFAULT_FILE}`
    );
  }

  let supabase = null;

  if (args.dryRun) {
    console.log("");
    console.log(`  Project   (dry run -- nothing will be written)`);
    console.log(`  File      ${basename(filePath)}`);
    if (asOf) console.log(`  As of     ${asOf}`);
    console.log("");
  } else {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      die(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be " +
          "set.\n  Try: node --env-file=.env.local scripts/import-cslb.mjs --as-of ..."
      );
    }

    const ref = projectRefFromUrl(url);
    const prodRef = productionRef();
    const isProd = ref !== null && ref === prodRef;

    // The same reasoning as `npm run db:linked` before every push: which
    // project this is about to rewrite is invisible unless something says it
    // out loud.
    console.log("");
    console.log(`  Project   ${ref ?? url}${isProd ? "   <-- PRODUCTION" : ""}`);
    console.log(`  File      ${basename(filePath)}`);
    console.log(`  As of     ${asOf}`);
    console.log("");

    if (isProd && !args.prod) {
      die(
        "This is PRODUCTION. Re-run with --prod if that is what you meant.\n" +
          "  (Staging is the default target; .env.local should point there.)"
      );
    }

    supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // A previous run that died after inserting would otherwise contribute its
    // rows to this one.
    const { error: resetError } = await supabase.rpc("cslb_reset_staging");
    if (resetError) {
      die(`Could not clear the staging table: ${resetError.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Parse and load
  // -------------------------------------------------------------------------

  const stream = createReadStream(filePath, { encoding: "utf8" });

  let header = null;
  let index = {};
  const stats = {
    rows: 0,
    kept: 0,
    shortRows: 0,
    badLicense: 0,
    badExpiry: 0,
    duplicates: 0,
  };

  const seen = new Set();
  let batch = [];

  async function flush() {
    if (batch.length === 0) return;

    if (supabase === null) {
      batch = [];
      process.stdout.write(`\r  Parsed ${stats.kept} C-10 licences`);
      return;
    }

    // upsert rather than insert: the file is not guaranteed to be free of
    // duplicated licence numbers, and one repeated row should not abort an
    // import of 29,000.
    const { error } = await supabase
      .from("cslb_licenses_staging")
      .upsert(batch, { onConflict: "license_no" });

    if (error) die(`Insert failed after ${stats.kept} rows: ${error.message}`);

    batch = [];
    process.stdout.write(`\r  Loaded ${stats.kept} C-10 licences`);
  }

  for await (const fields of csvRecords(stream)) {
    if (header === null) {
      header = fields.map((h) => h.trim());
      index = {};
      header.forEach((name, i) => {
        index[name] = i;
      });

      const missing = Object.values(COLUMNS).filter((name) => !(name in index));
      if (missing.length > 0) {
        die(
          `The file is missing expected columns: ${missing.join(", ")}\n  ` +
            "CSLB may have changed the format. Check the header before " +
            "adjusting COLUMNS in this script."
        );
      }
      continue;
    }

    // A blank trailing line parses as one empty field.
    if (fields.length === 1 && fields[0].trim() === "") continue;

    stats.rows++;

    // Short rows are kept rather than dropped -- a truncated row still carries
    // its licence number and status, and the fields it is missing read as
    // blank. Counted so a format change shows up in the summary.
    if (fields.length !== header.length) stats.shortRows++;

    const get = (name) => (fields[index[name]] ?? "").trim();

    const classKeys = parseClassifications(get(COLUMNS.classifications));
    if (!classKeys.includes("C10")) continue;

    const licenseNo = normaliseLicense(get(COLUMNS.license_no));
    if (licenseNo === null) {
      stats.badLicense++;
      continue;
    }

    if (seen.has(licenseNo)) stats.duplicates++;
    seen.add(licenseNo);

    const expiration = parseDate(get(COLUMNS.expiration_date));
    if (expiration === null) stats.badExpiry++;

    stats.kept++;

    batch.push({
      license_no: licenseNo,
      business_name: get(COLUMNS.business_name) || null,
      full_business_name: get(COLUMNS.full_business_name) || null,
      city: get(COLUMNS.city) || null,
      county: get(COLUMNS.county) || null,
      state: get(COLUMNS.state) || null,
      expiration_date: expiration,
      primary_status: get(COLUMNS.primary_status) || null,
      secondary_status: get(COLUMNS.secondary_status) || null,
      classifications: get(COLUMNS.classifications) || null,
      class_keys: classKeys,
      last_update: parseDate(get(COLUMNS.last_update)),
    });

    if (batch.length >= BATCH_SIZE) await flush();
  }

  await flush();
  process.stdout.write("\n\n");

  console.log(`  Read        ${stats.rows} rows`);
  console.log(`  C-10        ${stats.kept} kept`);
  if (stats.shortRows) console.log(`  Short rows  ${stats.shortRows}`);
  if (stats.badLicense) console.log(`  No licence  ${stats.badLicense} skipped`);
  if (stats.badExpiry) console.log(`  No expiry   ${stats.badExpiry} (kept, will not verify)`);
  if (stats.duplicates) console.log(`  Duplicates  ${stats.duplicates} (last one wins)`);
  console.log("");

  if (args.dryRun) {
    console.log("  Dry run. Nothing was written.");
    console.log("");
    return;
  }

  // -------------------------------------------------------------------------
  // Commit -- one transaction, with the row-count guard
  // -------------------------------------------------------------------------

  const { data: committed, error: commitError } = await supabase.rpc(
    "cslb_commit_import",
    {
      p_source_as_of: asOf,
      p_file_name: basename(filePath),
      p_min_ratio: args.minRatio,
      p_force: args.force,
    }
  );

  if (commitError) {
    die(
      `${commitError.message}\n\n  Nothing was replaced -- the previous ` +
        "import is still in place."
    );
  }

  const result = Array.isArray(committed) ? committed[0] : committed;
  const previous = result?.previous_rows;

  console.log(`  Committed   ${result?.imported_rows} rows, as of ${asOf}`);
  if (previous != null) {
    const delta = result.imported_rows - previous;
    console.log(
      `  Previous    ${previous} rows (${delta >= 0 ? "+" : ""}${delta})`
    );
  }
  console.log("");

  // -------------------------------------------------------------------------
  // Re-check every C-10 against what just landed
  // -------------------------------------------------------------------------

  const { data: sweep, error: sweepError } = await supabase.rpc(
    "cslb_recheck_all"
  );

  if (sweepError) {
    console.error(
      `  The import committed but the re-check failed: ${sweepError.message}`
    );
    console.error("  Badges are unchanged. Re-run this script to retry.");
    process.exit(1);
  }

  console.log("  Re-check");
  if (!sweep || sweep.length === 0) {
    console.log("    no C-10 contractors to check");
  } else {
    for (const row of sweep) {
      console.log(`    ${row.outcome.padEnd(28)} ${row.accounts}`);
    }
  }
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
