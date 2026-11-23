import { getDb } from "../../../db";
import { ensureSchema } from "../../../db/ensure";
import { parsePortfolioRequest, type PortfolioRequest } from "../../../lib/portfolio-request";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handleBackup } from "./backup";
import type { PortfolioContext } from "./context";
import { handleMutation } from "./mutations";
import { onboardPortfolio } from "./onboarding";
import { readPortfolio } from "./read";
import { refreshValuation } from "./valuation";

async function ownerEmail() {
  const user = await getChatGPTUser();
  if (user) return user.email;
  if (process.env.NODE_ENV !== "production") return "preview@local";
  return null;
}

async function portfolioContext(owner: string): Promise<PortfolioContext> {
  await ensureSchema();
  return { db: await getDb(), owner };
}

function dispatch(payload: PortfolioRequest, context: PortfolioContext) {
  if (payload.action === "export_backup" || payload.action === "restore_backup") return handleBackup(payload, context);
  if (payload.action === "onboard") return onboardPortfolio(payload, context);
  if (payload.action === "refresh_us_prices" || payload.action === "refresh_market_prices" || payload.action === "refresh_valuation") {
    return refreshValuation(payload, context);
  }
  return handleMutation(payload, context);
}

export async function GET() {
  const owner = await ownerEmail();
  if (!owner) return Response.json({ error: "Authentication required" }, { status: 401 });
  return Response.json(await readPortfolio(await portfolioContext(owner)));
}

export async function POST(request: Request) {
  const owner = await ownerEmail();
  if (!owner) return Response.json({ error: "Authentication required" }, { status: 401 });
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid request", code: "invalid_request" }, { status: 400 });
  }
  const parsedRequest = parsePortfolioRequest(requestBody);
  if (!parsedRequest.ok) return Response.json({ error: "Invalid request", code: "invalid_request" }, { status: 400 });
  return dispatch(parsedRequest.value, await portfolioContext(owner));
}
