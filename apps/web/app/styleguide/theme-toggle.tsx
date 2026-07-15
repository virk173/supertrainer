"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@supertrainer/ui/components/button";

export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      data-testid="theme-toggle"
    >
      {dark ? (
        <Sun aria-hidden="true" />
      ) : (
        <Moon aria-hidden="true" />
      )}
      {dark ? "Light" : "Dark"}
    </Button>
  );
}
