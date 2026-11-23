const pad = (value: number) => String(value).padStart(2, "0");

export function storedIsoToLocalDateTime(value: Date | string, offsetMinutes?: number) {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return "";
  const offset = offsetMinutes ?? instant.getTimezoneOffset();
  const local = new Date(instant.getTime() - offset * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

export function localDateTimeToStoredIso(value: string, offsetMinutes?: number) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Invalid local date and time");
  if (offsetMinutes === undefined) {
    const instant = new Date(value);
    if (Number.isNaN(instant.getTime())) throw new Error("Invalid local date and time");
    return instant.toISOString();
  }
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day, hour, minute) + offsetMinutes * 60_000);
  return instant.toISOString();
}

export function isExplicitUtcIso(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(new Date(value).getTime());
}
