import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPage,
  LegalSection,
  LegalText,
  LegalList,
} from "@/components/legal/LegalPage";
import { LEGAL_CONTACT_EMAIL, LEGAL_ENTITY } from "@/lib/legal";

// ⚠ DRAFT. Not reviewed by a lawyer. See the header of lib/legal.tsx.
//
// The field lists below were written against what the app actually collects —
// lib/signupRoles.tsx for the signup fields, the profiles columns in
// docs/schema-inventory.md, and the three storage buckets. If you add a field
// that collects something new about a person, it belongs here too.

export const metadata: Metadata = {
  title: "Privacy Policy | Sparx Plug Ecosystem",
  description:
    "What Sparx Plug collects, why we collect it, who it is shared with, and how to request deletion.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="What we collect, why we collect it, and how to get it deleted."
    >
      <LegalSection title="Who this covers">
        <LegalText>
          This policy applies to the Sparx Plug Ecosystem web application and to
          the accounts, profiles and content within it. It describes how{" "}
          {LEGAL_ENTITY} handles personal information about the people who use
          the platform — electricians, contractors, instructors and brands.
        </LegalText>
      </LegalSection>

      <LegalSection title="Information you give us">
        <LegalText>
          <strong className="text-gray-300">Account details.</strong> When you
          create an account we collect your first and last name, email address,
          and contact number. Your password is handled by our authentication
          provider and stored only as a cryptographic hash — we never see or
          store the password itself.
        </LegalText>

        <LegalText>
          <strong className="text-gray-300">
            Professional and credential details.
          </strong>{" "}
          Depending on the kind of account you choose, we collect some or all of:
        </LegalText>

        <LegalList>
          <li>Contractor licence numbers and the name of the certification</li>
          <li>Certificates held, and subjects or programmes taught</li>
          <li>Trade, classification and years of experience</li>
          <li>Company or employer name</li>
          <li>Union status</li>
          <li>Location, a short bio, and a profile or company image</li>
          <li>A resume, if you choose to upload one</li>
        </LegalList>

        <LegalText>
          <strong className="text-gray-300">Brand and advertiser details.</strong>{" "}
          Brand accounts additionally provide a brand name, website, category
          and billing contact, along with the images and destination links used
          in their advertising.
        </LegalText>

        <LegalText>
          <strong className="text-gray-300">Content you create.</strong> Posts,
          comments and reactions, direct messages, job posts, job applications,
          reviews, and connection requests are all stored so the platform can
          show them to the people they are meant for.
        </LegalText>
      </LegalSection>

      <LegalSection title="Information collected automatically">
        <LegalText>
          We record standard server and application logs, and we count
          advertisement impressions and clicks so that advertisers can be told
          how their campaigns performed. Advertising measurement is recorded
          against the advertisement, not against a named individual.
        </LegalText>
      </LegalSection>

      <LegalSection title="Why we collect it">
        <LegalList>
          <li>To create your account, sign you in, and keep it secure</li>
          <li>
            To show your profile and the credentials you have entered to other
            users of the platform
          </li>
          <li>
            To connect workers with jobs, and employers with applicants, and to
            let people message and connect with each other
          </li>
          <li>To take payment for paid features and advertising</li>
          <li>
            To review advertising before it runs, and to choose which audience
            segment an advertisement is shown to
          </li>
          <li>
            To investigate abuse, enforce our Terms of Service, and meet legal
            obligations
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Credentials are self-reported">
        <LegalText>
          Licence numbers, certifications, union status and years of experience
          are entered by the account holder. We do not currently verify them
          with any licensing body or union. They are displayed to other users as
          claims made by that person, not as facts confirmed by us. Please treat
          them accordingly, and verify independently before relying on them.
        </LegalText>
      </LegalSection>

      <LegalSection title="Payments are handled by Stripe">
        <LegalText>
          Paid features and advertising are processed by Stripe. When you pay,
          you are taken to a payment page hosted by Stripe and you enter your
          card details there.{" "}
          <strong className="text-gray-300">
            We never receive or store your card number, expiry date or security
            code.
          </strong>
        </LegalText>

        <LegalText>
          What we do store is the outcome: whether a subscription is active,
          whether an advertisement has been paid for, the amount charged, and
          the identifiers Stripe gives us to reconcile a payment with an
          account. Stripe handles your payment information under its own privacy
          policy, at{" "}
          <a
            href="https://stripe.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-2-soft hover:underline"
          >
            stripe.com/privacy
          </a>
          .
        </LegalText>
      </LegalSection>

      <LegalSection title="Where your data is stored">
        <LegalText>
          Authentication, the database and uploaded files are hosted on
          Supabase. That covers your login credentials, your profile and
          content, and files you upload such as resumes, company logos and
          banners, and advertisement images. Access is restricted at the
          database level so that accounts can only read the records they are
          entitled to.
        </LegalText>
      </LegalSection>

      <LegalSection title="Signing in">
        <LegalText>
          Sign-in is by email address and password. If we offer sign-in with a
          Google Account, choosing it means we receive your name, email address
          and profile picture from Google, and we use them only to create and
          identify your Sparx Plug account. We do not request or receive access
          to your Gmail, Drive, Calendar, Contacts or any other Google service,
          and we do not use Google account data for advertising.
        </LegalText>
      </LegalSection>

      <LegalSection title="Who can see your information">
        <LegalList>
          <li>
            <strong className="text-gray-300">Other users.</strong> Your
            profile, credentials, trade, location and public content are visible
            to other signed-in users — that is what the platform is for.
          </li>
          <li>
            <strong className="text-gray-300">People you message.</strong>{" "}
            Direct messages are visible to the participants in that conversation.
          </li>
          <li>
            <strong className="text-gray-300">Our administrators,</strong> who
            review advertising, verification documents and reported content.
          </li>
          <li>
            <strong className="text-gray-300">Our service providers</strong> —
            Supabase and Stripe — to the extent needed to run the platform.
          </li>
          <li>
            <strong className="text-gray-300">Legal requests,</strong> where we
            are required by law to disclose information.
          </li>
        </LegalList>

        <LegalText>
          We do not sell your personal information. Advertisers choose an
          audience segment — for example, contractors in a given area — and
          their advertisement is shown to people who match it. Advertisers do
          not receive your name, contact details or any other personal
          information as part of that.
        </LegalText>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <LegalText>
          We keep your account information for as long as your account exists.
          After an account is deleted we may retain a limited amount of data
          where we have to — records of payments for accounting and tax
          purposes, and information needed to resolve a dispute or enforce our
          Terms.
        </LegalText>
      </LegalSection>

      <LegalSection title="Requesting a copy, a correction, or deletion">
        <LegalText>
          You can edit most of your profile information yourself from the
          Profile page while signed in.
        </LegalText>

        <LegalText>
          To request a copy of your data, a correction, or deletion of your
          account, email{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="text-accent-2-soft hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          from the email address on the account, and say what you would like us
          to do. We will confirm the request and action it within 30 days.
        </LegalText>

        <LegalText>
          Deleting your account removes your profile, your uploaded files and
          your content from the platform. Messages you sent may remain visible
          to the person who received them, and anonymised records may be
          retained as described above.
        </LegalText>
      </LegalSection>

      <LegalSection title="Security">
        <LegalText>
          Traffic to the platform is encrypted in transit, passwords are stored
          only as hashes, and database access is restricted per account at the
          database level. No system is perfectly secure, and we cannot guarantee
          that a determined attacker will never obtain data. If a breach affects
          your information, we will tell you.
        </LegalText>
      </LegalSection>

      <LegalSection title="Children">
        <LegalText>
          The platform is intended for people in the electrical trade and is not
          directed at children. You must be at least 18 years old to create an
          account.
        </LegalText>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <LegalText>
          We may update this policy as the platform changes. The date at the top
          of this page shows when it was last revised. If a change materially
          affects how we handle your information, we will make a reasonable
          effort to tell you.
        </LegalText>
      </LegalSection>

      <LegalSection title="Contact">
        <LegalText>
          Questions about this policy, or about your information, go to{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="text-accent-2-soft hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Our{" "}
          <Link href="/terms" className="text-accent-2-soft hover:underline">
            Terms of Service
          </Link>{" "}
          cover the rules for using the platform.
        </LegalText>
      </LegalSection>
    </LegalPage>
  );
}
