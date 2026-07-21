import ChatUI from "@/components/ChatUI";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col px-6 py-8 lg:px-14 lg:py-10">
      <header className="mb-8">
        <p
          className="font-mono-tab text-[11px] mb-2"
          style={{ color: "var(--brass)" }}
        >
          SCALE YOUR OFFERS — INTERNAL
        </p>
        <h1
          className="text-3xl lg:text-4xl"
          style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}
        >
          Session Prep
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--slate)" }}>
          Build Tuesday &amp; Thursday coaching sessions in Patrick's voice.
        </p>
      </header>

      <div className="flex-1 min-h-[620px]">
        <ChatUI />
      </div>
    </main>
  );
}
