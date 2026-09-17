/**
 * Seed demo data for a recorded walkthrough.
 *
 * NOT SHIPPED. Nothing in app/, components/, hooks/ or lib/ imports this.
 *
 *   node --env-file=.env.local scripts/seed-demo.mjs
 *
 * or, pointing at production explicitly rather than trusting whatever is in a
 * dotenv file:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://ztjlyucyoiagdwafgppf.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/seed-demo.mjs
 *
 * Plain .mjs rather than the repo-wide .tsx, matching scripts/create-ad-prices.mjs:
 * Node strips types from .ts but does not strip JSX from .tsx, so a .tsx file
 * cannot be run directly.
 *
 *
 * ############################################################################
 * #  EVERY CREDENTIAL IN THIS FILE IS FABRICATED.                            #
 * #                                                                          #
 * #  The CSLB licence number, the electrician certification card number, the #
 * #  CE provider approval, the ET card number and every business detail below #
 * #  were invented for a demo recording. None of them belongs to a real       #
 * #  person, a real contractor, or a real licence on any state register.      #
 * #  They are shaped to look plausible on camera and nothing more.            #
 * #                                                                          #
 * #  Do not copy any of these numbers into anything that is checked, and do   #
 * #  not leave this data on production after the recording — run              #
 * #  scripts/clear-demo.mjs.                                                  #
 * ############################################################################
 *
 *
 * WHY THE SERVICE ROLE KEY
 *
 * The seed writes rows that a normal client is not allowed to write: another
 * user's posts, applications on someone else's job, messages into a
 * conversation the caller is not in. Those are all correctly blocked by RLS.
 * service_role bypasses RLS, which is the only way to author data as four
 * different people from one process.
 *
 * It also means every guard in the database is bypassed, so this script is
 * responsible for its own correctness. It is deliberately narrow: it creates,
 * it never updates or deletes anything that was already there.
 *
 *
 * EMAIL CONFIRMATION
 *
 * Production has confirmation on and Resend configured. Accounts are created
 * with `email_confirm: true`, which marks them confirmed without sending
 * anything — so they can log in immediately, and Resend is never asked to
 * deliver to a domain that may not accept mail.
 *
 * admin.createUser still fires the on_auth_user_created trigger, so
 * handle_new_user() builds the profiles row, account_roles and role_credentials
 * from user_metadata. The metadata below is the exact shape app/signup/page.tsx
 * sends, so these accounts are indistinguishable from real signups.
 *
 *
 * SIX ACCOUNTS, NOT FOUR — AND WHY
 *
 * The brief asked for four accounts, all connected to each other and accepted,
 * plus a couple of pending connection requests. Those two cannot both be true
 * with four accounts: if all six pairs are accepted, there is nobody left to
 * have a request pending from. So there are two extra walk-on accounts whose
 * only purpose is to have sent a request that is still pending, which is what
 * makes the Connections page show both states.
 *
 * They are on the same @demo.sparxplug.com domain and are removed by
 * clear-demo.mjs with everything else. Delete them from ACCOUNTS if you would
 * rather the pending list were empty.
 *
 *
 * SAFE TO RE-RUN? NO. It refuses instead.
 *
 * If any @demo.sparxplug.com account already exists the script stops and tells
 * you to run clear-demo.mjs first. Partial re-seeding would double every post
 * and leave applications pointing at jobs from the previous run.
 */

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { deflateSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import process from "node:process";

const DEMO_DOMAIN = "@demo.sparxplug.com";
const DEMO_PASSWORD = "SparxDemo2026!";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Optional real banner. Falls back to a generated placeholder. */
const AD_IMAGE_PATH = "scripts/demo-assets/coast-supply-ad.png";

// The ad image spec, mirrored from lib/ads.tsx.
//
// DUPLICATED ON PURPOSE, and it has to stay in step. lib/ads.tsx is a .tsx
// module that reaches for File, Image and URL.createObjectURL, none of which
// exist in Node, so this script cannot import it. If the numbers there change,
// change them here.
const AD_ASPECT_RATIO = 4; // 4:1 (width ÷ height)
const AD_ASPECT_TOLERANCE = 0.02; // ±2%
const AD_MIN_WIDTH = 1200;
const AD_MIN_HEIGHT = 300;
const AD_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const AD_SPEC_TEXT =
  "Required: 4:1 ratio (e.g. 1200×300px). PNG, JPG or WebP. Max 2MB.";

// ---------------------------------------------------------------------------
// Accounts
//
// user_metadata mirrors what app/signup/page.tsx sends. signup_type is
// authoritative; account_type and roles are derived from it in
// lib/signupRoles.tsx and re-validated by handle_new_user().
//
// EVERY LICENCE NUMBER BELOW IS INVENTED. See the banner at the top.
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  {
    key: "contractor",
    email: `contractor${DEMO_DOMAIN}`,
    full_name: "Miguel Herrera",
    metadata: {
      full_name: "Miguel Herrera",
      role: "employer",
      signup_type: "c10",
      account_type: "company",
      roles: ["contractor"],
      signup_fields: {
        // FABRICATED. A CSLB licence is 6-7 digits; this one is not on the
        // register and must never be checked against it.
        license_number: "1047382",
        certification_name: "C-10 Electrical Contractor",
        notes:
          "Herrera Electric, Boyle Heights. Service, tenant improvement and "
          + "residential panel work across LA County. Bonded and insured, "
          + "workers' comp on file.",
      },
    },
    profile: {
      trade: "Commercial / Service",
      location: "Boyle Heights, Los Angeles, CA",
      bio:
        "C-10 out of Boyle Heights. Twenty-two years in, mostly service and "
        + "tenant improvement between Downtown and the Valley. Four trucks, two "
        + "apprentices, and I still pull my own permits.",
      years_experience: 22,
      company_description:
        "Herrera Electric — service calls, panel upgrades, TI build-outs and "
        + "EV charger installs across Los Angeles County. C-10 licensed, "
        + "bonded and insured.",
      company_website: "herreraelectric.example.com",
      employer_verified: true,
      messaging_subscribed: true,
    },
  },
  {
    key: "electrician",
    email: `electrician${DEMO_DOMAIN}`,
    full_name: "Ray Whitfield",
    metadata: {
      full_name: "Ray Whitfield",
      role: "worker",
      signup_type: "electrician",
      account_type: "individual",
      roles: ["electrician"],
      signup_fields: {
        company: "IBEW Local 11",
        // FABRICATED. California issues General Electrician certification
        // cards and Electrician Trainee (ET) cards through the DIR; neither
        // number below is real.
        notes:
          "General Electrician certification #E-142207, current. Started on "
          + "ET card #ET-118406 in 2016, 8,000 hours logged before "
          + "certification. Inside wireman, IBEW Local 11.",
      },
    },
    profile: {
      trade: "Inside Wireman",
      location: "Van Nuys, Los Angeles, CA",
      bio:
        "Inside wireman, Local 11. Service and troubleshooting is what I am "
        + "best at — give me a nuisance trip nobody can find and I am happy. "
        + "Comfortable on 480 three-phase, gear changeouts, and anything that "
        + "needs a permit signed off.",
      years_experience: 9,
      union_status: "union",
      union_verified: true,
      messaging_subscribed: true,
    },
  },
  {
    key: "instructor",
    email: `instructor${DEMO_DOMAIN}`,
    full_name: "Dolores Kim",
    metadata: {
      full_name: "Dolores Kim",
      role: "worker",
      signup_type: "instructor",
      account_type: "individual",
      roles: ["instructor"],
      signup_fields: {
        // FABRICATED. DIR approves continuing-education providers for
        // electrician certification renewal; this approval number is invented.
        certificate: "DIR-approved CE provider #CEP-4471",
        notes:
          "Code update and exam prep. Subjects: 2025 CEC changes, grounding "
          + "and bonding, load calculations, GFCI/AFCI requirements. "
          + "Affiliated with the LA Trade-Technical College electrical "
          + "program and the Local 11 JATC.",
      },
    },
    profile: {
      trade: "Instruction / Code",
      location: "Pasadena, CA",
      bio:
        "I teach the code update classes nobody wants to sit through and try "
        + "to make them worth the four hours. Twelve years in the field before "
        + "that, mostly industrial. If you are renewing your certification "
        + "this cycle, come and argue with me about Article 250.",
      years_experience: 12,
      messaging_subscribed: true,
    },
  },
  {
    key: "brand",
    email: `brand${DEMO_DOMAIN}`,
    full_name: "Coast Supply Co",
    metadata: {
      full_name: "Coast Supply Co",
      // brand maps to the legacy 'employer' role purely so the existing
      // trigger creates the profile row — see legacyRoleFor() in
      // lib/signupRoles.tsx. It is not a claim that a brand employs anyone.
      role: "employer",
      signup_type: "brand",
      account_type: "brand",
      roles: [],
      signup_fields: {
        brand_name: "Coast Supply Co",
        website: "coastsupply.example.com",
        category: "Distributor — wire, gear and fittings",
        notes: "Billing contact: accounts@coastsupply.example.com",
      },
    },
    profile: {
      location: "Vernon, CA",
      company_description:
        "Electrical distributor serving Los Angeles and Orange County since "
        + "1978. Wire, conduit, gear, fittings and lighting. Six branches, "
        + "will-call until 6pm, same-day delivery inside the 405.",
      company_website: "coastsupply.example.com",
      messaging_subscribed: true,
    },
  },

  // --- Walk-ons. Pending connection requests only. See the header. ---
  {
    key: "apprentice",
    email: `apprentice${DEMO_DOMAIN}`,
    full_name: "Alma Reyes",
    metadata: {
      full_name: "Alma Reyes",
      role: "worker",
      signup_type: "electrician",
      account_type: "individual",
      roles: ["electrician"],
      signup_fields: {
        company: "IBEW Local 11 JATC",
        // FABRICATED.
        notes: "Electrician Trainee card #ET-133902. Third year, 4,200 hours.",
      },
    },
    profile: {
      trade: "Apprentice",
      location: "Inglewood, CA",
      bio: "Third-year apprentice, Local 11 JATC. Chasing hours and coffee.",
      years_experience: 3,
      union_status: "union",
      messaging_subscribed: true,
    },
  },
  {
    key: "foreman",
    email: `foreman${DEMO_DOMAIN}`,
    full_name: "Desmond Pike",
    metadata: {
      full_name: "Desmond Pike",
      role: "worker",
      signup_type: "electrician",
      account_type: "individual",
      roles: ["electrician"],
      signup_fields: {
        company: "Pike Electrical Services",
        // FABRICATED.
        notes: "General Electrician certification #E-097744. Foreman, 15 years.",
      },
    },
    profile: {
      trade: "Foreman / Industrial",
      location: "Long Beach, CA",
      bio:
        "Foreman, mostly industrial and port work out of Long Beach. Fifteen "
        + "years. Always looking for people who show up.",
      years_experience: 15,
      union_status: "non-union",
      messaging_subscribed: true,
    },
  },
];

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

