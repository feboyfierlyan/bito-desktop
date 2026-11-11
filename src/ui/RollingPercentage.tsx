import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  useVelocity,
} from "motion/react";

/** Odometer wheels roll in the direction of the actual percentage change. */
export function RollingPercentage({
  value,
  reduced,
}: {
  value: number;
  reduced: boolean;
}) {
  if (reduced) return <span aria-hidden="true">{value}%</span>;
  const places = value >= 100 ? [100, 10, 1] : value >= 10 ? [10, 1] : [1];
  return (
    <span className="rolling-percentage" aria-hidden="true">
      {places.map((place) => (
        <DigitWheel key={place} value={Math.floor(value / place)} />
      ))}
      <span className="rolling-percent-sign">%</span>
    </span>
  );
}

function DigitWheel({ value }: { value: number }) {
  const position = useMotionValue(0);
  const previous = useRef(0);
  const velocity = useVelocity(position);
  const blur = useTransform(
    velocity,
    (speed) => `blur(${Math.min(1.5, Math.abs(speed) * 0.055)}px)`,
  );
  useEffect(() => {
    const delta = value - previous.current;
    previous.current = value;
    const current = position.get();
    const currentDigit = ((current % 10) + 10) % 10;
    const targetDigit = value % 10;
    let distance =
      delta < 0
        ? -((currentDigit - targetDigit + 10) % 10)
        : (targetDigit - currentDigit + 10) % 10;
    // A carry ending on the same digit gets one turn, never several frantic loops.
    if (Math.abs(delta) >= 10 && Math.abs(distance) < 0.001)
      distance = delta < 0 ? -10 : 10;
    const animation = animate(position, current + distance, {
      duration: 0.95,
      ease: [0.2, 0.65, 0.2, 1],
    });
    return () => animation.stop();
  }, [value, position]);
  return (
    <motion.span className="rolling-digit" style={{ filter: blur }}>
      {Array.from({ length: 10 }, (_, digit) => (
        <WheelNumber key={digit} digit={digit} position={position} />
      ))}
    </motion.span>
  );
}

function WheelNumber({
  digit,
  position,
}: {
  digit: number;
  position: ReturnType<typeof useMotionValue<number>>;
}) {
  const offset = useTransform(
    position,
    (current) => ((digit - (current % 10) + 15) % 10) - 5,
  );
  const y = useTransform(offset, (distance) => `${distance * 62}%`);
  const opacity = useTransform(offset, (distance) => {
    const visible = Math.max(0, 1 - Math.abs(distance) / 0.9);
    return visible * visible * (3 - 2 * visible);
  });
  const blur = useTransform(
    offset,
    (distance) => `blur(${Math.min(2, Math.abs(distance) * 2)}px)`,
  );
  return (
    <motion.span
      className="rolling-digit-number"
      style={{ y, opacity, filter: blur }}
    >
      {digit}
    </motion.span>
  );
}
