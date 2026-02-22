import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Remaps FDP yellow #FFED00 → #c4a900 for readability on white backgrounds. All other values pass through unchanged. */
export function fixColor(hex: string): string {
  return hex === "#FFED00" ? "#c4a900" : hex;
}
