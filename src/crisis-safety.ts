/**
 * Crisis & acute self-harm safety support for Indonesian users (BITO-006).
 * Safety always overrides persona brevity, humor, or "no advice" constraints.
 */
export const CRISIS_HELPLINES = [
  {
    id: "healing119",
    title: "Kemenkes Healing119 · 119 ext. 8",
    subtitle: "Layanan konseling krisis kesehatan jiwa gratis 24 jam",
    url: "https://healing119.id",
    actionLabel: "Buka healing119.id",
  },
  {
    id: "emergency112",
    title: "Panggilan Darurat Nasional · 112",
    subtitle: "Layanan darurat medis & keselamatan 24 jam di Indonesia",
  },
] as const;

const CRISIS_SIGNAL_RE =
  /\b(?:(?:mau|pengen|ingin)\s+(?:bunuh\s+diri(?:ku|nya)?|mati\s+(?:aja|saja)|mengakhiri\s+hidup(?:ku|nya)?)|bunuh\s+diri(?:ku|nya)?|(?:nyakitin|menyakiti|lukain|melukai)\s+diri(?:\s+sendiri|ku|nya)|self[\s-]?harm|kill\s+myself|end\s+my\s+life|suicide|suicidal|lebih\s+baik\s+(?:aku|gue|gw|gua|saya)\s+mati)\b/i;

export function hasCrisisSignal(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return CRISIS_SIGNAL_RE.test(text.slice(0, 8000));
}

export function crisisFallbackReply(): string {
  return [
    "Aku dengar kamu lagi menanggung beban yang berat banget sekarang, dan kamu nggak harus menghadapinya sendirian.",
    "Sebagai AI, aku nggak bisa menggantikan pendampingan manusia di situasi darurat keselamatan diri. Tolong hubungi orang terdekat yang kamu percaya (keluarga, sahabat, atau konselor kampus), atau layanan bantuan krisis resmi gratis 24 jam di Indonesia: **Kemenkes Healing119 di 119 ext. 8** (https://healing119.id) atau **Darurat 112**.",
  ].join("[[BITO_BUBBLE]]");
}
