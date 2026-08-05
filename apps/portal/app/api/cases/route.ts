import { NextRequest, NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { requireSessionToken } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const token = requireSessionToken();
    const result = await xobriqFetch(`/v1/cases${request.nextUrl.search}`, token);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
