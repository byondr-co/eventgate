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

1. Open the Google Form response Sheet. Do not install this script from the
   Google Form editor; the bridge is response Sheet bound.
2. Open Extensions -> Apps Script.
3. Paste the script below.
4. Replace the `EVENTGATE_WEBHOOK_URL` constant with the bridge URL copied from
   Eventgate.
5. Open Project Settings -> Script properties.
6. Add `EVENTGATE_BRIDGE_SECRET` with the one-time bridge secret copied from
   Eventgate.
7. Save the script.
8. Reload the response Sheet.
9. In the Sheet menu bar, open Eventgate -> Initialize setup.
10. Complete the Google authorization prompt if it appears.
11. In the Sheet menu bar, open Eventgate -> Check setup and confirm it says
    setup looks ready.
12. Return to Eventgate Settings and enable the bridge.
13. Submit a test Google Form response.
14. Confirm the response row gets these operator-facing result columns:
    - `Eventgate Sync` = `accepted`
    - `Eventgate Guest ID` = the created guest UUID
    - `Eventgate Detail` blank or non-blocking detail text
    - `Eventgate Synced At` = a recent timestamp
15. Leave `Eventgate Submitted At` alone if it appears or is hidden; the script
    owns it for stable manual replay timestamps.
16. Confirm the guest appears in Eventgate.
17. Confirm the QR email sends when email delivery is configured for this pilot.
18. Keep the bridge enabled only after the test passes; disable it if rehearsal
    fails or the bridge is not green by the 2026-06-12 cutoff.

## Eventgate-managed columns

The script creates these columns at the end of the response Sheet:

| Column | Meaning |
| --- | --- |
| `Eventgate Sync` | Operator-facing result: `accepted`, `duplicate`, `updated`, `rejected`, `disabled`, `unauthorized`, or `failed`. |
| `Eventgate Guest ID` | Eventgate guest UUID when the webhook returns one. |
| `Eventgate Detail` | Error or diagnostic text. |
| `Eventgate Synced At` | Timestamp when the script last wrote a sync result. |
| `Eventgate Submitted At` | Internal managed timestamp used to keep fallback `submitted_at` stable for selected-row replay. The script hides this column when it creates it. |

Do not rename or delete these columns after setup. Do not edit
`Eventgate Submitted At`; if it is deleted, unchanged manual replays can lose
their stable fallback timestamp. If a column is missing, use Eventgate ->
Initialize columns only to recreate it.

## Eventgate Sheet menu

Reload the response Sheet after saving the script so the Eventgate menu appears.

| Menu item | Use it for |
| --- | --- |
| Initialize setup | Creates managed columns and installs the form-submit trigger idempotently. |
| Check setup | Confirms the bridge URL, secret, managed columns, and trigger are present. |
| Sync selected row | Manually syncs the currently selected response row. |
| Initialize columns only | Recreates missing managed columns without changing triggers. |

## Sheet-bound script

