export function googleFormBridgeAppsScript(webhookUrl: string): string {
  return `const EVENTGATE_WEBHOOK_URL = ${JSON.stringify(webhookUrl)};
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
}`;
}