/** Hours ago as an ISO timestamp, so the feed reads as an active few weeks. */
function ago(days, hours = 0) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}

const POSTS = [
  {
    author: "contractor",
    type: "status",
    days: 24,
    hours: 3,
    content:
      "Pulled a 1960s Zinsco out of a house in Highland Park this morning. "
      + "Bus bar was blued halfway up and the main was warm to the touch. If "
      + "you are still living with one of these, it is not a maintenance "
      + "problem, it is a replacement.",
    comments: [
      { author: "electrician", days: 24, hours: 1, content: "Zinsco and Federal Pacific. Twin evils. Did LADBS give you trouble on the service upgrade permit?" },
      { author: "contractor", days: 23, hours: 20, content: "Counter approval, in and out in forty minutes. Easiest one all month." },
      { author: "foreman", days: 23, hours: 14, content: "Forty minutes at LADBS. I do not believe you." },
    ],
    reactions: ["like", "insightful", "celebrate"],
  },
  {
    author: "instructor",
    type: "status",
    days: 22,
    hours: 6,
    content:
      "Reminder for anyone renewing their General Electrician certification "
      + "this cycle: you need 32 hours, and at least 16 have to be code. The "
      + "DIR does not care that you have been doing this for twenty years. "
      + "Next code update class in Pasadena is the second Saturday.",
    comments: [
      { author: "electrician", days: 22, hours: 2, content: "Signed up. Is this the 2025 CEC changes one or the general?" },
      { author: "instructor", days: 21, hours: 22, content: "2025 changes. Heavy on 210.8 and the expanded GFCI requirements. Bring your code book, not your phone." },
    ],
    reactions: ["like", "insightful", "support", "like"],
  },
  {
    author: "contractor",
    type: "job",
    days: 20,
    hours: 2,
    job_title: "Service Electrician — Commercial TI",
    job_location: "Koreatown, Los Angeles",
    content:
      "Need a service hand who can work alone. Mostly tenant improvement "
      + "punch work and troubleshooting between Koreatown and Downtown. Own "
      + "hand tools, meter, and a clean record. $42-48/hr depending on what "
      + "you can actually do.",
    comments: [
      { author: "electrician", days: 19, hours: 18, content: "Sent an application. Nine years inside wireman, Local 11." },
    ],
    reactions: ["like", "support"],
  },
  {
    author: "electrician",
    type: "status",
    days: 18,
    hours: 5,
    content:
      "Three hours chasing an intermittent trip on a 480 panel in Torrance. "
      + "Turned out to be a shared neutral on two circuits that someone put on "
      + "the same phase back in whenever. Meter told me nothing, thermal "
      + "camera told me everything.",
    comments: [
      { author: "contractor", days: 18, hours: 3, content: "The thermal camera pays for itself the first time it does that." },
      { author: "instructor", days: 17, hours: 20, content: "This is the exact example I use for multiwire branch circuits. Mind if I steal it for the class?" },
      { author: "electrician", days: 17, hours: 16, content: "Steal away. Just do not use my name when you describe the guy who wired it." },
    ],
    reactions: ["like", "insightful", "celebrate", "like"],
  },
  {
    author: "brand",
    type: "status",
    days: 16,
    hours: 4,
    content:
      "THHN #12 and #10 back in stock in all six branches after three weeks "
      + "of nothing. Will-call until 6pm. If you have a job waiting on wire, "
      + "it is on the shelf today.",
    comments: [
      { author: "contractor", days: 16, hours: 1, content: "Finally. Had a panel change sitting half done waiting on #10." },
      { author: "foreman", days: 15, hours: 22, content: "Vernon branch had it Tuesday. Worth the drive." },
    ],
    reactions: ["like", "celebrate"],
  },
  {
    author: "apprentice",
    type: "status",
    days: 15,
    hours: 7,
    content:
      "4,200 hours. Two years in and I finally bent a four-bend saddle that "
      + "did not look like a snake. Small wins.",
    comments: [
      { author: "foreman", days: 15, hours: 4, content: "That is not a small win. Keep the first good one, it is downhill from here." },
      { author: "electrician", days: 14, hours: 20, content: "Take a photo. You will want it when you are teaching someone else." },
      { author: "instructor", days: 14, hours: 12, content: "Bring it to class. I would rather show a real one than a diagram." },
    ],
    reactions: ["celebrate", "support", "like", "celebrate"],
  },
  {
    author: "contractor",
    type: "job",
    days: 13,
    hours: 3,
    job_title: "200A Residential Panel Upgrades",
    job_location: "Van Nuys, Los Angeles",
    content:
      "Steady residential panel work through the Valley for the next two "
      + "months. Mostly 100A to 200A upgrades, some with a meter main "
      + "combo. LADWP coordination is handled, you just need to do clean work "
      + "and be ready for inspection. $38/hr.",
    comments: [
      { author: "apprentice", days: 12, hours: 18, content: "Is there room for an apprentice on this one? Third year, happy to dig." },
      { author: "contractor", days: 12, hours: 10, content: "Always. Send me a message." },
    ],
    reactions: ["like", "support"],
  },
  {
    author: "instructor",
    type: "status",
    days: 11,
    hours: 2,
    content:
      "Had a student argue with me for twenty minutes yesterday that a "
      + "grounding electrode conductor and an equipment grounding conductor "
      + "are the same thing. He is wrong, but he argued well, and he will "
      + "never forget the difference now. That is a good class.",
    comments: [
      { author: "electrician", days: 10, hours: 21, content: "I sat through Article 250 four times before it clicked. No shame in it." },
    ],
    reactions: ["like", "insightful", "like"],
  },
  {
    author: "brand",
    type: "status",
    days: 9,
    hours: 5,
    content:
      "New at the Vernon counter: full line of Level 2 EV charger rough-in "
      + "kits, including the 60A whip and disconnect combos most of you have "
      + "been building on the truck. Ask for them by the counter, not online.",
    comments: [
      { author: "contractor", days: 9, hours: 2, content: "About time. I have built that whip forty times this year." },
    ],
    reactions: ["like", "celebrate", "like"],
  },
  {
    author: "electrician",
    type: "status",
    days: 7,
    hours: 6,
    content:
      "Service call in San Pedro: whole house flickering, homeowner convinced "
      + "it was the utility. Loose neutral at the weatherhead. Twenty minutes "
      + "and a crimp. She had been living with it for a year and a half.",
    comments: [
      { author: "contractor", days: 7, hours: 3, content: "Loose neutral is the one I always check first on a flicker call. Cheap fix, expensive if you miss it." },
      { author: "apprentice", days: 6, hours: 19, content: "Noted. Adding that to the list of things to check before I panic." },
    ],
    reactions: ["like", "insightful", "support"],
  },
  {
    author: "contractor",
    type: "job",
    days: 6,
    hours: 4,
    job_title: "EV Charger Installer — Level 2 and DCFC",
    job_location: "Santa Monica, CA",
    content:
      "Picked up a small commercial EV contract, eight Level 2 and two DC "
      + "fast chargers in a parking structure. Need someone who has done load "
      + "calculations for this and knows what the utility will ask for. "
      + "$45/hr, roughly six weeks.",
    comments: [],
    reactions: ["like", "like", "celebrate"],
  },
  {
    author: "foreman",
    type: "status",
    days: 4,
    hours: 3,
    content:
      "Port job wrapped two days early. Fourteen weeks, no recordables, and "
      + "the same crew start to finish. That last part is the hard one.",
    comments: [
      { author: "contractor", days: 4, hours: 1, content: "Same crew for fourteen weeks is the whole job. Congratulations." },
      { author: "instructor", days: 3, hours: 18, content: "No recordables on a port job. That is worth more than the schedule." },
    ],
    reactions: ["celebrate", "like", "support", "celebrate"],
  },
  {
    author: "contractor",
    type: "job",
    days: 2,
    hours: 5,
    job_title: "Journeyman — Tenant Improvement, Night Shift",
    job_location: "Downtown Los Angeles",
    content:
      "Occupied building, so the work is 8pm to 5am. Lighting retrofit and "
      + "branch circuit rework across four floors. $52/hr plus shift "
      + "differential. Six weeks. Need people who can work quiet and clean up "
      + "behind themselves before the tenants come back.",
    comments: [
      { author: "electrician", days: 2, hours: 2, content: "Applied. I have done nights in occupied buildings before, it is not for everyone but I do not mind it." },
    ],
    reactions: ["like", "support", "like"],
  },
  {
    author: "instructor",
    type: "status",
    days: 1,
    hours: 4,
    content:
      "Class this Saturday still has six seats. 2025 code update, four hours, "
      + "counts toward your renewal. Pasadena. Bring the code book.",
    comments: [
      { author: "apprentice", days: 1, hours: 1, content: "Can apprentices sit in even though we are not renewing anything?" },
      { author: "instructor", days: 0, hours: 20, content: "Especially apprentices. Come early and sit at the front." },
    ],
    reactions: ["like", "support"],
  },
];

