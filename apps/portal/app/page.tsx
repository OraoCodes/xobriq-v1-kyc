import { redirect } from "next/navigation";
import { getSessionToken } from "@/lib/session";
import { CheckFlow } from "@/components/check/check-flow";

export default function CheckPage({ searchParams }: { searchParams: { reference_id?: string } }) {
  if (!getSessionToken()) redirect("/login");
  return <CheckFlow initialReferenceId={searchParams.reference_id ?? null} />;
}
