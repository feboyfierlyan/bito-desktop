import type { AppState } from "../src/shared";

/** A failed local write must not escape a native drag/timer event handler. */
export function saveAppState(store: { save(state: AppState): void }, state: AppState) {
  try {
    store.save(state);
    return undefined;
  } catch (error) {
    const full = /database or disk is full|SQLITE_FULL|ENOSPC/i.test(String(error));
    return full
      ? "Penyimpanan penuh. Perubahan belum tersimpan. Biarkan Bito terbuka, kosongkan ruang, lalu coba simpan lagi."
      : "Perubahan belum tersimpan. Biarkan Bito terbuka dan coba simpan lagi.";
  }
}
