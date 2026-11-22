# Underwriting, scoring and matching methodology

All numbers are deterministic Python (`backend/app/analysis`, `backend/app/matching`) covered by
`backend/tests`. Every analysis stores the exact assumptions, inputs and comps it used.

## 1. Renovation estimate (`renovation.py`)

Scope comes from condition (excellent→cosmetic, good→light, fair→medium, poor→heavy,
distressed→gut). If condition is unknown, the medium scope is assumed and the deal is flagged. Line items are cosmetic,
kitchen, bathrooms (per bath), flooring, roofing, HVAC, electrical, plumbing, structural,
remediation, landscaping, permits (2% of hard cost, with a minimum) and contingency (8–20% by scope, +5% for
foundation or fire damage). The market cost multiplier applies (NoVA 1.15, Panhandle 0.95). Known issues
(roof, HVAC, foundation…) force the matching line in. Any line can be replaced by a contractor quote;
a saved manual/contractor estimate takes precedence in future analyses.

## 2. Comparable sales & ARV (`comps.py`)

**Eligible:** closed sales from recorded deeds, county sales data, licensed MLS sold data, or sales
an analyst manually verified. **Never** active listings, and **never** assessed values.

**Excluded, each with its reason shown:** distressed or non-arm's-length sale types (foreclosure, REO,
short sale, auction, family), sold in poor condition (an as-is value, not ARV), older than 12 months,
outside the extended radius (1–4 mi by market), a different property-type group, size outside ±25%,
bedrooms ±2 or more, or a future date.

**Adjustments toward the subject:** size at 50% of the comp's $/sqft, ±$7,500 per bedroom, ±$10,000 per
bath, and time at the market's monthly appreciation (FHFA when loaded).

**Weights:** recency (≤6 mo preferred), distance, size similarity, same subdivision (+15%), condition at sale,
total adjustment size, and verification status.

**ARV** is the weighted mean of adjusted prices (rounded to $100), with a range of ±1 standard deviation.

**Confidence (0–100)** = comp count (35) + recency (20) + distance (15) + consistency/CV (20) +
verification (10).

Fewer than three comps or confidence below 50 → `manual_review_required`. With zero comps there is no ARV,
and the deal is scored as *Insufficient data*. A manual ARV needs a written reason; it is labelled, its confidence is capped
(35 unless within 5% of the comp ARV), and it caps the score at 79.

## 3. Financial model (`financials.py`)

| Item | Formula |
|---|---|
| Acquisition costs | buyer closing % × price + inspection + legal + acquisition fee |
| Loan (hard money) | loan-to-purchase % × price + rehab-financed % × renovation, capped at max loan-to-ARV (rehab portion cut first) |
| Financing costs | points % × loan + lender fees + interest (purchase portion for the whole hold; rehab draws average half-drawn during rehab) |
| Holding costs | (taxes + insurance + utilities + maintenance + HOA) × months; taxes from actual bill, otherwise rate × price |
| Selling costs | commission % × ARV + seller closing % × ARV + staging + marketing |
| **Total project cost** | purchase + acquisition + renovation + holding + selling + financing |
| Gross sale proceeds | ARV |
| **Net profit** | ARV − total project cost |
| Cash invested | total project cost − selling costs − loan (selling costs are paid at closing; the loan is repaid from proceeds) |
| **ROI** | net profit ÷ cash invested × 100 |
| Cash-on-cash | equals ROI for a single-exit flip (no interim cash flow); shown for consistency |
| Return on cost | net profit ÷ total project cost (unlevered) |
| Annualized ROI | (1 + ROI)^(12 / months) − 1 |
| Profit margin | net profit ÷ ARV |
| Break-even sale price | (TPC − selling + fixed selling) ÷ (1 − commission % − seller closing %) |
| Duration | acquisition lead time + rehab months (by scope) + days to contract + days to close |
| **MAO** | ARV − renovation − holding − selling − financing − acquisition − target profit, **solved by bisection** because acquisition and financing depend on price. Target profit = max(minimum $, % of ARV) |
| 70% rule | shown for reference only; never used |
| Sensitivity | profit at ARV −5% / −10%, renovation +10% / +25%, +2 months, and combined stress |

The spec's sample deal (price $250k, renovation $55k, ARV $390k, 6 months) nets about **$24k**, not
$42k, once 85%-LTP hard money, points, interest, taxes, insurance, utilities, 5% commission and seller
costs are all included. The model deliberately surfaces those costs.

## 4. Deal score (`scoring.py`)

| Factor | Weight | Full marks when |
|---|---|---|
| Discount to market value | 12 | (price + renovation) ≤ 60% of ARV |
| ARV confidence | 14 | confidence 100 |
| Renovation risk | 8 | renovation ≤ 5% of ARV; penalties for structural issues, unknown condition, pre-1950 construction |
| Expected net profit | 14 | ≥ 2.4 × the market minimum profit |
| ROI | 12 | ≥ 40% on cash |
| Neighborhood sales activity | 8 | ≥ 8 verified nearby sales in 6 months |
| Days on market | 5 | ≥ 120 days (negotiating leverage); unknown = neutral |
| Market liquidity | 8 | ≤ 14 days to contract |
| Comparable-sales quality | 8 | average similarity 100% |
| Property condition certainty | 5 | condition known/inspected |
| Exit strategy risk | 6 | break-even ≥ 20% below ARV and still profitable under stress |

**Caps (applied after summing):** no ARV or no price → ≤ 59 and *Insufficient data*; profit ≤ 0 → ≤ 40;
profit below the minimum → ≤ 69; fewer than three comps or confidence < 50 → ≤ 69 plus review; loses money under
stress → ≤ 79; manual ARV → ≤ 79. Bands: 90+ exceptional, 80–89 strong, 70–79 potential, 60–69
investigate, < 60 not recommended. Each score comes with a deterministic explanation (strengths,
weaknesses, caps). Claude can rephrase it but cannot change it.

## 5. Investor matching (`matching/engine.py`)

The role is **lender** for private and hard-money lenders (required amount = loan; the check is loan-to-ARV
against the lender's maximum). Every other type is **equity** (required amount = cash invested; the check is ROI
against the investor's minimum).

**Hard disqualifiers:** inactive or no funding available, strategy mismatch, outside preferred
markets/ZIPs, property type not preferred, capital below the requirement or the requirement above
the investor's maximum, ROI below the minimum, LTV above the lender's maximum, deal risk two levels above
tolerance, timeline more than 2 months over the limit.

**Score (100):** geography 20, capital fit 20, return/collateral 20, risk 15, timeline 10, property
type 5, strategy 5, deal quality 5. Any disqualifier caps the score at 49. A match is eligible when it has no
disqualifiers and scores ≥ 60. Every explanation ends with: *"Preliminary match based on stated
preferences only — not a funding commitment, offer, or investment recommendation."* Demo deals match
only demo investors.

Matching never uses protected characteristics. Census data is displayed as context and is never an
input to scoring or matching.
