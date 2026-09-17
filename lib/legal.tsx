// Shared values for /privacy and /terms.
//
// ⚠ THE TEXT OF BOTH PAGES IS A DRAFT AND HAS NOT BEEN REVIEWED BY A LAWYER.
// It was written to give Google OAuth verification something to point at and
// to provide basic cover. Every TODO below must be filled in with a real value,
// and both pages should be read by counsel, before either is relied on.
//
// They live here rather than inline because both pages use them and a contact
// address that is right on one page and stale on the other is worse than one
// that is wrong on both.

/**
 * Where privacy questions and deletion requests go.
 *
 * TODO: replace before launch.
 *
 * Deliberately an address that cannot exist — example.com is reserved by IANA
 * for exactly this — rather than a plausible guess like support@sparxplug.com.
 * A guess that happens to be wrong sends real deletion requests into a mailbox
 * nobody reads, and looks correct while doing it. This one fails loudly.
 */
export const LEGAL_CONTACT_EMAIL = "privacy@example.com";

/**
 * The party the Terms are between.
 *
 * TODO: replace with the registered legal name, e.g. "Sparx Plug LLC".
 * "Sparx Plug" on its own names the product, not a legal entity, and an
 * agreement needs a party that can actually be held to it.
 */
export const LEGAL_ENTITY = "Sparx Plug";

/**
 * TODO: confirm with counsel.
 *
 * California is the assumption only because the product is built around the
 * C-10 licence classification, which is a California one. That is an inference
 * from the schema, not a decision anyone has recorded.
 */
export const GOVERNING_LAW = "the State of California, United States";

/** Shown on both pages. Bump whenever the text changes materially. */
export const LEGAL_UPDATED = "17 September 2026";
