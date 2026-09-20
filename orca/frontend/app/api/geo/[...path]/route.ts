import { NextRequest, NextResponse } from "next/server";

const GEO_BACKEND_URL = process.env.GEO_BACKEND_URL || "http://127.0.0.1:8000";

async function proxyRequest(request: NextRequest, context: { params: Promise<{ path: string[] }> | { path: string[] } }) {
  const resolvedParams = await Promise.resolve(context.params);
  const path = (resolvedParams.path || []).join("/");
  const url = new URL(request.url);
  const targetUrl = `${GEO_BACKEND_URL}/${path}${url.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    // Don't forward host header to avoid backend routing confusion
    if (key.toLowerCase() !== "host" && key.toLowerCase() !== "connection") {
      headers.set(key, value);
    }
  });

  try {
    const isBodyAllowed = request.method !== "GET" && request.method !== "HEAD";
    const body = isBodyAllowed ? request.body : undefined;

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
      // @ts-expect-error duplex is required by Node fetch for streaming bodies
      duplex: isBodyAllowed ? "half" : undefined,
      cache: "no-store",
    });

    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    // Ensure CORS headers allow frontend access if needed
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "Geospatial backend unavailable",
        target: targetUrl,
        details: message,
        hint: "Ensure geospatial FastAPI backend is running on port 8000 (uvicorn main:app --port 8000)",
      },
      { status: 503 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
