import { redirect } from "next/navigation";
import { getSessionToken } from "@/lib/session";
import { ReviewList } from "@/components/review/review-list";

export default function ReviewPage() {
  if (!getSessionToken()) redirect("/login");
  return <ReviewList />;
}
