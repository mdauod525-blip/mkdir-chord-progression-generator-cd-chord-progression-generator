# Legal & compliance dependencies

> This document lists issues to resolve **with qualified counsel** licensed in Virginia, West
> Virginia (and Maryland/DC before expanding there). It is not legal advice, and the software does
> not make the business compliant by itself.

## Must be resolved before launching investor solicitation

| Topic | Why it matters | What the software does today | Owner action |
|---|---|---|---|
| **Securities law** (Securities Act §5, Reg D 506(b)/(c), state blue-sky, Howey) | Pooled investments, JV interests and fractional deal participation can be securities, whatever they are called. General solicitation is only allowed under 506(c) with accredited-investor verification | Marketplace is private (approved, verified investors only). Every view carries a "not an offer of securities" disclosure. EOIs are explicitly nonbinding. No pooling, escrow or payment features exist. **Publishing a real opportunity requires an admin to confirm counsel review** | Counsel to decide the structure (e.g. direct loans or whole-property sales to single investors vs. a securities offering) and the solicitation method; possible Form D and state notice filings |
| **Broker-dealer / finder rules** | Being paid based on capital raised can require broker-dealer registration | **No transaction-based or success fees are implemented**, only flat subscriptions | Counsel review before any deal-contingent compensation |
| **Investment adviser rules** | Personalized recommendations about securities can be advisory activity | Scores and matches are labelled as estimates and preliminary fits, not recommendations | Counsel review of marketing and match language |
| **Real estate brokerage licensing** (Va. Code §54.1-2100 et seq.; W. Va. Code §30-40) | Marketing other people's property for compensation generally requires a license | The platform analyzes and shares data; it does not list property for sellers or collect commissions | Determine whether a licensed broker partner is needed, especially for MLS data and any per-deal fee |
| **Wholesaling** | VA and WV have rules on marketing equitable interests and required disclosures (laws vary and change) | Wholesaler submissions are labelled `wholesale` and attributed to the submitter, who attests to their right to share | Confirm current VA/WV wholesaling requirements; add required disclosures to listings |
| **Investor verification** | 506(c) requires reasonable steps to verify accredited status | Verification workflow (identity, accreditation, proof of funds, entity) with reviewer and timestamps. Documents are referenced, not stored in the database | Choose a verification provider or letter-based process; define the retention policy |

## Marketing & communications

| Topic | Implementation |
|---|---|
| CAN-SPAM | Email only with recorded opt-in; unsubscribe link and physical mailing address appended to every email; one-click unsubscribe stops email and SMS |
| TCPA / 10DLC | SMS only with separate express consent (timestamp and source recorded); "Reply STOP" in templates; Twilio 10DLC brand/campaign registration required before sending |
| Advertising disclosures | The disclosure text (editable in settings) is shown on every opportunity and in every investor email: estimates, not guarantees or appraisals |
| Fair Housing Act | No protected-class data is collected about investors; scoring and matching use only property economics and stated investor preferences; Census data is context only; the AI system prompt forbids referencing protected characteristics |

## Privacy & data protection

- Phone numbers, seller contact and property access details are encrypted at rest (Fernet); phone numbers are masked in lists.
- Exact address, seller and access information go only to staff and investors with an explicit, logged access grant (e.g. after an NDA).
- The audit log covers logins, data changes, approvals, publications, notifications and access grants.
- Nothing about sellers or investors is sent to the AI; prompts include only property and economics facts.
- **To do before launch:** privacy policy and terms of use; a data-retention schedule; incident response; a
  review of any state privacy law thresholds (e.g. the Virginia CDPA) as the user base grows.

## Data licensing

Each data source records its license and permitted use, and every record carries them. Do not enable
a source until its terms allow this commercial use. Maryland data requires attribution. HUD homes
may be bid only through registered brokers. OpenStreetMap tiles require attribution, and heavy use needs
a different tile provider.

## Agent guardrails (by design)

The automation agent can read data, analyze, score, match, draft summaries and alert staff. It has
**no code path** to purchase property, transfer money, sign agreements, contact sellers, make offers,
or publish opportunities. Publishing and investor notification are separate admin-only actions.
