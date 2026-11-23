import type { getDb } from "../../../db";

export type PortfolioContext = {
  db: Awaited<ReturnType<typeof getDb>>;
  owner: string;
};
