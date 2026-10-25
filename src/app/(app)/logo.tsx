export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true">
      <path d="M15 8v6M15 14L6.5 22M15 14v8M15 14l8.5 8" stroke="#1F6F66" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15" cy="6" r="4" fill="#1F6F66" />
      <circle cx="6" cy="24" r="3.2" fill="#E0973F" />
      <circle cx="15" cy="24" r="3.2" fill="#E0973F" />
      <circle cx="24" cy="24" r="3.2" fill="#E0973F" />
    </svg>
  );
}
