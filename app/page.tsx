import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-bold">Math Tutor</h1>
      <div className="flex gap-4">
        <Link href="/play" className="bg-blue-600 text-white rounded-full px-6 py-3 font-medium">
          Play
        </Link>
        <Link
          href="/parent"
          className="border border-neutral-300 dark:border-neutral-700 rounded-full px-6 py-3 font-medium"
        >
          Parent
        </Link>
      </div>
    </main>
  );
}
