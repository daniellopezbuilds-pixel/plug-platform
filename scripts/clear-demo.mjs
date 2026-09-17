/**
 * Remove everything scripts/seed-demo.mjs created.
 *
 *   node --env-file=.env.local scripts/clear-demo.mjs
 *
 * or explicitly:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://ztjlyucyoiagdwafgppf.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/clear-demo.mjs
 *
 *
 * THE ONLY THING THAT MAKES A ROW DELETABLE IS THE EMAIL DOMAIN
 *
 * Every account whose auth email ends @demo.sparxplug.com is in scope, and
 * nothing else is — not a name, not a date, not "looks like demo content".
 * Every row deleted below is reached from one of those profile ids through a
 * foreign key. A row belonging to a real account is never touched, even if the
 * seed created something next to it.
 *
 * The one case that needs care is conversations, which have no owner column
 * that settles it. A conversation is deleted only when EVERY participant is a
 * demo account. A conversation that a demo account shares with a real user is
 * left alone, and only the demo user's own messages and participant row go —
 * so the real user keeps their thread.
 *
 *
 * IT PRINTS BEFORE IT DELETES
 *
 * Counts every row it is about to remove, shows them, and requires the project
 * ref typed back. Nothing is written before that. Requires a TTY, so an answer
 * cannot be piped in.
 *
 *
 * ORDER MATTERS
 *
 * profiles.id references auth.users ON DELETE CASCADE, and several child
 * tables cascade from profiles — but not all of them do, and jobs.user_id has
 * no foreign key at all. So children are deleted explicitly, deepest first,
 * rather than relying on a cascade that only covers some of the graph.
 */

import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import process from "node:process";

