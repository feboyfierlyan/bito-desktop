import type { SelectedArea } from "../src/area-selection";
export type AreaImage = {
  mimeType: "image/jpeg";
  data: string;
  width: number;
  height: number;
};
export type AreaContext = SelectedArea & {
  image: AreaImage;
  owner: string;
  startMessage?: string;
};
/** One explicit selection, in memory only. No screenshots in AppState/SQLite.
 * Drafts expire while idle and are consumed once when sent. */
export class SelectedAreaContext {
  private value?: AreaContext;
  private expires = 0;
  constructor(
    private clock = Date.now,
    private ttl = 15 * 60_000,
  ) {}
  set(value: AreaContext) {
    this.value = value;
    this.expires = this.clock() + this.ttl;
  }
  get(owner: string, touch = false) {
    if (!this.value) return;
    if (this.value.owner !== owner || this.clock() >= this.expires) {
      this.clear();
      return;
    }
    if (touch) this.expires = this.clock() + this.ttl;
    return this.value;
  }
  take(owner: string) {
    const value = this.get(owner);
    this.clear();
    return value;
  }
  summary(owner: string): SelectedArea | undefined {
    const v = this.get(owner);
    return v
      ? {
          id: v.id,
          capturedAt: v.capturedAt,
          width: v.width,
          height: v.height,
          ...(v.thumbnail ? { thumbnail: v.thumbnail } : {}),
        }
      : undefined;
  }
  expire(owner: string) {
    const had = !!this.value;
    this.get(owner);
    return had && !this.value;
  }
  clear() {
    this.value = undefined;
    this.expires = 0;
  }
}
