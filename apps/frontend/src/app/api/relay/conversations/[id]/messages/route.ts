export const dynamic = "force-dynamic";

const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:3001").replace(/\/$/, "");

async function proxy(request: Request, path: string): Promise<Response> {
  const url = new URL(request.url);
  const target = `${BACKEND}/api/v1/relay${path}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();
  return fetch(target, { method: request.method, headers, body });
}

type Ctx = { params: { id: string } };

export async function GET(request: Request, { params }: Ctx) {
  return proxy(request, `/conversations/${params.id}/messages`);
}

export async function POST(request: Request, { params }: Ctx) {
  return proxy(request, `/conversations/${params.id}/messages`);
}
