import { useCallback, useEffect, useRef, useState } from "react";
import type { PreferenceGroup, preferenceWriter } from "./preference-writer";

export function usePreferenceDraft<T extends object>(
  group: PreferenceGroup,
  server: T,
  writer: ReturnType<typeof preferenceWriter>,
) {
  const [draft, setDraft] = useState(server);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const confirmed = useRef(server);
  confirmed.current = server;
  const dirty = useRef(
    new Map<keyof T, { value: T[keyof T]; revision: number }>(),
  );
  const failed = useRef(
    new Map<keyof T, { value: T[keyof T]; revision: number }>(),
  );
  const timers = useRef(
    new Map<
      keyof T,
      { timer?: ReturnType<typeof setTimeout>; run: () => Promise<void> }
    >(),
  );
  const sequence = useRef(0),
    alive = useRef(true),
    savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const send = useCallback(
    async (key: keyof T, value: T[keyof T], revision: number) => {
      timers.current.delete(key);
      if (alive.current) setStatus("saving");
      const result = await writer.write(group, { [key]: value });
      if (!alive.current || dirty.current.get(key)?.revision !== revision)
        return;
      if (result.ok) {
        dirty.current.delete(key);
        failed.current.delete(key);
        setErrors((old) => {
          const next = { ...old };
          delete next[String(key)];
          return next;
        });
        setStatus(dirty.current.size ? "saving" : "saved");
        clearTimeout(savedTimer.current);
        if (!dirty.current.size)
          savedTimer.current = setTimeout(() => setStatus("idle"), 1800);
      } else {
        if (typeof value === "boolean") {
          failed.current.set(key, { value, revision });
          dirty.current.delete(key);
          setDraft((old) => ({ ...old, [key]: confirmed.current[key] }));
        }
        setStatus("error");
        setErrors((old) => ({
          ...old,
          [String(key)]: result.error || "Perubahan belum tersimpan.",
        }));
      }
    },
    [writer, group],
  );
  const edit = <K extends keyof T>(
    key: K,
    value: T[K],
    delay: number | "commit" = 0,
    validation?: string,
  ) => {
    const previous = timers.current.get(key);
    if (previous) clearTimeout(previous.timer);
    timers.current.delete(key);
    const revision = ++sequence.current;
    failed.current.delete(key);
    dirty.current.set(key, { value, revision });
    setDraft((old) => ({ ...old, [key]: value }));
    clearTimeout(savedTimer.current);
    setErrors((old) => {
      const next = { ...old };
      if (validation) next[String(key)] = validation;
      else delete next[String(key)];
      return next;
    });
    if (validation) {
      setStatus("error");
      return;
    }
    setStatus("saving");
    const run = () => send(key, value, revision);
    if (delay === "commit") timers.current.set(key, { run });
    else if (delay)
      timers.current.set(key, { timer: setTimeout(run, delay), run });
    else void run();
  };
  const flush = useCallback(async () => {
    const pending = Array.from(timers.current.values());
    timers.current.clear();
    await Promise.all(
      pending.map((item) => {
        clearTimeout(item.timer);
        return item.run();
      }),
    );
    await writer.flush();
    return dirty.current.size === 0;
  }, [writer]);
  const retry = async () => {
    for (const [key, { value, revision }] of [
      ...failed.current,
      ...dirty.current,
    ]) {
      if (group === "profile" && key === "name" && !String(value).trim())
        continue;
      const pending = timers.current.get(key);
      if (pending) clearTimeout(pending.timer);
      dirty.current.set(key, { value, revision });
      await send(key, value, revision);
    }
  };
  useEffect(() => {
    setDraft(() => {
      const next = { ...server };
      for (const [key, { value }] of dirty.current) next[key] = value;
      return next;
    });
  }, [server]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(savedTimer.current);
      void flush();
    };
  }, [flush]);
  return { draft, status, errors, edit, flush, retry };
}
