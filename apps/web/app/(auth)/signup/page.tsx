import { AuthCard } from "../auth-card";
import { signUpWithEmail } from "../actions";

export const metadata = { title: "Sign up — supertrainer" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <AuthCard
      title="Create your account"
      description="Start coaching with supertrainer — we'll email you a sign-in link."
      submitLabel="Sign up"
      emailAction={signUpWithEmail}
      footer={{
        text: "Already have an account?",
        linkLabel: "Log in",
        href: "/login",
      }}
      sent={sent}
      error={error}
    />
  );
}
