import { NextRequest, NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { requireSessionToken } from "@/lib/session";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = requireSessionToken();
    const body = await request.json();
    const updated = await xobriqFetch(`/v1/cases/${params.id}/resolve`, token, { method: "POST", body });
    return NextResponse.json(updated);
  } catch (error) {
    return toErrorResponse(error);
  }
}
