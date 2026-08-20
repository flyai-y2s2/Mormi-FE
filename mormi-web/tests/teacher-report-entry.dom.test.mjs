import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { transformWithOxc } from "vite";

async function loadEntry() {
  const source = await readFile(new URL("../app/TeacherReportEntry.tsx", import.meta.url), "utf8");
  const { code } = await transformWithOxc(source, "TeacherReportEntry.tsx", { target: "es2022" });
  const require = createRequire(import.meta.url);
  const moduleCode = code.replace(
    '"react/jsx-runtime"',
    JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href),
  );
  return import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString("base64")}`);
}

test("login entry links teachers directly to the report", async () => {
  const [{ TeacherReportEntry }, React, server] = await Promise.all([
    loadEntry(),
    import("react"),
    import("react-dom/server"),
  ]);
  const html = server.renderToStaticMarkup(React.createElement(TeacherReportEntry));
  assert.match(html, /href="\/report\?teacher=1"/);
  assert.match(html, />교사용 리포트<\/a>/);
  assert.match(html, /class="teacher-report-entry"/);
});
