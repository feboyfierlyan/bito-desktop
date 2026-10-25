import type { Reply } from "./shared";

export type PreferenceGroup = "profile" | "settings";
// Serialize writes; each request contains only edited fields, never a stale snapshot.
export function preferenceWriter(
  write: (name: string, patch: object) => Promise<Reply>,
) {
  let tail = Promise.resolve();
  return {
    write(group: PreferenceGroup, patch: object) {
      const job = tail
        .then(() => write(`${group}-patch`, patch))
        .catch((): Reply => ({
          ok: false,
          error: "Perubahan belum tersimpan. Coba lagi.",
        }));
      tail = job.then(() => {});
      return job;
    },
    flush: () => tail,
  };
}
