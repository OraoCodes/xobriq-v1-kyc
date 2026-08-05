import { redirect } from "next/navigation";
import { getSessionToken } from "@/lib/session";
import { LoginForm } from "@/components/login/login-form";

export default function LoginPage() {
  if (getSessionToken()) redirect("/");

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center px-4 pb-16 pt-[24vh]">
      <p className="mb-1 font-mono text-sm text-ink-soft">xobriq</p>
      <p className="mb-6 font-display text-lg italic text-ink-soft">Log in to run a check</p>
      <LoginForm />
    </div>
  );
}
