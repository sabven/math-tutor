import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
      <div className="text-6xl animate-float">🍕</div>
      <h1 className="font-fun text-4xl font-bold text-purple-700 dark:text-purple-200">
        Fraction Quest
      </h1>
      <div className="flex gap-4">
        <Link
          href="/play"
          className="font-fun bg-purple-600 text-white rounded-full px-8 py-3 font-semibold text-lg shadow-lg shadow-purple-300 dark:shadow-purple-950 hover:bg-purple-700 active:scale-95 transition-all"
        >
          Play 🚀
        </Link>
        <Link
          href="/parent"
          className="rounded-full px-6 py-3 font-medium border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
        >
          Parent
        </Link>
      </div>
    </main>
  );
}