const JOBS = [
  {
    title: "Service Electrician — Commercial TI",
    location: "Koreatown, Los Angeles, CA",
    pay: "$42-48/hr DOE",
    required_union_status: null,
    days: 20,
    description:
      "Service and punch work across commercial tenant improvement projects "
      + "between Koreatown and Downtown. You will be working alone most days: "
      + "troubleshooting, small branch circuit additions, device and fixture "
      + "replacement, and closing out punch lists ahead of inspection.\n\n"
      + "Required: own hand tools and meter, clean driving record, comfortable "
      + "reading a panel schedule that is wrong. California General "
      + "Electrician certification preferred.",
  },
  {
    title: "200A Residential Panel Upgrades",
    location: "Van Nuys, Los Angeles, CA",
    pay: "$38/hr",
    required_union_status: null,
    days: 13,
    description:
      "Two months of steady residential service upgrades through the San "
      + "Fernando Valley. Mostly 100A to 200A, a mix of main breaker panels "
      + "and meter main combos, occasional subpanel and grounding electrode "
      + "work.\n\nLADWP coordination and permits are handled. You need to do "
      + "clean work that passes inspection the first time and talk to "
      + "homeowners without scaring them.",
  },
  {
    title: "Apprentice Electrician — Ground-Up Retail",
    location: "El Segundo, CA",
    pay: "$24/hr",
    required_union_status: "union",
    days: 17,
    description:
      "Ground-up retail shell, roughly four months. Underground, slab "
      + "layout, overhead rough and eventually trim. Good hours for anyone "
      + "working through an apprenticeship — you will see the whole job from "
      + "dirt to final.\n\nSecond year or above preferred. ET card required. "
      + "Local 11 JATC hours count.",
  },
  {
    title: "EV Charger Installer — Level 2 and DCFC",
    location: "Santa Monica, CA",
    pay: "$45/hr",
    required_union_status: null,
    days: 6,
    description:
      "Eight Level 2 chargers and two DC fast chargers in an existing "
      + "parking structure. Feeder runs from an existing 480V switchboard, new "
      + "distribution panel, transformer and step-down for the Level 2 "
      + "circuits.\n\nYou should have done load calculations for EVSE before "
      + "and know what the utility will ask for on a service review. Roughly "
      + "six weeks.",
  },
  {
    title: "Journeyman — Tenant Improvement, Night Shift",
    location: "Downtown Los Angeles, CA",
    pay: "$52/hr + shift differential",
    required_union_status: "union",
    days: 2,
    description:
      "Occupied high-rise, 8pm to 5am, six weeks. Lighting retrofit to LED "
      + "across four floors plus branch circuit rework for a new office "
      + "layout.\n\nWork has to be quiet, dust controlled, and completely "
      + "cleaned up before tenants return in the morning. Journeyman level "
      + "only — there is no supervision on site overnight.",
  },
  {
    title: "Fire Alarm Rough-In Technician",
    location: "Torrance, CA",
    pay: "$40/hr",
    required_union_status: null,
    days: 9,
    description:
      "Fire alarm rough-in on a three-storey medical office building. "
      + "Conduit, back boxes and cable pull for devices, NAC circuits and "
      + "the panel location. Final termination and programming is handled by "
      + "the alarm contractor — you are getting it ready for them.\n\n"
      + "Experience with fire alarm rough preferred, but a careful commercial "
      + "hand will pick it up.",
  },
  {
    title: "Service Truck Electrician — Troubleshooting",
    location: "Long Beach, CA",
    pay: "$44/hr",
    required_union_status: "non-union",
    days: 11,
    description:
      "Own truck, own route. Mixed commercial and light industrial service "
      + "calls around Long Beach and the harbour area: nuisance trips, "
      + "failed lighting contactors, motor starters, the occasional gear "
      + "changeout.\n\nThis is a troubleshooting job more than an installation "
      + "job. If you like being handed a problem nobody else could find, it is "
      + "a good one.",
  },
];