```javascript
const EVENTGATE_WEBHOOK_URL = "https://api.eventgate.byondr.co/api/v1/integrations/google-forms/BRIDGE_ID/submissions/";
const BRIDGE_SECRET_PROPERTY = "EVENTGATE_BRIDGE_SECRET";
const HEADER_ROW = 1;
const STATUS_COLUMN_NAME = "Eventgate Sync";
const GUEST_ID_COLUMN_NAME = "Eventgate Guest ID";
const DETAIL_COLUMN_NAME = "Eventgate Detail";
const SYNCED_AT_COLUMN_NAME = "Eventgate Synced At";
const SUBMITTED_AT_COLUMN_NAME = "Eventgate Submitted At";
const EVENTGATE_COLUMNS = [
  STATUS_COLUMN_NAME,
  GUEST_ID_COLUMN_NAME,
  DETAIL_COLUMN_NAME,
  SYNCED_AT_COLUMN_NAME,
  SUBMITTED_AT_COLUMN_NAME
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Eventgate")
    .addItem("Initialize setup", "initializeEventgateSetup")
    .addItem("Check setup", "checkEventgateSetup")
    .addSeparator()
    .addItem("Sync selected row", "syncSelectedRowToEventgate")
    .addItem("Initialize columns only", "initializeEventgateColumns")
    .addToUi();
}

function initializeEventgateSetup() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  ensureEventgateColumns(sheet);
  const triggerInfo = ensureSubmitTrigger();
  const issues = setupIssues(sheet);

  if (issues.length > 0) {
    ui.alert(
      "Eventgate setup initialized with warnings:\\n\\n- " + issues.join("\\n- ")
    );
    return;
  }

  const triggerMessage = triggerInfo.created
    ? "Submit trigger installed."
    : "Submit trigger already existed.";
  ui.alert(
    "Eventgate setup is ready. " +
      triggerMessage +
      " Submit a test Google Form response next."
  );
}

function checkEventgateSetup() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const issues = setupIssues(sheet);

  if (issues.length > 0) {
    ui.alert("Eventgate setup needs attention:\\n\\n- " + issues.join("\\n- "));
    return;
  }

  ui.alert("Eventgate setup looks ready.");
}

function initializeEventgateColumns() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const result = ensureEventgateColumns(sheet);

  if (result.created.length > 0) {
    ui.alert("Created Eventgate columns: " + result.created.join(", "));
    return;
  }

  ui.alert("Eventgate columns already exist.");
}

function onFormSubmit(e) {
  if (!e || !e.range) {
    throw new Error("Missing form submit range. Install this script on the response Sheet.");
  }

  const sheet = e.range.getSheet();
  const rowNumber = e.range.getRow();
  syncSheetRow(sheet, rowNumber, fieldsFromRow(sheet, rowNumber));
}

function syncSelectedRowToEventgate() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = sheet.getActiveRange();

  if (!range) {
    ui.alert("Select a response row first.");
    return;
  }

  const rowNumber = range.getRow();
  if (rowNumber <= HEADER_ROW) {
    ui.alert("Select a response row, not the header row.");
    return;
  }

  const result = syncSheetRow(sheet, rowNumber, fieldsFromRow(sheet, rowNumber));
  const detail = result.detail ? "\\n\\n" + result.detail : "";
  ui.alert("Eventgate sync complete: " + result.sync + detail);
}

function syncSheetRow(sheet, rowNumber, fields) {
  try {
    assertReadyForSync();
    const payload = {
      submission_id: submissionIdFor(sheet, rowNumber),
      submitted_at: submittedAtForRow(sheet, rowNumber),
      fields: fields
    };
    const response = postToEventgate(payload);
    const result = resultFromResponse(response);
    writeSyncResult(sheet, rowNumber, result);
    return result;
  } catch (err) {
    const result = {
      sync: "failed",
      guestId: null,
      detail: shorten(errorMessage(err)),
      clearGuestId: false
    };
    writeSyncResult(sheet, rowNumber, result);
    return result;
  }
}

function assertReadyForSync() {
  if (!EVENTGATE_WEBHOOK_URL || EVENTGATE_WEBHOOK_URL.indexOf("BRIDGE_ID") !== -1) {
    throw new Error("Set EVENTGATE_WEBHOOK_URL to the bridge URL copied from Eventgate.");
  }
  if (!eventgateBridgeSecret()) {
    throw new Error("Missing EVENTGATE_BRIDGE_SECRET script property.");
  }
}

function eventgateBridgeSecret() {
  return PropertiesService.getScriptProperties().getProperty(BRIDGE_SECRET_PROPERTY);
}

function ensureSubmitTrigger() {
  const triggers = matchingSubmitTriggers();
  if (triggers.length > 0) {
    return { created: false, count: triggers.length };
  }

  ScriptApp.newTrigger("onFormSubmit")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();

  return { created: true, count: 1 };
}

function matchingSubmitTriggers() {
  const activeSpreadsheetId = activeSpreadsheetSourceId();
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return (
      trigger.getHandlerFunction() === "onFormSubmit" &&
      trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT &&
      triggerMatchesActiveSpreadsheet(trigger, activeSpreadsheetId)
    );
  });
}

function activeSpreadsheetSourceId() {
  const spreadsheet = SpreadsheetApp.getActive();
  if (!spreadsheet || typeof spreadsheet.getId !== "function") return "";
  return String(spreadsheet.getId() || "");
}

function triggerMatchesActiveSpreadsheet(trigger, activeSpreadsheetId) {
  if (!activeSpreadsheetId || typeof trigger.getTriggerSourceId !== "function") {
    return true;
  }

  let triggerSourceId = "";
  try {
    triggerSourceId = String(trigger.getTriggerSourceId() || "");
  } catch (err) {
    return true;
  }

  if (!triggerSourceId) return true;
  return triggerSourceId === activeSpreadsheetId;
}

function setupIssues(sheet) {
  const issues = [];
  const missingColumns = missingEventgateColumns(sheet);
  const triggerCount = matchingSubmitTriggers().length;

  if (!EVENTGATE_WEBHOOK_URL || EVENTGATE_WEBHOOK_URL.indexOf("BRIDGE_ID") !== -1) {
    issues.push("Set EVENTGATE_WEBHOOK_URL to the bridge URL copied from Eventgate.");
  }
  if (!eventgateBridgeSecret()) {
    issues.push("Add EVENTGATE_BRIDGE_SECRET in Apps Script Project Settings.");
  }
  if (missingColumns.length > 0) {
    issues.push("Missing columns: " + missingColumns.join(", "));
  }
  if (triggerCount === 0) {
    issues.push("Submit trigger is missing. Run Eventgate > Initialize setup.");
  }
  if (triggerCount > 1) {
    issues.push("Multiple onFormSubmit triggers found. Remove duplicates in Apps Script Triggers.");
  }

  return issues;
}

function missingEventgateColumns(sheet) {
  const headers = getHeaders(sheet);
  return EVENTGATE_COLUMNS.filter(function (columnName) {
    return headers.indexOf(columnName) === -1;
  });
}

function ensureEventgateColumns(sheet) {
  const created = [];
  let headers = getHeaders(sheet);
  let lastColumn = Math.max(sheet.getLastColumn(), 1);

  EVENTGATE_COLUMNS.forEach(function (columnName) {
    if (headers.indexOf(columnName) !== -1) return;
    lastColumn += 1;
    sheet.getRange(HEADER_ROW, lastColumn).setValue(columnName);
    hideInternalColumn(sheet, columnName, lastColumn);
    created.push(columnName);
    headers = getHeaders(sheet);
  });

  return { columns: getHeaderMap(sheet), created: created };
}

function hideInternalColumn(sheet, columnName, columnNumber) {
  if (columnName !== SUBMITTED_AT_COLUMN_NAME) return;
  if (typeof sheet.hideColumns !== "function") return;
  sheet.hideColumns(columnNumber);
}

function getHeaders(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  return sheet
    .getRange(HEADER_ROW, 1, 1, lastColumn)
    .getValues()[0]
    .map(function (value) {
      return String(value || "").trim();
    });
}

function getHeaderMap(sheet) {
  const headers = getHeaders(sheet);
  const out = {};
  headers.forEach(function (header, index) {
    if (header) out[header] = index + 1;
  });
  return out;
}

function fieldsFromRow(sheet, rowNumber) {
  const headers = getHeaders(sheet);
  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const fields = {};

  headers.forEach(function (header, index) {
    if (!header || EVENTGATE_COLUMNS.indexOf(header) !== -1) return;
    const value = normalizeCellValue(values[index]);
    if (!value) return;
    fields[header] = [value];
  });

  return fields;
}

function normalizeCellValue(value) {
  if (value === null || typeof value === "undefined") return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function submittedAtForRow(sheet, rowNumber) {
  const columns = ensureEventgateColumns(sheet).columns;
  const existing = isoTimestampFromCellValue(
    sheet.getRange(rowNumber, columns[SUBMITTED_AT_COLUMN_NAME]).getValue()
  );
  if (existing) return existing;

  const value = sheet.getRange(rowNumber, 1).getValue();
  const stableSubmittedAt = isoTimestampFromCellValue(value) || new Date().toISOString();
  sheet.getRange(rowNumber, columns[SUBMITTED_AT_COLUMN_NAME]).setValue(stableSubmittedAt);
  return stableSubmittedAt;
}

function isoTimestampFromCellValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (value) {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return "";
}

function submissionIdFor(sheet, rowNumber) {
  return ["sheet", sheet.getSheetId(), rowNumber].join("-");
}

function postToEventgate(payload) {
  const options = {
    method: "post",
    contentType: "application/json",
    headers: { "X-Eventgate-Bridge-Secret": eventgateBridgeSecret() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const first = UrlFetchApp.fetch(EVENTGATE_WEBHOOK_URL, options);
  if (first.getResponseCode() >= 500) {
    Utilities.sleep(1000);
    return UrlFetchApp.fetch(EVENTGATE_WEBHOOK_URL, options);
  }
  return first;
}

function resultFromResponse(response) {
  const code = response.getResponseCode();
  const text = response.getContentText() || "";
  const body = parseResponseBody(text);
  const data = body.ok ? body.value : {};
  const detail = detailFromBody(data);
  const guestId = data.guest_id ? String(data.guest_id) : "";

  if (code === 401) {
    return {
      sync: "unauthorized",
      guestId: "",
      detail: detail || "Invalid bridge secret.",
      clearGuestId: true
    };
  }

  if (!body.ok) {
    return {
      sync: "failed",
      guestId: null,
      detail: code + " invalid JSON: " + shorten(text),
      clearGuestId: false
    };
  }

  const status = data.status ? String(data.status) : "";

  if (code >= 500) {
    return {
      sync: "failed",
      guestId: null,
      detail: code + " " + shorten(text),
      clearGuestId: false
    };
  }

  if (detail === "Bridge is disabled.") {
    return { sync: "disabled", guestId: guestId, detail: detail, clearGuestId: !guestId };
  }

  if (status === "accepted" || status === "duplicate" || status === "updated") {
    return { sync: status, guestId: guestId, detail: detail, clearGuestId: false };
  }

  if (status === "rejected" || code >= 400) {
    return {
      sync: "rejected",
      guestId: guestId,
      detail: detail || code + " " + shorten(text),
      clearGuestId: false
    };
  }

  return {
    sync: "failed",
    guestId: null,
    detail: "Unexpected response: " + code + " " + shorten(text),
    clearGuestId: false
  };
}

function parseResponseBody(text) {
  if (!text) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, value: {} };
  }
}

function detailFromBody(data) {
  if (data.detail) return String(data.detail);
  if (data.error) return String(data.error);
  return "";
}

function writeSyncResult(sheet, rowNumber, result) {
  const columns = ensureEventgateColumns(sheet).columns;
  sheet.getRange(rowNumber, columns[STATUS_COLUMN_NAME]).setValue(result.sync);

  if (result.clearGuestId) {
    sheet.getRange(rowNumber, columns[GUEST_ID_COLUMN_NAME]).setValue(result.guestId || "");
  } else if (result.guestId) {
    sheet.getRange(rowNumber, columns[GUEST_ID_COLUMN_NAME]).setValue(result.guestId);
  }

  sheet.getRange(rowNumber, columns[DETAIL_COLUMN_NAME]).setValue(result.detail || "");
  sheet.getRange(rowNumber, columns[SYNCED_AT_COLUMN_NAME]).setValue(new Date().toISOString());
}

function errorMessage(err) {
  if (err && err.message) return String(err.message);
  return String(err);
}

function shorten(value) {
  const text = String(value || "");
  if (text.length <= 240) return text;
  return text.slice(0, 237) + "...";
}
```

