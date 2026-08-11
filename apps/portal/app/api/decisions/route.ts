import { NextRequest, NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { requireSessionToken } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const token = requireSessionToken();
    const body = await request.json();
    const idempotencyKey = request.headers.get("idempotency-key");
    const liveCheck = request.headers.get("x-xobriq-live-check") === "true";

    const decision = await xobriqFetch("/v1/decisions", token, {
      method: "POST",
      body,
      headers: {
        "X-Xobriq-Manual": "true",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        ...(liveCheck ? { "X-Xobriq-Live-Check": "true" } : {}),
      },
    });
    return NextResponse.json(decision);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = requireSessionToken();
    const result = await xobriqFetch(`/v1/decisions${request.nextUrl.search}`, token);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
