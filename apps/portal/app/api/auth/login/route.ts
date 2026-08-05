import { NextRequest, NextResponse } from "next/server";
import { xobriqFetch, toErrorResponse } from "@/lib/xobriq-server";
import { setSessionCookie } from "@/lib/session";

interface LoginApiResponse {
  token: string;
  expires_at: string;
  customer_id: string;
  customer_name: string | null;
  email: string;
  role: "admin" | "operator";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await xobriqFetch<LoginApiResponse>("/v1/auth/login", null, { method: "POST", body });

    // The raw token lives only in the httpOnly cookie from here on — the
    // client gets everything else it needs for the UI, never the token itself.
    const response = NextResponse.json({
      customer_id: result.customer_id,
      customer_name: result.customer_name,
      email: result.email,
      role: result.role,
    });
    setSessionCookie(response, result.token, result.expires_at);
    return response;
  } catch (error) {
    return toErrorResponse(error);
  }
}
