import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyCalculatedDepositValues } from "../app/api/portfolio/deposits.ts";
import { deriveAssetValues, isLegacyManualDepositState } from "../app/api/portfolio/asset-values.ts";
import { dataCheckHoldingIds } from "../lib/data-check.ts";
import { depositTiming, fixedDepositValidationIssues, fixedDepositValue, nextExitPoint, ownedDepositBackupData, sortedExitPoints, validateDepositBackupData, validateExitPoints, validateFixedDepositTerms } from "../lib/fixed-deposit.ts";
import { isValidBackupV1, trackedWealthIls } from "../lib/finance.ts";
import { supportsGenericHoldingCorrection } from "../lib/holding-correction.ts";
import { onboardingHoldingValues } from "../lib/onboarding.ts";
import { parsePortfolioRequest } from "../lib/portfolio-request.ts";

const terms = (patch = {}) => ({ principal: 10_000, currency: "ILS", startDate: "2026-01-01", maturityDate: "2027-01-01", annualInterestRate: 10, interestMethod: "simple", compoundingFrequency: null, ...patch });

test("simple interest accrues partway through a term using ACT/365", () => {
  assert.equal(fixedDepositValue(terms(), "2026-07-02"), 10_000 * (1 + .1 * 182 / 365));
});

test("simple interest stops at maturity and value before start is principal", () => {
  assert.equal(fixedDepositValue(terms(), "2028-01-01"), 11_000);
  assert.equal(fixedDepositValue(terms(), "2025-12-01"), 10_000);
});

test("annual and monthly compound interest follow the specified formula", () => {
  assert.equal(fixedDepositValue(terms({ interestMethod: "compound", compoundingFrequency: "annual" }), "2027-01-01"), 11_000);
  assert.equal(fixedDepositValue(terms({ interestMethod: "compound", compoundingFrequency: "monthly", annualInterestRate: 12 }), "2027-01-01"), 10_000 * Math.pow(1.01, 12));
});

test("invalid fixed-deposit terms and exit points are rejected", () => {
  assert.equal(validateFixedDepositTerms(terms({ principal: 0 })), false);
  assert.equal(validateFixedDepositTerms(terms({ annualInterestRate: -1 })), false);
  assert.equal(validateFixedDepositTerms(terms({ maturityDate: "2026-01-01" })), false);
  assert.equal(validateFixedDepositTerms(terms({ interestMethod: "compound" })), false);
  assert.equal(validateExitPoints(["2025-12-31"], terms()), false);
  assert.throws(() => fixedDepositValue(terms({ startDate: "invalid" }), "2026-01-01"));
});

test("client-facing deposit validation reports the authoritative field failures", () => {
  assert.deepEqual(fixedDepositValidationIssues(terms(), ["2026-06-01"]), []);
  assert.deepEqual(fixedDepositValidationIssues(terms({ principal: 0 })), ["principal_required"]);
  assert.deepEqual(fixedDepositValidationIssues(terms({ startDate: "" })), ["start_date_required"]);
  assert.deepEqual(fixedDepositValidationIssues(terms({ maturityDate: "" })), ["maturity_date_required"]);
  assert.deepEqual(fixedDepositValidationIssues(terms({ maturityDate: "2026-01-01" })), ["maturity_after_start"]);
  assert.deepEqual(fixedDepositValidationIssues(terms({ annualInterestRate: -0.01 })), ["interest_rate_invalid"]);
  assert.deepEqual(fixedDepositValidationIssues(terms({ interestMethod: "compound", compoundingFrequency: null })), ["compounding_frequency_required"]);
  assert.deepEqual(fixedDepositValidationIssues(terms(), ["2025-12-31"]), ["exit_point_invalid"]);
});

test("exit points are durable, sorted, deduplicated, and select the next future date", () => {
  const points = ["2026-11-01", "2026-06-01", "2026-11-01"];
  assert.deepEqual(sortedExitPoints(points), ["2026-06-01", "2026-11-01"]);
  assert.equal(nextExitPoint(points, "2026-06-01"), "2026-11-01");
});

test("matured deposit timing creates an actionable attention state", () => {
  assert.deepEqual(depositTiming(terms(), [], "2027-01-01"), { matured: true, nextExitPoint: null, exitPoints: [] });
  const [holding] = applyCalculatedDepositValues([{ id: 1, instrumentKind: "deposit", currentPrice: 10_000, quantity: 1, attentionReason: null }], [{ holdingId: 1, ...terms() }], [], "2027-02-01");
  assert.equal(holding.attentionReason, "deposit_matured");
  assert.equal(holding.currentPrice, 11_000);
});

