// Synthetic anchor only. This page never captures or transmits screen content.
if (import.meta.env.DEV) {
  (window as any).bitoSpotlight = {
    listen(fn: any) {
      fn({
        visible: false,
        guide: {
          text: "",
          phase: "thinking",
          anchor: { x: 200, y: 160, width: 130, height: 130 },
        },
      });
      return () => {};
    },
    painted() {},
  };
  await import("../../src/Spotlight");
}
