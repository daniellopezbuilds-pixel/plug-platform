import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPage,
  LegalSection,
  LegalText,
  LegalList,
} from "@/components/legal/LegalPage";
import {
  GOVERNING_LAW,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY,
} from "@/lib/legal";

// ⚠ DRAFT. Not reviewed by a lawyer. See the header of lib/legal.tsx.
//
// The advertising section describes how the ad flow actually works today:
// payment is taken up front via Stripe, and an advertisement only serves once
// an administrator has approved it AND it is inside its date window. If that
// order ever changes, change this page with it.

export const metadata: Metadata = {
  title: "Terms of Service | Sparx Plug Ecosystem",
  description:
    "The rules for using the Sparx Plug Ecosystem — accounts, credentials, content and advertising.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="The rules for using Sparx Plug, and what we each agree to."
    >
      <LegalSection title="Agreement">
        <LegalText>
          These terms are an agreement between you and {LEGAL_ENTITY}. By
          creating an account or using the Sparx Plug Ecosystem, you agree to
          them. If you do not agree, do not use the platform. Our{" "}
          <Link href="/privacy" className="text-accent-2-soft hover:underline">
            Privacy Policy
          </Link>{" "}
          forms part of this agreement.
        </LegalText>
      </LegalSection>

      <LegalSection title="What Sparx Plug is">
        <LegalText>
          Sparx Plug is a platform for the electrical trade. It lets
          electricians, contractors, instructors and brands create profiles,
          post and apply for work, message and connect with each other, share
          content, and buy advertising.
        </LegalText>

        <LegalText>
          We provide the venue.{" "}
          <strong className="text-gray-300">
            We are not an employer, an employment agency, a staffing agency, a
            union, or a licensed contractor,
          </strong>{" "}
          and we are not a party to any job, hire, contract or agreement reached
          between users. We do not supervise work, guarantee that any job or
          applicant is genuine, or take responsibility for what users do with
          each other.
        </LegalText>
      </LegalSection>

      <LegalSection title="Your account">
        <LegalText>
          You must be at least 18 years old to create an account. You agree to
          give accurate information when you sign up and to keep it current. You
          are responsible for keeping your password secure and for everything
          done through your account. Tell us promptly if you believe someone
          else has access to it.
        </LegalText>
      </LegalSection>

      <LegalSection title="Your credentials are your responsibility">
        <LegalText>
          Licence numbers, certifications, classifications, union status and
          years of experience are entered by you.{" "}
          <strong className="text-gray-300">
            You are responsible for the accuracy of everything you enter, and
            for keeping it up to date
          </strong>{" "}
          — including when a licence lapses, is suspended, or changes
          classification.
        </LegalText>

        <LegalText>
          We do not verify credentials with any licensing body, school or union.
          Displaying them is not a representation by us that they are genuine or
          current. Misrepresenting a contractor licence may also be unlawful in
          your jurisdiction, quite apart from these terms.
        </LegalText>

        <LegalText>
          If we believe credentials on an account are false, out of date or
          misleading, we may remove them, suspend the account, or both.
        </LegalText>
      </LegalSection>

      <LegalSection title="Jobs, hiring and work">
        <LegalText>
          Job posts, applications and hiring decisions are between the users
          involved. Before engaging anyone through the platform, satisfy
          yourself independently as to their licence, insurance, qualifications
          and suitability. We are not responsible for the conduct or work of any
          user, for payment disputes, or for anything arising out of a working
          relationship formed through the platform.
        </LegalText>
      </LegalSection>

      <LegalSection title="Content you post">
        <LegalText>
          You keep ownership of what you post. By posting it you give us a
          non-exclusive, worldwide, royalty-free licence to host, store,
          reproduce and display it for the purpose of operating and promoting
          the platform. You confirm that you have the rights to post what you
          post, and that it does not infringe anyone else&apos;s rights.
        </LegalText>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <LegalText>You agree not to:</LegalText>

        <LegalList>
          <li>
            Claim a licence, certification or qualification you do not hold, or
            impersonate another person or business
          </li>
          <li>
            Post content that is unlawful, misleading, harassing, hateful,
            threatening or obscene
          </li>
          <li>Post spam, or use the platform to send unsolicited bulk messages</li>
          <li>
            Solicit or advertise contracting work that you are not licensed to
            perform
          </li>
          <li>
            Scrape, harvest or bulk-export other users&apos; information, or use
            the platform to build a competing database
          </li>
          <li>
            Interfere with the platform&apos;s operation or security, or attempt
            to access accounts or data that are not yours
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="We can remove content and suspend accounts">
        <LegalText>
          <strong className="text-gray-300">
            We may remove or edit any content, and suspend or terminate any
            account, at our discretion
          </strong>{" "}
          — including content we believe is inaccurate, unlawful, misleading, or
          in breach of these terms, and accounts we believe are being used to
          break them. Where it is practical and appropriate we will say why, but
          we may act without prior notice when the circumstances warrant it.
        </LegalText>
      </LegalSection>

      <LegalSection title="Advertising and brand accounts">
        <LegalText>
          <strong className="text-gray-300">
            Advertising is paid for up front and is subject to review before it
            runs.
          </strong>{" "}
          Submitting and paying for a campaign does not put it live. Every
          advertisement is reviewed by an administrator, and it only starts
          serving once it has been approved and its scheduled start date has
          arrived.
        </LegalText>

        <LegalText>
          We may reject an advertisement, ask for changes, or remove one that is
          already running — for example where the creative is misleading, where
          it promotes unlicensed contracting or an unaccredited training
          provider, or where it is unsuitable to appear alongside trade content.
          Approving an advertisement is not an endorsement of the advertiser or
          of what it says.
        </LegalText>

        <LegalText>
          Advertising is sold at a flat rate for a placement and a run length,
          agreed at the time of purchase. We do not guarantee a number of
          impressions, clicks, leads or any particular position on the page. If
          we reject an advertisement before it runs, or remove it for a reason
          that is not your breach of these terms, we will refund the unused
          portion of what you paid.
        </LegalText>
      </LegalSection>

      <LegalSection title="Paid features and payments">
        <LegalText>
          Some features are paid. Payments are processed by Stripe, and by
          paying you also accept Stripe&apos;s terms. Subscriptions continue
          until you cancel them, and cancelling stops the next renewal rather
          than refunding the current period. Prices may change, and we will give
          notice before a change affects an existing subscription.
        </LegalText>
      </LegalSection>

      <LegalSection title="Ending your use of the platform">
        <LegalText>
          You can stop using the platform at any time and ask us to delete your
          account — see the{" "}
          <Link href="/privacy" className="text-accent-2-soft hover:underline">
            Privacy Policy
          </Link>{" "}
          for how. We may suspend or end your access as described above.
          Provisions that by their nature should survive — ownership,
          disclaimers, limitation of liability — survive termination.
        </LegalText>
      </LegalSection>

      <LegalSection title="Disclaimers">
        <LegalText>
          The platform is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;. To the fullest extent permitted by law we disclaim
          all warranties, express or implied, including fitness for a particular
          purpose and non-infringement. We do not warrant that the platform will
          be uninterrupted, error-free, or that any content on it is accurate.
        </LegalText>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <LegalText>
          To the fullest extent permitted by law, {LEGAL_ENTITY} is not liable
          for indirect, incidental, special, consequential or punitive damages,
          or for lost profits, lost work, or lost data, arising out of your use
          of the platform. Our total liability for any claim relating to the
          platform is limited to the amount you paid us in the twelve months
          before the claim arose.
        </LegalText>

        <LegalText>
          Some jurisdictions do not allow these limitations, in which case they
          apply to you only as far as the law allows.
        </LegalText>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <LegalText>
          We may update these terms as the platform changes. The date at the top
          of this page shows when they were last revised. Continuing to use the
          platform after a change means you accept the revised terms.
        </LegalText>
      </LegalSection>

      <LegalSection title="Governing law">
        <LegalText>
          These terms are governed by the laws of {GOVERNING_LAW}, without
          regard to its conflict of law rules.
        </LegalText>
      </LegalSection>

      <LegalSection title="Contact">
        <LegalText>
          Questions about these terms go to{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="text-accent-2-soft hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </LegalText>
      </LegalSection>
    </LegalPage>
  );
}
