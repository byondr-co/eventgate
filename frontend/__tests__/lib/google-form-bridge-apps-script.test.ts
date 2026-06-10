import { describe, expect, it } from "vitest";

import { googleFormBridgeAppsScript } from "@/lib/google-form-bridge-apps-script";

describe("googleFormBridgeAppsScript", () => {
  it("generates the Sheet menu, setup helpers, structured columns, and manual row sync", () => {
    const script = googleFormBridgeAppsScript(
      "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
    );

    expect(script).toContain(
      'const EVENTGATE_WEBHOOK_URL = "https://api.test/api/v1/integrations/google-forms/b1/submissions/";',
    );
    expect(script).toContain('const BRIDGE_SECRET_PROPERTY = "EVENTGATE_BRIDGE_SECRET";');
    expect(script).toContain("const HEADER_ROW = 1;");
    expect(script).toContain("function onOpen()");
    expect(script).toContain('.createMenu("Eventgate")');
    expect(script).toContain('.addItem("Initialize setup", "initializeEventgateSetup")');
    expect(script).toContain('.addItem("Check setup", "checkEventgateSetup")');
    expect(script).toContain('.addItem("Sync selected row", "syncSelectedRowToEventgate")');
    expect(script).toContain('.addItem("Initialize columns only", "initializeEventgateColumns")');
    expect(script).toContain("function initializeEventgateSetup()");
    expect(script).toContain("function checkEventgateSetup()");
    expect(script).toContain("function initializeEventgateColumns()");
    expect(script).toContain("function syncSelectedRowToEventgate()");
    expect(script).toContain("function onFormSubmit(e)");
    expect(script).toContain("const sheet = e.range.getSheet();");
    expect(script).toContain("const fields = e.namedValues || fieldsFromRow(sheet, rowNumber);");
    expect(script).toContain("ScriptApp.getProjectTriggers()");
    expect(script).toContain('ScriptApp.newTrigger("onFormSubmit")');
    expect(script).toContain(".forSpreadsheet(SpreadsheetApp.getActive())");
    expect(script).toContain(".onFormSubmit()");
    expect(script).toContain('trigger.getHandlerFunction() === "onFormSubmit"');
    expect(script).toContain("trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT");
    expect(script).toContain('const STATUS_COLUMN_NAME = "Eventgate Sync";');
    expect(script).toContain('const GUEST_ID_COLUMN_NAME = "Eventgate Guest ID";');
    expect(script).toContain('const DETAIL_COLUMN_NAME = "Eventgate Detail";');
    expect(script).toContain('const SYNCED_AT_COLUMN_NAME = "Eventgate Synced At";');
    expect(script).toContain("const EVENTGATE_COLUMNS = [");
    expect(script).toContain("function submittedAtForRow(sheet, rowNumber)");
    expect(script).toContain("sheet.getRange(rowNumber, 1).getValue()");
    expect(script).toContain("function fieldsFromRow(sheet, rowNumber)");
    expect(script).toContain("EVENTGATE_COLUMNS.indexOf(header) !== -1");
    expect(script).toContain("function writeSyncResult(sheet, rowNumber, result)");
    expect(script).toContain("function resultFromResponse(response)");
    expect(script).toContain("function submissionIdFor(sheet, rowNumber)");
    expect(script).toContain('return ["sheet", sheet.getSheetId(), rowNumber].join("-");');
    expect(script).toContain("submitted_at: submittedAtForRow(sheet, rowNumber)");
    expect(script).toContain("function postToEventgate(payload)");
    expect(script).toContain("if (first.getResponseCode() >= 500)");
    expect(script).not.toContain('values["Email"]');
  });
});