/**
 * Applications from the electrician, across a range of statuses so the
 * applications page shows more than one state. Indexes are into JOBS.
 */
const APPLICATIONS = [
  { job: 0, status: "accepted", days: 19 },
  { job: 1, status: "accepted", days: 12 },
  { job: 3, status: "pending", days: 5 },
  { job: 4, status: "pending", days: 2 },
  { job: 5, status: "rejected", days: 8 },
  { job: 6, status: "accepted", days: 10 },
];

/**
 * Reviews hang off accepted applications only. Each (application, reviewer)
 * pair is distinct, so this survives a unique constraint on that pair if one
 * exists — the inventory cannot see unique constraints beyond the PK.
 */
const REVIEWS = [
  {
    application: 0,
    reviewer: "contractor",
    reviewee: "electrician",
    rating: 5,
    comment:
      "Ray worked the Koreatown punch list alone for three weeks and I never "
      + "had to go back behind him. Found a mislabelled circuit the GC had "
      + "been fighting for a month. Would put him on anything.",
    days: 14,
  },
  {
    application: 0,
    reviewer: "electrician",
    reviewee: "contractor",
    rating: 5,
    comment:
      "Permits were pulled before I got there, material was on site, and I "
      + "got paid on the day he said I would. That is rarer than it should be.",
    days: 13,
  },
  {
    application: 1,
    reviewer: "contractor",
    reviewee: "electrician",
    rating: 4,
    comment:
      "Good clean panel work through the Valley. Passed every inspection "
      + "first time. Only note is he is faster than he is tidy on the paperwork.",
    days: 6,
  },
  {
    application: 1,
    reviewer: "electrician",
    reviewee: "contractor",
    rating: 5,
    comment:
      "Straightforward to work for. Tells you what he wants, lets you do it, "
      + "and backs you up when the homeowner wants something that is not to code.",
    days: 5,
  },
];

