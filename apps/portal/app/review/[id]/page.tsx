import { redirect } from "next/navigation";
import { getSessionToken } from "@/lib/session";
import { CaseDetail } from "@/components/review/case-detail";

export default function ReviewCasePage({ params }: { params: { id: string } }) {
  if (!getSessionToken()) redirect("/login");
  return <CaseDetail caseId={params.id} />;
}
