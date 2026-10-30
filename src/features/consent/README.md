# Data Element Repository

Catalogue owns the UI; Java `consent-management-service` owns data and validation.
No legacy CMP server is needed for these pages.

Set `CONSENT_SERVICE_URL=http://localhost:8088` in Catalogue's server environment
or `.env.local`, then restart Catalogue after changing the value. Configure and
initialize the Java service database as described in its README.

Sign in once with an Identity OS administrator, CMP writer, auditor or DPO role.
The expandable sidebar appears in organization and platform navigation. Open:

- `/organization/consent/business-units`: organizations; create/view/edit/delete, active flag.
- `/organization/consent/user-attributes`: attributes; create/view/edit/delete, PII flag.
- `/organization/consent/purposes-of-processing`: sub-master categories; CRUD.
- `/organization/consent/consent-purposes`: purpose master; general settings,
  processing activities and attribute selections, processor mappings, translations,
  review, draft/publish, automatic versioning and selected template propagation.
- `/organization/consent/notice-templates`: list/view/create templates using the
  existing Java create API, with purpose rules, durations, legal links and translations.
- `/organization/consent/data-processors`: supporting processor CRUD, linked from
  the purpose-mapping step in a new tab so unsaved form work is retained.
- `/organization/consent/consent-history`: CMP-style search by one or more exact
  reference IDs, user IDs or notice IDs; process, date and both status filters.
- `/organization/consent/manage-consents`: admin renewal/re-enabling and revocation.
  Records are listed only when their original version-specific processing rule enables
  reconsent or revocation. Mandatory records are locked in both UI and backend.
  Renewal uses the original template duration without changing purposes or attributes.
  Changes require a reason and create consent lifecycle audit events; stale actions
  require a refresh. Reader roles can inspect records but cannot change them.
  **View audit history** opens the record's actual lifecycle log with action, admin,
  reason and IST timestamp. The history also opens automatically after a successful
  renewal or revocation, including for legacy records without a linked notice.
- `/organization/consent/notices`: issued-notice list, status views and pagination.
- `/organization/consent/notice-preview`: preview published template versions with the
  same notice UI used during registration, with desktop/mobile display controls.
  Activity checkboxes can be tried; decision buttons are disabled, and only existing
  authenticated read APIs are used. No notice, consent or history record is created.
- Both record lists open `/{noticePublicId}` detail pages with notice/template
  fields, metadata, submitted data, associated consents and paginated lifecycle events.

Consent History appears under the **Consent History** heading; **View Notice Details** appears
under **Notice Details** in the Consent Management sidebar. These views use the same
Identity OS session and Java reader permissions as the repository. Dates filter the
whole selected day in Asia/Kolkata; event and record timestamps display IST.

The record views read the existing CMP `notices`, `notice_metadata`, `consents` and
`consent_audit_trail` tables. They do not generate notices or modify consent decisions.
Consent associations require the same principal, reference and exact process version;
notices without reference IDs show an explicit association-unavailable message.

Lists support search, server sorting, pagination, refresh and explicit delete confirmation.
Read-only roles can view data; Java remains the authority for every request. The
server-only proxy permits only the supported consent endpoints and forwards bearer
authorization. Browser clients never receive service credentials or CMP API keys.

`npm run test:consent-repository` checks proxy route boundaries (Node 22.18+ / 24).
`npx tsc --noEmit`, `npm run lint -- --quiet`, and `npm run build` verify the frontend.

## Registration notice

The registration form's **Click here** opens a notice inside Catalogue using the Java
consent service. Set `CONSENT_NOTICE_TEMPLATE_CODE=2X67hx8xHO` in `.env.local`; the
service uses the latest published version of that code belonging to an active
organization. `CONSENT_SERVICE_URL` defaults to `http://localhost:8088`.

Catalogue's `/api/consent-notice` creates the notice and submits its decision. The
registration form stays in memory, including OTP verification, while the user reviews
the notice. No redirect or separate consent platform is involved. Passwords and other
registration field values are not sent to the notice service or saved in session storage.
Accepting saves the selected activities and their grant events; declining saves a rejected
notice and leaves registration blocked. Both appear in the existing history/details views.
Registration only becomes enabled after the backend confirms acceptance for the current
principal. Refreshing the registration page requires consent again.

Anonymous users access only their issued notice using a random 256-bit token, stored
hashed by the backend and valid for 24 hours. Existing administrator APIs retain their
role requirements. Neither `CMP_BASE_URL` nor a CMP API key is used.

After a production build, `node scripts/verify-registration-notice-proxy.mjs` checks
the actual Next.js route against an isolated backend fixture on local ports 53001/58089,
including configured-template selection, token forwarding, and private-field filtering.

### Privacy notice configuration and release review

Required activities are initially selected and locked according to the template's mandatory
flags. Optional activities start unchecked and remain editable. Consent is recorded only
after the user explicitly accepts; the whole notice can still be declined. The notice separates each purpose, its data items and
consent validity. Consent validity is not described as a data-retention or deletion deadline.

Provide real organisation details in Catalogue's `.env.local`:

```text
CONSENT_PRIVACY_CONTACT_NAME=
CONSENT_PRIVACY_CONTACT_EMAIL=
CONSENT_PRIVACY_POLICY_URL=
CONSENT_WITHDRAWAL_URL=
CONSENT_RIGHTS_URL=
CONSENT_GRIEVANCE_URL=
CONSENT_BOARD_COMPLAINT_URL=
```

The contact must be the DPO where applicable, or another authorised privacy contact.
Use working routes for withdrawal, rights requests and grievances. A contact email is
shown as a fallback request channel; an email link alone does not establish that withdrawal
is as easy as giving consent. Missing contact details are disclosed visibly in the notice.
No organisation contacts or external request workflows are fabricated.

This UI is not a compliance certification. Before production, verify actual rights and
withdrawal workflows, language access and accurate notice translations, minimum necessary
data for each purpose, valid grounds for any mandatory data, lawful retention and deletion,
appropriate child/guardian handling where relevant, and evidence of the exact notice and
language presented. The existing backend records selections, a template version and grant
events, but does not implement the organisation's complete DPDP obligations by itself.

Design references: DPDP Act 2023 sections 5, 6 and 11–14
(https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf),
and the final DPDP Rules 2025, rule 3
(https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf).
The Rules have staged commencement; their notice provisions should not be described as
already fully effective solely because the Rules were notified.

Child / guardian demo flow and configuration: [CONSENT_CHILD_GUARDIAN_DEMO.md](../../../../docs/CONSENT_CHILD_GUARDIAN_DEMO.md).