const CONVERSATIONS = [
  {
    participants: ["contractor", "electrician"],
    days: 12,
    messages: [
      { from: "contractor", days: 12, hours: 6, content: "Ray — got your application on the Van Nuys panel work. You available starting Monday?" },
      { from: "electrician", days: 12, hours: 5, content: "Monday works. How many are on the schedule?" },
      { from: "contractor", days: 12, hours: 5, content: "Eleven so far, probably fifteen by the time we finish. Mostly 100 to 200, two meter main combos." },
      { from: "electrician", days: 12, hours: 4, content: "Any of them with a subpanel feed I should know about?" },
      { from: "contractor", days: 12, hours: 3, content: "Two. I will send addresses tonight. DWP has already been out on both." },
      { from: "electrician", days: 11, hours: 22, content: "Got them, thanks. See you Monday." },
    ],
  },
  {
    participants: ["electrician", "instructor"],
    days: 8,
    messages: [
      { from: "electrician", days: 8, hours: 4, content: "Dolores — is the Saturday class going to cover the 210.8 changes in any depth or is it a skim?" },
      { from: "instructor", days: 8, hours: 3, content: "Depth. It is most of the second hour. The expanded GFCI requirements are what people are failing on right now." },
      { from: "electrician", days: 8, hours: 2, content: "Good. That is exactly what I wanted. Do I need to bring anything besides the code book?" },
      { from: "instructor", days: 7, hours: 20, content: "A calculator and something to write with. And the trip you told the feed about — I would like to use it as an example if you do not mind." },
      { from: "electrician", days: 7, hours: 18, content: "Go ahead. Just do not name the guy who wired it." },
    ],
  },
  {
    participants: ["contractor", "brand"],
    days: 5,
    messages: [
      { from: "contractor", days: 5, hours: 7, content: "Do you have the 60A EVSE whip kits at Vernon or do I need to order?" },
      { from: "brand", days: 5, hours: 6, content: "On the shelf at Vernon. How many do you need?" },
      { from: "contractor", days: 5, hours: 6, content: "Eight to start, probably ten. Santa Monica job." },
      { from: "brand", days: 5, hours: 5, content: "We can hold ten for will-call tomorrow. Anything else for that job — disconnects, fittings?" },
      { from: "contractor", days: 4, hours: 23, content: "Send me a quote on the disconnects and I will decide. Thanks." },
    ],
  },
];

/**
 * The three campaigns seeded for the brand account.
 *
 * One running, one waiting in the admin queue, one rejected. Between them the
 * review flow can be shown end to end with no Stripe involvement at all: the
 * pending row is already marked paid, so approving it on camera is a status
 * change and nothing more, and it goes live on a placement the approved one is
 * not using.
 *
 * All three are `source: 'brand'` and `payment_status: 'paid'`. Paid matters
 * for more than realism — useAdRequests excludes 'unpaid' rows from the review
 * queue, so a pending campaign that is not marked paid never appears in the
 * tab this data exists to fill.
 *
 * `placement` is not set here. Which surfaces are free depends on what is
 * already running in the project being seeded, so it is assigned at insert.
 */
const ADS = [
  {
    slug: "coast-supply",
    status: "approved",
    title: "Coast Supply Co — wire, gear and fittings across LA",
    link_url: "https://coastsupply.example.com",
    amount_charged: 299,
    // Sold as a term, which is what puts AdRequestCard into its prepaid
    // branch: payment fields locked, end date computed from the term rather
    // than typed. Left off the approved row, which is past review and whose
    // dates are set explicitly below.
    duration_months: null,
    city: "Los Angeles",
    review_notes: null,
    createdDaysAgo: 7,
  },
  {
    slug: "coast-supply-spring",
    status: "pending",
    title: "Coast Supply Co — spring conduit and fittings promotion",
    link_url: "https://coastsupply.example.com/spring",
    amount_charged: 549,
    duration_months: 3,
    city: "Los Angeles",
    review_notes: null,
    createdDaysAgo: 2,
  },
  {
    slug: "coast-supply-clearance",
    status: "rejected",
    title: "Coast Supply Co — clearance blowout, everything must go",
    link_url: "https://coastsupply.example.com/clearance",
    amount_charged: 299,
    duration_months: 1,
    city: "Los Angeles",
    // Shown back to the brand on /dashboard/branding-deals under "Why this was
    // rejected", so it is written as feedback to them rather than as an
    // internal note. Concrete enough to be actionable, which is the point
    // being demonstrated.
    review_notes:
      "The creative reads as a general retail sale rather than trade supply, " +
      "and 'everything must go' implies a closing-down sale we can't verify. " +
      "Resubmit with the product range and any trade pricing spelled out, and " +
      "we'll approve it.",
    createdDaysAgo: 5,
  },
];

