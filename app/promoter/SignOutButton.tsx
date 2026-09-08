import { logout } from "@/app/promoter/login/actions";

export function SignOutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="border-hairline hover:border-chalk/40 label border px-3 py-2 transition-colors"
      >
        Sign out
      </button>
    </form>
  );
}
