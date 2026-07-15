import { AuthCard } from "../auth-card";
import { signInWithEmail } from "../actions";

export const metadata = { title: "Log in — supertrainer" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <AuthCard
      title="Welcome back"
      description="We'll email you a sign-in link."
      submitLabel="Log in"
      emailAction={signInWithEmail}
      footer={{
        text: "New to supertrainer?",
        linkLabel: "Sign up",
        href: "/signup",
      }}
      sent={sent}
      error={error}
    />
  );
}