// ---------------------------------------------------------------------------
// Placeholder ad image
//
// A 1200x300 PNG built with node:zlib and nothing else. There is no image
// library in this project and adding one to draw a rectangle is not worth a
// dependency; there is also no font, which is why this is geometric rather
// than a banner with words on it.
//
// Drop a real 4:1 image at scripts/demo-assets/coast-supply-ad.png and this is
// not used.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * The reason this buffer is not a usable ad creative, or null if it is fine.
 *
 * Mirrors validateAdImage in lib/ads.tsx, which is what a real upload goes
 * through. The seed writes to storage directly and so skips it — that is how a
 * 2172×724 (3:1, 2.27MB) file sat in scripts/demo-assets for a while, was
 * uploaded without complaint, and then letterboxed itself into the 4:1 slot on
 * every surface that rendered it. A demo that silently misrepresents the
 * product is worse than one that refuses to run.
 *
 * PNG only, unlike the app: the caller uploads as image/png under a .png key,
 * so a JPEG here would be mislabelled even though the app would accept one.
 * Dimensions come from the IHDR chunk, which is always the first chunk and
 * always at a fixed offset, so no image library is needed.
 */
function adImageProblem(buffer) {
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "it is not a PNG file.";
  }

  if (buffer.length > AD_MAX_BYTES) {
    const mb = (buffer.length / 1024 / 1024).toFixed(2);
    return `it is ${mb}MB, over the ${AD_MAX_BYTES / 1024 / 1024}MB limit.`;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width < AD_MIN_WIDTH || height < AD_MIN_HEIGHT) {
    return `it is ${width}×${height}px, under the ${AD_MIN_WIDTH}×${AD_MIN_HEIGHT}px minimum.`;
  }

  const ratio = width / height;
  const minRatio = AD_ASPECT_RATIO * (1 - AD_ASPECT_TOLERANCE);
  const maxRatio = AD_ASPECT_RATIO * (1 + AD_ASPECT_TOLERANCE);

  if (ratio < minRatio || ratio > maxRatio) {
    return (
      `it is ${width}×${height}px, a ${ratio.toFixed(2)}:1 ratio. ` +
      `Needs ${AD_ASPECT_RATIO}:1 ±${AD_ASPECT_TOLERANCE * 100}% — ` +
      `${width}×${Math.round(width / AD_ASPECT_RATIO)}px would do it.`
    );
  }

  return null;
}

