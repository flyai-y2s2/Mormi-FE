import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("메인 홈은 핵심 동선과 성장 정보만 표시한다", async () => {
  const [app, collectedStarsModal, css] = await Promise.all([
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CollectedStarsModal.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const homeStart = app.indexOf("function HomeHub");
  const homeEnd = app.indexOf("function OutsideHub");
  const home = app.slice(homeStart, homeEnd);
  const outsideStart = homeEnd;
  const outsideEnd = app.indexOf("export function MoramiApp");
  const outside = app.slice(outsideStart, outsideEnd);

  assert.doesNotMatch(home, /모르미의 생활 수학/);
  assert.doesNotMatch(home, /오늘의 퀘스트/);
  assert.doesNotMatch(home, /개념을 익히고 별 3개를 받아요/);
  assert.doesNotMatch(home, /카페가 열렸어요!/);
  assert.match(home, /Math\.min\(level, 4\)/);
  assert.match(home, /level > 4/);
  assert.match(home, /<div className="home-room-main">\s*<div className="home-room-copy-column">\s*<div className="player-hud"/);
  assert.match(home, /<div className="player-hud"[\s\S]*?<\/button>\s*<\/div>\s*<div className="home-room-copy">\s*<h1>오늘은 어떤 걸 할까\?<\/h1>/);
  assert.match(home, /<div className="player-status-summary">\s*<div className="player-stat player-stat--level"[\s\S]*?<div className="player-wallet">/);
  assert.match(home, /<\/div>\s*<button type="button" className="player-stat player-stat--star"/);
  assert.match(home, /<div className="player-stat player-stat--level"/);
  assert.match(home, /<div className="player-wallet">/);
  assert.match(home, /<button type="button" className="player-stat player-stat--star"[\s\S]{0,240}aria-haspopup="dialog"/);
  assert.match(home, /<small>별노트<\/small><b>모은 별 \{stars\}개<\/b>/);
  assert.doesNotMatch(home, /<button[^>]*player-stat--level|<button[^>]*player-wallet/);
  assert.match(home, /<div className="home-room-character-column">\s*<div className="home-room-morami">/);
  assert.match(home, /<div className="home-main-actions">\s*<button className="home-action-card home-action-card--study" onClick=\{onCurriculum\}>[\s\S]*?<button className="home-action-card home-action-card--outside" onClick=\{onOutside\}>/);
  assert.match(home, /home-action-visual--house[\s\S]*?<UiIcon name="home"/);
  assert.match(home, /home-action-visual--door[\s\S]*?<Image src="\/home\/exit-door-3d-v2\.png"/);
  assert.doesNotMatch(home, /home-exit-door|home-room-scene-objects|exit-door-v1\.png/);
  assert.match(app, /stage !== "home" && stage !== "complete" && <button type="button" className="home-return-control" onClick=\{showHome\} aria-label="집으로 돌아가기">/);
  assert.doesNotMatch(app, /journey-nav--top|>외부<\/button>/);
  assert.match(app, /<div className="top-actions">[\s\S]{0,220}\{!learningStage && <ProfileMenu/);
  assert.doesNotMatch(app, /효과음 끄기|효과음 켜기/);
  assert.doesNotMatch(app, /className="star-note-archive-link"/);
  assert.match(collectedStarsModal, />별노트 모아보기<\/button>/);
  assert.match(outside, /<h2>카페 가기<\/h2>/);
  assert.match(outside, /<h2>놀이동산 가기<\/h2>/);
  assert.doesNotMatch(outside, /displayName|rename\(|와 생활 수학|와 출발하기|와 들어가기/);
  assert.match(css, /\.profile-sheet \{ width:min\(240px,calc\(100vw - 24px\)\); min-width:0;[\s\S]{0,160}right:0; left:auto;/);
  assert.match(css, /\.profile-sheet \{ width:min\(216px,calc\(100vw - 16px\)\); \}/);
  assert.match(css, /@media\(min-width:901px\)\{[\s\S]{0,180}width:min\(1040px,100%\);[\s\S]{0,180}grid-template-columns:minmax\(480px,560px\) minmax\(280px,380px\)/);
  assert.match(css, /\.home-room-copy-column\{width:100%;max-width:560px\}/);
  assert.match(css, /\.home-room-copy-column>\.player-hud,\.home-room-copy\{width:100%;max-width:560px\}/);
  assert.doesNotMatch(css, /\.home-exit-door|\.home-room-scene-objects/);
  assert.match(css, /\.home-main-actions\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.home-action-visual--door>img\{/);
  assert.match(css, /span\.home-action-visual--door\{width:146px;height:146px;min-height:146px;[\s\S]{0,120}border-radius:50%/);
  assert.match(css, /@media\(max-width:560px\)\{\.home-main-actions\{grid-template-columns:1fr\}/);
  assert.match(css, /\.home-return-control\{[\s\S]*?display:flex[\s\S]*?border-radius:18px/);
});
