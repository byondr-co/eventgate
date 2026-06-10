# Plan O - Google Form Bridge Sheet Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the Google Form bridge response Sheet workflow with structured sync columns, menu-driven setup, automatic trigger installation, and selected-row manual sync.

**Architecture:** Move the generated Apps Script into a focused frontend script-generator module so the settings card stays small. The Apps Script remains Sheet-bound, keeps the existing Eventgate webhook contract, installs its own spreadsheet submit trigger idempotently, writes structured result columns, and derives stable row payloads so manual re-sync preserves backend idempotency. Backend APIs stay unchanged.

**Tech Stack:** Next.js 16 + React 19 + Vitest, Google Apps Script V8, Google Sheets custom menus, ScriptApp installable spreadsheet triggers, existing Django Google Form bridge webhook.

---

## Final Implementation Notes

The final branch intentionally differs from the first draft snippets in this
plan in three places:

- Automatic submit and manual selected-row sync both build payload fields from
  the response Sheet row via `fieldsFromRow(sheet, rowNumber)`. They do not use
  `e.namedValues`, because that can produce a different payload hash from a
  later manual replay of the same row.
- The generated script creates an internal `Eventgate Submitted At` column to
  keep fallback `submitted_at` stable when the Sheet timestamp cell is blank or
  unparseable.
- Generic `rejected` responses preserve an existing `Eventgate Guest ID`.
  Unauthorized responses and disabled responses without a returned guest ID can
  clear the guest ID.

## Current State

- Branch: `topic/google-form-bridge-sheet-ops-design`.
- Design spec: `docs/superpowers/specs/2026-06-10-google-form-bridge-sheet-ops-design.md`.
- Existing generated script lives inline in `frontend/components/integrations/google-form-bridge-card.tsx`.
- Existing component test lives at `frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx`.
- Existing runbook lives at `docs/runbooks/google-form-bridge-apps-script.md`.
- Existing pilot runbook bridge smoke lives in `docs/plans/2026-05-23-pilot-launch-runbook.md`.
- Existing untracked files `AGENTS.md` and `dummy-guests-250.csv` are unrelated. Do not stage them.

## File Structure

- Create `frontend/lib/google-form-bridge-apps-script.ts`
  - Sole responsibility: generate the Sheet-bound Apps Script string for a given Eventgate webhook URL.
- Create `frontend/__tests__/lib/google-form-bridge-apps-script.test.ts`
  - Verifies the generated script contains the Sheet menu, trigger installation, structured columns, stable row ID/timestamp helpers, selected-row manual sync, and no hardcoded Email dependency.
- Modify `frontend/components/integrations/google-form-bridge-card.tsx`
  - Remove the inline `scriptFor()` function.
  - Import and use `googleFormBridgeAppsScript()`.
- Modify `frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx`
  - Keep the existing settings-card behavior test.
  - Add a small assertion that the textarea receives the enhanced script from the generator.
- Modify `docs/runbooks/google-form-bridge-apps-script.md`
  - Update setup instructions to prefer `Eventgate > Initialize setup`.
  - Document structured columns and selected-row manual sync.
  - Replace the script block with the enhanced Sheet-bound script.
- Modify `docs/plans/2026-05-23-pilot-launch-runbook.md`
  - Update the optional bridge smoke checklist to check structured columns and menu-driven setup.

## Pre-flight

- [ ] **Step 1: Confirm branch and worktree state**

Run:

```bash
cd /Users/vinei/Projects/eventgate
git status --short --branch
git log --oneline --decorate --max-count=5
```

Expected:

- Branch is `topic/google-form-bridge-sheet-ops-design` or a fresh implementation branch created from it.
- `AGENTS.md` and `dummy-guests-250.csv` may appear as untracked files.
- No tracked files are dirty before implementation starts.

- [ ] **Step 2: Confirm frontend dependencies are usable**