const DEMO_DOMAIN = "@demo.sparxplug.com";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
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

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- Who is in scope ------------------------------------------------------

  const { data: userPage, error: listError } = await db.auth.admin.listUsers({
    perPage: 1000,
  });

  if (listError) die(`Could not list users: ${listError.message}`);

  const demoUsers = (userPage?.users ?? []).filter((u) =>
    u.email?.endsWith(DEMO_DOMAIN)
  );

  if (demoUsers.length === 0) {
    console.log(`\n  No ${DEMO_DOMAIN} accounts found on ${ref}. Nothing to do.\n`);
    return;
  }

  const demoIds = demoUsers.map((u) => u.id);
  const demoIdSet = new Set(demoIds);

  // --- Work out what would go ----------------------------------------------

  async function countIn(table, column) {
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .in(column, demoIds);

    if (error) die(`Counting ${table} failed: ${error.message}`);
    return count ?? 0;
  }

  const { data: demoPosts } = await db
    .from("posts")
    .select("id")
    .in("author_id", demoIds);
  const postIds = (demoPosts ?? []).map((p) => p.id);

  const { data: demoJobs } = await db
    .from("jobs")
    .select("id")
    .in("user_id", demoIds);
  const jobIds = (demoJobs ?? []).map((j) => j.id);

  // Applications reachable two ways: the demo worker applied, or someone
  // applied to a demo job. Both are seed output; the union is what goes.
  const { data: appsByWorker } = await db
    .from("applications")
    .select("id")
    .in("worker_id", demoIds);

  const { data: appsByJob } = jobIds.length
    ? await db.from("applications").select("id").in("job_id", jobIds)
    : { data: [] };

  const applicationIds = [
    ...new Set([
      ...(appsByWorker ?? []).map((a) => a.id),
      ...(appsByJob ?? []).map((a) => a.id),
    ]),
  ];

  // Conversations: only those where every participant is a demo account.
  const { data: demoParticipantRows } = await db
    .from("conversation_participants")
    .select("conversation_id")
    .in("user_id", demoIds);

  const touchedConversationIds = [
    ...new Set((demoParticipantRows ?? []).map((r) => r.conversation_id)),
  ];

  const { data: allParticipants } = touchedConversationIds.length
    ? await db
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", touchedConversationIds)
    : { data: [] };

  const participantsByConversation = new Map();
  for (const row of allParticipants ?? []) {
    const list = participantsByConversation.get(row.conversation_id) ?? [];
    list.push(row.user_id);
    participantsByConversation.set(row.conversation_id, list);
  }

  const demoOnlyConversationIds = [];
  const sharedConversationIds = [];

  for (const [conversationId, users] of participantsByConversation) {
    if (users.every((u) => demoIdSet.has(u))) {
      demoOnlyConversationIds.push(conversationId);
    } else {
      sharedConversationIds.push(conversationId);
    }
  }

  const { data: demoAds } = await db
    .from("sponsored_listings")
    .select("id, image_path")
    .in("submitted_by", demoIds);

  const adIds = (demoAds ?? []).map((a) => a.id);
  const adImagePaths = (demoAds ?? []).map((a) => a.image_path).filter(Boolean);

  const idList = demoIds.join(",");
  const { count: connectionCount } = await db
    .from("connections")
    .select("id", { count: "exact", head: true })
    .or(`requester_id.in.(${idList}),recipient_id.in.(${idList})`);

  const counts = {
    "auth users + profiles": demoIds.length,
    posts: postIds.length,
    "post comments (by demo authors)": await countIn("post_comments", "author_id"),
    "post reactions (by demo users)": await countIn("post_reactions", "user_id"),
    jobs: jobIds.length,
    applications: applicationIds.length,
    reviews: await countIn("reviews", "reviewer_id"),
    connections: connectionCount ?? 0,
    "conversations (demo-only)": demoOnlyConversationIds.length,
    "conversations (shared, kept)": sharedConversationIds.length,
    "messages (by demo senders)": await countIn("messages", "sender_id"),
    "sponsored listings": adIds.length,
    "ad images in storage": adImagePaths.length,
  };

  // --- Show it --------------------------------------------------------------

  console.log("\n  Clear demo data");
  console.log("  ----------------------------------------------------------");
  console.log(`  Project : ${ref}`);
  console.log(`  URL     : ${SUPABASE_URL}`);
  console.log(`  Matching: ${DEMO_DOMAIN} and nothing else`);
  console.log("");
  console.log("  Accounts:");
  for (const user of demoUsers) console.log(`    ${user.email}`);
  console.log("");
  console.log("  Will delete:");
  for (const [label, value] of Object.entries(counts)) {
    if (label.includes("kept")) continue;
    console.log(`    ${String(value).padStart(4)}  ${label}`);
  }

  if (sharedConversationIds.length > 0) {
    console.log("");
    console.log(
      `  ${sharedConversationIds.length} conversation(s) also involve a NON-demo`
    );
    console.log(
      "  account and will be KEPT. Only the demo participants and their"
    );
    console.log("  messages are removed from those threads.");
  }

  console.log("");

  const typed = await confirm(`  Type the project ref (${ref}) to delete: `);
  if (typed !== ref) die("Project ref did not match. Nothing was deleted.");

  console.log("");

  // --- Delete, deepest first ------------------------------------------------

  async function remove(label, query) {
    const { error } = await query;
    if (error) die(`Deleting ${label} failed: ${error.message}`);
    console.log(`  - ${label}`);
  }

  // Reviews before applications: reviews.application_id cascades, but deleting
  // explicitly keeps the printed plan honest about what went.
  if (applicationIds.length) {
    await remove(
      "reviews",
      db.from("reviews").delete().in("application_id", applicationIds)
    );
  }
  await remove(
    "reviews (by demo reviewers)",
    db.from("reviews").delete().in("reviewer_id", demoIds)
  );

  if (applicationIds.length) {
    await remove(
      "applications",
      db.from("applications").delete().in("id", applicationIds)
    );
  }

  if (jobIds.length) {
    await remove("jobs", db.from("jobs").delete().in("id", jobIds));
  }

  // Comments and reactions on demo posts, including any left by real users —
  // they cannot outlive the post they hang on.
  if (postIds.length) {
    await remove(
      "post comments on demo posts",
      db.from("post_comments").delete().in("post_id", postIds)
    );
    await remove(
      "post reactions on demo posts",
      db.from("post_reactions").delete().in("post_id", postIds)
    );
  }

  // Comments and reactions demo accounts left on OTHER people's posts.
  await remove(
    "demo comments elsewhere",
    db.from("post_comments").delete().in("author_id", demoIds)
  );
  await remove(
    "demo reactions elsewhere",
    db.from("post_reactions").delete().in("user_id", demoIds)
  );

  if (postIds.length) {
    await remove("posts", db.from("posts").delete().in("id", postIds));
  }

  // Messages: everything in a demo-only conversation, plus demo-authored
  // messages in shared threads.
  if (demoOnlyConversationIds.length) {
    await remove(
      "messages in demo conversations",
      db.from("messages").delete().in("conversation_id", demoOnlyConversationIds)
    );
  }
  await remove(
    "demo messages in shared conversations",
    db.from("messages").delete().in("sender_id", demoIds)
  );

  await remove(
    "conversation participants",
    db.from("conversation_participants").delete().in("user_id", demoIds)
  );

  if (demoOnlyConversationIds.length) {
    await remove(
      "demo-only conversations",
      db.from("conversations").delete().in("id", demoOnlyConversationIds)
    );
  }

  await remove(
    "connections (requested)",
    db.from("connections").delete().in("requester_id", demoIds)
  );
  await remove(
    "connections (received)",
    db.from("connections").delete().in("recipient_id", demoIds)
  );

  await remove(
    "notifications",
    db.from("notifications").delete().in("user_id", demoIds)
  );

  if (adIds.length) {
    // ad_events cascades from sponsored_listings, but only if 20260916120000
    // has been applied. Ignore a missing-table error rather than stopping.
    const { error: eventsError } = await db
      .from("ad_events")
      .delete()
      .in("advertisement_id", adIds);

    if (eventsError && !/does not exist|schema cache/i.test(eventsError.message)) {
      die(`Deleting ad events failed: ${eventsError.message}`);
    }

    await remove(
      "sponsored listings",
      db.from("sponsored_listings").delete().in("id", adIds)
    );
  }

  if (adImagePaths.length) {
    const { error: storageError } = await db.storage
      .from("sponsored-listings")
      .remove(adImagePaths);

    if (storageError) {
      console.log(`  ! ad images: ${storageError.message} (remove by hand)`);
    } else {
      console.log("  - ad images in storage");
    }
  }

  // Badges, roles and credentials cascade from profiles, which cascades from
  // auth.users. Deleted explicitly so a failure is reported here rather than
  // surfacing as a foreign key error on the user delete.
  //
  // The owning column is not the same in all four — employer_documents predates
  // the others and uses user_id — so it is named per table rather than guessed.
  // user_badges only exists where 20260916130000 has been applied; a missing
  // table is skipped, not fatal.
  const OWNED_TABLES = [
    { table: "user_badges", column: "profile_id" },
    { table: "role_credentials", column: "profile_id" },
    { table: "account_roles", column: "profile_id" },
    { table: "employer_documents", column: "user_id" },
  ];

  for (const { table, column } of OWNED_TABLES) {
    const { error } = await db.from(table).delete().in(column, demoIds);

    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) {
        console.log(`  · ${table} (not present, skipped)`);
        continue;
      }
      die(`Deleting ${table} failed: ${error.message}`);
    }

    console.log(`  - ${table}`);
  }

  await remove("profiles", db.from("profiles").delete().in("id", demoIds));

  for (const user of demoUsers) {
    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) die(`Deleting ${user.email} failed: ${error.message}`);
    console.log(`  - ${user.email}`);
  }

  console.log(`\n  Done. ${demoUsers.length} demo accounts removed from ${ref}.\n`);
}

main().catch((error) => die(error.stack ?? String(error)));
