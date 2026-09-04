"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

import { lockConsole } from "@/app/admin/actions";

export function LockButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await lockConsole();
        router.refresh();
      }}
    >
      <Lock />
      Lock
    </Button>
  );
}
