# Local Admin Learner Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a localhost-only learner-name search above the weekly report so a developer can select an operational learner and render that learner's existing diagnostic report without exposing database credentials or administrator keys to the browser.

**Architecture:** Spring owns learner search and selected-learner report generation behind a local-profile, shared-key guard. A Next Route Handler is the only browser-facing proxy and injects that key server-side. The React report keeps its existing rendering model, adding a reusable search component and switching between the authenticated learner data source and the local-admin data source.

**Tech Stack:** Java 21, Spring Boot 4, Spring Data JPA, Spring Security, JUnit 5, Mockito, Next.js 16 App Router, React 19, TypeScript 5.9, Node test runner, JSDOM.

**Spec:** `docs/superpowers/specs/2026-08-19-local-admin-learner-search-design.md`

## Global Constraints

- The local administrator feature must be disabled unless `ENABLE_LOCAL_REPORT_ADMIN=true` in Next and `MORMI_LOCAL_REPORT_ADMIN_ENABLED=true` under Spring's `local` profile.
- The shared administrator key must remain server-side and must never use a `NEXT_PUBLIC_` variable.
- The Next proxy target must be `http://localhost` or `http://127.0.0.1`; reject every other hostname and reject `NODE_ENV=production`.
- Learner search returns only `learner_id` and `display_name`, with a server-enforced limit from 1 through 10.
- Existing authenticated `/v1/reports/diagnostic` endpoints must continue to derive the learner ID only from `LearnerPrincipal`.
- Raw dialogue, login IDs, research codes, password material, database credentials, and shared keys must not appear in responses or logs.
- Keep the pre-existing 100%-ladder edits in `NumericReportPreview.tsx`, `globals.css`, and `numeric-report-preview.dom.test.mjs`; do not revert or rewrite them while adding search.
- Do not enable the operational database connection or persist its password until the user separately authorizes that credential operation.

---

### Task 1: Spring local-admin guard and learner search

**Files:**
- Create: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/report/LocalReportAdminGuard.java`
- Create: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/report/LocalReportAdminDtos.java`
- Create: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/report/LocalReportAdminService.java`
- Create: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/report/LocalReportAdminController.java`
- Modify: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/learner/LearnerRepository.java`
- Modify: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/config/SecurityConfig.java`
- Modify: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/resources/application.yml`
- Test: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/test/java/com/mormi/backend/report/LocalReportAdminGuardTest.java`
- Test: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/test/java/com/mormi/backend/report/LocalReportAdminServiceTest.java`

**Interfaces:**
- Consumes: `LearnerRepository`, `ApiException`, Spring profile/property conditions.
- Produces: `List<LocalLearnerResult> search(String query, int limit)`, `void requireAllowed(String providedKey, String remoteAddress)`, and `GET /v1/local-report-admin/learners`.

- [ ] **Step 1: Write failing guard tests**

```java
@Test
void acceptsOnlyLoopbackWithTheConfiguredKey() {
    var guard = new LocalReportAdminGuard("local-secret");
    assertThatCode(() -> guard.requireAllowed("local-secret", "127.0.0.1"))
            .doesNotThrowAnyException();
    assertThatThrownBy(() -> guard.requireAllowed("wrong", "127.0.0.1"))
            .isInstanceOf(ApiException.class);
    assertThatThrownBy(() -> guard.requireAllowed("local-secret", "10.0.0.8"))
            .isInstanceOf(ApiException.class);
}
```

- [ ] **Step 2: Run the guard test and verify RED**

Run from `Mormi-BE/.worktrees/diagnostic-report`:

```powershell
.\gradlew.bat test --tests "com.mormi.backend.report.LocalReportAdminGuardTest"
```

Expected: compilation fails because `LocalReportAdminGuard` does not exist.

- [ ] **Step 3: Implement the constant-time local guard**

```java
@Profile("local")
@Component
@ConditionalOnProperty(name = "mormi.local-report-admin.enabled", havingValue = "true")
public final class LocalReportAdminGuard {
    private final byte[] expectedKey;

