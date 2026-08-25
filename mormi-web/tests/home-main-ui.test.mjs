import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("메인 홈은 핵심 동선과 성장 정보만 표시한다", async () => {
  const [app, collectedStarsModal] = await Promise.all([
    readFile(new URL("../app/MoramiApp.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CollectedStarsModal.tsx", import.meta.url), "utf8"),
  ]);
  const homeStart = app.indexOf("function HomeHub");
  const homeEnd = app.indexOf("function OutsideHub");
  const home = app.slice(homeStart, homeEnd);

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
  assert.match(app, /stage !== "home" && stage !== "complete" && <nav/);
  assert.match(app, /<div className="top-actions">[\s\S]{0,220}\{!learningStage && <ProfileMenu/);
  assert.doesNotMatch(app, /효과음 끄기|효과음 켜기/);
  assert.doesNotMatch(app, /className="star-note-archive-link"/);
  assert.match(collectedStarsModal, />별노트 모아보기<\/button>/);
});