test("deposit and pension are excluded from cost basis and classification Data Check rules", () => {
  const base = { avg: 0, price: 10_000, status: "manual", updatedAt: "2026-01-01T00:00:00Z", geography: "unspecified", sector: "unspecified" };
  const holdings = [{ id: 1, instrumentKind: "deposit", type: "deposit", ...base }, { id: 2, instrumentKind: "pension", type: "pension", ...base }];
  for (const issue of ["missing-cost-basis", "missing-classification", "stale-manual-price"]) assert.deepEqual(dataCheckHoldingIds(holdings, issue, Date.parse("2026-08-01")), []);
});

test("calculated deposits and manual pensions count in total wealth", () => {
  const accounts = [{ id: 1, cashBalance: 0, cashCurrency: "ILS", archivedAt: null }];
  const stored = [{ id: 1, accountId: 1, instrumentKind: "deposit", quantity: 1, currentPrice: 10_000, currency: "ILS", attentionReason: null, archivedAt: null }, { id: 2, accountId: 1, instrumentKind: "pension", quantity: 1, currentPrice: 50_000, currency: "ILS", attentionReason: null, archivedAt: null }];
  const valued = applyCalculatedDepositValues(stored, [{ holdingId: 1, ...terms() }], [], "2027-01-01");
  assert.equal(trackedWealthIls(accounts, valued, 3.7), 61_000);
});

test("deposit assets use calculated valuation and never select market data", () => {
  const result = deriveAssetValues({ assetType: "deposit", symbol: "", currency: "ILS", quantity: 1, averagePrice: 0, currentPrice: 0, costMode: "average", priceUnit: "currency", deposit: { principal: 10_000 } });
  assert.equal(result.priceMode, "calculated");
  assert.equal(result.automaticProvider, null);
  assert.equal(result.persistCanonicalInstrument, false);
});

test("deposit request validation is strict and pension/deposit account kinds round-trip", () => {
  const asset = { action: "save_asset", accountId: 1, assetType: "deposit", symbol: "", name: "Fixed deposit", currency: "ILS", quantity: 1, averagePrice: 10_000, currentPrice: 10_000, liquidity: "locked", costMode: "average", priceUnit: "currency", deposit: { principal: 10_000, startDate: "2026-01-01", maturityDate: "2027-01-01", annualInterestRate: 4, interestMethod: "compound", compoundingFrequency: "monthly", exitPoints: ["2026-06-01"] } };
  assert.equal(parsePortfolioRequest(asset).ok, true);
  assert.equal(parsePortfolioRequest({ ...asset, deposit: { ...asset.deposit, maturityDate: asset.deposit.startDate } }).ok, false);
  for (const kind of ["pension", "deposit"]) assert.equal(parsePortfolioRequest({ action: "save_account", name: kind, kind, cashCurrency: "ILS", cashBalance: 0 }).ok, true);
});

test("legacy manual deposit requests parse only as existing-asset candidates", () => {
  const legacyEdit = { action: "save_asset", id: 7, accountId: 1, assetType: "deposit", symbol: "", name: "Old deposit", currency: "ILS", quantity: 1, averagePrice: 8_000, currentPrice: 8_250, liquidity: "near", costMode: "average", priceUnit: "currency" };
  const parsed = parsePortfolioRequest(legacyEdit);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.value.action === "save_asset" ? parsed.value.deposit : "unexpected", undefined);
  assert.equal(parsePortfolioRequest(({ ...legacyEdit, id: undefined })).ok, false);
});

test("only the exact stored legacy state authorizes manual deposit valuation", () => {
  const storedLegacy = { instrumentKind: "deposit", priceMode: "manual" };
  assert.equal(isLegacyManualDepositState(storedLegacy, false), true);
  assert.equal(isLegacyManualDepositState({ instrumentKind: "deposit", priceMode: "calculated" }, true), false);
  assert.equal(isLegacyManualDepositState({ instrumentKind: "security", priceMode: "manual" }, false), false);
  assert.equal(isLegacyManualDepositState(null, false), false);

  const payload = { action: "save_asset", id: 7, accountId: 1, assetType: "deposit", symbol: "", name: "Old deposit", currency: "ILS", quantity: 1, averagePrice: 8_000, currentPrice: 8_250, liquidity: "near", costMode: "average", priceUnit: "currency" };
  const derived = deriveAssetValues(payload, { verifiedLegacyManualDeposit: true });
  assert.equal(derived.priceMode, "manual");
  assert.equal(derived.currentPrice, 8_250);
});

