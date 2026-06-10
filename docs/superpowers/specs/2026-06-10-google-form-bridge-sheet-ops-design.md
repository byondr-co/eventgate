# Google Form Bridge Sheet Operations Design

Date: 2026-06-10
Status: Approved for implementation planning

## Context

Plan N shipped a response Sheet based Google Form bridge for Click Cam. The
bridge works, but the current Apps Script writes a raw HTTP response into one
`Eventgate Sync` column, for example:

```text
201 {"status":"accepted","guest_id":"1717ff7f-73ec-4319-b51c-3b1c1deb8afd"}
```

That is technically useful but not operator-friendly. It also still requires
manual trigger setup after copy/pasting the script.

This design keeps the response Sheet bridge as the recommended pilot path. It
does not introduce a Form-bound script variant.

## Goals

- Make the response Sheet easier to inspect by splitting sync output into
  structured columns.
- Reduce setup mistakes by adding an `Eventgate` Sheet menu that can initialize
  columns and install the submit trigger.
- Add a manual recovery path to sync the selected response row to Eventgate.
- Preserve Eventgate backend idempotency and audit behavior.
- Avoid backend API changes.

## Non-goals

- No Form-bound Apps Script snippet in this iteration.
- No force-update mode for already processed submissions.
- No bulk manual sync.
- No backend endpoint changes.
- No automatic secret provisioning into Apps Script properties.

## Sheet Columns

The Apps Script will manage these columns in the response Sheet:

| Column | Purpose |
|---|---|
| `Eventgate Sync` | Short status: `accepted`, `duplicate`, `updated`, `rejected`, `failed`, `disabled`, or `unauthorized`. |
| `Eventgate Guest ID` | Guest UUID returned by Eventgate when available. |
| `Eventgate Detail` | Short diagnostic text from Eventgate or Apps Script. |
| `Eventgate Synced At` | ISO timestamp when the script wrote the latest sync result. |

The script creates missing columns at the end of the header row. It must not
reorder customer columns or overwrite existing response values.

## Sheet Menu

The Sheet-bound script will add this custom menu from `onOpen()`:

```text
Eventgate
- Initialize setup
- Check setup
- Sync selected row
- Initialize columns only
```

`Initialize setup` performs the normal one-click setup:

1. Ensure required Eventgate columns exist.
2. Check `EVENTGATE_WEBHOOK_URL` is configured in the script.
3. Check `EVENTGATE_BRIDGE_SECRET` exists in script properties.
4. Install the spreadsheet `on form submit` trigger if it is missing.
5. Show a success or actionable error alert.

Google will still require the user to authorize the script the first time this
menu action runs. That is expected and should be documented.

`Check setup` verifies:

- required columns exist,
- bridge secret is present,
- webhook URL is not blank,
- exactly one usable submit trigger exists for `onFormSubmit`.

It does not mutate the Sheet, except for showing an alert.

`Initialize columns only` creates missing Eventgate columns without touching
triggers.

## Trigger Installation

Trigger installation must be idempotent. The script should inspect existing
project triggers and only create a new spreadsheet submit trigger when there is
not already an `onFormSubmit` trigger for this project.

If duplicate matching triggers already exist, `Check setup` should warn the
operator. `Initialize setup` should not create another duplicate.

The manual trigger setup instructions remain as a fallback in the runbook, but
the preferred path becomes:

1. Paste script into the response Sheet Apps Script project.
2. Save.
3. Reload/open the response Sheet.
4. Choose `Eventgate > Initialize setup`.
5. Complete Google authorization.
6. Submit a test Google Form response.

## Automatic Submit Flow

The automatic submit flow keeps the existing payload contract:

```json
{
  "submission_id": "sheet-<sheetId>-<rowNumber>",
  "submitted_at": "<ISO timestamp>",
  "fields": {
    "Google Form label": ["value"]
  }
}
```

The script posts to the existing webhook using
`X-Eventgate-Bridge-Secret`. It retries once for 5xx responses, matching the
current runbook behavior.

After the webhook response, the script parses the JSON body and writes the
structured columns.

## Manual Selected-row Sync

`Eventgate > Sync selected row` allows re-syncing any selected response row,
including one already marked `accepted`.

Behavior:

1. The operator selects any cell in a response row.
2. The script rejects header-row selection with a clear alert.
3. The script reads headers from row 1 and values from the selected row.
4. The script builds the same payload as the automatic submit flow.
5. The script uses the same stable `submission_id`:
   `sheet-<sheetId>-<rowNumber>`.
6. The script posts to Eventgate.
7. The script writes the structured sync result columns for that row.

This intentionally does not block based on the existing `Eventgate Sync`
value.

Idempotency behavior remains backend-owned:

- Re-syncing an unchanged accepted row should not create another guest or send
  another QR email.
- Re-syncing an edited row with the same `submission_id` should be rejected by
  Eventgate as a changed replay.
- Correcting an already accepted guest should be done in Eventgate directly, or
  by submitting/importing a new corrected row.

## Result Mapping

The script maps responses into Sheet columns as follows:

| HTTP / body | `Eventgate Sync` | `Eventgate Guest ID` | `Eventgate Detail` |
|---|---|---|---|
| 201 body `status=accepted` | `accepted` | `guest_id` | blank unless body has `detail` |
| 200 body `status=duplicate` | `duplicate` | `guest_id` | body `detail` if present |
| 200 body `status=updated` | `updated` | `guest_id` | body `detail` if present |
| 200 body `status=rejected` | `rejected` | unchanged unless Eventgate returns `guest_id` | body `detail` |
| 400 body `detail=Bridge is disabled.` | `disabled` | blank or existing value cleared | body `detail` |
| 401 | `unauthorized` | blank or existing value cleared | body `detail` or `Invalid bridge secret.` |
| network error or parse error | `failed` | unchanged | short exception message |
| 5xx after retry | `failed` | unchanged | HTTP status and response text |

For generic rejected results, including replay mismatch and validation
rejections, the script should preserve any existing `Eventgate Guest ID` unless
Eventgate returns a new guest ID. For disabled and unauthorized results, the
script should clear `Eventgate Guest ID` unless Eventgate returns a guest ID.

For transient failures where Eventgate may or may not have processed the row,
the script should keep any existing guest ID and write the failure detail.

## Frontend and Docs Scope

Frontend changes are limited to the generated Apps Script snippet in the Google
Form bridge settings card and the related component tests.

Documentation changes:

- Update `docs/runbooks/google-form-bridge-apps-script.md`.
- Update the pilot runbook bridge section if it still references manual trigger
  setup as the primary path.
- Mention that the menu appears in the response Sheet, not the Form editor.

## Testing

Frontend unit tests should verify the generated script contains:

- `onOpen`,
- `initializeEventgateSetup`,
- `checkEventgateSetup`,
- `syncSelectedRowToEventgate`,
- idempotent trigger inspection via `ScriptApp.getProjectTriggers`,
- structured columns including `Eventgate Guest ID`,
- stable row-based submission IDs,
- no dependency on `values["Email"]`.

Docs can be verified with a focused text scan for the new column names and menu
flow.

Backend tests are not required because the webhook contract is unchanged.

## Acceptance Criteria

- The generated Apps Script can initialize columns from the Sheet menu.
- The generated Apps Script can install the submit trigger from the Sheet menu
  without creating duplicates.
- Automatic form submissions write structured sync output columns.
- Manual selected-row sync works for any response row.
- Re-syncing an unchanged accepted row remains idempotent.
- Re-syncing a changed accepted row surfaces Eventgate's replay rejection.
- Runbook instructions match the new preferred setup flow.
