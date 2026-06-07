# Google Form bridge Apps Script install guide

Use this for the Click Cam pilot when the customer wants to keep using a Google Form
or its response Sheet while Eventgate owns QR issuance, guest records, scanning,
help desk, and audit.

## When to use this bridge

Use it only when all are true:

- The customer already has a Google Form or response Sheet.
- Eventgate native registration is not the preferred intake path for this pilot.
- A test form submission has synced into Eventgate before the T-7 gate.

If the bridge is not green by 2026-06-12, disable it and use Eventgate native
registration or CSV import.

## Eventgate setup

1. Open the event in Eventgate.
2. Go to Settings.
3. Create a Google Form bridge.
4. Configure the field mapping.
5. Copy the webhook URL.
6. Copy the one-time secret.
7. Keep the bridge disabled until the Apps Script is installed.

## Google Sheet setup

1. Open the Google Form response Sheet.
2. Open Extensions -> Apps Script.
3. Paste the script below.
4. Replace the `EVENTGATE_WEBHOOK_URL` constant with the bridge URL copied from Eventgate.
5. Open Project Settings -> Script properties.
6. Add `EVENTGATE_BRIDGE_SECRET` with the one-time bridge secret copied from Eventgate.
7. Save the script.
8. In Apps Script, open Triggers.
9. Add a trigger:
   - Function: `onFormSubmit`
   - Event source: From spreadsheet
   - Event type: On form submit
10. Return to Eventgate Settings and enable the bridge.
11. Submit a test Google Form response.
12. Confirm the response row gets an Eventgate Sync value without a disabled or
    failed response.
13. Confirm the guest appears in Eventgate.
14. Confirm the QR email sends when email delivery is configured for this pilot.
15. Keep the bridge enabled only after the test passes; disable it if rehearsal
    fails or the bridge is not green by the 2026-06-12 cutoff.

## Sheet-bound script

```javascript
const EVENTGATE_WEBHOOK_URL =
  "https://api.eventgate.byondr.co/api/v1/integrations/google-forms/BRIDGE_ID/submissions/";
const EVENTGATE_BRIDGE_SECRET =
  PropertiesService.getScriptProperties().getProperty(
    "EVENTGATE_BRIDGE_SECRET",
  );
const STATUS_COLUMN_NAME = "Eventgate Sync";

function onFormSubmit(e) {
  if (!EVENTGATE_BRIDGE_SECRET)
    throw new Error("Missing EVENTGATE_BRIDGE_SECRET script property.");
  const values = e.namedValues || {};
  const submittedAt = new Date().toISOString();
  const submissionId = submissionIdFor(e, submittedAt);

  const payload = {
    submission_id: submissionId,
    submitted_at: submittedAt,
    fields: values,
  };

  const response = postToEventgate(payload);
  writeSyncStatus(
    e,
    response.getResponseCode() + " " + response.getContentText(),
  );
}

function submissionIdFor(e, submittedAt) {
  if (!e.range) return ["manual", submittedAt].join("-");
  const sheet = e.range.getSheet();
  return ["sheet", sheet.getSheetId(), e.range.getRow()].join("-");
}

function postToEventgate(payload) {
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { "X-Eventgate-Bridge-Secret": EVENTGATE_BRIDGE_SECRET },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const first = UrlFetchApp.fetch(EVENTGATE_WEBHOOK_URL, options);
  if (first.getResponseCode() >= 500) {
    Utilities.sleep(1000);
    return UrlFetchApp.fetch(EVENTGATE_WEBHOOK_URL, options);
  }
  return first;
}

function writeSyncStatus(e, status) {
  if (!e.range) return;
  const sheet = e.range.getSheet();
  const headerRow = 1;
  const headers = sheet
    .getRange(headerRow, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  let col = headers.indexOf(STATUS_COLUMN_NAME) + 1;
  if (col === 0) {
    col = sheet.getLastColumn() + 1;
    sheet.getRange(headerRow, col).setValue(STATUS_COLUMN_NAME);
  }
  sheet.getRange(e.range.getRow(), col).setValue(status);
}
```

## Manual retry

If a row says failed but the Eventgate event is healthy:

1. Fix the field mapping or secret.
2. Submit a new Google Form response with the corrected values, or use CSV
   import for the unsynced rows.
3. If you build a custom retry helper later, keep the original `submission_id`
   when replaying the same row.

Eventgate idempotency prevents duplicate guests when the same `submission_id` is
sent twice.

## Disable procedure

1. In Eventgate Settings, uncheck Enabled for the bridge.
2. Leave the Apps Script installed if the customer still wants logs.
3. Unsynced rows can be imported by CSV before the event.
