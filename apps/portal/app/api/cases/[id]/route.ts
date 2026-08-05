import { NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { requireSessionToken } from "@/lib/session";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const token = requireSessionToken();
    const caseRecord = await xobriqFetch(`/v1/cases/${params.id}`, token);
    return NextResponse.json(caseRecord);
  } catch (error) {
    return toErrorResponse(error);
  }
}
