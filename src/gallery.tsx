// Dev-only component gallery: open http://127.0.0.1:5173/gallery.html while
// `npm run dev` is running. Not part of the production build inputs.
import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, Camera, Paperclip, Sun, Timer } from "lucide-react";
import "./ui/design-tokens.css";
import "./ui/next/next.css";
import "./gallery.css";
import {
  ApprovalCard,
  Button,
  Checkbox,
  Composer,
  ContextCard,
  EmptyState,
  IconButton,
  InsightCards,
  Loader,
  Message,
  RecommendationCard,
  Search,
  Segmented,
  SelectionActions,
  SidebarNav,
  Source,
  StreamingText,
  Suggestions,
  TaskRow,
  TextField,
  Thinking,
  Toggle,
  ToolChip,
} from "./ui/next";

const ANSWER =
  "Bab 2 kamu sudah kuat di teori, tapi belum ada penelitian terdahulu lima tahun terakhir. Mulai dari tiga jurnal dulu, lalu susun tabel perbandingannya.";

function Section({
  title,
  source,
  children,
}: {
  title: string;
  source: string;
  children: ReactNode;
}) {
  return (
    <section className="gx-section">
      <header>
        <h2>{title}</h2>
        <small>{source}</small>
      </header>
      <div className="gx-stage">{children}</div>
    </section>
  );
}

function useStream(text: string) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    if (length >= text.length) return;
    const timer = setTimeout(() => setLength((value) => value + 3), 30);
    return () => clearTimeout(timer);
  }, [length, text]);
  return {
    shown: text.slice(0, length),
    streaming: length < text.length,
    replay: () => setLength(0),
  };
}

