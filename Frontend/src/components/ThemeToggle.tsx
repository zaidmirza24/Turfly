import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle() {
  const { isDark, toggle } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="h-10 w-10 rounded-xl"
    >
      {isDark ? (
        <Sun className="h-5 w-5 transition-all text-amber-400" />
      ) : (
        <Moon className="h-5 w-5 transition-all text-primary" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
