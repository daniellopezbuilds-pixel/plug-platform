import Link from "next/link";
import { Card } from "@/components/ui/Card";

export function BrandDashboard() {
  return (
    <Card>
      <h2 className="text-2xl font-bold mb-3">Welcome to your brand workspace</h2>
      <p className="text-gray-300 mb-6">
        Branding deals are where you&apos;ll set up and run campaigns across the
        platform. Nothing to manage yet — campaigns are coming soon.
      </p>
      <Link
        href="/dashboard/branding-deals"
        className="inline-block bg-accent text-on-accent px-5 py-3 rounded-lg font-semibold"
      >
        Go to Branding deals
      </Link>
    </Card>
  );
}
