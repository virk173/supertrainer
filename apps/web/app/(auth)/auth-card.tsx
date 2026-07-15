import Link from "next/link";

import { Button } from "@supertrainer/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@supertrainer/ui/components/card";
import { Input } from "@supertrainer/ui/components/input";
import { Label } from "@supertrainer/ui/components/label";

import { signInWithGoogle } from "./actions";

interface AuthCardProps {
  title: string;
  description: string;
  submitLabel: string;
  emailAction: (formData: FormData) => Promise<void>;
  footer: { text: string; linkLabel: string; href: string };
  sent?: string;
  error?: string;
}

export function AuthCard({
  title,
  description,
  submitLabel,
  emailAction,
  footer,
  sent,
  error,
}: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sent ? (
            <p
              className="rounded-md bg-secondary p-3 text-sm"
              data-testid="otp-sent"
            >
              Check your email — we sent a sign-in link to{" "}
              <span className="font-medium">{sent}</span>.
            </p>
          ) : (
            <>
              {error ? (
                <p
                  className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                  data-testid="auth-error"
                >
                  {error}
                </p>
              ) : null}
              <form action={emailAction} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full">
                  {submitLabel}
                </Button>
              </form>
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <form action={signInWithGoogle}>
                <Button type="submit" variant="outline" className="w-full">
                  Continue with Google
                </Button>
              </form>
            </>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {footer.text}{" "}
            <Link href={footer.href} className="underline underline-offset-4">
              {footer.linkLabel}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
