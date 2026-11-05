import type { ReactNode } from "react";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "@astryxdesign/theme-neutral/theme.css";

/** One light theme for every renderer, including native transparent overlays. */
export function BitoTheme({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode="light">
      <InternationalizationProvider
        locale="id-ID"
        overrides={{
          "id-ID": {
            "@astryx.dialog.close": "Tutup",
            "@astryx.popover.close": "Tutup menu",
            "@astryx.calendar.previousMonth": "Bulan sebelumnya",
            "@astryx.calendar.nextMonth": "Bulan berikutnya",
            "@astryx.dateInput.openCalendar": "Buka kalender",
            "@astryx.dateInput.closeCalendar": "Tutup kalender",
            "@astryx.appShell.skipToContent": "Ke konten utama",
          },
        }}
      >
        {children}
      </InternationalizationProvider>
    </Theme>
  );
}
