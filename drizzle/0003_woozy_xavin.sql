-- The market-data tables predate the generated migration history and are
-- created idempotently by db/ensure.ts. Keeping this migration as a no-op
-- prevents existing D1 databases from attempting to create them twice.
SELECT 1;
