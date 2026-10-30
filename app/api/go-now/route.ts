import { handleGoNow } from "../../../lib/gonow/handler";

export const maxDuration = 60;

export type { GoNowCard, GoNowDeps } from "../../../lib/gonow/handler";

export async function POST(request: Request) {
  return handleGoNow(request);
}