    public LocalReportAdminGuard(@Value("${mormi.local-report-admin.key:}") String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalStateException("Local report admin key is required");
        }
        this.expectedKey = key.getBytes(StandardCharsets.UTF_8);
    }

    void requireAllowed(String providedKey, String remoteAddress) {
        boolean loopback = "127.0.0.1".equals(remoteAddress)
                || "0:0:0:0:0:0:0:1".equals(remoteAddress)
                || "::1".equals(remoteAddress);
        byte[] provided = providedKey == null ? new byte[0] : providedKey.getBytes(StandardCharsets.UTF_8);
        if (!loopback || !MessageDigest.isEqual(expectedKey, provided)) {
            throw ApiException.forbidden("로컬 리포트 관리자 권한이 없습니다.");
        }
    }
}
```

- [ ] **Step 4: Write failing learner-search tests**

```java
@Test
void trimsTheQueryCapsTheLimitAndReturnsOnlyIdAndName() {
    when(learnerRepository.findByDisplayNameContainingIgnoreCaseOrderByDisplayNameAscIdAsc(
            eq("이재"), any(Pageable.class)))
            .thenReturn(List.of(learner(19L, "이재용")));

    assertThat(service.search("  이재  ", 99))
            .containsExactly(new LocalLearnerResult(19L, "이재용"));
    verify(learnerRepository).findByDisplayNameContainingIgnoreCaseOrderByDisplayNameAscIdAsc(
            eq("이재"), argThat(page -> page.getPageSize() == 10));
}

@Test
void rejectsQueriesShorterThanTwoCharacters() {
    assertThatThrownBy(() -> service.search("이", 10)).isInstanceOf(ApiException.class);
    verifyNoInteractions(learnerRepository);
}
```

- [ ] **Step 5: Run the learner-search test and verify RED**

```powershell
.\gradlew.bat test --tests "com.mormi.backend.report.LocalReportAdminServiceTest"
```

Expected: compilation fails because the DTO, repository method, and service do not exist.

- [ ] **Step 6: Implement the DTO, repository query, service, and search endpoint**

```java
public final class LocalReportAdminDtos {
    private LocalReportAdminDtos() {}
    public record LocalLearnerResult(long learnerId, String displayName) {}
}
```

```java
List<Learner> findByDisplayNameContainingIgnoreCaseOrderByDisplayNameAscIdAsc(
        String displayName, Pageable pageable);
