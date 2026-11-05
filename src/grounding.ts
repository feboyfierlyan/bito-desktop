/** Shared, dependency-free geometry and wire validation. All coordinates here
 * are window-relative normalized 0..1000, or desktop DIP (never retina pixels). */
export type ScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type GroundingResult = {
  status: "found" | "ambiguous" | "not_found";
  answer: string;
  label: string;
  confidence: number;
  box: number[];
  explanation?: {
    answer: string;
    label: string;
    confidence: number;
    box: number[];
  }[];
  guide?: {
    progress: "initial" | "waiting" | "advanced" | "done" | "blocked";
    expected: string;
    evidence: string;
    elementId: string;
    nextMenu?: { name: string; instruction: string; expected: string };
  };
};
export type ScreenElement = {
  id: string;
  role: string;
  name: string;
  enabled: boolean;
  bounds: ScreenRect;
  hitVerified?: boolean;
};
export type GuideContext = {
  goal: string;
  step: number;
  previous?: { label: string; instruction: string; expected: string };
};
export type GroundingView = {
  id: string;
  target: ScreenRect;
  label: string;
  visible: boolean;
};
export function isScreenQuestion(
  text: string,
  recentScreenContext = false,
): boolean {
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  const ui =
    /\b(tombol|button|menu|tab|plugins?|sisipkan|insert|format|daftar isi|table of contents|ekstensi|extensions?|ikon|icon|toolbar|sidebar|checkbox|dropdown|close|minimi[sz]e|maximi[sz]e)\b/;
  const locate =
    /\b(cara|di ?mana|mana|where|letak|posisi|tunjuk\w*|cari\w*|klik|click|pencet|tekan|buka|nemu|ketemu|aktif\w*|nonaktif\w*|tutup)\b/;
  const reference =
    /\b(di layar|layarku|layar ini|screen|jendela ini|aplikasi ini|yang ini|bagian ini|error ini|ini error|pesan error ini)\b/;
  // Follow-ups remain visual only briefly after an actual screen answer.
  const followUp =
    /^(?:oke[,. ]*|ok[,. ]*|udah[,. ]*|sudah[,. ]*)?(?:terus(?: apa| gimana)?|lanjut(?:in)?(?: dong)?|yang mana(?: ya| tuh| itu)?|mana(?: ya| tuh)?|(?:yang |di )?(?:sebelah )?(?:kiri|kanan|atas|bawah)(?: ya)?|tunjuk(?:in|kan)?(?: dong| lagi)?|belum (?:ada|ketemu|nemu|keliatan|kelihatan)|gak (?:ada|ketemu|nemu|keliatan|kelihatan)|(?:udah|sudah)(?: aku)? (?:klik|buka))(?:[?.! ]*)$/i;
  return (
    (recentScreenContext && followUp.test(s)) ||
    (ui.test(s) && locate.test(s)) ||
    (reference.test(s) &&
      /\b(apa|kenapa|mengapa|jelas\w*|bantu\w*|cara|mana|where|error|tunjuk\w*)\b/.test(
        s,
      ))
  );
}
export function parseGroundingResult(raw: unknown): GroundingResult {
  if (!raw || typeof raw !== "object") throw Error("invalid_grounding");
  const r = raw as GroundingResult;
  if (
    !["found", "ambiguous", "not_found"].includes(r.status) ||
    typeof r.answer !== "string" ||
    !r.answer.trim() ||
    r.answer.length > 2000 ||
    typeof r.label !== "string" ||
    r.label.length > 120 ||
    typeof r.confidence !== "number" ||
    !Number.isFinite(r.confidence) ||
    r.confidence < 0 ||
    r.confidence > 1 ||
    !Array.isArray(r.box) ||
    (r.box.length !== 0 && r.box.length !== 4) ||
    r.box.some((v) => !Number.isFinite(v) || v < 0 || v > 1000)
  )
    throw Error("invalid_grounding");
  if (r.status === "found") {
    const [top, left, bottom, right] = r.box;
    if (
      r.box.length !== 4 ||
      bottom <= top ||
      right <= left ||
      (bottom - top) * (right - left) > 650000 ||
      !r.label.trim()
    )
      throw Error("invalid_grounding");
  } else if (r.box.length) throw Error("invalid_grounding");
  if (r.guide !== undefined) {
    const g = r.guide;
    if (
      !g ||
      !["initial", "waiting", "advanced", "done", "blocked"].includes(
        g.progress,
      ) ||
      [g.expected, g.evidence, g.elementId].some(
        (v) => typeof v !== "string",
      ) ||
      g.expected.length > 500 ||
      g.evidence.length > 800 ||
      g.elementId.length > 80 ||
      (["done", "blocked"].includes(g.progress) && r.status === "found")
    )
      throw Error("invalid_grounding");
    if (g.nextMenu !== undefined) {
      const n = g.nextMenu;
      if (
        !n ||
        typeof n !== "object" ||
        typeof n.name !== "string" ||
        !n.name.trim() ||
        n.name.length > 120 ||
        typeof n.instruction !== "string" ||
        !n.instruction.trim() ||
        n.instruction.length > 220 ||
        typeof n.expected !== "string" ||
        !n.expected.trim() ||
        n.expected.length > 500
      )
        throw Error("invalid_grounding");
    }
  }
  const explanation: NonNullable<GroundingResult["explanation"]> = [];
  if (r.explanation !== undefined) {
    if (!Array.isArray(r.explanation) || r.explanation.length > 5)
      throw Error("invalid_grounding");
    for (const region of r.explanation) {
      if (!region || typeof region !== "object" || region.answer?.length > 280)
        throw Error("invalid_grounding");
      const checked = parseGroundingResult({
        ...region,
        status: "found",
        guide: undefined,
        explanation: undefined,
      });
      // The same visible-evidence/geometry threshold applies to tour stops.
      if (checked.status === "found")
        explanation.push({
          answer: checked.answer,
          label: checked.label,
          confidence: checked.confidence,
          box: checked.box,
        });
    }
  }
  // Validate the entire wire object before downgrading an uncertain detection.
  if (r.status === "found" && r.confidence < 0.84)
    return {
      status: "ambiguous",
      box: [],
      label: "",
      confidence: r.confidence,
      answer:
        "Aku belum yakin bagian yang kamu maksud. Bisa sebut nama atau cirinya?",
      ...(r.guide
        ? {
            guide: {
              progress: "blocked" as const,
              expected: "",
              evidence: "",
              elementId: "",
            },
          }
        : {}),
    };
  return {
    status: r.status,
    answer: r.answer.trim(),
    label: r.label.trim(),
    confidence: r.confidence,
    box: [...r.box],
    ...(explanation.length ? { explanation } : {}),
    ...(r.guide ? { guide: { ...r.guide } } : {}),
  };
}
/** Resolve model-selected native IDs only from this exact observation. Never
 * accept an invented ID or use native bounds outside the captured frame. */