test("structured deposit omission is rejected before mutation and owned-state checks precede writes", async () => {
  const source = await readFile(new URL("../app/api/portfolio/mutations.ts", import.meta.url), "utf8");
  const ownedHoldingLookup = source.indexOf("eq(holdings.ownerEmail, owner)", source.indexOf('payload.action === "save_asset"'));
  const missingOwnedHoldingRejection = source.indexOf('id !== undefined && !before', ownedHoldingLookup);
  const structuredOmissionRejection = source.indexOf("beforeDeposit && !payload.deposit");
  const legacyStateCheck = source.indexOf("isLegacyManualDepositState(before, Boolean(beforeDeposit))");
  const accountLookup = source.indexOf("const [ownedAccount]", source.indexOf('payload.action === "save_asset"'));
  assert.ok(ownedHoldingLookup >= 0 && missingOwnedHoldingRejection > ownedHoldingLookup && structuredOmissionRejection > missingOwnedHoldingRejection);
  assert.ok(legacyStateCheck > structuredOmissionRejection && accountLookup > legacyStateCheck);
});

test("legacy deposit conversion requires valid explicit terms and becomes calculated", () => {
  const conversion = { action: "save_asset", id: 7, accountId: 1, assetType: "deposit", symbol: "", name: "Converted deposit", currency: "ILS", quantity: 1, averagePrice: 10_000, currentPrice: 10_000, liquidity: "locked", costMode: "average", priceUnit: "currency", deposit: { principal: 10_000, startDate: "2026-01-01", maturityDate: "2027-01-01", annualInterestRate: 4, interestMethod: "simple", exitPoints: [] } };
  const parsed = parsePortfolioRequest(conversion);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.value.action === "save_asset" ? deriveAssetValues(parsed.value).priceMode : "unexpected", "calculated");
  assert.equal(parsePortfolioRequest({ ...conversion, deposit: { ...conversion.deposit, startDate: "" } }).ok, false);
});

test("snapshots value deposits at capture time without daily writes", async () => {
  const source = await readFile(new URL("../app/api/portfolio/snapshots.ts", import.meta.url), "utf8");
  assert.match(source, /applyCalculatedDepositValues/);
  assert.doesNotMatch(source, /update\(depositDetails\)/);
});

const backupHolding = (id, patch = {}) => ({ id, accountId: 1, instrumentId: null, name: `Asset ${id}`, instrumentKind: "other", currency: "ILS", liquidity: "invested", priceMode: "manual", quantity: 1, averagePrice: 0, currentPrice: 1, ...patch });
const backup = (holdings, patch = {}) => ({ schema: "my-wealth-backup", version: 1, data: { accounts: [{ id: 1, name: "Account", kind: "other", cashCurrency: "ILS", cashBalance: 0 }], holdings, instruments: [], snapshots: [], ...patch } });

test("backup validator accepts pension, legacy deposits, structured deposits, and mixed backups", () => {
  assert.equal(isValidBackupV1(backup([backupHolding(1, { instrumentKind: "pension" })], { accounts: [{ id: 1, name: "Pension", kind: "pension", cashCurrency: "ILS", cashBalance: 0 }] })), true);
  const legacy = backupHolding(1, { instrumentKind: "deposit" });
  const structured = backupHolding(2, { instrumentKind: "deposit", priceMode: "calculated", currentPrice: 10_000 });
  const depositDetails = [{ holdingId: 2, ...terms() }];
  const depositExitPoints = [{ holdingId: 2, exitDate: "2026-06-01" }];
  assert.equal(isValidBackupV1(backup([legacy])), true);
  assert.equal(isValidBackupV1(backup([structured], { accounts: [{ id: 1, name: "Fixed deposits", kind: "deposit", cashCurrency: "ILS", cashBalance: 0 }], depositDetails, depositExitPoints })), true);
  assert.equal(isValidBackupV1(backup([legacy, structured], { depositDetails, depositExitPoints })), true);
});

