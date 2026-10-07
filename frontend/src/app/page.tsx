import { AskForm } from "@/components/AskForm";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[60rem] flex-col px-4 sm:px-8">
      <p className="m-0 pt-8 font-sans text-sm font-semibold">Concept Explainer</p>
      <div className="flex flex-1 flex-col justify-center py-16">
        <AskForm />
      </div>
    </main>
  );
}