export function resolveGroundingTarget(
  result: GroundingResult,
  frame: ScreenRect,
  elements: ScreenElement[],
) {
  const id = result.guide?.elementId;
  if (!id) return targetInDesktop(result, frame);
  const element = elements.find((e) => e.id === id && e.enabled);
  if (
    !element ||
    result.status !== "found" ||
    !containsScreenRect(frame, element.bounds)
  )
    return null;
  const visual = targetInDesktop(result, frame);
  // Native and visual evidence must agree; accessibility can include occluded items.
  if (
    !visual ||
    !containsScreenRect(
      {
        x: visual.x - 24,
        y: visual.y - 24,
        width: visual.width + 48,
        height: visual.height + 48,
      },
      element.bounds,
    )
  )
    return null;
  return element.bounds;
}
export function targetInDesktop(
  result: GroundingResult,
  window: ScreenRect,
): ScreenRect | null {
  if (result.status !== "found") return null;
  const [top, left, bottom, right] = result.box;
  return {
    x: window.x + (left * window.width) / 1000,
    y: window.y + (top * window.height) / 1000,
    width: ((right - left) * window.width) / 1000,
    height: ((bottom - top) * window.height) / 1000,
  };
}
export function sameScreenRect(
  a: ScreenRect,
  b: ScreenRect,
  tolerance = 2,
): boolean {
  return (["x", "y", "width", "height"] as const).every(
    (k) => Math.abs(a[k] - b[k]) <= tolerance,
  );
}
export function containsScreenRect(area: ScreenRect, r: ScreenRect): boolean {
  return (
    r.x >= area.x &&
    r.y >= area.y &&
    r.x + r.width <= area.x + area.width &&
    r.y + r.height <= area.y + area.height
  );
}
export function placeGuideBubble(
  pet: ScreenRect,
  area: ScreenRect,
  target?: ScreenRect,
  size = { width: 300, height: 210 },
) {
  const width = Math.min(size.width, area.width - 24),
    height = Math.min(size.height, area.height - 44);
  const clamp = (v: number, low: number, high: number) =>
    Math.max(low, Math.min(high, v));
  const points = [
    {
      side: "right" as const,
      x: pet.x + pet.width + 14,
      y: pet.y + pet.height * 0.38,
    },
    {
      side: "left" as const,
      x: pet.x - width - 14,
      y: pet.y + pet.height * 0.38,
    },
    {
      side: "above" as const,
      x: pet.x + pet.width / 2 - width / 2,
      y: pet.y - height - 14,
    },
    {
      side: "below" as const,
      x: pet.x + pet.width / 2 - width / 2,
      y: pet.y + pet.height + 14,
    },
  ].map((p) => ({
    ...p,
    x: clamp(p.x, area.x + 12, area.x + area.width - width - 12),
    y: clamp(p.y, area.y + 32, area.y + area.height - height - 12),
    width,
    height,
  }));
  const overlap = (p: ScreenRect, r: ScreenRect) =>
    Math.max(0, Math.min(p.x + p.width, r.x + r.width) - Math.max(p.x, r.x)) *
    Math.max(0, Math.min(p.y + p.height, r.y + r.height) - Math.max(p.y, r.y));
  return points.sort(
    (a, b) =>
      (target ? overlap(a, target) - overlap(b, target) : 0) ||
      overlap(a, pet) - overlap(b, pet),
  )[0];
}
export function besideTarget(
  target: ScreenRect,
  pet: ScreenRect,
  area: ScreenRect,
  accompanying: (position: ScreenRect) => ScreenRect[] = () => [],
): ScreenRect {
  const clamp = (n: number, low: number, high: number) =>
    Math.min(Math.max(low, high), Math.max(low, n));
  const gap = 18;
  const candidates = [
    {
      x: target.x + target.width + gap,
      y: target.y + target.height / 2 - pet.height / 2,
    },
    {
      x: target.x - pet.width - gap,
      y: target.y + target.height / 2 - pet.height / 2,
    },
    {
      x: target.x + target.width / 2 - pet.width / 2,
      y: target.y + target.height + gap,
    },
    {
      x: target.x + target.width / 2 - pet.width / 2,
      y: target.y - pet.height - gap,
    },
  ].map((p) => ({
    ...pet,
    x: Math.round(clamp(p.x, area.x, area.x + area.width - pet.width)),
    y: Math.round(clamp(p.y, area.y, area.y + area.height - pet.height)),
  }));
  const overlap = (p: ScreenRect) =>
    Math.max(
      0,
      Math.min(p.x + p.width, target.x + target.width) -
        Math.max(p.x, target.x),
    ) *
    Math.max(
      0,
      Math.min(p.y + p.height, target.y + target.height) -
        Math.max(p.y, target.y),
    );
  const covered = (p: ScreenRect) =>
    overlap(p) + accompanying(p).reduce((n, r) => n + overlap(r), 0);
  // Keeping the current position is a fallback only when every nearby
  // placement would cover the control with either Bito or the chat panel.
  if (candidates.every((p) => covered(p) > 0) && containsScreenRect(area, pet))
    candidates.push(pet);
  return candidates.sort(
    (a, b) =>
      covered(a) - covered(b) ||
      Math.hypot(a.x - pet.x, a.y - pet.y) -
        Math.hypot(b.x - pet.x, b.y - pet.y),
  )[0];
}
/** Small image comparisons tolerate antialiasing/caret blink, but reject a
 * page navigation, scroll, popup or changed content before pointing. */
export function imageChanged(before: Uint8Array, after: Uint8Array): boolean {
  if (!before.length || before.length !== after.length) return true;
  let changed = 0,
    count = 0;
  for (let i = 0; i < before.length; i += 4) {
    count++;
    if (
      Math.abs(before[i] - after[i]) +
        Math.abs(before[i + 1] - after[i + 1]) +
        Math.abs(before[i + 2] - after[i + 2]) >
      90
    )
      changed++;
  }
  return changed / count > 0.035;
}
