export type BackupPresentationSummary = {
  backup: unknown;
  accountCount: number;
  assetCount: number;
  snapshotCount: number;
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function backupPresentationSummary(value: unknown): BackupPresentationSummary | null {
  if (!record(value) || value.schema !== "my-wealth-backup" || value.version !== 1 || !record(value.data)) return null;
  const accounts = Array.isArray(value.data.accounts) ? value.data.accounts : [];
  if (!accounts.length) return null;
  return {
    backup: value,
    accountCount: accounts.length,
    assetCount: Array.isArray(value.data.holdings) ? value.data.holdings.length : 0,
    snapshotCount: Array.isArray(value.data.snapshots) ? value.data.snapshots.length : 0,
  };
}

export function parsedBackupPresentationSummary(content: string): BackupPresentationSummary | null {
  try {
    return backupPresentationSummary(JSON.parse(content));
  } catch {
    return null;
  }
}
