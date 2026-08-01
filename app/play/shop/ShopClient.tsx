"use client";

import { useState } from "react";
import Link from "next/link";

interface Perk {
  id: string;
  name: string;
  pointCost: number;
  icon: string | null;
}

interface RedemptionRow {
  id: string;
  perkName: string;
  status: "pending" | "granted";
  createdAt: string;
}

export function ShopClient({
  balance: initialBalance,
  perks,
  redemptions: initialRedemptions,
}: {
  balance: number;
  perks: Perk[];
  redemptions: RedemptionRow[];
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function redeem(perk: Perk) {
    setErrorMessage(null);
    setRedeemingId(perk.id);
    const res = await fetch("/api/redemptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perkId: perk.id }),
    });
    const data = await res.json();
    setRedeemingId(null);

    if (!res.ok) {
      setErrorMessage(
        data.error === "insufficient_points"
          ? "Not enough points yet — keep playing!"
          : "Couldn't redeem that right now."
      );
      return;
    }

    setBalance(data.balance);
    setRedemptions((prev) => [
      { id: data.redemption.id, perkName: perk.name, status: "pending", createdAt: new Date().toISOString() },
      ...prev,
    ]);
  }

  return (
    <main className="flex-1 flex flex-col items-center gap-6 p-6 max-w-2xl mx-auto w-full bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100 dark:from-indigo-950 dark:via-purple-950 dark:to-slate-950">
      <Link
        href="/"
        className="fixed top-4 left-4 z-50 flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-neutral-900/90 text-purple-700 dark:text-purple-200 px-4 py-2 text-sm font-semibold shadow-lg hover:bg-white dark:hover:bg-neutral-900 active:scale-95 transition-all"
      >
        🏠 Home
      </Link>

      <div className="flex w-full items-center justify-between mt-2">
        <h1 className="font-fun text-2xl font-semibold text-purple-700 dark:text-purple-200">
          🎁 Perk Shop
        </h1>
        <Link
          href="/play"
          className="text-sm font-semibold text-purple-600 dark:text-purple-300 underline"
        >
          Back to play
        </Link>
      </div>

      <div className="w-full rounded-3xl bg-white dark:bg-neutral-900 shadow-lg shadow-purple-200/50 dark:shadow-black/40 px-6 py-6 text-center">
        <p className="text-sm text-neutral-500">Your points</p>
        <p className="font-fun text-4xl font-bold text-amber-500">✨ {balance}</p>
      </div>

      {errorMessage && (
        <p className="text-rose-600 dark:text-rose-400 font-semibold">{errorMessage}</p>
      )}

      {perks.length === 0 ? (
        <p className="text-neutral-500">No perks yet — ask a parent to add some!</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 w-full">
          {perks.map((perk) => {
            const affordable = balance >= perk.pointCost;
            return (
              <div
                key={perk.id}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white dark:bg-neutral-900 shadow-md p-4 text-center"
              >
                <span className="text-3xl">{perk.icon || "🎁"}</span>
                <span className="font-fun font-semibold text-neutral-800 dark:text-neutral-100">
                  {perk.name}
                </span>
                <span className="text-amber-500 font-semibold">✨ {perk.pointCost}</span>
                <button
                  onClick={() => redeem(perk)}
                  disabled={!affordable || redeemingId === perk.id}
                  className="font-fun w-full mt-1 px-4 py-2 rounded-full bg-purple-600 text-white font-semibold text-sm shadow hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {redeemingId === perk.id ? "…" : affordable ? "Redeem" : "Not enough yet"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {redemptions.length > 0 && (
        <div className="w-full">
          <h2 className="font-fun text-lg font-semibold text-purple-700 dark:text-purple-200 mb-2">
            Your redemptions
          </h2>
          <div className="space-y-2">
            {redemptions.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl bg-white/70 dark:bg-neutral-900/70 px-4 py-2 text-sm"
              >
                <span className="text-neutral-700 dark:text-neutral-200">{r.perkName}</span>
                <span
                  className={
                    r.status === "granted"
                      ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "text-amber-600 dark:text-amber-400 font-semibold"
                  }
                >
                  {r.status === "granted" ? "✓ Granted" : "Waiting for parent"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
