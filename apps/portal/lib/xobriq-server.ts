import "server-only";
import { NextResponse } from "next/server";

/**
 * The only place a bearer credential touches an outbound request. Every
 * portal call to xobriq flows through here, server-side. Once logged in,
 * the credential is the SESSION TOKEN from the httpOnly cookie (see
 * lib/session.ts) — never a raw sk_live_ key, which the browser never
 * holds and the server never needs to recover after it was first shown.
 */

export class XobriqApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "XobriqApiError";
  }
}

function baseUrl(): string {
  const url = process.env.XOBRIQ_API_URL;
  if (!url) throw new Error("XOBRIQ_API_URL is not configured");
  return url.replace(/\/+$/, "");
}

export interface XobriqRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  /** No caching by default — decisions and cases are live state. */
  cache?: RequestCache;
}

/** `bearerToken` is `null` only for the public routes (login) that don't have one yet. */
export async function xobriqFetch<T>(path: string, bearerToken: string | null, options: XobriqRequestOptions = {}): Promise<T> {
  // Content-Type only when there's actually a body — Fastify's JSON parser
  // rejects an empty body sent with application/json (FST_ERR_CTP_EMPTY_JSON_BODY).
  const headers: Record<string, string> = { ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...options.headers };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const res = await fetch(`${baseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    cache: options.cache ?? "no-store",
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code = json?.error?.code ?? "INTERNAL";
    const message = json?.error?.message ?? "Unexpected error";
    throw new XobriqApiError(res.status, code, message, json?.error?.details);
  }

  return json as T;
}

/** Every route handler funnels errors through here, so the shape is uniform. */
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof XobriqApiError) {
    return NextResponse.json({ error: { code: error.code, message: error.message, details: error.details } }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Couldn't reach the check service. Try again." } }, { status: 500 });
}
