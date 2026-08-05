"use client";

export default function PlayError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="text-6xl">😵</div>
      <p className="font-fun text-xl font-semibold text-purple-700 dark:text-purple-200">
        Couldn&apos;t load your questions. Let&apos;s try again.
      </p>
      <button
        onClick={reset}
        className="font-fun bg-purple-600 text-white rounded-full px-8 py-3 font-semibold text-lg shadow-lg shadow-purple-300 dark:shadow-purple-950 hover:bg-purple-700 active:scale-95 transition-all"
      >
        Retry
      </button>
    </div>
  );
}
