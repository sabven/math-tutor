import Link from "next/link";
import { familyLoginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <Link
        href="/"
        className="fixed top-4 left-4 z-50 rounded-full border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 px-4 py-2 text-sm font-medium bg-white dark:bg-neutral-900 shadow hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
      >
        ← Home
      </Link>
      <form action={familyLoginAction} className="flex flex-col gap-3 w-full max-w-xs">
        <h1 className="text-xl font-semibold text-center">Family Login</h1>
        <input
          type="text"
          name="username"
          placeholder="Username"
          autoFocus
          autoComplete="username"
          className="border rounded px-3 py-2"
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          className="border rounded px-3 py-2"
          required
        />
        {error && <p className="text-red-600 text-sm">Incorrect username or password</p>}
        <button type="submit" className="bg-blue-600 text-white rounded py-2 font-medium">
          Log in
        </button>
      </form>
    </main>
  );
}
