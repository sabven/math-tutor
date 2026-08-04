import { adminLoginAction } from "./actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <form action={adminLoginAction} className="flex flex-col gap-3 w-full max-w-xs">
        <h1 className="text-xl font-semibold text-center">Admin</h1>
        <input
          type="password"
          name="password"
          placeholder="Admin password"
          autoFocus
          autoComplete="current-password"
          className="border rounded px-3 py-2"
          required
        />
        {error && <p className="text-red-600 text-sm">Incorrect password</p>}
        <button type="submit" className="bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 text-white rounded py-2 font-medium">
          Unlock
        </button>
      </form>
    </main>
  );
}
