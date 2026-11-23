let ready = false;

export async function ensureSchema() {
  if (ready) return;
  const { env } = await import("cloudflare:workers");
  const d1 = env.DB;
  if (!d1) throw new Error("Database binding is unavailable");
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_email TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      cash_balance REAL NOT NULL DEFAULT 0,
      cash_currency TEXT NOT NULL DEFAULT 'ILS',
      annual_management_fee_percent REAL,
      archived_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS accounts_owner_idx ON accounts (owner_email)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market TEXT NOT NULL DEFAULT 'US',
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      asset_class TEXT NOT NULL,
      exchange TEXT,
      mic TEXT,
      isin TEXT,
      currency TEXT NOT NULL DEFAULT 'USD',
      provider TEXT NOT NULL,
      provider_instrument_id TEXT NOT NULL,
      quote_provider TEXT,
      quote_provider_instrument_id TEXT,
      geography_profile TEXT,
      sector_profile TEXT,
      exposure_source TEXT,
      exposure_as_of TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      metadata_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS instruments_provider_id_idx ON instruments (provider, provider_instrument_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS instrument_quotes (
      instrument_id INTEGER PRIMARY KEY REFERENCES instruments(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      price_as_of TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'close'
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_email TEXT NOT NULL,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      instrument_id INTEGER REFERENCES instruments(id) ON DELETE SET NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      display_alias TEXT,
      instrument_kind TEXT NOT NULL DEFAULT 'security',
      asset_type TEXT NOT NULL,
      geography TEXT NOT NULL DEFAULT 'unspecified',
      sector TEXT NOT NULL DEFAULT 'broad',
      exposure_mode TEXT NOT NULL DEFAULT 'inherit',
      currency TEXT NOT NULL,
      quantity REAL NOT NULL,
      average_price REAL NOT NULL,
      current_price REAL NOT NULL,
      price_mode TEXT NOT NULL DEFAULT 'manual',
      attention_reason TEXT,
      cost_basis_intentionally_unknown INTEGER NOT NULL DEFAULT 0,
      geography_intentionally_unclassified INTEGER NOT NULL DEFAULT 0,
      sector_intentionally_unclassified INTEGER NOT NULL DEFAULT 0,
      manual_price_reviewed_at TEXT,
      liquidity TEXT NOT NULL,
      archived_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS holdings_owner_idx ON holdings (owner_email)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS holdings_account_idx ON holdings (account_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS deposit_details (
      holding_id INTEGER PRIMARY KEY REFERENCES holdings(id) ON DELETE CASCADE,
      principal REAL NOT NULL,
      currency TEXT NOT NULL,
      start_date TEXT NOT NULL,
      maturity_date TEXT NOT NULL,
      annual_interest_rate REAL NOT NULL,
      interest_method TEXT NOT NULL,
      compounding_frequency TEXT,
      note TEXT
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS deposit_exit_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holding_id INTEGER NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
      exit_date TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS deposit_exit_points_holding_idx ON deposit_exit_points (holding_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS settings (
      owner_email TEXT PRIMARY KEY,
      language TEXT NOT NULL DEFAULT 'he',
      base_currency TEXT NOT NULL DEFAULT 'ILS',
      usd_ils_rate REAL NOT NULL DEFAULT 3.65,
      usd_ils_rate_mode TEXT NOT NULL DEFAULT 'automatic',
      usd_ils_rate_as_of TEXT,
      usd_ils_rate_source TEXT,
      valuation_checked_at TEXT,
      onboarding_complete INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_email TEXT NOT NULL,
      total_ils REAL NOT NULL,
      captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS snapshots_owner_idx ON snapshots (owner_email)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS wealth_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_email TEXT NOT NULL,
      direction TEXT NOT NULL,
      original_amount REAL NOT NULL,
      currency TEXT NOT NULL,
      ils_value REAL NOT NULL,
      related_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      occurred_at TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS wealth_flows_owner_occurred_idx ON wealth_flows (owner_email, occurred_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_email TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      changed_fields_json TEXT,
      before_json TEXT,
      after_json TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS change_log_owner_created_idx ON change_log (owner_email, created_at)"),
  ]);
  const columnResult = await d1.prepare("PRAGMA table_info(holdings)").all<{ name: string }>();
  const columns = new Set(columnResult.results.map((column) => column.name));
  const additions: Array<[string, string]> = [
    ["display_alias", "ALTER TABLE holdings ADD COLUMN display_alias TEXT"],
    ["instrument_kind", "ALTER TABLE holdings ADD COLUMN instrument_kind TEXT NOT NULL DEFAULT 'security'"],
    ["geography", "ALTER TABLE holdings ADD COLUMN geography TEXT NOT NULL DEFAULT 'unspecified'"],
    ["sector", "ALTER TABLE holdings ADD COLUMN sector TEXT NOT NULL DEFAULT 'broad'"],
    ["attention_reason", "ALTER TABLE holdings ADD COLUMN attention_reason TEXT"],
    ["archived_at", "ALTER TABLE holdings ADD COLUMN archived_at TEXT"],
    ["instrument_id", "ALTER TABLE holdings ADD COLUMN instrument_id INTEGER REFERENCES instruments(id) ON DELETE SET NULL"],
    ["exposure_mode", "ALTER TABLE holdings ADD COLUMN exposure_mode TEXT NOT NULL DEFAULT 'inherit'"],
    ["cost_basis_intentionally_unknown", "ALTER TABLE holdings ADD COLUMN cost_basis_intentionally_unknown INTEGER NOT NULL DEFAULT 0"],
    ["geography_intentionally_unclassified", "ALTER TABLE holdings ADD COLUMN geography_intentionally_unclassified INTEGER NOT NULL DEFAULT 0"],
    ["sector_intentionally_unclassified", "ALTER TABLE holdings ADD COLUMN sector_intentionally_unclassified INTEGER NOT NULL DEFAULT 0"],
    ["manual_price_reviewed_at", "ALTER TABLE holdings ADD COLUMN manual_price_reviewed_at TEXT"],
  ];
  const missing = additions.filter(([name]) => !columns.has(name)).map(([, statement]) => d1.prepare(statement));
  if (missing.length) await d1.batch(missing);
  const instrumentColumnResult = await d1.prepare("PRAGMA table_info(instruments)").all<{ name: string }>();
  const instrumentColumns = new Set(instrumentColumnResult.results.map((column) => column.name));
  const instrumentAdditions: Array<[string, string]> = [
    ["mic", "ALTER TABLE instruments ADD COLUMN mic TEXT"],
    ["isin", "ALTER TABLE instruments ADD COLUMN isin TEXT"],
    ["quote_provider", "ALTER TABLE instruments ADD COLUMN quote_provider TEXT"],
    ["quote_provider_instrument_id", "ALTER TABLE instruments ADD COLUMN quote_provider_instrument_id TEXT"],
    ["geography_profile", "ALTER TABLE instruments ADD COLUMN geography_profile TEXT"],
    ["sector_profile", "ALTER TABLE instruments ADD COLUMN sector_profile TEXT"],
    ["exposure_source", "ALTER TABLE instruments ADD COLUMN exposure_source TEXT"],
    ["exposure_as_of", "ALTER TABLE instruments ADD COLUMN exposure_as_of TEXT"],
  ];
  const missingInstrumentColumns = instrumentAdditions.filter(([name]) => !instrumentColumns.has(name)).map(([, statement]) => d1.prepare(statement));
  if (missingInstrumentColumns.length) await d1.batch(missingInstrumentColumns);
  await d1.batch([
    d1.prepare("UPDATE holdings SET geography = 'unspecified', sector = 'unspecified', exposure_mode = 'manual' WHERE exposure_mode = 'automatic'"),
    d1.prepare("UPDATE holdings SET exposure_mode = 'manual' WHERE exposure_mode = 'inherit'"),
    d1.prepare("UPDATE instruments SET geography_profile = NULL, sector_profile = NULL, exposure_source = NULL, exposure_as_of = NULL WHERE geography_profile IS NOT NULL OR sector_profile IS NOT NULL OR exposure_source IS NOT NULL OR exposure_as_of IS NOT NULL"),
  ]);
  const accountColumnResult = await d1.prepare("PRAGMA table_info(accounts)").all<{ name: string }>();
  const accountColumns = new Set(accountColumnResult.results.map((column) => column.name));
  if (!accountColumns.has("archived_at")) await d1.prepare("ALTER TABLE accounts ADD COLUMN archived_at TEXT").run();
  if (!accountColumns.has("annual_management_fee_percent")) await d1.prepare("ALTER TABLE accounts ADD COLUMN annual_management_fee_percent REAL").run();
  const settingColumnResult = await d1.prepare("PRAGMA table_info(settings)").all<{ name: string }>();
  const settingColumns = new Set(settingColumnResult.results.map((column) => column.name));
  const settingAdditions: Array<[string, string]> = [
    ["usd_ils_rate_mode", "ALTER TABLE settings ADD COLUMN usd_ils_rate_mode TEXT NOT NULL DEFAULT 'automatic'"],
    ["usd_ils_rate_as_of", "ALTER TABLE settings ADD COLUMN usd_ils_rate_as_of TEXT"],
    ["usd_ils_rate_source", "ALTER TABLE settings ADD COLUMN usd_ils_rate_source TEXT"],
    ["valuation_checked_at", "ALTER TABLE settings ADD COLUMN valuation_checked_at TEXT"],
    ["wealth_flow_tracking_started_at", "ALTER TABLE settings ADD COLUMN wealth_flow_tracking_started_at TEXT"],
  ];
  const missingSettingColumns = settingAdditions.filter(([name]) => !settingColumns.has(name)).map(([, statement]) => d1.prepare(statement));
  if (missingSettingColumns.length) await d1.batch(missingSettingColumns);
  await d1.prepare(`UPDATE settings
    SET wealth_flow_tracking_started_at = CASE
      WHEN wealth_flow_tracking_started_at IS NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ', wealth_flow_tracking_started_at)
    END
    WHERE wealth_flow_tracking_started_at IS NULL
      OR wealth_flow_tracking_started_at NOT GLOB '????-??-??T??:??:??*Z'`).run();
  ready = true;
}
