import { NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { requireSessionToken } from "@/lib/session";

export async function GET() {
  try {
    const token = requireSessionToken();
    const keys = await xobriqFetch("/v1/keys", token);
    return NextResponse.json(keys);
  } catch (error) {
    return toErrorResponse(error);
  }
}
