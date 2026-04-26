import { handleCreateMessage, handleListMessages } from "@fauward/relay-api";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: Request, context: RouteContext) {
  return handleCreateMessage(request, context.params.id);
}

export async function GET(request: Request, context: RouteContext) {
  return handleListMessages(request, context.params.id);
}