Run:

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20
pnpm install
```

Expected: install exits 0.

## Task 1: Add failing tests for the enhanced Apps Script generator

**Files:**

- Create: `frontend/__tests__/lib/google-form-bridge-apps-script.test.ts`
- Modify: `frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx`

- [ ] **Step 1: Create the failing generator test**

Create `frontend/__tests__/lib/google-form-bridge-apps-script.test.ts`:

```ts
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
    expect(script).toContain("function onOpen()");
    expect(script).toContain('.createMenu("Eventgate")');
    expect(script).toContain('.addItem("Initialize setup", "initializeEventgateSetup")');
    expect(script).toContain('.addItem("Check setup", "checkEventgateSetup")');
    expect(script).toContain('.addItem("Sync selected row", "syncSelectedRowToEventgate")');
    expect(script).toContain("function initializeEventgateSetup()");
    expect(script).toContain("function checkEventgateSetup()");
    expect(script).toContain("function initializeEventgateColumns()");
    expect(script).toContain("function syncSelectedRowToEventgate()");
    expect(script).toContain("ScriptApp.getProjectTriggers()");
    expect(script).toContain('ScriptApp.newTrigger("onFormSubmit")');
    expect(script).toContain(".forSpreadsheet(SpreadsheetApp.getActive())");
    expect(script).toContain(".onFormSubmit()");
    expect(script).toContain('const GUEST_ID_COLUMN_NAME = "Eventgate Guest ID";');
    expect(script).toContain('const DETAIL_COLUMN_NAME = "Eventgate Detail";');
    expect(script).toContain('const SYNCED_AT_COLUMN_NAME = "Eventgate Synced At";');
    expect(script).toContain("function submittedAtForRow(sheet, rowNumber)");
    expect(script).toContain("function fieldsFromRow(sheet, rowNumber)");
    expect(script).toContain("function writeSyncResult(sheet, rowNumber, result)");
    expect(script).toContain("function resultFromResponse(response)");
    expect(script).toContain("function submissionIdFor(sheet, rowNumber)");
    expect(script).not.toContain('values["Email"]');
  });
});
```

- [ ] **Step 2: Extend the existing component test**

In `frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx`, find the existing test named `"shows existing webhook URL and Apps Script snippet"`.

Inside that test, after the existing script assertions:

```ts
    expect(script.value).toContain("sheet.getSheetId()");
    expect(script.value).toContain("function postToEventgate");
    expect(script.value).not.toContain('values["Email"]');