function generateAdPng(width = 1200, height = 300) {
  const rows = [];

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter: none

    for (let x = 0; x < width; x++) {
      // Charcoal ground, an ember rule down the left, and three lighter
      // blocks where a wordmark and strapline would sit.
      let r = 24, g = 24, b = 27;

      if (x < 14) {
        [r, g, b] = [255, 94, 58];
      } else if (y > 92 && y < 146 && x > 70 && x < 470) {
        [r, g, b] = [244, 244, 245];
      } else if (y > 166 && y < 194 && x > 70 && x < 700) {
        [r, g, b] = [113, 113, 122];
      } else if (y > 92 && y < 194 && x > 980 && x < 1130) {
        [r, g, b] = [255, 94, 58];
      }

      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }

    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

/** Throws on error rather than letting a failed insert pass silently. */
async function must(label, promise) {
  const { data, error } = await promise;
  if (error) die(`${label} failed: ${error.message}`);
  return data;
}

async function confirm(question) {
  if (!process.stdin.isTTY) {
    die("Refusing to run without a TTY — this needs an interactive confirmation.");
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

async function main() {
  if (!SUPABASE_URL) die("Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).");
  if (!SERVICE_ROLE_KEY) die("Set SUPABASE_SERVICE_ROLE_KEY.");

  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];

  console.log("\n  Seed demo data");
  console.log("  ----------------------------------------------------------");
  console.log(`  Project : ${ref}`);
  console.log(`  URL     : ${SUPABASE_URL}`);
  console.log(`  Accounts: ${ACCOUNTS.length} on ${DEMO_DOMAIN}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("");
  console.log("  Every licence number in this data is FABRICATED.");
  console.log("  Remove it with scripts/clear-demo.mjs when the recording is done.");
  console.log("");

  const typed = await confirm(`  Type the project ref (${ref}) to continue: `);
  if (typed !== ref) die("Project ref did not match. Nothing was written.");

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Refuse to run on top of an existing seed -----------------------------

  const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
  const already = (existing?.users ?? []).filter((u) =>
    u.email?.endsWith(DEMO_DOMAIN)
  );

  if (already.length > 0) {
    die(
      `${already.length} ${DEMO_DOMAIN} account(s) already exist.\n` +
        "  Run scripts/clear-demo.mjs first — re-seeding on top would double\n" +
        "  every post and orphan the applications from the previous run."
    );
  }

  // --- Accounts -------------------------------------------------------------

  const ids = {};

  for (const account of ACCOUNTS) {
    const { data, error } = await db.auth.admin.createUser({
      email: account.email,
      password: DEMO_PASSWORD,
      // Production has confirmation on. Without this the account cannot log in
      // and Resend is asked to deliver to a domain that may not accept mail.
      email_confirm: true,
      user_metadata: account.metadata,
    });

    if (error) die(`Creating ${account.email} failed: ${error.message}`);

    ids[account.key] = data.user.id;
    console.log(`  + ${account.email}`);
  }

  // handle_new_user() builds the profiles row from an AFTER INSERT trigger on
  // auth.users. createUser returns once that transaction commits, but poll
  // rather than assume — a missing profile here would fail every insert below
  // with a foreign key error that says nothing useful.
  for (const account of ACCOUNTS) {
    let found = false;

    for (let attempt = 0; attempt < 10 && !found; attempt++) {
      const { data } = await db
        .from("profiles")
        .select("id")
        .eq("id", ids[account.key])
        .maybeSingle();

      if (data) found = true;
      else await new Promise((r) => setTimeout(r, 300));
    }

    if (!found) {
      die(
        `No profiles row for ${account.email} after 3s.\n` +
          "  handle_new_user() did not fire or failed. Check the trigger before\n" +
          "  re-running, and clear the half-created accounts first."
      );
    }
  }

  // Everything the signup trigger does not set.
  for (const account of ACCOUNTS) {
    if (!account.profile) continue;
    await must(
      `Updating profile for ${account.email}`,
      db.from("profiles").update(account.profile).eq("id", ids[account.key])
    );
  }

  console.log(`  ${ACCOUNTS.length} accounts ready\n`);

  // --- Posts, comments, reactions ------------------------------------------

  let commentCount = 0;
  let reactionCount = 0;

  for (const post of POSTS) {
    const row = await must(
      "Creating post",
      db
        .from("posts")
        .insert({
          author_id: ids[post.author],
          post_type: post.type,
          content: post.content,
          job_title: post.job_title ?? null,
          job_location: post.job_location ?? null,
          created_at: ago(post.days, post.hours),
        })
        .select("id")
        .single()
    );

    for (const comment of post.comments) {
      await must(
        "Creating comment",
        db.from("post_comments").insert({
          post_id: row.id,
          author_id: ids[comment.author],
          content: comment.content,
          created_at: ago(comment.days, comment.hours),
        })
      );
      commentCount++;
    }

    // One reaction per person per post — a second from the same account would
    // trip the unique constraint the reaction bar relies on.
    const reactors = ACCOUNTS.map((a) => a.key).filter((k) => k !== post.author);

    for (let i = 0; i < post.reactions.length && i < reactors.length; i++) {
      await must(
        "Creating reaction",
        db.from("post_reactions").insert({
          post_id: row.id,
          user_id: ids[reactors[i]],
          reaction_type: post.reactions[i],
          created_at: ago(post.days, Math.max(0, post.hours - 1)),
        })
      );
      reactionCount++;
    }
  }

  console.log(
    `  ${POSTS.length} posts, ${commentCount} comments, ${reactionCount} reactions`
  );

  // --- Jobs -----------------------------------------------------------------

  const jobIds = [];

  for (const job of JOBS) {
    const row = await must(
      "Creating job",
      db
        .from("jobs")
        .insert({
          user_id: ids.contractor,
          company: "Herrera Electric",
          title: job.title,
          location: job.location,
          pay: job.pay,
          description: job.description,
          required_union_status: job.required_union_status,
          created_at: ago(job.days),
        })
        .select("id")
        .single()
    );

    jobIds.push(row.id);
  }

  console.log(`  ${JOBS.length} jobs`);

  // --- Applications ---------------------------------------------------------

  const applicationIds = [];

  for (const application of APPLICATIONS) {
    const row = await must(
      "Creating application",
      db
        .from("applications")
        .insert({
          job_id: jobIds[application.job],
          worker_id: ids.electrician,
          status: application.status,
          created_at: ago(application.days),
        })
        .select("id")
        .single()
    );

    applicationIds.push(row.id);
  }

  console.log(`  ${APPLICATIONS.length} applications`);

  // --- Connections ----------------------------------------------------------
  //
  // The four named accounts are connected to each other, all accepted. The two
  // walk-ons have requests in that are still pending, which is the only way to
  // show both states — see the header.

  const CONNECTIONS = [
    { from: "contractor", to: "electrician", status: "accepted", days: 21 },
    { from: "contractor", to: "instructor", status: "accepted", days: 19 },
    { from: "contractor", to: "brand", status: "accepted", days: 17 },
    { from: "electrician", to: "instructor", status: "accepted", days: 16 },
    { from: "electrician", to: "brand", status: "accepted", days: 14 },
    { from: "instructor", to: "brand", status: "accepted", days: 12 },
    { from: "apprentice", to: "contractor", status: "pending", days: 3 },
    { from: "foreman", to: "electrician", status: "pending", days: 1 },
  ];

  for (const connection of CONNECTIONS) {
    await must(
      "Creating connection",
      db.from("connections").insert({
        requester_id: ids[connection.from],
        recipient_id: ids[connection.to],
        status: connection.status,
        created_at: ago(connection.days),
      })
    );
  }

  console.log(
    `  ${CONNECTIONS.length} connections (${
      CONNECTIONS.filter((c) => c.status === "pending").length
    } pending)`
  );

  // --- Reviews --------------------------------------------------------------

  for (const review of REVIEWS) {
    await must(
      "Creating review",
      db.from("reviews").insert({
        application_id: applicationIds[review.application],
        reviewer_id: ids[review.reviewer],
        reviewee_id: ids[review.reviewee],
        rating: review.rating,
        comment: review.comment,
        created_at: ago(review.days),
      })
    );
  }

  console.log(`  ${REVIEWS.length} reviews`);

  // --- Conversations --------------------------------------------------------

  let messageCount = 0;

  for (const conversation of CONVERSATIONS) {
    const row = await must(
      "Creating conversation",
      db
        .from("conversations")
        .insert({
          is_group: false,
          created_by: ids[conversation.participants[0]],
          created_at: ago(conversation.days),
        })
        .select("id")
        .single()
    );

    for (const participant of conversation.participants) {
      await must(
        "Adding conversation participant",
        db.from("conversation_participants").insert({
          conversation_id: row.id,
          user_id: ids[participant],
          joined_at: ago(conversation.days),
        })
      );
    }

    for (const message of conversation.messages) {
      await must(
        "Creating message",
        db.from("messages").insert({
          conversation_id: row.id,
          sender_id: ids[message.from],
          content: message.content,
          created_at: ago(message.days, message.hours),
        })
      );
      messageCount++;
    }
  }

  console.log(`  ${CONVERSATIONS.length} conversations, ${messageCount} messages`);

  // --- Ad -------------------------------------------------------------------
  //
  // Written straight to the table, which bypasses /api/ads/capacity and its one
  // advertiser per placement rule. So check first and take a placement that is
  // free, rather than quietly becoming the second advertiser somewhere.

  const today = new Date().toISOString().slice(0, 10);

  const { data: liveAds } = await db
    .from("sponsored_listings")
    .select("placement, title, end_date")
    .eq("is_active", true)
    .eq("status", "approved");

  const occupied = new Set(
    (liveAds ?? [])
      .filter((a) => !a.end_date || a.end_date >= today)
      .map((a) => a.placement)
  );

  if (occupied.size > 0) {
    console.log(`\n  Placements already running an ad: ${[...occupied].join(", ")}`);
  }

  // One placement each, and the approved and pending campaigns must not land
  // on the same one: the pending campaign is there to be approved on camera,
  // and if it went live where the approved one already runs, the demo would
  // finish by breaking the one-advertiser-per-placement rule it is showing off.
  //
  // The rejected campaign's placement is inert — a rejected row never renders
  // and never reaches the review queue — so it takes whatever is left over and
  // is allowed to double up.
  const ALL_PLACEMENTS = ["feed", "jobs_board", "marketplace"];
  const freePlacements = ALL_PLACEMENTS.filter((p) => !occupied.has(p));

  const approvedPlacement = freePlacements[0] ?? ALL_PLACEMENTS[0];
  const pendingPlacement =
    freePlacements[1] ?? ALL_PLACEMENTS.find((p) => p !== approvedPlacement);
  const rejectedPlacement =
    freePlacements[2] ??
    ALL_PLACEMENTS.find((p) => p !== approvedPlacement && p !== pendingPlacement) ??
    approvedPlacement;

  const placementFor = {
    approved: approvedPlacement,
    pending: pendingPlacement,
    rejected: rejectedPlacement,
  };

  if (freePlacements.length < 2) {
    console.log(
      `  WARNING: only ${freePlacements.length} placement(s) free. The pending campaign is on\n` +
        `  '${pendingPlacement}', which already has an advertiser — approving it in the\n` +
        "  demo will make two of them share it until the demo data is removed."
    );
  }

  const usingRealImage = existsSync(AD_IMAGE_PATH);
  const image = usingRealImage ? readFileSync(AD_IMAGE_PATH) : generateAdPng();

  // Refuse an off-spec creative rather than uploading it. The generated
  // fallback is 1200x300 by construction and never reaches this check.
  if (usingRealImage) {
    const problem = adImageProblem(image);

    if (problem) {
      die(
        `Ad image ${AD_IMAGE_PATH} is off-spec: ${problem}\n` +
          `  ${AD_SPEC_TEXT}\n` +
          "  Replace it, or delete it and a compliant placeholder is generated instead."
      );
    }
  }

  console.log(
    usingRealImage
      ? `  Ad image: ${AD_IMAGE_PATH}`
      : "  Ad image: generated placeholder (drop a 4:1 PNG at " +
          `${AD_IMAGE_PATH} for a real one)`
  );

  // One upload per campaign, all of them the same bytes.
  //
  // The asset is reused rather than a placeholder being generated for the
  // second and third: a demo with one real creative and two grey rectangles
  // looks like two of the campaigns are broken. Separate storage objects
  // rather than one shared path because clear-demo collects image_path per
  // row and removes what it collects — sharing one path would have it count
  // three images, delete the same one three times, and report a number that
  // is not true.
  //
  // Pathed under the brand's profile id, matching uploadAdImage in lib/ads.tsx,
  // so clear-demo can find them by prefix.
  const imagePathFor = {};

  for (const ad of ADS) {
    const path = `${ids.brand}/demo-${ad.slug}.png`;

    const { error: uploadError } = await db.storage
      .from("sponsored-listings")
      .upload(path, image, { contentType: "image/png", upsert: true });

    if (uploadError) die(`Ad image upload failed (${ad.slug}): ${uploadError.message}`);

    imagePathFor[ad.slug] = path;
  }

  // duration_months ships with 20260915120000, which is not applied
  // everywhere yet. PostgREST rejects an insert naming a column that does not
  // exist, and it rejects the whole batch, so ask once rather than lose all
  // three rows to it. Without the column the review flow still works end to
  // end — the admin just sees editable payment fields instead of the locked
  // prepaid ones, because AdRequestCard keys that branch off duration_months.
  const { error: durationMissing } = await db
    .from("sponsored_listings")
    .select("duration_months")
    .limit(1);

  if (durationMissing) {
    console.log(
      "  Note: duration_months is missing, so the pending campaign shows\n" +
        "  editable payment fields at review rather than the locked prepaid\n" +
        "  ones. Push 20260915120000 for those."
    );
  }

  const start = new Date();
  start.setDate(start.getDate() - 7);
  const end = new Date();
  end.setDate(end.getDate() + 30);

  const adRows = ADS.map((ad) => ({
    title: ad.title,
    image_path: imagePathFor[ad.slug],
    link_url: ad.link_url,
    placement: placementFor[ad.status],
    // Only the approved campaign runs. A pending row must not render before
    // an admin has seen it, and a rejected one must not render at all.
    is_active: ad.status === "approved",
    status: ad.status,
    // Dates are chosen at approval, so only the running campaign has them.
    // A pending row with no start_date lands on today in AdRequestCard,
    // which is what an admin approving it now would pick anyway.
    start_date: ad.status === "approved" ? start.toISOString().slice(0, 10) : null,
    end_date: ad.status === "approved" ? end.toISOString().slice(0, 10) : null,
    is_paid_ad: true,
    // usePublicAds filters out payment_status 'unpaid', so an ad that is not
    // marked paid never renders however approved it looks — and useAdRequests
    // excludes unpaid rows from the review queue, so the pending one would
    // not even appear there.
    payment_status: "paid",
    amount_charged: ad.amount_charged,
    ...(durationMissing ? {} : { duration_months: ad.duration_months }),
    city: ad.city,
    review_notes: ad.review_notes,
    submitted_by: ids.brand,
    source: "brand",
    created_at: ago(ad.createdDaysAgo),
  }));

  await must("Creating ads", db.from("sponsored_listings").insert(adRows));

  for (const ad of ADS) {
    console.log(`  ad '${ad.status}' on '${placementFor[ad.status]}' — ${ad.title}`);
  }

  console.log("");

  console.log("  Done. Log in with any of:");
  for (const account of ACCOUNTS) {
    console.log(`    ${account.email}  /  ${DEMO_PASSWORD}`);
  }
  console.log("\n  Remove it all with: node scripts/clear-demo.mjs\n");
}

main().catch((error) => die(error.stack ?? String(error)));
