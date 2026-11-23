These public Keren44 responses were captured on 2026-10-13 using the application's
`MyWealth/1.0` request headers. No portfolio or runtime data is included.

Discovery: https://keren44.co.il/data/funds.json (HTTP 200).
Detail URLs use `/fund/{slug}-{fundId}` with the exact discovery slug.
All six original detail requests returned HTTP 200; uppercasing the four reported
fund slugs returned HTTP 404. The HTML fixtures retain the captured Astro fund
fields used for identity, units, NAV and date; unrelated chart histories, holdings,
styles and scripts are omitted. Discovery retains fourteen complete fund records.

| Security | Slug | NAV | Date | Reported currency |
| --- | --- | --- | --- | --- |
| 5124482 | קסם-sp500-ktf | 325.2 | 2026-10-08 | ILS |
| 5138631 | קסם-ru20n30u-ktf | 116.88 | 2026-10-08 | ILS |
| 5136064 | קסם-nikkei225-ktf | 33818.37 | 2026-10-08 | JPY |
| 5139902 | קסם-sptsx-60-ktf | 5026.89 | 2026-10-08 | CAD |
| 5138698 | דולפין-כספית | 109.63 | 2026-10-12 | ILS |
| 5127600 | תכלית-ise-cloud-ttf-ממ | 258.83 | 2026-10-08 | ILS |

The `currency` field is displayed as **מטבע בסיס** (base/exposure currency),
not the currency in which fund units are quoted. `unitsInUsd` independently
identifies dollar-denominated units. The earlier JPY/CAD rejection confused
these fields; the independent review on PR #29 prompted the checks below.

Direct public requests on 2026-10-13 corroborated Keren44 NAVs exactly with
Bizportal redemption prices. The independent pages identify the security number
and the unit currency (`ש"ח` for shekels, `דולר` for dollars). Web-indexed copies
can have different dates/prices; the figures below came from direct HTTP 200
responses, not inferred from different-date prices. No independent provider is
used by the application at runtime.

| Security | Keren44 base currency | unitsInUsd | NAV / independent redemption | Independent unit currency |
| --- | --- | --- | --- | --- |
| [5136064](https://www.bizportal.co.il/mutualfunds/quote/generalview/5136064) | JPY | false | 33818.37 | ILS |
| [5139902](https://www.bizportal.co.il/mutualfunds/quote/generalview/5139902) | CAD | false | 5026.89 | ILS |
| [5139571](https://www.bizportal.co.il/mutualfunds/quote/generalview/5139571) | USD | false | 130.4 | ILS |
| [5130752](https://www.bizportal.co.il/mutualfunds/quote/generalview/5130752) | EUR | false | 162.73 | ILS |
| [5137039](https://www.bizportal.co.il/mutualfunds/quote/generalview/5137039) | INR | false | 713.81 | ILS |
| [5137088](https://www.bizportal.co.il/mutualfunds/quote/generalview/5137088) | HKD | false | 1337.2 | ILS |
| [5141007](https://www.bizportal.co.il/mutualfunds/quote/generalview/5141007) | USD | true | 108.75 | USD |
| [5115795](https://www.bizportal.co.il/mutualfunds/quote/generalview/5115795) | USD | true | 128.08 | USD |
| [5127089](https://www.bizportal.co.il/mutualfunds/quote/generalview/5127089) | ILS | true | 275.97 | USD |

The dollar-unit fund 5127089 is a counterexample to using `currency === "ILS"`
as a denomination rule. The foreign ETF 1159250 (IE00B5BMR087) also has
`unitsInUsd: false`; the flag alone cannot establish a domestic mutual-fund NAV.
The eight added detail fixtures contain `latestNavDate: 2026-10-08`, except the
foreign ETF, whose source date is 2026-10-12. Original six NAVs/dates are unchanged;
their originally captured `isForeignEtf` flags are now retained too.

The general rule is deliberately bounded to domestic mutual funds: `fundType`
must be `mutual`, `isForeignEtf` and `unitsInUsd` must both be explicitly boolean
false, and the domestic ISIN must encode the same requested security number.
Only the independently checked base codes ILS/USD/EUR/JPY/CAD/INR/HKD are
accepted. Missing/malformed flags or identities, other codes, and explicit
denomination labels contradicting the flag are rejected. Existing equity-index,
money-market and non-leveraged discovery restrictions still apply. An accepted
NAV is in agorot and is divided by 100 once; no FX conversion is applied.

This rule is an inference from the captured source schema and representative
independent checks, not a blanket claim that every non-USD fund quotes in ILS.
New base currencies, other unit denominations, or a source schema change require
verification before support is extended. Tests include genuine USD-unit funds,
foreign ETFs, missing/malformed metadata and synthetic denomination conflicts.
