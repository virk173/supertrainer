import { TrainerShell } from "@/components/trainer-shell";

export default function TrainerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TrainerShell>{children}</TrainerShell>;
}
