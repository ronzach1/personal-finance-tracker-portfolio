import { getChatGPTUser } from "../../../chatgpt-auth";
import { marketData } from "../../../../lib/market-data";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") return Response.json({ error: "Authentication required" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 1) return Response.json({ results: [] });
  try {
    return Response.json({ results: await marketData.searchInstruments(query) });
  } catch {
    return Response.json({ error: "Market search is temporarily unavailable" }, { status: 503 });
  }
}
