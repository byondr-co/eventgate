import { describe, expect, it } from "vitest";

import { googleFormBridgeAppsScript } from "@/lib/google-form-bridge-apps-script";

type CellValue = Date | number | string | null | undefined;
type ResponseBody = Record<string, unknown> | string;

type SyncResult = {
  sync: string;
  guestId: string | null;
  detail: string;
  clearGuestId: boolean;
};

type FakeResponse = {
  getResponseCode: () => number;
  getContentText: () => string;
};

type ScriptHarness = {
  onFormSubmit: (event: { range: FakeRange; namedValues?: Record<string, string[]> }) => void;
  syncSelectedRowToEventgate: () => void;
  resultFromResponse: (response: FakeResponse) => SyncResult;
  matchingSubmitTriggers: () => FakeTrigger[];
  ensureSubmitTrigger: () => { created: boolean; count: number };
  submittedAtForRow: (sheet: FakeSheet, rowNumber: number) => string;
  fieldsFromRow: (sheet: FakeSheet, rowNumber: number) => Record<string, string[]>;
  writeSyncResult: (sheet: FakeSheet, rowNumber: number, result: SyncResult) => void;
};

class FakeRange {
  constructor(
    private readonly sheet: FakeSheet,
    private readonly row: number,
    private readonly column: number,
    private readonly rowCount = 1,
    private readonly columnCount = 1,
  ) {}

  getRow() {
    return this.row;
  }

  getSheet() {
    return this.sheet;
  }

  getValue() {
    return this.sheet.readCell(this.row, this.column);
  }

  getValues() {
    return Array.from({ length: this.rowCount }, (_, rowIndex) =>
      Array.from({ length: this.columnCount }, (_, columnIndex) =>
        this.sheet.readCell(this.row + rowIndex, this.column + columnIndex),
      ),
    );
  }

  setValue(value: CellValue) {
    this.sheet.writeCell(this.row, this.column, value);
  }
}

class FakeSheet {
  readonly hiddenColumns: number[] = [];

  constructor(
    private readonly data: CellValue[][],
    private readonly activeRow = 2,
    private readonly activeColumn = 1,
  ) {}

  getSheetId() {
    return 456;
  }

  getLastColumn() {
    return Math.max(...this.data.map((row) => row.length));
  }

  getRange(row: number, column: number, rowCount = 1, columnCount = 1) {
    return new FakeRange(this, row, column, rowCount, columnCount);
  }

  getActiveRange() {
    return new FakeRange(this, this.activeRow, this.activeColumn);
  }

  hideColumns(column: number) {
    this.hiddenColumns.push(column);
  }

  readCell(row: number, column: number) {
    return this.data[row - 1]?.[column - 1] ?? "";
  }

  writeCell(row: number, column: number, value: CellValue) {
    this.data[row - 1] ??= [];
    this.data[row - 1][column - 1] = value;
  }

  valueForHeader(rowNumber: number, header: string) {
    const columnIndex = this.data[0].indexOf(header);
    return columnIndex === -1 ? undefined : this.data[rowNumber - 1][columnIndex];
  }
}

class FakeTrigger {
  constructor(
    private readonly handlerFunction: string,
    private readonly eventType: string,
    private readonly sourceId: string | null,
  ) {}

  getHandlerFunction() {
    return this.handlerFunction;
  }

  getEventType() {
    return this.eventType;
  }

  getTriggerSourceId() {
    return this.sourceId;
  }
}