## Manual selected-row sync

Use this when a row did not sync because the trigger was missing, the bridge was
disabled during setup, or the operator wants to replay a row.

1. Open the response Sheet.
2. Select any cell in the response row.
3. Open Eventgate -> Sync selected row.
4. Confirm the Eventgate-managed columns update for that row.

The script allows re-syncing any row, including one already marked `accepted`.
Eventgate idempotency prevents duplicate guests and duplicate QR emails when the
row payload is unchanged. If the row was edited after it was already processed,
Eventgate rejects the replay and writes the reason into `Eventgate Detail`.
Automatic submits and manual sync both build the Eventgate payload from the
current Sheet row, excluding Eventgate-managed columns.

## Manual retry

If a row says failed but the Eventgate event is healthy:

1. Fix the field mapping, secret, or bridge enabled state.
2. Select any cell in the failed response row.
3. Open Eventgate -> Sync selected row.
4. Confirm `Eventgate Sync`, `Eventgate Guest ID`, `Eventgate Detail`, and
   `Eventgate Synced At` update for that row.

Eventgate idempotency prevents duplicate guests when the same `submission_id` is
sent twice. For unchanged rows, the script keeps both `submission_id` and
fallback `submitted_at` stable.

## Disable procedure

1. In Eventgate Settings, uncheck Enabled for the bridge.
2. Leave the Apps Script installed if the customer still wants logs.
3. Unsynced rows can be imported by CSV before the event.