```

append:

```ts
    expect(script.value).toContain("function onOpen()");
    expect(script.value).toContain('.createMenu("Eventgate")');
    expect(script.value).toContain("function initializeEventgateSetup()");
    expect(script.value).toContain("function syncSelectedRowToEventgate()");
    expect(script.value).toContain("Eventgate Guest ID");
    expect(script.value).toContain("Eventgate Synced At");
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20
pnpm test -- google-form-bridge-apps-script google-form-bridge-card
```

Expected:

- `google-form-bridge-apps-script.test.ts` fails because `@/lib/google-form-bridge-apps-script` does not exist.
- `google-form-bridge-card.test.tsx` fails because the textarea script does not contain the menu/setup/manual sync functions yet.

Do not commit this failing state.

## Task 2: Implement the Apps Script generator and wire the settings card to it

**Files:**

- Create: `frontend/lib/google-form-bridge-apps-script.ts`
- Modify: `frontend/components/integrations/google-form-bridge-card.tsx`
- Test: `frontend/__tests__/lib/google-form-bridge-apps-script.test.ts`
- Test: `frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx`

- [ ] **Step 1: Create the script generator module**

Create `frontend/lib/google-form-bridge-apps-script.ts`:

```ts
export function googleFormBridgeAppsScript(webhookUrl: string) {
  return `const EVENTGATE_WEBHOOK_URL = ${JSON.stringify(webhookUrl)};
const BRIDGE_SECRET_PROPERTY = "EVENTGATE_BRIDGE_SECRET";
const HEADER_ROW = 1;
const STATUS_COLUMN_NAME = "Eventgate Sync";
const GUEST_ID_COLUMN_NAME = "Eventgate Guest ID";
const DETAIL_COLUMN_NAME = "Eventgate Detail";
const SYNCED_AT_COLUMN_NAME = "Eventgate Synced At";
const EVENTGATE_COLUMNS = [
  STATUS_COLUMN_NAME,
  GUEST_ID_COLUMN_NAME,
  DETAIL_COLUMN_NAME,
  SYNCED_AT_COLUMN_NAME
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
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return (
      trigger.getHandlerFunction() === "onFormSubmit" &&
      trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT
    );
  });
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
    created.push(columnName);
    headers = getHeaders(sheet);
  });

  return { columns: getHeaderMap(sheet), created: created };
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
  const value = sheet.getRange(rowNumber, 1).getValue();
  if (value instanceof Date) return value.toISOString();
  if (value) {
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
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

  if (!body.ok) {
    return {
      sync: "failed",
      guestId: null,
      detail: code + " invalid JSON: " + shorten(text),
      clearGuestId: false
    };
  }

  const data = body.value;
  const status = data.status ? String(data.status) : "";
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
```

- [ ] **Step 2: Wire the settings card to the generator**

In `frontend/components/integrations/google-form-bridge-card.tsx`, add this import near the existing lib imports:

```ts
import { googleFormBridgeAppsScript } from "@/lib/google-form-bridge-apps-script";
```

Delete the entire existing local `scriptFor(webhookUrl: string)` function.

Replace:

```ts
  const script = useMemo(() => scriptFor(bridge?.webhook_url ?? ""), [bridge?.webhook_url]);
```

with:

```ts
  const script = useMemo(
    () => googleFormBridgeAppsScript(bridge?.webhook_url ?? ""),
    [bridge?.webhook_url],
  );
```

- [ ] **Step 3: Run focused frontend tests**

Run:

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20
pnpm test -- google-form-bridge-apps-script google-form-bridge-card
```

Expected: PASS for the new generator test and existing Google Form bridge card tests.

- [ ] **Step 4: Run typecheck for the touched frontend files**

Run:

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
cd /Users/vinei/Projects/eventgate
git add frontend/lib/google-form-bridge-apps-script.ts \
  frontend/__tests__/lib/google-form-bridge-apps-script.test.ts \
  frontend/components/integrations/google-form-bridge-card.tsx \
  frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx
git commit -m "feat(integrations): enhance Google Form bridge Sheet script"
```

Expected: commit succeeds.

## Task 3: Update bridge runbook and pilot checklist

**Files:**

- Modify: `docs/runbooks/google-form-bridge-apps-script.md`
- Modify: `docs/plans/2026-05-23-pilot-launch-runbook.md`

- [ ] **Step 1: Update the setup instructions in the bridge runbook**

In `docs/runbooks/google-form-bridge-apps-script.md`, replace the `## Google Sheet setup` numbered list with:

```md
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
14. Confirm the response row gets:
    - `Eventgate Sync` = `accepted`
    - `Eventgate Guest ID` = the created guest UUID
    - `Eventgate Detail` blank or non-blocking detail text
    - `Eventgate Synced At` = a recent timestamp
15. Confirm the guest appears in Eventgate.
16. Confirm the QR email sends when email delivery is configured for this pilot.
17. Keep the bridge enabled only after the test passes; disable it if rehearsal
    fails or the bridge is not green by the 2026-06-12 cutoff.
```

- [ ] **Step 2: Add a structured columns section**

After the setup list, add:

```md
## Eventgate-managed columns

The script creates these columns at the end of the response Sheet:

| Column | Meaning |
|---|---|
| `Eventgate Sync` | Short result: `accepted`, `duplicate`, `updated`, `rejected`, `disabled`, `unauthorized`, or `failed`. |
| `Eventgate Guest ID` | Eventgate guest UUID when the webhook returns one. |
| `Eventgate Detail` | Error or diagnostic text. |
| `Eventgate Synced At` | Timestamp when the script last wrote a sync result. |

Do not rename these columns after setup. If a column is deleted, use
Eventgate -> Initialize columns only to recreate it.
```

- [ ] **Step 3: Add a manual sync section**

Before `## Manual retry`, add:

```md
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
```

- [ ] **Step 4: Replace the Sheet-bound script block**

In `docs/runbooks/google-form-bridge-apps-script.md`, replace the entire JavaScript block under `## Sheet-bound script` with the script generated by `frontend/lib/google-form-bridge-apps-script.ts`, using this placeholder URL on the first line:

```javascript
const EVENTGATE_WEBHOOK_URL =
  "https://api.eventgate.byondr.co/api/v1/integrations/google-forms/BRIDGE_ID/submissions/";
```

The runbook script must otherwise match the generated script from Task 2 exactly, including:

```javascript
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
```

and:

```javascript
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
```

- [ ] **Step 5: Update the pilot runbook bridge smoke checklist**

In `docs/plans/2026-05-23-pilot-launch-runbook.md`, find `### 1.5a Google Form bridge smoke (optional Plan N path)`.

Replace the existing bridge setup bullets:

```md
- [ ] The response Sheet has the Sheet-bound Apps Script from
      `docs/runbooks/google-form-bridge-apps-script.md`.
- [ ] Apps Script trigger is installed on the response Sheet:
      `onFormSubmit` / From spreadsheet / On form submit.
```

with:

```md
- [ ] The response Sheet has the Sheet-bound Apps Script from
      `docs/runbooks/google-form-bridge-apps-script.md`.
- [ ] The Sheet menu shows Eventgate -> Initialize setup, Check setup, Sync
      selected row, and Initialize columns only.
- [ ] Eventgate -> Initialize setup has been run and Eventgate -> Check setup
      reports the setup is ready.
```

Replace the existing successful-submission bullet:

```md
- [ ] The test response row gets an Eventgate Sync value with `accepted`.
```

with:

```md
- [ ] The test response row gets structured sync output:
      `Eventgate Sync=accepted`, `Eventgate Guest ID=<uuid>`,
      `Eventgate Detail` blank or non-blocking, and `Eventgate Synced At`
      populated.
```

Add this bullet after the replay/idempotency bullet:

```md
- [ ] Eventgate -> Sync selected row can replay the accepted test row without
      creating another guest or duplicate QR email.
```

- [ ] **Step 6: Run docs-focused scans**

Run:

```bash
cd /Users/vinei/Projects/eventgate
rg -n "Initialize setup|Check setup|Sync selected row|Eventgate Guest ID|Eventgate Synced At" \
  docs/runbooks/google-form-bridge-apps-script.md \
  docs/plans/2026-05-23-pilot-launch-runbook.md
```

Expected: both docs contain the menu names and structured column names.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
cd /Users/vinei/Projects/eventgate
git add docs/runbooks/google-form-bridge-apps-script.md \
  docs/plans/2026-05-23-pilot-launch-runbook.md
git commit -m "docs(integrations): update Google Form bridge Sheet setup"
```

Expected: commit succeeds.

## Task 4: Full verification and closeout

**Files:**

- Verify: frontend tests and docs scans.
- No file edits unless verification exposes a defect.

- [ ] **Step 1: Run focused frontend verification**

Run:

```bash
cd /Users/vinei/Projects/eventgate/frontend
source ~/.nvm/nvm.sh && nvm use 20
pnpm test -- google-form-bridge-apps-script google-form-bridge-card
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
```

Expected:

- Focused Vitest tests pass.
- TypeScript passes.
- Lint exits 0. Existing unrelated `<img>` warnings may still appear.
- Prettier check passes.

- [ ] **Step 2: Run backend smoke check only if backend files are untouched**

Run:

```bash
cd /Users/vinei/Projects/eventgate
git diff --name-only origin/main...HEAD | rg '^backend/' || true
```

Expected: no backend file paths.

If backend paths appear, stop and inspect before continuing. This plan should not touch backend code.

- [ ] **Step 3: Verify generated script includes no hardcoded pilot-only values**

Run:

```bash
cd /Users/vinei/Projects/eventgate
rg -n "Click Cam|1717ff7f|values\\[\\\"Email\\\"\\]" \
  frontend/lib/google-form-bridge-apps-script.ts \
  frontend/components/integrations/google-form-bridge-card.tsx \
  docs/runbooks/google-form-bridge-apps-script.md
```

Expected:

- No matches for `1717ff7f` or `values["Email"]`.
- `Click Cam` may appear only in surrounding runbook prose, not in the generated script.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
cd /Users/vinei/Projects/eventgate
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Expected changed files:

```text
A frontend/lib/google-form-bridge-apps-script.ts
A frontend/__tests__/lib/google-form-bridge-apps-script.test.ts
M frontend/components/integrations/google-form-bridge-card.tsx
M frontend/__tests__/components/integrations/google-form-bridge-card.test.tsx
M docs/runbooks/google-form-bridge-apps-script.md
M docs/plans/2026-05-23-pilot-launch-runbook.md
```

The design spec and this plan may also appear if this branch includes their doc commits.

- [ ] **Step 5: Prepare PR summary**

Use this PR summary:

```md
## Summary

- moves the Google Form bridge Apps Script into a focused generator module
- adds Sheet menu setup, idempotent trigger installation, structured sync columns, and selected-row manual sync
- updates bridge and pilot runbooks for the new Sheet setup flow

## Verification

- `pnpm test -- google-form-bridge-apps-script google-form-bridge-card`
- `pnpm exec tsc --noEmit`
- `pnpm lint`
- `pnpm format:check`
```

## Manual QA After Deployment

After this reaches prod, use a test response Sheet:

1. Copy the new generated script from Eventgate settings.
2. Paste it into the response Sheet Apps Script project.
3. Set `EVENTGATE_BRIDGE_SECRET` in script properties.
4. Reload the Sheet.
5. Run Eventgate -> Initialize setup.
6. Run Eventgate -> Check setup.
7. Submit a test form response.
8. Confirm structured columns populate.
9. Select the accepted row and run Eventgate -> Sync selected row.
10. Confirm no duplicate guest or duplicate QR email is created.

## Self-Review Checklist

- Spec coverage:
  - Structured columns: Task 2 generator + Task 3 docs.
  - Sheet menu: Task 2 generator + Task 3 docs.
  - Idempotent trigger install: Task 2 generator and tests.
  - Manual selected-row sync for any row: Task 2 generator + Task 3 docs.
  - Backend unchanged: Task 4 backend path scan.
- Placeholder scan:
  - Plan uses no unspecified implementation placeholders.
- Type consistency:
  - Generator export is `googleFormBridgeAppsScript`.
  - Menu handler names match tests: `initializeEventgateSetup`, `checkEventgateSetup`, `syncSelectedRowToEventgate`, `initializeEventgateColumns`.
  - Column constants match docs and tests.