test("legacy and structured deposits survive serialized backup restore input without changing shape", () => {
  const legacy = backupHolding(1, { instrumentKind: "deposit", priceMode: "manual", currentPrice: 8_250 });
  const structured = backupHolding(2, { instrumentKind: "deposit", priceMode: "calculated", currentPrice: 10_250 });
  const original = backup([legacy, structured], { depositDetails: [{ holdingId: 2, ...terms() }], depositExitPoints: [{ holdingId: 2, exitDate: "2026-06-01" }] });
  const restoredInput = JSON.parse(JSON.stringify(original));
  assert.equal(isValidBackupV1(restoredInput), true);
  assert.deepEqual(restoredInput.data.holdings, [legacy, structured]);
  assert.deepEqual(restoredInput.data.depositDetails.map(row => row.holdingId), [2]);
  assert.equal(restoredInput.data.holdings[0].currentPrice, 8_250);
});

test("legacy deposit editor defaults to manual balance and gates structured fields behind conversion", async () => {
  const source = await readFile(new URL("../app/components/PortfolioManager.tsx", import.meta.url), "utf8");
  assert.match(source, /asset\?\.instrumentKind === "deposit" \? "deposit"/);
  assert.match(source, /legacyManualDeposit \? "manual" : "structured"/);
  assert.match(source, /depositMode === "manual"[^]*Current balance/);
  assert.match(source, /legacy-deposit-conversion[^]*depositMode === "structured"[^]*סכום[^]*Amount/);
  assert.match(source, /Convert to fixed-rate/);
  assert.match(source, /depositMode === "manual"[^]*Manual balance/);
  assert.match(source, /setDeposit\(old => \(\{ \.\.\.old, principal: form\.currentPrice \}\)\)/);
  assert.match(source, /The amount was carried over from the manual balance/);
  assert.doesNotMatch(source, /principalInputRef|scrollIntoView|scrollContainer|requestAnimationFrame/);
});

test("mixed backup export selection preserves every owned structured deposit row", () => {
  const selected = ownedDepositBackupData([1, 2], [{ holdingId: 2, ...terms() }, { holdingId: 99, ...terms() }], [{ holdingId: 2, exitDate: "2026-06-01" }, { holdingId: 99, exitDate: "2026-06-01" }]);
  assert.deepEqual(selected.depositDetails.map(row => row.holdingId), [2]);
  assert.deepEqual(selected.depositExitPoints.map(row => row.holdingId), [2]);
});

test("backup validator rejects inconsistent calculated and fixed-deposit relationships", () => {
  const calculated = backupHolding(1, { instrumentKind: "deposit", priceMode: "calculated", currentPrice: 10_000 });
  const detail = { holdingId: 1, ...terms() };
  assert.equal(isValidBackupV1(backup([calculated], { depositDetails: [], depositExitPoints: [] })), false);
  assert.equal(isValidBackupV1(backup([backupHolding(1, { priceMode: "calculated" })])), false);
  assert.equal(isValidBackupV1(backup([backupHolding(1)], { depositDetails: [detail], depositExitPoints: [] })), false);
  assert.equal(isValidBackupV1(backup([calculated], { depositDetails: [{ ...detail, currency: "USD" }], depositExitPoints: [] })), false);
  assert.equal(validateDepositBackupData({ hasDepositData: true, holdings: [calculated], details: [detail, detail], exitPoints: [] }), false);
  assert.equal(validateDepositBackupData({ hasDepositData: true, holdings: [calculated], details: [detail], exitPoints: [{ holdingId: 1, exitDate: "2028-01-01" }] }), false);
});

test("pension onboarding semantics and specialized correction boundaries are deterministic", () => {
  assert.deepEqual(onboardingHoldingValues({ assetType: "pension", symbol: "PENSION", quantity: 20, averagePrice: 30, currentPrice: 50_000, liquidity: "available", geography: "global", sector: "finance" }), { instrumentKind: "pension", symbol: "", quantity: 1, averagePrice: 0, liquidity: "locked", geography: "unspecified", sector: "unspecified" });
  assert.throws(() => onboardingHoldingValues({ assetType: "deposit", symbol: "", quantity: 1, averagePrice: 0, currentPrice: 10_000, liquidity: "locked" }));
  assert.equal(supportsGenericHoldingCorrection("deposit"), false);
  assert.equal(supportsGenericHoldingCorrection("pension"), false);
  assert.equal(supportsGenericHoldingCorrection("security"), true);
  assert.equal([{ instrumentKind: "pension" }, { instrumentKind: "deposit" }].filter((holding) => supportsGenericHoldingCorrection(holding.instrumentKind)).length, 0);
});
