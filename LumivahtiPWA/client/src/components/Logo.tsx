import { Snowflake } from "lucide-react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Snowflake className="w-7 h-7 text-brand-primary" />
      <span className="text-lg font-bold text-brand-primary">Lumivahti</span>
    </div>
  );
}
