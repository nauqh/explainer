import { AskForm } from "@/components/AskForm";

export default function Home() {
  return (
    // One screen, no scrolling: sizes and gaps below scale with the screen's height as well as its width.
    <main className="blueprint h-dvh overflow-hidden">
      <div className="mx-auto flex h-full max-w-[64rem] flex-col px-4 sm:px-8">
        <p className="m-0 pt-[3svh] font-sans text-sm font-semibold text-white/85">Concept Explainer</p>
        <div className="flex min-h-0 flex-1 flex-col justify-center py-[3svh]">
          <AskForm />
        </div>
      </div>
    </main>
  );
}
