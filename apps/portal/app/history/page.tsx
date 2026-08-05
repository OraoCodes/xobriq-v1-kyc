import { redirect } from "next/navigation";
import { getSessionToken } from "@/lib/session";
import { HistoryList } from "@/components/history/history-list";

export default function HistoryPage() {
  if (!getSessionToken()) redirect("/login");
  return <HistoryList />;
}
