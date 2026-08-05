import { NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { requireSessionToken } from "@/lib/session";

export async function GET() {
  try {
    const token = requireSessionToken();
    const me = await xobriqFetch("/v1/auth/me", token);
    return NextResponse.json(me);
  } catch (error) {
    return toErrorResponse(error);
  }
}
