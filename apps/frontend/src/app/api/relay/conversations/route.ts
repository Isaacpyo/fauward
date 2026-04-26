import { handleCreateConversation, handleListConversations } from "@fauward/relay-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleCreateConversation(request);
}

export async function GET(request: Request) {
  return handleListConversations(request);
}