function Gallery() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [toggle, setToggle] = useState(true);
  const [check, setCheck] = useState(true);
  const [tab, setTab] = useState("hari-ini");
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [nav, setNav] = useState("today");
  const [picked, setPicked] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [approval, setApproval] = useState<"ask" | "saved" | "cancelled">(
    "ask",
  );
  const [tasks, setTasks] = useState([
    { id: "a", title: "Cari 3 jurnal penelitian terdahulu", done: true },
    {
      id: "b",
      title: "Susun tabel perbandingan jurnal",
      done: false,
      due: "Kamis",
    },
    {
      id: "c",
      title: "Tulis ulang kerangka pikir",
      done: false,
      meta: "Bab 2",
    },
  ]);
  const [selected, setSelected] = useState<string[]>(["b", "c"]);
  const [elapsed, setElapsed] = useState(0);
  const stream = useStream(ANSWER);
  useEffect(() => {
    const timer = setInterval(
      () => setElapsed((value) => (value >= 9.9 ? 0 : value + 0.1)),
      100,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <main data-bito-ui="next" data-theme={theme} className="gx-root">
      <header className="gx-top">
        <img src="/icon.png" alt="" />
        <div>
          <h1>Bito UI</h1>
          <p>Galeri komponen tahap 1. Semua komponen memakai token --bx-*.</p>
        </div>
        <Segmented
          label="Tema"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Terang" },
            { value: "dark", label: "Gelap" },
          ]}
        />
      </header>

      <div className="gx-grid">
        <Section title="Warna" source="Dari maskot">
          <div className="gx-swatches">
            {[
              "paper",
              "card",
              "sunk",
              "leaf",
              "leaf-soft",
              "sprout",
              "cream",
              "blush",
              "blush-soft",
              "ink",
              "ink-2",
              "ink-3",
            ].map((name) => (
              <div key={name}>
                <i style={{ background: `var(--bx-${name})` }} />
                <small>{name}</small>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tombol" source="Dasar">
          <div className="gx-row">
            <Button variant="primary">Simpan</Button>
            <Button>Ubah</Button>
            <Button variant="ghost">Batal</Button>
            <Button variant="danger">Hapus</Button>
            <Button variant="primary" loading>
              Menyimpan
            </Button>
            <IconButton label="Ambil area layar">
              <Camera size={15} aria-hidden />
            </IconButton>
          </div>
        </Section>

        <Section title="Kontrol" source="Tabs sliding · transitions.dev">
          <div className="gx-row">
            <Segmented
              label="Tampilan"
              value={tab}
              onChange={setTab}
              options={[
                { value: "hari-ini", label: "Hari ini" },
                { value: "jadwal", label: "Jadwal" },
                { value: "fokus", label: "Fokus" },
              ]}
            />
            <Toggle
              checked={toggle}
              onChange={setToggle}
              label="Pengingat aktif"
            />
            <Checkbox
              checked={check}
              onChange={setCheck}
              label="Contoh centang"
            />
          </div>
        </Section>

        <Section title="Isian" source="Error state shake · transitions.dev">
          <div className="gx-col">
            <TextField label="Nama panggilan" placeholder="Mis. Febo" />
            <TextField
              label="Email"
              defaultValue="febo@"
              error="Email belum lengkap."
            />
          </div>
        </Section>

        <Section title="Loading State" source="beautifului · Loader prompt-kit">
          <Loader label="Membaca Bab 2…" elapsedSeconds={elapsed} />
        </Section>

        <Section
          title="Thinking"
          source="beautifului · Reasoning, Steps prompt-kit"
        >
          <Thinking
            defaultOpen
            durationSeconds={2}
            steps={[
              "Membaca lampiran Bab 2",
              "Mencocokkan dengan catatan dosen",
              "Menyusun langkah berikutnya",
            ]}
          />
        </Section>

        <Section
          title="Streaming Text"
          source="beautifului · Source prompt-kit"
        >
          <div className="gx-col">
            <Message from="bito">
              <StreamingText text={stream.shown} streaming={stream.streaming} />
              {!stream.streaming && <Source domain="garuda.kemdikbud.go.id" />}
            </Message>
            <div>
              <Button onClick={stream.replay}>Ulangi</Button>
            </div>
          </div>
        </Section>

        <Section title="Tool Chips" source="beautifului · Tool prompt-kit">
          <div className="gx-row">
            <ToolChip status="running" label="Menyimpan pengingat" />
            <ToolChip status="done" label="Pengingat disimpan" />
            <ToolChip
              status="error"
              label="Web tidak terjangkau"
              onRetry={() => {}}
            />
          </div>
        </Section>

        <Section
          title="Chat + Prompt Bar"
          source="beautifului · Prompt Input, Message, Suggestion prompt-kit"
        >
          <div className="gx-col">
            <Message from="user">
              {sent ?? "Dosen minta revisi Bab 2, mulai dari mana?"}
            </Message>
            <Message from="bito">
              <p>Mulai dari tiga jurnal terdahulu, baru tabel perbandingan.</p>
            </Message>
            <Suggestions
              items={["Pecah jadi langkah kecil", "Ingatkan Kamis"]}
              onPick={setDraft}
            />
            <Composer
              value={draft}
              onChange={setDraft}
              onSubmit={(text) => {
                setSent(text);
                setDraft("");
              }}
              context="Skripsi · Bab 2"
              maxLength={200}
              actions={
                <>
                  <IconButton label="Lampirkan file">
                    <Paperclip size={14} aria-hidden />
                  </IconButton>
                  <IconButton label="Ambil area layar">
                    <Camera size={14} aria-hidden />
                  </IconButton>
                </>
              }
            />
          </div>
        </Section>

        <Section title="Approval Card" source="beautifului">
          {approval === "ask" ? (
            <ApprovalCard
              title="Simpan pengingat ini?"
              description="Bito tidak menyimpan apa pun sebelum kamu setuju."
              detail={{
                badge: { top: "Kam", main: "26" },
                title: "Bimbingan Bab 2",
                text: "Kamis, 26 Nov · 10.00 · diingatkan 1 jam sebelumnya",
              }}
              confirmLabel="Simpan pengingat"
              onConfirm={() => setApproval("saved")}
              onCancel={() => setApproval("cancelled")}
              onEdit={() => {}}
            />
          ) : (
            <div className="gx-row">
              <ToolChip
                status={approval === "saved" ? "done" : "error"}
                label={
                  approval === "saved" ? "Pengingat disimpan" : "Dibatalkan"
                }
              />
              <Button onClick={() => setApproval("ask")}>Ulangi</Button>
            </div>
          )}
        </Section>

        <Section title="Recommendation Card" source="beautifului">
          <RecommendationCard
            title="Kerjakan tabel perbandingan jurnal dulu"
            confidence="medium"
            acceptLabel={accepted ? "Ditambahkan" : "Jadikan tugas"}
            onAccept={() => setAccepted(true)}
            onAlternatives={() => setAccepted(false)}
          >
            Bimbingan tinggal 3 hari dan dosen meminta bagian ini secara khusus.
          </RecommendationCard>
        </Section>

        <Section title="Insight Cards" source="beautifului">
          <InsightCards
            title="Minggu ini"
            insights={[
              {
                text: "Kamu menyelesaikan 5 dari 8 langkah Bab 2.",
                metrics: [
                  { label: "Selesai", value: "5", tone: "good" },
                  { label: "Tersisa", value: "3" },
                  { label: "Tenggat", value: "3 hari", tone: "warn" },
                ],
              },
              { text: "Kamu paling sering fokus pukul 20.00–22.00." },
            ]}
          />
        </Section>

        <Section title="Context Cards" source="beautifului">
          <div className="gx-col">
            <ContextCard
              title="Bab-2-revisi.pdf"
              meta="hlm. 14"
              excerpt="Penelitian terdahulu yang relevan perlu ditambah, terutama publikasi lima tahun terakhir yang membahas variabel yang sama."
              source="Lampiran"
            />
            <ContextCard
              title="Area layar"
              meta="baru saja"
              excerpt="Komentar dosen: “kerangka pikir belum menggambarkan hubungan antarvariabel”."
              source="Tangkapan layar"
            />
          </div>
        </Section>

        <Section
          title="Task Rows + Selection Actions"
          source="beautifului · Success check transitions.dev"
        >
          <div className="gx-col">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                {...task}
                selected={selected.includes(task.id)}
                onToggle={(done) =>
                  setTasks((list) =>
                    list.map((item) =>
                      item.id === task.id ? { ...item, done } : item,
                    ),
                  )
                }
              />
            ))}
            <div className="gx-center">
              <SelectionActions
                count={selected.length}
                onClear={() => setSelected([])}
                actions={[
                  { label: "Selesai", onClick: () => {} },
                  { label: "Pindah hari", onClick: () => {} },
                ]}
              />
              {selected.length === 0 && (
                <Button onClick={() => setSelected(["b", "c"])}>
                  Pilih dua tugas
                </Button>
              )}
            </div>
          </div>
        </Section>

        <Section title="Sidebar Nav" source="beautifului">
          <div className="gx-nav">
            <SidebarNav
              label="Ruang Kerja"
              current={nav}
              onSelect={setNav}
              items={[
                {
                  id: "today",
                  label: "Hari ini",
                  icon: <Sun size={15} aria-hidden />,
                  count: 3,
                },
                {
                  id: "schedule",
                  label: "Jadwal",
                  icon: <CalendarDays size={15} aria-hidden />,
                },
                {
                  id: "focus",
                  label: "Fokus",
                  icon: <Timer size={15} aria-hidden />,
                },
              ]}
            />
          </div>
        </Section>

        <Section title="Search" source="beautifului">
          <div className="gx-col">
            <Search
              onPick={(item) => setPicked(item.label)}
              items={[
                { id: "1", label: "Cari 3 jurnal penelitian terdahulu" },
                { id: "2", label: "Susun tabel perbandingan jurnal" },
                { id: "3", label: "Obrolan: revisi Bab 2" },
              ]}
            />
            {picked && <small>Dipilih: {picked}</small>}
          </div>
        </Section>

        <Section title="Keadaan kosong" source="Maskot">
          <EmptyState
            image="/icon.png"
            title="Belum ada langkah hari ini"
            text="Ceritakan revisimu, Bito bantu pecah jadi langkah kecil."
            action={<Button variant="primary">Mulai</Button>}
          />
        </Section>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Gallery />);
