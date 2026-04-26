import { handleGetConversation, handleUpdateConversation } from "@fauward/relay-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleUpdateConversation(request, context.params.id);
}

export async function GET(request: Request, context: RouteContext) {
  return handleGetConversation(request, context.params.id);
}
