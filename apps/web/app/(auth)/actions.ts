"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

async function sendOtp(formData: FormData, options: { signup: boolean }) {
  const email = String(formData.get("email") ?? "").trim();
  const page = options.signup ? "/signup" : "/login";

  if (!email || !email.includes("@")) {
    redirect(`${page}?error=${encodeURIComponent("Enter a valid email address")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: options.signup,
      emailRedirectTo: `${appOrigin()}/auth/confirm`,
    },
  });

  if (error) {
    redirect(`${page}?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`${page}?sent=${encodeURIComponent(email)}`);
}

export async function signUpWithEmail(formData: FormData) {
  await sendOtp(formData, { signup: true });
}

export async function signInWithEmail(formData: FormData) {
  await sendOtp(formData, { signup: false });
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appOrigin()}/auth/callback` },
  });

  if (error || !data.url) {
    redirect(`/login?error=${encodeURIComponent(error?.message ?? "OAuth unavailable")}`);
  }
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
