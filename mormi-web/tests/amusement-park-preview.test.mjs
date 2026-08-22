import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const { amusementParkPreview } = await import("../app/amusement-park-contract.ts");
const component = await readFile(new URL("../app/amusement-park-preview/AmusementParkPreview.tsx", import.meta.url), "utf8");

test("놀이동산 FE 계약은 곱셈·나눗셈·혼합 3단계를 순서대로 고정한다", () => {
  assert.deepEqual(amusementParkPreview.stage_order, ["ticket", "snack_split", "pass_break_even"]);
  assert.deepEqual(amusementParkPreview.stages.map((stage) => stage.skill), ["multiply", "divide", "mixed"]);
});

test("본전은 4번, 자유이용권 이득은 5번부터로 구분한다", () => {
  const stage = amusementParkPreview.stages[2];
  assert.equal(stage.verified_facts.break_even_rides, 4);
  assert.equal(stage.verified_facts.benefit_from_rides, 5);
  assert.match(stage.transfer.conclusion, /네 번이면 본전/);
  assert.match(stage.transfer.conclusion, /다섯 번부터/);
});

test("FE 미리보기는 서버 판정을 흉내 내지 않고 원문 인용·전이·별노트 장면만 제공한다", () => {
  assert.match(component, /FE 계약 미리보기/);
  assert.match(component, /explanation\.trim\(\)/);
  assert.match(component, /전이 성공/);
  assert.match(component, /별노트/);
  assert.doesNotMatch(component, /api\./);
});

test("놀이동산에서 쓰는 생성 이미지 4개가 프로젝트에 존재한다", async () => {
  for (const file of ["park-map.png", "ticket-booth.png", "churros-split.png", "ride-pass.png"]) {
    await access(new URL(`../public/amusement-park/${file}`, import.meta.url));
  }
});

