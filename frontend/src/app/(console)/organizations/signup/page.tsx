import Link from "next/link";
import { SignupForm } from "../../../../components/SignupForm";

export default function OrganizationSignupPage() {
  return (
    <div>
      <Link href="/organizations" className="text-xs text-text-muted hover:text-text-primary">
        ← Organizations
      </Link>

      <div className="mt-2 mb-6">
        <p className="font-mono text-xs uppercase tracking-widest text-text-muted">Control-Plane</p>
        <h1 className="text-lg font-semibold text-text-primary">Sign up a new organization</h1>
      </div>

      <SignupForm />
    </div>
  );
}