function makeResponse(code: number, body: ResponseBody): FakeResponse {
  return {
    getResponseCode: () => code,
    getContentText: () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function makeFakeDate(isoValues: string[]): DateConstructor {
  let callCount = 0;

  class FakeDate extends Date {
    constructor(value?: string | number | Date) {
      if (arguments.length === 0) {
        super(isoValues[Math.min(callCount, isoValues.length - 1)]);
        callCount += 1;
        return;
      }

      super(value as string | number | Date);
    }
  }

  return FakeDate as unknown as DateConstructor;
}

function loadScript({
  sheet = new FakeSheet([["Timestamp"], ["2026-06-10T00:00:00.000Z"]]),
  responses = [],
  triggers = [],
  activeSpreadsheetId = "spreadsheet-1",
  date = Date,
}: {
  sheet?: FakeSheet;
  responses?: FakeResponse[];
  triggers?: FakeTrigger[];
  activeSpreadsheetId?: string;
  date?: DateConstructor;
} = {}) {
  const payloads: Array<Record<string, unknown>> = [];
  const createdTriggers: Array<{ handler: string; spreadsheetId: string }> = [];
  const spreadsheet = { getId: () => activeSpreadsheetId };

  const SpreadsheetApp = {
    getUi: () => ({
      alert: () => undefined,
      createMenu: () => ({
        addItem() {
          return this;
        },
        addSeparator() {
          return this;
        },
        addToUi() {
          return this;
        },
      }),
    }),
    getActive: () => spreadsheet,
    getActiveSheet: () => sheet,
  };
  const ScriptApp = {
    EventType: { ON_FORM_SUBMIT: "ON_FORM_SUBMIT" },
    getProjectTriggers: () => triggers,
    newTrigger: (handler: string) => ({
      forSpreadsheet(selectedSpreadsheet: typeof spreadsheet) {
        return {
          onFormSubmit() {
            return {
              create() {
                createdTriggers.push({
                  handler,
                  spreadsheetId: selectedSpreadsheet.getId(),
                });
              },
            };
          },
        };
      },
    }),
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: () => "secret-123",
    }),
  };
  const UrlFetchApp = {
    fetch: (_url: string, options: { payload: string }) => {
      payloads.push(JSON.parse(options.payload) as Record<string, unknown>);
      return responses.shift() ?? makeResponse(201, { status: "accepted", guest_id: "guest-1" });
    },
  };
  const Utilities = { sleep: () => undefined };
  const script = googleFormBridgeAppsScript(
    "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
  );
  const evaluate = new Function(
    "SpreadsheetApp",
    "ScriptApp",
    "PropertiesService",
    "UrlFetchApp",
    "Utilities",
    "Date",
    `${script}; return {
      onFormSubmit,
      syncSelectedRowToEventgate,
      resultFromResponse,
      matchingSubmitTriggers,
      ensureSubmitTrigger,
      submittedAtForRow,
      fieldsFromRow,
      writeSyncResult
    };`,
  );

  return {
    createdTriggers,
    harness: evaluate(
      SpreadsheetApp,
      ScriptApp,
      PropertiesService,
      UrlFetchApp,
      Utilities,
      date,
    ) as ScriptHarness,
    payloads,
    sheet,
  };
}

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
    expect(script).toContain("syncSheetRow(sheet, rowNumber, fieldsFromRow(sheet, rowNumber));");
    expect(script).not.toContain("e.namedValues");
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
    expect(script).toContain('const SUBMITTED_AT_COLUMN_NAME = "Eventgate Submitted At";');
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

  it("embeds the bridge secret when provided and falls back to the script property otherwise", () => {
    const withSecret = googleFormBridgeAppsScript(
      "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
      "sek_test_123",
    );
    expect(withSecret).toContain('const EVENTGATE_BRIDGE_SECRET_EMBEDDED = "sek_test_123";');
    expect(withSecret).toContain("if (EVENTGATE_BRIDGE_SECRET_EMBEDDED)");
    expect(withSecret).toContain(
      "PropertiesService.getScriptProperties().getProperty(BRIDGE_SECRET_PROPERTY)",
    );

    const withoutSecret = googleFormBridgeAppsScript(
      "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
    );
    expect(withoutSecret).toContain('const EVENTGATE_BRIDGE_SECRET_EMBEDDED = "";');
  });

  it("uses the embedded secret in the request header so no manual script property is needed", () => {
    const sheet = new FakeSheet([
      ["Timestamp", "Full Name"],
      ["2026-06-10T01:00:00.000Z", "Ada Lovelace"],
    ]);
    const script = googleFormBridgeAppsScript(
      "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
      "sek_embedded_999",
    );
    const headers: Array<Record<string, string>> = [];
    const SpreadsheetApp = {
      getUi: () => ({ alert: () => undefined }),
      getActive: () => ({ getId: () => "s1" }),
      getActiveSheet: () => sheet,
    };
    // Script property is empty -> only the embedded secret can satisfy the header.
    const PropertiesService = {
      getScriptProperties: () => ({ getProperty: () => null }),
    };
    const UrlFetchApp = {
      fetch: (_url: string, options: { headers: Record<string, string> }) => {
        headers.push(options.headers);
        return makeResponse(201, { status: "accepted", guest_id: "g1" });
      },
    };
    const evaluate = new Function(
      "SpreadsheetApp",
      "PropertiesService",
      "UrlFetchApp",
      "Utilities",
      "Date",
      `${script}; return { syncSelectedRowToEventgate };`,
    );
    const harness = evaluate(
      SpreadsheetApp,
      PropertiesService,
      UrlFetchApp,
      { sleep: () => undefined },
      Date,
    ) as { syncSelectedRowToEventgate: () => void };
    harness.syncSelectedRowToEventgate();
    expect(headers).toHaveLength(1);
    expect(headers[0]["X-Eventgate-Bridge-Secret"]).toBe("sek_embedded_999");
  });

  it("preserves existing guest ID for generic rejected replay mismatch responses", () => {
    const sheet = new FakeSheet([
      [
        "Timestamp",
        "Eventgate Guest ID",
        "Eventgate Sync",
        "Eventgate Detail",
        "Eventgate Synced At",
      ],
      ["2026-06-10T01:00:00.000Z", "guest-existing", "", "", ""],
    ]);
    const { harness } = loadScript({ sheet });

    const result = harness.resultFromResponse(
      makeResponse(400, { status: "rejected", detail: "Submission replay mismatch." }),
    );
    harness.writeSyncResult(sheet, 2, result);

    expect(result.clearGuestId).toBe(false);
    expect(sheet.valueForHeader(2, "Eventgate Sync")).toBe("rejected");
    expect(sheet.valueForHeader(2, "Eventgate Guest ID")).toBe("guest-existing");
  });

  it("clears existing guest ID for unauthorized or disabled responses without guest ID", () => {
    const sheet = new FakeSheet([
      [
        "Timestamp",
        "Eventgate Guest ID",
        "Eventgate Sync",
        "Eventgate Detail",
        "Eventgate Synced At",
      ],
      ["2026-06-10T01:00:00.000Z", "guest-existing", "", "", ""],
    ]);
    const { harness } = loadScript({ sheet });

    harness.writeSyncResult(sheet, 2, harness.resultFromResponse(makeResponse(401, "")));
    expect(sheet.valueForHeader(2, "Eventgate Guest ID")).toBe("");

    sheet.writeCell(2, 2, "guest-existing");
    harness.writeSyncResult(
      sheet,
      2,
      harness.resultFromResponse(makeResponse(400, { detail: "Bridge is disabled." })),
    );
    expect(sheet.valueForHeader(2, "Eventgate Guest ID")).toBe("");
  });

  it("reuses the same submitted_at when re-syncing a row with an unparseable timestamp", () => {
    const sheet = new FakeSheet([
      [
        "Timestamp",
        "Full Name",
        "Eventgate Sync",
        "Eventgate Guest ID",
        "Eventgate Detail",
        "Eventgate Synced At",
      ],
      ["not a timestamp", "Ada Lovelace", "", "", "", ""],
    ]);
    const { harness, payloads } = loadScript({
      date: makeFakeDate([
        "2026-06-10T01:00:00.000Z",
        "2026-06-10T01:00:01.000Z",
        "2026-06-10T01:00:02.000Z",
        "2026-06-10T01:00:03.000Z",
      ]),
      responses: [
        makeResponse(201, { status: "accepted", guest_id: "guest-1" }),
        makeResponse(200, { status: "duplicate", guest_id: "guest-1" }),
      ],
      sheet,
    });

    harness.syncSelectedRowToEventgate();
    harness.syncSelectedRowToEventgate();

    expect(payloads).toHaveLength(2);
    expect(payloads[0].submitted_at).toBe("2026-06-10T01:00:00.000Z");
    expect(payloads[1].submitted_at).toBe(payloads[0].submitted_at);
    expect(sheet.valueForHeader(2, "Eventgate Submitted At")).toBe(payloads[0].submitted_at);
  });

  it("builds identical payloads for automatic submit and manual sync of the same row", () => {
    const sheet = new FakeSheet([
      [
        "Timestamp",
        "Full Name",
        "Email",
        "Eventgate Sync",
        "Eventgate Guest ID",
        "Eventgate Detail",
        "Eventgate Synced At",
      ],
      ["not a timestamp", "Ada Lovelace", "", "", "", "", ""],
    ]);
    const { harness, payloads } = loadScript({
      date: makeFakeDate([
        "2026-06-10T01:00:00.000Z",
        "2026-06-10T01:00:01.000Z",
        "2026-06-10T01:00:02.000Z",
        "2026-06-10T01:00:03.000Z",
      ]),
      responses: [
        makeResponse(201, { status: "accepted", guest_id: "guest-1" }),
        makeResponse(200, { status: "duplicate", guest_id: "guest-1" }),
      ],
      sheet,
    });

    harness.onFormSubmit({
      range: sheet.getRange(2, 1),
      namedValues: {
        Email: [""],
        "Full Name": ["Different value from event payload"],
        "Unexpected Form Field": ["ignored"],
      },
    });
    harness.syncSelectedRowToEventgate();

    expect(payloads).toHaveLength(2);
    expect(payloads[1]).toMatchObject({
      submission_id: payloads[0].submission_id,
      submitted_at: payloads[0].submitted_at,
      fields: payloads[0].fields,
    });
    expect(payloads[0].fields).toEqual({
      Timestamp: ["not a timestamp"],
      "Full Name": ["Ada Lovelace"],
    });
  });

  it("ignores same-handler triggers from a different source and creates the spreadsheet trigger", () => {
    const { createdTriggers, harness } = loadScript({
      activeSpreadsheetId: "active-spreadsheet",
      triggers: [new FakeTrigger("onFormSubmit", "ON_FORM_SUBMIT", "different-spreadsheet")],
    });

    expect(harness.matchingSubmitTriggers()).toHaveLength(0);
    expect(harness.ensureSubmitTrigger()).toEqual({ created: true, count: 1 });
    expect(createdTriggers).toEqual([
      { handler: "onFormSubmit", spreadsheetId: "active-spreadsheet" },
    ]);
  });
});
