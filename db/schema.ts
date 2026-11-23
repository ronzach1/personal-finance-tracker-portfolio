import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["bank", "broker", "crypto_wallet", "cash", "pension", "deposit", "other"] }).notNull(),
  cashBalance: real("cash_balance").notNull().default(0),
  cashCurrency: text("cash_currency", { enum: ["ILS", "USD"] }).notNull().default("ILS"),
  annualManagementFeePercent: real("annual_management_fee_percent"),
  archivedAt: text("archived_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("accounts_owner_idx").on(table.ownerEmail)]);

export const instruments = sqliteTable("instruments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  market: text("market").notNull().default("US"),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  assetClass: text("asset_class").notNull(),
  exchange: text("exchange"),
  mic: text("mic"),
  isin: text("isin"),
  currency: text("currency").notNull().default("USD"),
  provider: text("provider").notNull(),
  providerInstrumentId: text("provider_instrument_id").notNull(),
  quoteProvider: text("quote_provider"),
  quoteProviderInstrumentId: text("quote_provider_instrument_id"),
  geographyProfile: text("geography_profile"),
  sectorProfile: text("sector_profile"),
  exposureSource: text("exposure_source"),
  exposureAsOf: text("exposure_as_of"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  metadataUpdatedAt: text("metadata_updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("instruments_provider_id_idx").on(table.provider, table.providerInstrumentId)]);

export const instrumentQuotes = sqliteTable("instrument_quotes", {
  instrumentId: integer("instrument_id").primaryKey().references(() => instruments.id, { onDelete: "cascade" }),
  price: real("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  priceAsOf: text("price_as_of").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("close"),
});

export const holdings = sqliteTable("holdings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  instrumentId: integer("instrument_id").references(() => instruments.id, { onDelete: "set null" }),
  symbol: text("symbol"),
  name: text("name").notNull(),
  displayAlias: text("display_alias"),
  instrumentKind: text("instrument_kind", { enum: ["security", "crypto", "deposit", "pension", "other"] }).notNull().default("security"),
  assetType: text("asset_type").notNull(),
  geography: text("geography").notNull().default("unspecified"),
  sector: text("sector").notNull().default("broad"),
  exposureMode: text("exposure_mode", { enum: ["inherit", "automatic", "manual"] }).notNull().default("inherit"),
  currency: text("currency", { enum: ["ILS", "USD"] }).notNull(),
  quantity: real("quantity").notNull(),
  averagePrice: real("average_price").notNull(),
  currentPrice: real("current_price").notNull(),
  priceMode: text("price_mode", { enum: ["automatic", "manual", "calculated"] }).notNull().default("manual"),
  attentionReason: text("attention_reason"),
  costBasisIntentionallyUnknown: integer("cost_basis_intentionally_unknown", { mode: "boolean" }).notNull().default(false),
  geographyIntentionallyUnclassified: integer("geography_intentionally_unclassified", { mode: "boolean" }).notNull().default(false),
  sectorIntentionallyUnclassified: integer("sector_intentionally_unclassified", { mode: "boolean" }).notNull().default(false),
  manualPriceReviewedAt: text("manual_price_reviewed_at"),
  liquidity: text("liquidity", { enum: ["available", "near", "invested", "locked"] }).notNull(),
  archivedAt: text("archived_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("holdings_owner_idx").on(table.ownerEmail), index("holdings_account_idx").on(table.accountId)]);

export const depositDetails = sqliteTable("deposit_details", {
  holdingId: integer("holding_id").primaryKey().references(() => holdings.id, { onDelete: "cascade" }),
  principal: real("principal").notNull(),
  currency: text("currency", { enum: ["ILS", "USD"] }).notNull(),
  startDate: text("start_date").notNull(),
  maturityDate: text("maturity_date").notNull(),
  annualInterestRate: real("annual_interest_rate").notNull(),
  interestMethod: text("interest_method", { enum: ["simple", "compound"] }).notNull(),
  compoundingFrequency: text("compounding_frequency", { enum: ["annual", "monthly", "daily"] }),
  note: text("note"),
});

export const depositExitPoints = sqliteTable("deposit_exit_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  holdingId: integer("holding_id").notNull().references(() => holdings.id, { onDelete: "cascade" }),
  exitDate: text("exit_date").notNull(),
}, (table) => [index("deposit_exit_points_holding_idx").on(table.holdingId)]);

export const settings = sqliteTable("settings", {
  ownerEmail: text("owner_email").primaryKey(),
  language: text("language", { enum: ["he", "en"] }).notNull().default("he"),
  baseCurrency: text("base_currency").notNull().default("ILS"),
  usdIlsRate: real("usd_ils_rate").notNull().default(3.65),
  usdIlsRateMode: text("usd_ils_rate_mode", { enum: ["automatic", "manual"] }).notNull().default("automatic"),
  usdIlsRateAsOf: text("usd_ils_rate_as_of"),
  usdIlsRateSource: text("usd_ils_rate_source"),
  valuationCheckedAt: text("valuation_checked_at"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  wealthFlowTrackingStartedAt: text("wealth_flow_tracking_started_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const snapshots = sqliteTable("snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  totalIls: real("total_ils").notNull(),
  capturedAt: text("captured_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("snapshots_owner_idx").on(table.ownerEmail)]);

export const wealthFlows = sqliteTable("wealth_flows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  direction: text("direction", { enum: ["in", "out"] }).notNull(),
  originalAmount: real("original_amount").notNull(),
  currency: text("currency", { enum: ["ILS", "USD"] }).notNull(),
  ilsValue: real("ils_value").notNull(),
  relatedAccountId: integer("related_account_id").references(() => accounts.id, { onDelete: "set null" }),
  occurredAt: text("occurred_at").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("wealth_flows_owner_occurred_idx").on(table.ownerEmail, table.occurredAt)]);

export const changeLog = sqliteTable("change_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id"),
  changedFieldsJson: text("changed_fields_json"),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  metadataJson: text("metadata_json"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("change_log_owner_created_idx").on(table.ownerEmail, table.createdAt)]);
