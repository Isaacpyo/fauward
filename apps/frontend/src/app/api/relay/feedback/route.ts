import { handleCreateFeedback, handleListFeedback } from "@fauward/relay-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateFeedback(request);
}

export async function GET(request: Request) {
  return handleListFeedback(request);
}