```

```java
public List<LocalLearnerResult> search(String rawQuery, int rawLimit) {
    String query = rawQuery == null ? "" : rawQuery.trim();
    if (query.length() < 2) throw ApiException.badRequest("query", "이름을 두 글자 이상 입력해 주세요.");
    int limit = Math.max(1, Math.min(rawLimit, 10));
    return learnerRepository
            .findByDisplayNameContainingIgnoreCaseOrderByDisplayNameAscIdAsc(query, PageRequest.of(0, limit))
            .stream()
            .map(learner -> new LocalLearnerResult(learner.getId(), learner.getDisplayName()))
            .toList();
}
```

The controller must call `guard.requireAllowed(request.getHeader("X-Mormi-Local-Admin-Key"), request.getRemoteAddr())` before calling `service.search(query, limit)`.

- [ ] **Step 7: Permit only the guarded local-admin path through Spring Security and add disabled-by-default settings**

Add before the general `/v1/**` matcher:

```java
.requestMatchers(HttpMethod.GET, "/v1/local-report-admin/**").permitAll()
```

Add to `application.yml`:

```yaml
  local-report-admin:
    enabled: ${MORMI_LOCAL_REPORT_ADMIN_ENABLED:false}
    key: ${MORMI_LOCAL_REPORT_ADMIN_KEY:}
```

- [ ] **Step 8: Run Task 1 tests and the existing backend suite**

```powershell
.\gradlew.bat test --tests "com.mormi.backend.report.LocalReportAdminGuardTest" --tests "com.mormi.backend.report.LocalReportAdminServiceTest"
.\gradlew.bat test
```

Expected: all tests pass.

- [ ] **Step 9: Commit Task 1**

```powershell
git add src/main/java/com/mormi/backend/report/LocalReportAdminGuard.java src/main/java/com/mormi/backend/report/LocalReportAdminDtos.java src/main/java/com/mormi/backend/report/LocalReportAdminService.java src/main/java/com/mormi/backend/report/LocalReportAdminController.java src/main/java/com/mormi/backend/learner/LearnerRepository.java src/main/java/com/mormi/backend/config/SecurityConfig.java src/main/resources/application.yml src/test/java/com/mormi/backend/report/LocalReportAdminGuardTest.java src/test/java/com/mormi/backend/report/LocalReportAdminServiceTest.java
git commit -m "feat(report): add local learner search"
```

---

### Task 2: Spring selected-learner diagnostic endpoints

**Files:**
- Modify: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/report/LocalReportAdminController.java`
- Create: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/report/DiagnosticReportDomains.java`
- Modify: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/main/java/com/mormi/backend/report/DiagnosticReportController.java`
- Test: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/src/test/java/com/mormi/backend/report/LocalReportAdminControllerTest.java`

**Interfaces:**
- Consumes: `LocalReportAdminGuard.requireAllowed`, `DiagnosticReportService.current`, and `DiagnosticReportService.speechEvidence`.
- Produces: `GET /v1/local-report-admin/learners/{learnerId}/diagnostic` and `GET /v1/local-report-admin/learners/{learnerId}/speech-evidence` with the existing `DiagnosticReport` and `SpeechEvidence` response contracts.

- [ ] **Step 1: Write failing controller delegation tests**

```java
@Test
void diagnosticUsesThePathLearnerAndRequestedWeekAfterGuarding() {
    LocalDate monday = LocalDate.of(2026, 8, 17);
    controller.diagnostic(19L, monday, requestWithLoopbackAndKey());
    verify(guard).requireAllowed("local-secret", "127.0.0.1");
    verify(diagnosticReportService).current(19L, monday);
}

@Test
void speechEvidenceUsesTheSameSelectedLearner() {
    LocalDate monday = LocalDate.of(2026, 8, 17);
    controller.speechEvidence(19L, "money-count", monday, requestWithLoopbackAndKey());
    verify(diagnosticReportService).speechEvidence(19L, "money-count", monday);
}
```

- [ ] **Step 2: Run the controller test and verify RED**

```powershell
.\gradlew.bat test --tests "com.mormi.backend.report.LocalReportAdminControllerTest"
```

Expected: compilation fails because both controller methods are missing.

- [ ] **Step 3: Implement the two GET methods**

```java
@GetMapping("/learners/{learnerId}/diagnostic")
public DiagnosticReport diagnostic(
        @PathVariable long learnerId,
        @RequestParam(name = "week_start", required = false) LocalDate weekStart,
        HttpServletRequest request) {
    requireAllowed(request);
    return diagnosticReportService.current(learnerId, weekStart);
}

@GetMapping("/learners/{learnerId}/speech-evidence")
public SpeechEvidence speechEvidence(
        @PathVariable long learnerId,
        @RequestParam("domain_id") String domainId,
        @RequestParam(name = "week_start", required = false) LocalDate weekStart,
        HttpServletRequest request) {
    requireAllowed(request);
    return diagnosticReportService.speechEvidence(learnerId, domainId, weekStart);
}
```

Reuse the supported-domain validation from `DiagnosticReportController` by extracting a package-private `DiagnosticReportDomains.requireSupported(String domainId)` helper rather than duplicating the set.

- [ ] **Step 4: Add a regression test that the authenticated controller ignores query learner IDs**

```java
@Test
void authenticatedDiagnosticStillUsesOnlyThePrincipalLearner() {
    controller.current(new LearnerPrincipal(7L, 101L), LocalDate.of(2026, 8, 17));
    verify(service).current(7L, LocalDate.of(2026, 8, 17));
}
```

- [ ] **Step 5: Run focused and full backend tests**

```powershell
.\gradlew.bat test --tests "com.mormi.backend.report.LocalReportAdminControllerTest"
.\gradlew.bat test
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/main/java/com/mormi/backend/report/LocalReportAdminController.java src/main/java/com/mormi/backend/report/DiagnosticReportController.java src/main/java/com/mormi/backend/report/DiagnosticReportDomains.java src/test/java/com/mormi/backend/report/LocalReportAdminControllerTest.java
git commit -m "feat(report): expose local selected learner diagnostics"
```

---

### Task 3: Next server-only local-admin proxy

**Files:**
- Create: `app/local-report-admin-policy.ts`
- Create: `app/api/local-report-admin/[...path]/route.ts`
- Modify: `.env.example`
- Test: `tests/local-report-admin-policy.test.mts`
- Test: `tests/local-report-admin-proxy.test.mjs`

**Interfaces:**
- Consumes: `ENABLE_LOCAL_REPORT_ADMIN`, `LOCAL_REPORT_ADMIN_ORIGIN`, and `LOCAL_REPORT_ADMIN_KEY` from server runtime environment.
- Produces: `localReportAdminConfig(env, nodeEnv): LocalReportAdminConfig | null` and a GET-only `/api/local-report-admin/*` proxy that injects `X-Mormi-Local-Admin-Key`.

- [ ] **Step 1: Write failing policy tests**

```ts
test("enables only a non-production loopback origin with a key", () => {
  assert.deepEqual(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://127.0.0.1:8080",
    LOCAL_REPORT_ADMIN_KEY: "secret",
  }, "development"), { origin: "http://127.0.0.1:8080", key: "secret" });
  assert.equal(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "https://example.com",
    LOCAL_REPORT_ADMIN_KEY: "secret",
  }, "development"), null);
  assert.equal(localReportAdminConfig({
    ENABLE_LOCAL_REPORT_ADMIN: "true",
    LOCAL_REPORT_ADMIN_ORIGIN: "http://localhost:8080",
    LOCAL_REPORT_ADMIN_KEY: "secret",
  }, "production"), null);
});
```

- [ ] **Step 2: Run the policy test and verify RED**

```powershell
node --experimental-strip-types --test tests/local-report-admin-policy.test.mts
```

Expected: module/function not found.

- [ ] **Step 3: Implement the pure server policy**

```ts
export type LocalReportAdminConfig = { origin: string; key: string };

export function localReportAdminConfig(
  env: Record<string, string | undefined>,
  nodeEnv = env.NODE_ENV,
): LocalReportAdminConfig | null {
  if (nodeEnv === "production" || env.ENABLE_LOCAL_REPORT_ADMIN !== "true") return null;
  const key = env.LOCAL_REPORT_ADMIN_KEY?.trim();
  if (!key) return null;
  try {
    const origin = new URL(env.LOCAL_REPORT_ADMIN_ORIGIN ?? "");
    if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) return null;
    return { origin: origin.toString().replace(/\/$/, ""), key };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Write failing proxy tests**

Test these observable behaviors with a stubbed `globalThis.fetch`:

```js
assert.equal(disabledResponse.status, 404);
assert.equal(forwardedRequest.headers.get("X-Mormi-Local-Admin-Key"), "secret");
assert.equal(forwardedRequest.headers.has("authorization"), false);
assert.equal(forwardedRequest.method, "GET");
assert.match(forwardedRequest.url, /\/v1\/local-report-admin\/learners\?query=/);
```

- [ ] **Step 5: Run the proxy test and verify RED**

```powershell
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/local-report-admin-proxy.test.mjs
```

Expected: route module not found.

- [ ] **Step 6: Implement the dynamic GET Route Handler**

```ts
import "server-only";
import { localReportAdminConfig } from "../../../local-report-admin-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const config = localReportAdminConfig(process.env);
  if (!config) return Response.json({ code: "not_found" }, { status: 404 });
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = new URL(`/v1/local-report-admin/${path.map(encodeURIComponent).join("/")}`, config.origin);
  target.search = incoming.search;
  const upstream = await fetch(target, {
    method: "GET",
    headers: { accept: "application/json", "X-Mormi-Local-Admin-Key": config.key },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
  });
}
```

- [ ] **Step 7: Document disabled defaults**

Add to `.env.example`:

```dotenv
ENABLE_LOCAL_REPORT_ADMIN=false
LOCAL_REPORT_ADMIN_ORIGIN=http://127.0.0.1:8080
LOCAL_REPORT_ADMIN_KEY=
```

- [ ] **Step 8: Run Task 3 tests, lint, and Next build**

```powershell
node --experimental-strip-types --test tests/local-report-admin-policy.test.mts
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/local-report-admin-proxy.test.mjs
npm run lint
npm run build:vercel
```

Expected: all commands pass.

- [ ] **Step 9: Commit Task 3**

```powershell
git add app/local-report-admin-policy.ts app/api/local-report-admin/[...path]/route.ts .env.example tests/local-report-admin-policy.test.mts tests/local-report-admin-proxy.test.mjs
git commit -m "feat(report): add local admin server proxy"
```

---

### Task 4: Reusable learner-search client and component

**Files:**
- Create: `app/local-report-admin-client.ts`
- Create: `app/report/LocalLearnerSearch.tsx`
- Test: `tests/local-learner-search.dom.test.mjs`

**Interfaces:**
- Consumes: same-origin `/api/local-report-admin` endpoints.
- Produces: `LocalAdminLearner`, `localReportAdminApi.search`, `localReportAdminApi.diagnostic`, `localReportAdminApi.speechEvidence`, and `<LocalLearnerSearch currentLearner searchLearners onSelect onUnavailable debounceMs />`.

- [ ] **Step 1: Write failing client contract tests**

```js
const learners = await localReportAdminApi.search("이재", controller.signal);
assert.equal(requestedUrl, "/api/local-report-admin/learners?query=%EC%9D%B4%EC%9E%AC&limit=10");
assert.deepEqual(learners, [{ learner_id: 19, display_name: "이재용" }]);

await localReportAdminApi.diagnostic(19, "2026-08-17", controller.signal);
assert.match(requestedUrl, /learners\/19\/diagnostic\?week_start=2026-08-17/);
```

- [ ] **Step 2: Run client tests and verify RED**

```powershell
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/local-learner-search.dom.test.mjs
```

Expected: module not found.

- [ ] **Step 3: Implement the local client with no learner token dependency**

```ts
export type LocalAdminLearner = { learner_id: number; display_name: string };

async function localAdminRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/local-report-admin${path}`, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new ApiError(response.status, "local_report_admin_error", "학습자 정보를 불러오지 못했습니다.");
  return response.json() as Promise<T>;
}
```

Expose typed `search`, `diagnostic`, and `speechEvidence` methods. `search` must trim the query and always send `limit=10`.

- [ ] **Step 4: Write failing accessible-combobox tests**

```js
assert.equal(input.getAttribute("role"), "combobox");
await type(input, "이");
assert.equal(searchCalls.length, 0);
await type(input, "이재");
await flushDebounce();
assert.deepEqual(searchCalls, ["이재"]);
assert.match(listbox.textContent, /이재용/);
assert.match(listbox.textContent, /#19/);
await click(optionFor("이재용"));
assert.deepEqual(selected, { learner_id: 19, display_name: "이재용" });
await type(input, "없는이름");
await flushDebounce();
assert.match(listbox.textContent, /일치하는 학습자가 없습니다/);
```

- [ ] **Step 5: Implement `LocalLearnerSearch`**

The component must:

```tsx
<div className="local-learner-search">
  <label htmlFor="local-learner-query">학습자 검색</label>
  <span className="local-learner-search__current">현재: {currentLearner.display_name}</span>
  <input
    id="local-learner-query"
    role="combobox"
    aria-expanded={open}
    aria-controls="local-learner-results"
    aria-autocomplete="list"
    value={query}
    onChange={handleQuery}
  />
  {open && <ul id="local-learner-results" role="listbox">{results.map(renderOption)}</ul>}
</div>
```

Use an `AbortController` per request, cancel it on query change/unmount, debounce for `debounceMs = 250`, skip trimmed queries shorter than two characters, cap displayed results at 10, and implement ArrowDown/ArrowUp/Enter/Escape keyboard handling. Render every option as `display_name · #learner_id`. Close the list on an outside pointer event. Render `일치하는 학습자가 없습니다` for an empty completed search. If search throws `ApiError` with status 403 or 404, call `onUnavailable()` so the parent can remove the local-only control; show a compact retry message for other failures.

- [ ] **Step 6: Run Task 4 tests**

```powershell
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/local-learner-search.dom.test.mjs
```

Expected: all tests pass without React act warnings.

- [ ] **Step 7: Commit Task 4**

```powershell
git add app/local-report-admin-client.ts app/report/LocalLearnerSearch.tsx tests/local-learner-search.dom.test.mjs
git commit -m "feat(report): add learner search control"
```

---

### Task 5: Report data-source switching and top placement

**Files:**
- Modify: `app/report/page.tsx`
- Modify: `app/report/ReportDashboard.tsx`
- Modify: `app/report/NumericReportPreview.tsx`
- Modify: `app/globals.css`
- Modify: `tests/numeric-report-preview.dom.test.mjs`
- Create: `tests/local-admin-report-flow.test.mts`

**Interfaces:**
- Consumes: `localReportAdminConfig`, `LocalLearnerSearch`, `localReportAdminApi`, existing `api`, and existing diagnostic DTOs.
- Produces: selected learner state that is applied consistently to report, week navigation, and speech evidence requests; an optional `topAccessory: ReactNode` rendered between `.report-header` and `.weekly-report-nav`.

- [ ] **Step 1: Write failing pure flow tests**

Extract a pure decision helper and test it first:

```ts
assert.deepEqual(reportRequestFor({ selectedLearnerId: 19, weekStart: "2026-08-17" }), {
  source: "local-admin",
  learnerId: 19,
  weekStart: "2026-08-17",
});
assert.deepEqual(reportRequestFor({ selectedLearnerId: null, weekStart: undefined }), {
  source: "authenticated",
  weekStart: undefined,
});
```

- [ ] **Step 2: Run the flow test and verify RED**

```powershell
node --experimental-strip-types --test tests/local-admin-report-flow.test.mts
```

Expected: helper module/function not found.

- [ ] **Step 3: Implement the request decision helper and use it in `ReportDashboard`**

Add `selectedLearner: LocalAdminLearner | null`. `loadReport(weekStart, learnerOverride = selectedLearner)` must:

```ts
const request = reportRequestFor({ selectedLearnerId: learnerOverride?.learner_id ?? null, weekStart });
const data = request.source === "local-admin"
  ? await localReportAdminApi.diagnostic(request.learnerId, request.weekStart, controller.signal)
  : await loadAuthenticatedReportWithHistoryFallback(request.weekStart, controller.signal);
```

When a learner changes: abort report and speech requests, clear `speechByDomain`, clear stale notices, set the selected learner, and load the current requested week for the new learner. A local-admin diagnostic failure must show an error; it must never fall back to the authenticated learner's history.

Set `report` to `null` and `loadState` to `loading` before the selected-learner request begins so the previous learner's values are not visible under the newly selected name. Maintain `localAdminAvailable` from the initial prop; pass `onUnavailable={() => setLocalAdminAvailable(false)}` to the search component and remove the accessory when the local proxy returns 403 or 404.

- [ ] **Step 4: Route speech evidence through the same selected learner**

```ts
const evidence = selectedLearner
  ? await localReportAdminApi.speechEvidence(
      selectedLearner.learner_id,
      domainId,
      reportRef.current!.period.week_start,
      controller.signal,
    )
  : await api.diagnosticSpeechEvidence(domainId, {
      weekStart: reportRef.current!.period.week_start,
      signal: controller.signal,
    });
```

Key the speech cache by `${learnerId ?? "self"}:${weekStart}:${domainId}` or clear it on every learner/week change so records can never cross learners.

- [ ] **Step 5: Pass the server-only enabled boolean from the page**

```tsx
export default async function ReportPage({ searchParams }: ReportPageProps) {
  const { example } = await searchParams;
  const localAdminEnabled = localReportAdminConfig(process.env) !== null;
  return <ReportDashboard completeExample={example === "complete"} localAdminEnabled={localAdminEnabled} />;
}
```

Do not pass the origin or key to the client component.

- [ ] **Step 6: Add the top accessory slot and search placement test**

Insert this single new wrapper immediately after the existing `.report-header` and immediately before the existing `WeeklyReportNav` call:

```tsx
{topAccessory && <div className="local-report-admin-bar">{topAccessory}</div>}
```

Test that `.local-learner-search` precedes `.weekly-report-nav` and `.report-paper`, and that it is absent when `localAdminEnabled` is false.

- [ ] **Step 7: Add compact styles without changing the report paper**

Add `.local-report-admin-bar`, `.local-learner-search`, `.local-learner-results`, active option, loading, empty, and mobile styles. Constrain the bar to the report width, use a compact height, and keep it outside `.report-paper`. Preserve the existing ladder rules including `.numeric-ladder-bars > span.is-empty`.

- [ ] **Step 8: Run focused frontend tests**

```powershell
node --experimental-strip-types --test tests/local-admin-report-flow.test.mts
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/local-learner-search.dom.test.mjs tests/numeric-report-preview.dom.test.mjs
```

Expected: all tests pass.

- [ ] **Step 9: Run the full frontend verification**

```powershell
npm run test:model
node --experimental-transform-types --import ./tests/ts-resolver.mjs --test tests/*.test.mjs
npm run lint
npm run build:vercel
```

Expected: all commands pass. Use `build:vercel` on Windows because the existing `build` script uses POSIX inline environment assignment.

- [ ] **Step 10: Commit Task 5 without mixing unrelated work**

First review `git diff`. Include the already-approved 100%-ladder changes only if they have not yet been committed, and describe them in a separate commit before the learner-search commit.

```powershell
git add app/report/page.tsx app/report/ReportDashboard.tsx app/report/NumericReportPreview.tsx app/globals.css tests/numeric-report-preview.dom.test.mjs tests/local-admin-report-flow.test.mts
git commit -m "feat(report): switch local admin learners"
```

---

### Task 6: Safe local configuration and end-to-end verification

**Files:**
- Modify locally, never commit: `.env.local`
- Modify locally, never commit: `C:/Users/PJ08/Desktop/mormi/Mormi-BE/.worktrees/diagnostic-report/.env.local`
- Modify locally, never commit: `C:/Users/PJ08/Desktop/mormi/Mormi-AI/.worktrees/diagnostic-report/.env`

**Interfaces:**
- Consumes: user-authorized operational DB credentials, the shared local-admin key, local Spring at `127.0.0.1:8080`, and local Mormi-AI at `127.0.0.1:8000`.
- Produces: a local report page where searching `이재용`, selecting the correct learner ID, changing week, selecting a unit, and expanding speech evidence all use the same learner.

- [ ] **Step 1: Stop before credentials unless the user explicitly approves**

Do not read, decrypt, copy, or persist DBeaver credentials automatically. Obtain explicit approval for storing the operational DB password in ignored local environment files, then use a masked local input mechanism. Never print the password or raw encryption key.

- [ ] **Step 2: Configure non-secret local values**

Frontend `.env.local`:

```dotenv
BACKEND_ORIGIN=http://127.0.0.1:8080
ENABLE_LOCAL_REPORT_ADMIN=true
LOCAL_REPORT_ADMIN_ORIGIN=http://127.0.0.1:8080
```

The masked local configuration helper generates one random local-admin key and writes `LOCAL_REPORT_ADMIN_KEY` in the frontend file and the identical value as `MORMI_LOCAL_REPORT_ADMIN_KEY` in the Spring file. It must not print either value.

Spring process environment:

```dotenv
SPRING_PROFILES_ACTIVE=local
MORMI_LOCAL_REPORT_ADMIN_ENABLED=true
MORMI_DIALOGUE_BASE_URL=http://127.0.0.1:8000
```

The masked helper also generates one local AI service key and writes the identical value as `MORMI_DIALOGUE_SERVICE_KEY` for Spring and `MORMI_SERVICE_API_KEY` for Mormi-AI. Generated keys and user-entered credentials stay only in ignored local files.

- [ ] **Step 3: Start the diagnostic AI and backend worktrees**

Start AI from `Mormi-AI/.worktrees/diagnostic-report` with PostgreSQL extras and UTF-8 enabled. Start Spring from `Mormi-BE/.worktrees/diagnostic-report` with the `local` profile and the ignored environment file loaded. Use hidden background windows for non-interactive servers on Windows.

- [ ] **Step 4: Verify health and local guard behavior without exposing secrets**

Verify:

- AI `/health` returns 200 and identifies PostgreSQL rather than SQLite.
- Spring `/health` returns 200.
- local learner search without the shared key returns 403.
- local learner search with the server-injected key returns at most 10 rows containing only `learner_id` and `display_name`.
- `NODE_ENV=production` makes the Next proxy return 404 even when the feature flag is true.

- [ ] **Step 5: Restart the frontend and verify the browser flow**

At `http://localhost:3002/report`:

1. Confirm the compact search appears above the week selector.
2. Search `이재용` and select the intended ID.
3. Confirm the learner name in the report matches the selection.
4. Change week and confirm the selected learner remains active.
5. Select a completed unit and confirm the diagnostic numbers update.
6. Confirm a 100% ladder distribution shows one visible bar with the other level labels retained.
7. Expand `과거·최근 발화 보기`; if the raw encryption key is unavailable, confirm the UI says the speech comparison is unavailable while ladder and validation metrics remain visible.

- [ ] **Step 6: Final repository checks**

```powershell
git -C C:\Users\PJ08\Desktop\mormi\Mormi-AI\.worktrees\diagnostic-report status --short
git -C C:\Users\PJ08\Desktop\mormi\Mormi-BE\.worktrees\diagnostic-report status --short
git -C C:\Users\PJ08\Desktop\mormi\Mormi-FE\.worktrees\numeric-report-preview\mormi-web status --short
```

Confirm no `.env` file, password, raw encryption key, shared key, or operational database URL is staged.
