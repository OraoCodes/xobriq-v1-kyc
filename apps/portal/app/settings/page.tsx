import { redirect } from "next/navigation";
import { getSessionToken } from "@/lib/session";
import { ApiKeysPanel } from "@/components/settings/api-keys-panel";

export default function SettingsPage() {
  if (!getSessionToken()) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="mb-1 font-display text-2xl italic text-ink">Settings</h1>
      <p className="mb-8 text-sm text-ink-soft">API keys for developer integration. The portal itself uses your login, not these.</p>
      <ApiKeysPanel />
    </div>
  );
}
