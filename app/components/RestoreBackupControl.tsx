import { useEffect, useRef, useState } from "react";
import { RefreshCw, Upload } from "lucide-react";
import { parsedBackupPresentationSummary, type BackupPresentationSummary } from "../../lib/backup-presentation";

type RestoreOperation = "idle" | "reading" | "restoring";

export function RestoreBackupControl({
  he,
  cancelLabel,
  replaceExisting,
  restored,
  disabled = false,
  onBusyChange,
}: {
  he: boolean;
  cancelLabel: string;
  replaceExisting: boolean;
  restored: () => Promise<void>;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [operation, setOperation] = useState<RestoreOperation>("idle");
  const [message, setMessage] = useState<{ kind: "error"; text: string } | null>(null);
  const [pending, setPending] = useState<BackupPresentationSummary | null>(null);
  const busy = operation !== "idle";

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  const readBackup = async (file: File) => {
    setOperation("reading");
    setMessage(null);
    setPending(null);
    try {
      if (file.size > 2_000_000) {
        setMessage({ kind: "error", text: he ? "קובץ הגיבוי גדול מדי." : "The backup file is too large." });
        return;
      }
      const summary = parsedBackupPresentationSummary(await file.text());
      if (!summary) throw new Error(he ? "זה אינו קובץ גיבוי תקין." : "This is not a valid backup file.");
      setPending(summary);
    } catch {
      setMessage({ kind: "error", text: he ? "זה אינו קובץ גיבוי תקין." : "This is not a valid backup file." });
    } finally {
      setOperation("idle");
      if (input.current) input.current.value = "";
    }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    setOperation("restoring");
    setMessage(null);
    try {
      const response = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore_backup", backup: pending.backup }) });
      if (!response.ok) throw new Error(he ? "השחזור לא הושלם. הנתונים הקיימים לא השתנו." : "Restore could not be completed. Existing data was not changed.");
      await restored();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : (he ? "השחזור נכשל. הנתונים הקיימים לא השתנו." : "Restore failed. Existing data was not changed.") });
      setOperation("idle");
    }
  };

  return <div className="restore-control">
    <button className="secondary" disabled={disabled || busy} onClick={() => input.current?.click()}>{operation === "reading" ? <RefreshCw className="spin" size={16}/> : <Upload size={16}/>}<span>{operation === "reading" ? (he ? "בודק קובץ…" : "Checking file…") : (he ? "בחירת קובץ גיבוי" : "Choose backup file")}</span></button>
    <input ref={input} hidden type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (file) void readBackup(file); }}/>
    {pending && <section className="restore-review" role="alert"><div><strong>{replaceExisting ? (he ? "להחליף את התיק הנוכחי?" : "Replace the current portfolio?") : (he ? "לשחזר את הגיבוי הזה?" : "Restore this backup?")}</strong><small>{he ? `${pending.accountCount} חשבונות · ${pending.assetCount} נכסים · ${pending.snapshotCount} תמונות מצב` : `${pending.accountCount} accounts · ${pending.assetCount} assets · ${pending.snapshotCount} snapshots`}</small><p>{replaceExisting ? (he ? "השחזור יחליף את כל הנתונים הנוכחיים. מומלץ להוריד גיבוי שלהם קודם." : "Restore replaces all current data. Download a backup of it first.") : (he ? "השחזור יטען את החשבונות, הנכסים, תמונות המצב וההגדרות מהגיבוי." : "Restore loads the accounts, assets, snapshots, and settings from this backup.")}</p></div><div><button className="secondary" disabled={busy} onClick={() => setPending(null)}>{cancelLabel}</button><button className="danger-action" disabled={busy} onClick={() => void confirmRestore()}>{operation === "restoring" && <RefreshCw className="spin" size={16}/>}<span>{operation === "restoring" ? (he ? "משחזר…" : "Restoring…") : (he ? "שחזור הגיבוי" : "Restore backup")}</span></button></div></section>}
    {message && <small className="backup-message error" role="status" aria-live="polite">{message.text}</small>}
  </div>;
}
