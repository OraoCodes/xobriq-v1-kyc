import { NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { requireSessionToken } from "@/lib/session";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const token = requireSessionToken();
    const rotated = await xobriqFetch(`/v1/keys/${params.id}/rotate`, token, { method: "POST" });
    return NextResponse.json(rotated);
  } catch (error) {
    return toErrorResponse(error);
  }
}
