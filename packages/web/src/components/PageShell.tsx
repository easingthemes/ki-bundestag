import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageShellProps {
  children: ReactNode;
  sidebar?: ReactNode;
  fullWidth?: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
}

/**
 * Reusable page layout wrapper.
 * - Default: single column with max-width
 * - With sidebar: 2-column grid (main 2fr + sidebar 1fr)
 * - fullWidth: removes max-width constraint
 */
export function PageShell({ children, sidebar, fullWidth, title, subtitle, className }: PageShellProps) {
  return (
    <div className={cn(!fullWidth && "max-w-[1280px] mx-auto", className)}>
      {(title || subtitle) && (
        <div className="mb-6">
          {title && <h1>{title}</h1>}
          {subtitle && <p className="text-muted-foreground text-sm -mt-2">{subtitle}</p>}
        </div>
      )}
      {sidebar ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
          <div className="min-w-0">{children}</div>
          <aside className="flex flex-col gap-4">{sidebar}</aside>
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}
