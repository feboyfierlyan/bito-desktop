/** Existing Bito artwork; the live pet keeps ownership of native animation. */
export function BitoMascot({ className = "" }: { className?: string }) {
  return (
    <span className={`bito-mascot ${className}`} aria-hidden="true">
      <span className="bito-mascot-art" />
    </span>
  );
}
