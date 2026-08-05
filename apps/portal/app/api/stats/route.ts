import { NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { requireSessionToken } from "@/lib/session";

export async function GET() {
  try {
    const token = requireSessionToken();
    const stats = await xobriqFetch("/v1/stats", token);
    return NextResponse.json(stats);
  } catch (error) {
    return toErrorResponse(error);
  }
}
