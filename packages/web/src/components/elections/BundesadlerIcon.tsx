interface BundesadlerIconProps {
  size?: number;
}

export function BundesadlerIcon({ size = 28 }: BundesadlerIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="rgba(255,215,0,0.9)">
      <path d="M12 2 C10 3 6 4 4 7 L7 8 C5 10 4 12 5 14 L8 13 C9 16 10 18 12 20 C14 18 15 16 16 13 L19 14 C20 12 19 10 17 8 L20 7 C18 4 14 3 12 2Z" />
    </svg>
  );
}
