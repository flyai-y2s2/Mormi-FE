import { sessions as originalSessions, type Problem, type Session, type Subject, type Visual } from "./morami-content";

export type MathArea = {
  id: string;
  title: string;
  description: string;
  color: string;
  sessionIds: string[];
  gradeBands: Array<{ label: "1~2학년군" | "3~4학년군" | "5~6학년군"; topics: string }>;
};

export type CurriculumAlignment = {
  domain: "수와 연산" | "변화와 관계" | "도형과 측정" | "자료와 가능성";
  gradeBand: "1~2학년군" | "3~4학년군" | "5~6학년군";
  code: string;
  achievement: string;
};

type LessonSpec = {
  id: string;
  subject: Subject;
  unit: string;
  title: string;
  level: number;
  memoryTitle: [string, string];
  rule: string[];
  key: string;
  keyOptions: string[];
  distractor: string;
  hint: string;
  misconception: string;
  mistake: string;
  drills: Problem[];
  transfer: Problem[];
};

const p = (prompt: string, answers: string[], correct: string, visual: Visual): Problem => ({ prompt, answers, correct, visual });

function lesson(spec: LessonSpec): Session {
  const keyIndex = spec.rule.indexOf(spec.key);
  const learnedLine = spec.rule.join(" ");
  return {
    id: spec.id,
    subject: spec.subject,
    unit: spec.unit,
    title: spec.title,
    level: spec.level,
    memoryTitle: spec.memoryTitle.join("\n"),
    memoryDialogue: "지난번에 배운 방법을 다시 봤어!",
    drillIntro: "그림을 보고 답을 골라 봐.",
    drills: spec.drills,
    teachPrompt: spec.mistake,
    learnedLine,
    sentenceWords: [...spec.rule, spec.distractor],
    targetSentence: spec.rule,
    fillBefore: spec.rule.slice(0, keyIndex).join(" "),
    fillAfter: spec.rule.slice(keyIndex + 1).join(" "),
    fillCorrect: spec.key,
    fillOptions: spec.keyOptions,
    oneWordPrompt: "어떤 방법이 맞을까?",
    oneWordCorrect: spec.key,
    oneWordOptions: spec.keyOptions,
    hint: spec.hint,
    dictionaryLines: [learnedLine, spec.hint],
    dictionaryProblem: spec.drills[0],
    pointPrompt: spec.drills[0].prompt,
    pointOptions: spec.drills[0].answers,
    pointCorrect: spec.drills[0].correct,
    homework: spec.transfer,
    misconception: spec.misconception,
  };
}

const addedSessions: Session[] = [
  lesson({
    id: "number-count", subject: "number", unit: "수 감각", title: "수를 빠뜨리지 않고 세어요", level: 1,
    memoryTitle: ["하나씩 짝지으면", "빠뜨리지 않아!"], rule: ["하나씩", "가리키며", "마지막 수를", "말해!"], key: "가리키며", keyOptions: ["가리키며", "한꺼번에", "눈을 감고"], distractor: "건너뛰며", hint: "센 것과 세지 않은 것을 자리를 나누어 봐.", misconception: "대상을 빠뜨리거나 같은 것을 두 번 셈", mistake: "점이 일곱 개니까 여섯이라고 하면 되지?",
    drills: [
      p("점은 모두 몇 개일까?", ["3", "4", "5"], "3", { type: "ten-frame", count: 3 }),
      p("점은 모두 몇 개일까?", ["5", "4", "6"], "5", { type: "ten-frame", count: 5 }),
      p("점은 모두 몇 개일까?", ["7", "6", "8"], "7", { type: "ten-frame", count: 7 }),
      p("점은 모두 몇 개일까?", ["9", "8", "10"], "9", { type: "ten-frame", count: 9 }),
      p("점은 모두 몇 개일까?", ["10", "9", "11"], "10", { type: "ten-frame", count: 10 }),
      p("점은 모두 몇 개일까?", ["8", "7", "9"], "8", { type: "ten-frame", count: 8 }),
    ],
    transfer: [p("접시에 딸기가 몇 개 있을까?", ["6개", "5개", "7개"], "6개", { type: "ten-frame", count: 6, item: "strawberry" }), p("필요한 컵은 모두 몇 개일까?", ["9개", "8개", "10개"], "9개", { type: "ten-frame", count: 9, item: "cup" })],
  }),
  lesson({
    id: "number-compare", subject: "number", unit: "수 감각", title: "수의 크기를 비교해요", level: 2,
    memoryTitle: ["서로 짝지어 보면", "더 많은 쪽이 보여!"], rule: ["두 수는", "하나씩", "짝지어", "비교해!"], key: "짝지어", keyOptions: ["짝지어", "색으로", "느낌으로"], distractor: "섞어서", hint: "두 줄을 같은 자리에서 시작해 남는 점을 찾아.", misconception: "점의 간격이나 크기를 수량으로 판단함", mistake: "점이 넓게 퍼져 있으면 언제나 더 많지?",
    drills: [
      p("어느 쪽이 더 많을까?", ["왼쪽", "오른쪽", "같아"], "오른쪽", { type: "ten-frame", count: 3, secondCount: 5 }),
      p("어느 쪽이 더 많을까?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "ten-frame", count: 8, secondCount: 6 }),
      p("두 수의 크기는 어떨까?", ["왼쪽", "오른쪽", "같아"], "같아", { type: "ten-frame", count: 7, secondCount: 7 }),
      p("어느 쪽이 더 적을까?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "ten-frame", count: 4, secondCount: 9 }),
      p("어느 쪽이 더 적을까?", ["왼쪽", "오른쪽", "같아"], "오른쪽", { type: "ten-frame", count: 10, secondCount: 2 }),
      p("두 수의 크기는 어떨까?", ["왼쪽", "오른쪽", "같아"], "같아", { type: "ten-frame", count: 5, secondCount: 5 }),
    ],
    transfer: [p("두 간식 상자 중 더 많은 쪽은?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "ten-frame", count: 9, secondCount: 6 }), p("두 모둠의 인원은 어떨까?", ["왼쪽", "오른쪽", "같아"], "같아", { type: "ten-frame", count: 6, secondCount: 6 })],
  }),
  lesson({
    id: "number-make-ten", subject: "number", unit: "수 감각", title: "10을 만들고 가르어요", level: 3,
    memoryTitle: ["10칸을 채우면", "남은 수가 보여!"], rule: ["10은", "두 수로", "가르고", "모을 수 있어!"], key: "두 수로", keyOptions: ["두 수로", "한 수만", "아무 수로"], distractor: "세지 않고", hint: "10칸에서 채운 칸과 빈칸을 함께 봐.", misconception: "전체와 부분의 관계를 각각 다른 수로 봄", mistake: "10은 6과 3으로 가를 수 있지?",
    drills: [
      p("6과 몇을 모으면 10일까?", ["4", "3", "5"], "4", { type: "ten-frame", count: 6 }),
      p("8과 몇을 모으면 10일까?", ["2", "1", "3"], "2", { type: "ten-frame", count: 8 }),
      p("5와 몇을 모으면 10일까?", ["5", "4", "6"], "5", { type: "ten-frame", count: 5 }),
      p("7과 몇을 모으면 10일까?", ["3", "2", "4"], "3", { type: "ten-frame", count: 7 }),
      p("9와 몇을 모으면 10일까?", ["1", "2", "0"], "1", { type: "ten-frame", count: 9 }),
      p("4와 몇을 모으면 10일까?", ["6", "5", "7"], "6", { type: "ten-frame", count: 4 }),
    ],
    transfer: [p("달걀판 10칸 중 7칸을 채웠어. 몇 개가 더 필요할까?", ["3개", "2개", "4개"], "3개", { type: "ten-frame", count: 7 }), p("10명 모둠에 8명이 왔어. 몇 명이 더 와야 할까?", ["2명", "1명", "3명"], "2명", { type: "ten-frame", count: 8 })],
  }),
  lesson({
    id: "number-place-value", subject: "number", unit: "수 감각", title: "십과 일을 나누어 봐요", level: 4,
    memoryTitle: ["십 묶음과 낱개를 보면", "큰 수도 읽을 수 있어!"], rule: ["두 자리 수는", "십과", "일로", "나누어 읽어!"], key: "십과", keyOptions: ["십과", "일만", "모양과"], distractor: "뒤집어", hint: "왼쪽 자리는 십 묶음, 오른쪽 자리는 낱개야.", misconception: "십의 자리와 일의 자리를 바꾸거나 낱개로만 셈", mistake: "3십 4는 43이지?",
    drills: [
      p("3십 4는 어떤 수일까?", ["34", "43", "304"], "34", { type: "number-line", start: 0, end: 50, marks: [0, 10, 20, 30, 34, 40, 50], missing: 34 }),
      p("5십 2는 어떤 수일까?", ["52", "25", "502"], "52", { type: "number-line", start: 0, end: 60, marks: [0, 10, 20, 30, 40, 50, 52, 60], missing: 52 }),
      p("47에서 십의 자리 수는?", ["4", "7", "47"], "4", { type: "number-line", start: 0, end: 50, marks: [0, 10, 20, 30, 40, 47, 50], missing: 47 }),
      p("68에서 일의 자리 수는?", ["8", "6", "68"], "8", { type: "number-line", start: 0, end: 70, marks: [0, 10, 20, 30, 40, 50, 60, 68, 70], missing: 68 }),
      p("9십은 어떤 수일까?", ["90", "9", "19"], "90", { type: "number-line", start: 0, end: 100, marks: [0, 20, 40, 60, 80, 90, 100], missing: 90 }),
      p("2십 6에서 낱개는 몇 개일까?", ["6개", "2개", "26개"], "6개", { type: "number-line", start: 0, end: 30, marks: [0, 10, 20, 26, 30], missing: 26 }),
    ],
    transfer: [p("34개의 물건을 10개씩 묶으면 십 묶음은?", ["3묶음", "4묶음", "34묶음"], "3묶음", { type: "number-line", start: 0, end: 40, marks: [0, 10, 20, 30, 34, 40], missing: 34 }), p("72번 버스에서 십의 자리 수는?", ["7", "2", "72"], "7", { type: "number-line", start: 0, end: 80, marks: [0, 20, 40, 60, 72, 80], missing: 72 })],
  }),

  lesson({
    id: "multiply-groups", subject: "multiplication", unit: "곱셈", title: "같은 수씩 묶어요", level: 1,
    memoryTitle: ["같은 수가 여러 묶음이면", "곱셈으로 세어!"], rule: ["같은 수씩", "여러 묶음은", "곱셈으로", "세어!"], key: "곱셈으로", keyOptions: ["곱셈으로", "뺄셈으로", "하나만"], distractor: "따로", hint: "한 묶음의 수와 묶음 수를 차례로 확인해.", misconception: "묶음 수와 한 묶음의 수 중 하나만 셈", mistake: "2개씩 3묶음이면 2와 3을 더해서 5지?",
    drills: [
      p("2개씩 3묶음은 모두 몇 개일까?", ["6", "5", "8"], "6", { type: "groups", groups: 3, each: 2, mode: "multiply" }),
      p("3개씩 4묶음은 모두 몇 개일까?", ["12", "7", "9"], "12", { type: "groups", groups: 4, each: 3, mode: "multiply" }),
      p("5개씩 2묶음은 모두 몇 개일까?", ["10", "7", "12"], "10", { type: "groups", groups: 2, each: 5, mode: "multiply" }),
      p("4개씩 3묶음은 모두 몇 개일까?", ["12", "7", "16"], "12", { type: "groups", groups: 3, each: 4, mode: "multiply" }),
      p("2개씩 5묶음은 모두 몇 개일까?", ["10", "7", "12"], "10", { type: "groups", groups: 5, each: 2, mode: "multiply" }),
      p("3개씩 3묶음은 모두 몇 개일까?", ["9", "6", "12"], "9", { type: "groups", groups: 3, each: 3, mode: "multiply" }),
    ],
    transfer: [p("접시 4개에 귤이 2개씩 있어. 모두 몇 개일까?", ["8개", "6개", "10개"], "8개", { type: "groups", groups: 4, each: 2, mode: "multiply" }), p("의자 3줄에 5개씩 있어. 모두 몇 개일까?", ["15개", "8개", "12개"], "15개", { type: "groups", groups: 3, each: 5, mode: "multiply" })],
  }),
  lesson({
    id: "multiply-addition", subject: "multiplication", unit: "곱셈", title: "같은 수를 이어 더해요", level: 2,
    memoryTitle: ["같은 수를 되풀이해 더하면", "곱셈과 같아!"], rule: ["곱셈은", "같은 수를", "여러 번", "더한 거야!"], key: "같은 수를", keyOptions: ["같은 수를", "다른 수를", "큰 수만"], distractor: "한 번만", hint: "각 묶음의 수를 묶음 수만큼 이어 더해.", misconception: "묶음 수까지 덧셈 항으로 넣음", mistake: "3개씩 4묶음은 3+4로 나타내지?",
    drills: [
      p("2개씩 4묶음을 덧셈으로 나타내면?", ["2+2+2+2", "2+4", "4+4+4+4"], "2+2+2+2", { type: "groups", groups: 4, each: 2, mode: "multiply" }),
      p("3개씩 3묶음을 덧셈으로 나타내면?", ["3+3+3", "3+3", "3+6"], "3+3+3", { type: "groups", groups: 3, each: 3, mode: "multiply" }),
      p("5개씩 2묶음을 덧셈으로 나타내면?", ["5+5", "5+2", "2+2+2+2+2"], "5+5", { type: "groups", groups: 2, each: 5, mode: "multiply" }),
      p("4+4+4는 어떤 묶음일까?", ["4개씩 3묶음", "3개씩 4묶음", "4개씩 4묶음"], "4개씩 3묶음", { type: "groups", groups: 3, each: 4, mode: "multiply" }),
      p("2+2+2+2+2는?", ["2개씩 5묶음", "5개씩 2묶음", "2개씩 2묶음"], "2개씩 5묶음", { type: "groups", groups: 5, each: 2, mode: "multiply" }),
      p("6개씩 2묶음의 합은?", ["12", "8", "6"], "12", { type: "groups", groups: 2, each: 6, mode: "multiply" }),
    ],
    transfer: [p("한 주에 5일씩 2주를 덧셈으로 나타내면?", ["5+5", "5+2", "2+2+2+2+2"], "5+5", { type: "groups", groups: 2, each: 5, mode: "multiply" }), p("달걀 3개씩 4접시는 모두?", ["12개", "7개", "10개"], "12개", { type: "groups", groups: 4, each: 3, mode: "multiply" })],
  }),
  lesson({
    id: "multiply-easy-tables", subject: "multiplication", unit: "곱셈", title: "2·5·10단을 생활에서 써요", level: 3,
    memoryTitle: ["2·5·10씩 뛰어 세면", "곱셈이 빨라져!"], rule: ["2·5·10단은", "뛰어 세며", "답을", "찾아!"], key: "뛰어 세며", keyOptions: ["뛰어 세며", "하나씩만", "거꾸로만"], distractor: "외우지 않고", hint: "2, 4, 6처럼 같은 간격으로 수를 말해.", misconception: "곱하는 수만큼 한 번 더 세거나 중간 수를 빠뜨림", mistake: "5씩 네 번이면 5, 10, 15에서 끝나지?",
    drills: [
      p("2×4는?", ["8", "6", "10"], "8", { type: "groups", groups: 4, each: 2, mode: "multiply" }),
      p("5×3은?", ["15", "10", "20"], "15", { type: "groups", groups: 3, each: 5, mode: "multiply" }),
      p("10×4는?", ["40", "14", "30"], "40", { type: "groups", groups: 4, each: 10, mode: "multiply" }),
      p("2×6은?", ["12", "8", "14"], "12", { type: "groups", groups: 6, each: 2, mode: "multiply" }),
      p("5×5는?", ["25", "10", "20"], "25", { type: "groups", groups: 5, each: 5, mode: "multiply" }),
      p("10×7은?", ["70", "17", "60"], "70", { type: "groups", groups: 7, each: 10, mode: "multiply" }),
    ],
    transfer: [p("500원 동전 2개는?", ["1,000원", "700원", "500원"], "1,000원", { type: "groups", groups: 2, each: 5, mode: "multiply" }), p("손가락이 10개인 사람이 3명이면?", ["30개", "13개", "20개"], "30개", { type: "groups", groups: 3, each: 10, mode: "multiply" })],
  }),
  lesson({
    id: "multiply-tables", subject: "multiplication", unit: "곱셈", title: "곱셈구구의 관계를 찾아요", level: 4,
    memoryTitle: ["순서를 바꾸어도", "곱은 같아!"], rule: ["곱셈은", "아는 곱에서", "이어", "찾아!"], key: "아는 곱에서", keyOptions: ["아는 곱에서", "처음부터만", "아무 수에서"], distractor: "짐작만", hint: "바로 앞 곱에 한 묶음의 수를 더해.", misconception: "각 구구를 서로 관계없는 암기 항목으로 봄", mistake: "4×6을 알아도 4×7에는 쓸 수 없지?",
    drills: [
      p("3×6은?", ["18", "16", "21"], "18", { type: "groups", groups: 6, each: 3, mode: "multiply" }),
      p("4×7은?", ["28", "24", "32"], "28", { type: "groups", groups: 7, each: 4, mode: "multiply" }),
      p("6×6은?", ["36", "30", "42"], "36", { type: "groups", groups: 6, each: 6, mode: "multiply" }),
      p("7×8은?", ["56", "48", "64"], "56", { type: "groups", groups: 8, each: 7, mode: "multiply" }),
      p("8×4는?", ["32", "24", "36"], "32", { type: "groups", groups: 4, each: 8, mode: "multiply" }),
      p("9×5는?", ["45", "40", "50"], "45", { type: "groups", groups: 5, each: 9, mode: "multiply" }),
    ],
    transfer: [p("상자 6개에 공이 4개씩 있어. 모두?", ["24개", "10개", "20개"], "24개", { type: "groups", groups: 6, each: 4, mode: "multiply" }), p("한 줄에 8명씩 7줄이면?", ["56명", "54명", "64명"], "56명", { type: "groups", groups: 7, each: 8, mode: "multiply" })],
  }),
  lesson({
    id: "divide-share", subject: "division", unit: "나눗셈", title: "똑같이 나누어요", level: 1,
    memoryTitle: ["하나씩 번갈아 주면", "똑같이 나눌 수 있어!"], rule: ["나눗셈은", "하나씩", "번갈아", "나누어!"], key: "번갈아", keyOptions: ["번갈아", "한쪽에만", "눈대중으로"], distractor: "몰아서", hint: "모든 사람에게 하나씩 주는 일을 반복해.", misconception: "한 사람에게 먼저 모두 주고 남은 것을 나눔", mistake: "사탕 8개를 2명에게 나누면 한 명이 6개를 가져도 되지?",
    drills: [
      p("6개를 2명에게 똑같이 나누면 한 명당?", ["3개", "2개", "4개"], "3개", { type: "groups", groups: 2, each: 3, mode: "share" }),
      p("8개를 4명에게 똑같이 나누면 한 명당?", ["2개", "4개", "3개"], "2개", { type: "groups", groups: 4, each: 2, mode: "share" }),
      p("12개를 3명에게 똑같이 나누면 한 명당?", ["4개", "3개", "6개"], "4개", { type: "groups", groups: 3, each: 4, mode: "share" }),
      p("10개를 5명에게 똑같이 나누면 한 명당?", ["2개", "5개", "1개"], "2개", { type: "groups", groups: 5, each: 2, mode: "share" }),
      p("15개를 3명에게 똑같이 나누면 한 명당?", ["5개", "3개", "6개"], "5개", { type: "groups", groups: 3, each: 5, mode: "share" }),
      p("18개를 6명에게 똑같이 나누면 한 명당?", ["3개", "6개", "4개"], "3개", { type: "groups", groups: 6, each: 3, mode: "share" }),
    ],
    transfer: [p("빵 12개를 4명에게 나누면 한 명당?", ["3개", "4개", "2개"], "3개", { type: "groups", groups: 4, each: 3, mode: "share" }), p("색연필 20자루를 5상자에 나누면 한 상자에?", ["4자루", "5자루", "10자루"], "4자루", { type: "groups", groups: 5, each: 4, mode: "share" })],
  }),
  lesson({
    id: "divide-group", subject: "division", unit: "나눗셈", title: "몇 묶음인지 찾아요", level: 2,
    memoryTitle: ["같은 수씩 묶으면", "묶음 수가 답이야!"], rule: ["같은 수씩", "묶고", "묶음 수를", "세어!"], key: "묶음 수를", keyOptions: ["묶음 수를", "낱개만", "전체만"], distractor: "남은 것만", hint: "정해진 수만큼 동그라미를 치고 동그라미 수를 세어.", misconception: "한 묶음의 수를 답으로 말함", mistake: "12개를 3개씩 묶으면 3묶음이지?",
    drills: [
      p("8개를 2개씩 묶으면 몇 묶음?", ["4묶음", "2묶음", "6묶음"], "4묶음", { type: "groups", groups: 4, each: 2, mode: "share" }),
      p("12개를 3개씩 묶으면 몇 묶음?", ["4묶음", "3묶음", "6묶음"], "4묶음", { type: "groups", groups: 4, each: 3, mode: "share" }),
      p("15개를 5개씩 묶으면 몇 묶음?", ["3묶음", "5묶음", "10묶음"], "3묶음", { type: "groups", groups: 3, each: 5, mode: "share" }),
      p("18개를 3개씩 묶으면 몇 묶음?", ["6묶음", "3묶음", "9묶음"], "6묶음", { type: "groups", groups: 6, each: 3, mode: "share" }),
      p("20개를 4개씩 묶으면 몇 묶음?", ["5묶음", "4묶음", "8묶음"], "5묶음", { type: "groups", groups: 5, each: 4, mode: "share" }),
      p("24개를 6개씩 묶으면 몇 묶음?", ["4묶음", "6묶음", "18묶음"], "4묶음", { type: "groups", groups: 4, each: 6, mode: "share" }),
    ],
    transfer: [p("달걀 18개를 6개들이 상자에 넣으면?", ["3상자", "6상자", "12상자"], "3상자", { type: "groups", groups: 3, each: 6, mode: "share" }), p("학생 24명이 4명씩 한 모둠이면?", ["6모둠", "4모둠", "8모둠"], "6모둠", { type: "groups", groups: 6, each: 4, mode: "share" })],
  }),

  lesson({
    id: "time-duration", subject: "clock", unit: "시간·달력", title: "걸린 시간을 찾아요", level: 3,
    memoryTitle: ["시작과 끝 사이를 세면", "걸린 시간이 보여!"], rule: ["걸린 시간은", "시작부터", "끝까지", "세어!"], key: "시작부터", keyOptions: ["시작부터", "끝에서만", "숫자만"], distractor: "거꾸로", hint: "시작 시각에서 30분이나 1시간씩 뛰어 세어.", misconception: "끝 시각 자체를 걸린 시간으로 답함", mistake: "2시에 시작해 3시에 끝났으면 3시간 걸렸지?",
    drills: [
      p("2시부터 3시까지는 몇 시간?", ["1시간", "2시간", "3시간"], "1시간", { type: "number-line", start: 2, end: 3, marks: [2, 3] }),
      p("4시부터 6시까지는 몇 시간?", ["2시간", "1시간", "6시간"], "2시간", { type: "number-line", start: 4, end: 6, marks: [4, 5, 6] }),
      p("1시 30분부터 2시까지는?", ["30분", "1시간", "2시간"], "30분", { type: "number-line", start: 0, end: 60, marks: [0, 30, 60] }),
      p("3시부터 4시 30분까지는?", ["1시간 30분", "30분", "4시간"], "1시간 30분", { type: "number-line", start: 0, end: 90, marks: [0, 30, 60, 90] }),
      p("10시 15분부터 10시 45분까지는?", ["30분", "15분", "45분"], "30분", { type: "number-line", start: 15, end: 45, marks: [15, 30, 45] }),
      p("7시부터 9시까지는?", ["2시간", "7시간", "9시간"], "2시간", { type: "number-line", start: 7, end: 9, marks: [7, 8, 9] }),
    ],
    transfer: [p("영화가 2시에 시작해 4시에 끝났어. 걸린 시간은?", ["2시간", "4시간", "6시간"], "2시간", { type: "number-line", start: 2, end: 4, marks: [2, 3, 4] }), p("버스가 8시 30분에 와서 9시에 도착했어. 걸린 시간은?", ["30분", "1시간", "9시간"], "30분", { type: "number-line", start: 0, end: 30, marks: [0, 15, 30] })],
  }),
  lesson({
    id: "time-calendar", subject: "clock", unit: "시간·달력", title: "달력에서 날짜를 찾아요", level: 4,
    memoryTitle: ["가로는 요일, 세로는 한 주", "달력에서 함께 봐!"], rule: ["날짜는", "월·일·요일을", "함께", "확인해!"], key: "월·일·요일을", keyOptions: ["월·일·요일을", "일만", "색만"], distractor: "숫자 하나만", hint: "먼저 월을 보고, 날짜 칸을 찾고, 위의 요일을 확인해.", misconception: "날짜 숫자만 보고 월이나 요일을 놓침", mistake: "8월 8일이면 언제나 월요일이지?",
    drills: [
      p("8월 8일에서 사흘 뒤는?", ["11일", "10일", "12일"], "11일", { type: "calendar", month: 8, highlight: 8 }),
      p("8월 15일에서 일주일 뒤는?", ["22일", "16일", "25일"], "22일", { type: "calendar", month: 8, highlight: 15 }),
      p("9월 10일에서 이틀 뒤는?", ["12일", "8일", "20일"], "12일", { type: "calendar", month: 9, highlight: 10 }),
      p("5월 20일에서 하루 전은?", ["19일", "21일", "10일"], "19일", { type: "calendar", month: 5, highlight: 20 }),
      p("3월 1일부터 3월 4일까지 며칠 차이일까?", ["3일", "4일", "1일"], "3일", { type: "calendar", month: 3, highlight: 1 }),
      p("12월 24일에서 일주일 뒤는?", ["31일", "30일", "1일"], "31일", { type: "calendar", month: 12, highlight: 24 }),
    ],
    transfer: [p("약속이 6월 12일에서 일주일 미뤄졌어. 새 날짜는?", ["6월 19일", "6월 13일", "6월 22일"], "6월 19일", { type: "calendar", month: 6, highlight: 12 }), p("반납일이 10월 21일이고 이틀 남았어. 오늘은?", ["10월 19일", "10월 23일", "10월 20일"], "10월 19일", { type: "calendar", month: 10, highlight: 21 })],
  }),

  lesson({
    id: "measure-compare", subject: "measurement", unit: "측정", title: "길이를 직접 비교해요", level: 1,
    memoryTitle: ["한쪽 끝을 맞추면", "긴 쪽이 보여!"], rule: ["길이는", "한쪽 끝을", "맞추어", "비교해!"], key: "맞추어", keyOptions: ["맞추어", "벌려서", "눈감고"], distractor: "흩어", hint: "두 물건의 시작점을 같은 줄에 놓아.", misconception: "시작점이 다른 물건을 끝 위치만 보고 비교함", mistake: "시작점이 달라도 끝이 오른쪽이면 더 길지?",
    drills: [
      p("어느 막대가 더 길까?", ["왼쪽", "오른쪽", "같아"], "오른쪽", { type: "measurement", kind: "length", left: 4, right: 7, unit: "칸" }),
      p("어느 막대가 더 짧을까?", ["왼쪽", "오른쪽", "같아"], "오른쪽", { type: "measurement", kind: "length", left: 8, right: 5, unit: "칸" }),
      p("두 길이는 어떨까?", ["왼쪽", "오른쪽", "같아"], "같아", { type: "measurement", kind: "length", left: 6, right: 6, unit: "칸" }),
      p("어느 끈이 더 길까?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "measurement", kind: "length", left: 9, right: 3, unit: "칸" }),
      p("어느 연필이 더 짧을까?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "measurement", kind: "length", left: 2, right: 5, unit: "칸" }),
      p("두 리본의 길이는?", ["왼쪽", "오른쪽", "같아"], "같아", { type: "measurement", kind: "length", left: 7, right: 7, unit: "칸" }),
    ],
    transfer: [p("두 선반 중 긴 쪽은?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "measurement", kind: "length", left: 10, right: 8, unit: "칸" }), p("두 신발끈 중 짧은 쪽은?", ["왼쪽", "오른쪽", "같아"], "오른쪽", { type: "measurement", kind: "length", left: 9, right: 6, unit: "칸" })],
  }),
  lesson({
    id: "measure-ruler", subject: "measurement", unit: "측정", title: "자로 길이를 재어요", level: 2,
    memoryTitle: ["0에 시작점을 맞추고", "끝 숫자를 읽어!"], rule: ["자는", "0에 맞추고", "끝 숫자를", "읽어!"], key: "0에 맞추고", keyOptions: ["0에 맞추고", "1에만 맞추고", "중간에 놓고"], distractor: "비스듬히", hint: "물건 시작은 0, 물건 끝 아래 숫자가 길이야.", misconception: "눈금 개수와 끝 숫자를 혼동하거나 1부터 놓음", mistake: "2에서 시작해 8에서 끝나면 길이가 8cm지?",
    drills: [
      p("0에서 6까지의 길이는?", ["6cm", "5cm", "7cm"], "6cm", { type: "measurement", kind: "length", left: 6, unit: "cm" }),
      p("0에서 9까지의 길이는?", ["9cm", "8cm", "10cm"], "9cm", { type: "measurement", kind: "length", left: 9, unit: "cm" }),
      p("2에서 8까지의 길이는?", ["6cm", "8cm", "10cm"], "6cm", { type: "number-line", start: 2, end: 8, marks: [2, 3, 4, 5, 6, 7, 8] }),
      p("3에서 10까지의 길이는?", ["7cm", "10cm", "13cm"], "7cm", { type: "number-line", start: 3, end: 10, marks: [3, 4, 5, 6, 7, 8, 9, 10] }),
      p("0에서 4까지의 길이는?", ["4cm", "3cm", "5cm"], "4cm", { type: "measurement", kind: "length", left: 4, unit: "cm" }),
      p("5에서 12까지의 길이는?", ["7cm", "12cm", "17cm"], "7cm", { type: "number-line", start: 5, end: 12, marks: [5, 6, 7, 8, 9, 10, 11, 12] }),
    ],
    transfer: [p("연필이 0에서 14까지 놓였어. 길이는?", ["14cm", "13cm", "15cm"], "14cm", { type: "measurement", kind: "length", left: 14, unit: "cm" }), p("리본이 4에서 15까지 놓였어. 길이는?", ["11cm", "15cm", "19cm"], "11cm", { type: "number-line", start: 4, end: 15, marks: [4, 6, 8, 10, 12, 14, 15] })],
  }),
  lesson({
    id: "measure-weight-capacity", subject: "measurement", unit: "측정", title: "무게와 들이를 비교해요", level: 3,
    memoryTitle: ["같은 단위로 보면", "무게와 들이가 보여!"], rule: ["측정값은", "같은 단위로", "바꾸어", "비교해!"], key: "같은 단위로", keyOptions: ["같은 단위로", "숫자만", "모양으로"], distractor: "다른 단위로", hint: "kg와 g, L와 mL를 먼저 같은 단위로 맞춰.", misconception: "단위를 무시하고 숫자 크기만 비교함", mistake: "1kg은 숫자 1이니까 500g보다 가볍지?",
    drills: [
      p("어느 쪽이 더 무거울까?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "measurement", kind: "weight", left: 1000, right: 500, unit: "g" }),
      p("어느 쪽이 더 가벼울까?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "measurement", kind: "weight", left: 300, right: 800, unit: "g" }),
      p("두 무게는 어떨까?", ["왼쪽", "오른쪽", "같아"], "같아", { type: "measurement", kind: "weight", left: 1000, right: 1000, unit: "g" }),
      p("어느 병에 더 많이 들었을까?", ["왼쪽", "오른쪽", "같아"], "오른쪽", { type: "measurement", kind: "capacity", left: 500, right: 1000, unit: "mL" }),
      p("어느 컵의 들이가 더 적을까?", ["왼쪽", "오른쪽", "같아"], "오른쪽", { type: "measurement", kind: "capacity", left: 750, right: 250, unit: "mL" }),
      p("두 물병의 들이는?", ["왼쪽", "오른쪽", "같아"], "같아", { type: "measurement", kind: "capacity", left: 500, right: 500, unit: "mL" }),
    ],
    transfer: [p("1kg 쌀과 700g 과자 중 무거운 것은?", ["왼쪽", "오른쪽", "같아"], "왼쪽", { type: "measurement", kind: "weight", left: 1000, right: 700, unit: "g" }), p("500mL 물 두 병은 모두 얼마일까?", ["1,000mL", "500mL", "1,500mL"], "1,000mL", { type: "measurement", kind: "capacity", left: 500, right: 500, unit: "mL" })],
  }),
  lesson({
    id: "geometry-shapes", subject: "geometry", unit: "도형·공간", title: "도형의 특징을 찾아요", level: 1,
    memoryTitle: ["변과 꼭짓점을 세면", "도형 이름이 보여!"], rule: ["도형은", "변과", "꼭짓점을", "세어!"], key: "꼭짓점을", keyOptions: ["꼭짓점을", "색만", "크기만"], distractor: "느낌만", hint: "곧은 선의 수와 뾰족하게 만나는 점을 세어.", misconception: "도형의 방향이나 크기가 바뀌면 다른 도형으로 봄", mistake: "기울어진 세모는 세모가 아니지?",
    drills: [
      p("세 변과 세 꼭짓점이 있는 도형은?", ["삼각형", "사각형", "원"], "삼각형", { type: "shapes", shapes: ["triangle", "square", "circle"] }),
      p("네 변이 모두 같은 도형은?", ["정사각형", "삼각형", "원"], "정사각형", { type: "shapes", shapes: ["square", "triangle", "circle"] }),
      p("꼭짓점이 없는 도형은?", ["원", "삼각형", "사각형"], "원", { type: "shapes", shapes: ["circle", "triangle", "rectangle"] }),
      p("네 변이 있는 도형은?", ["직사각형", "삼각형", "원"], "직사각형", { type: "shapes", shapes: ["rectangle", "triangle", "circle"] }),
      p("삼각형은 어느 것일까?", ["첫째", "둘째", "셋째"], "둘째", { type: "shapes", shapes: ["circle", "triangle", "square"] }),
      p("원은 어느 것일까?", ["첫째", "둘째", "셋째"], "셋째", { type: "shapes", shapes: ["rectangle", "triangle", "circle"] }),
    ],
    transfer: [p("교통 표지판에서 세모 모양은?", ["첫째", "둘째", "셋째"], "첫째", { type: "shapes", shapes: ["triangle", "circle", "square"] }), p("창문과 닮은 도형은?", ["직사각형", "원", "삼각형"], "직사각형", { type: "shapes", shapes: ["rectangle", "circle", "triangle"] })],
  }),
  lesson({
    id: "geometry-compose", subject: "geometry", unit: "도형·공간", title: "도형을 나누고 합쳐요", level: 2,
    memoryTitle: ["작은 도형을 합치면", "새 모양이 돼!"], rule: ["도형은", "나누고", "돌리고", "합칠 수 있어!"], key: "합칠 수 있어!", keyOptions: ["합칠 수 있어!", "바꿀 수 없어!", "색만 봐!"], distractor: "버려", hint: "도형의 방향을 돌려 빈자리에 맞춰 봐.", misconception: "도형을 돌리면 다른 도형이 된다고 생각함", mistake: "정사각형을 돌리면 더는 정사각형이 아니지?",
    drills: [
      p("같은 삼각형 두 개를 합쳐 만들 수 있는 것은?", ["사각형", "원", "점"], "사각형", { type: "shapes", shapes: ["triangle", "triangle", "square"] }),
      p("정사각형을 반으로 나누면 만들기 쉬운 것은?", ["삼각형 두 개", "원 두 개", "점 하나"], "삼각형 두 개", { type: "shapes", shapes: ["square", "triangle", "triangle"] }),
      p("같은 정사각형 두 개를 옆으로 합치면?", ["직사각형", "원", "삼각형"], "직사각형", { type: "shapes", shapes: ["square", "square", "rectangle"] }),
      p("도형을 돌렸을 때 변하지 않는 것은?", ["변의 수", "위쪽 방향", "자리"], "변의 수", { type: "shapes", shapes: ["triangle", "triangle"] }),
      p("직사각형을 반으로 나누어 만들 수 있는 것은?", ["작은 직사각형", "원만", "점만"], "작은 직사각형", { type: "shapes", shapes: ["rectangle", "rectangle", "rectangle"] }),
      p("빈자리에 맞추기 전에 해 볼 것은?", ["돌려 보기", "도형 버리기", "색칠만"], "돌려 보기", { type: "shapes", shapes: ["triangle", "square", "rectangle"] }),
    ],
    transfer: [p("타일 두 장으로 긴 바닥 모양을 만들면?", ["직사각형", "원", "삼각형"], "직사각형", { type: "shapes", shapes: ["square", "square", "rectangle"] }), p("샌드위치를 대각선으로 자르면?", ["삼각형 두 개", "원 두 개", "사각형 세 개"], "삼각형 두 개", { type: "shapes", shapes: ["square", "triangle", "triangle"] })],
  }),
  lesson({
    id: "geometry-position", subject: "geometry", unit: "도형·공간", title: "위치와 방향을 말해요", level: 3,
    memoryTitle: ["기준을 먼저 정하면", "위치를 말할 수 있어!"], rule: ["위치는", "기준에서", "방향과", "거리를", "말해!"], key: "기준에서", keyOptions: ["기준에서", "내 느낌으로", "반대에서"], distractor: "아무 데서", hint: "무엇을 기준으로 왼쪽·오른쪽·앞·뒤인지 먼저 말해.", misconception: "말하는 사람과 듣는 사람의 기준 방향을 섞음", mistake: "기준이 없어도 왼쪽이라고만 말하면 모두 알지?",
    drills: [
      p("별은 세모의 어느 쪽일까?", ["오른쪽", "왼쪽", "위"], "오른쪽", { type: "pattern", items: ["△", "★"], missingIndex: -1 }),
      p("원은 네모의 어느 쪽일까?", ["왼쪽", "오른쪽", "아래"], "왼쪽", { type: "pattern", items: ["●", "■"], missingIndex: -1 }),
      p("위쪽 화살표는?", ["↑", "↓", "→"], "↑", { type: "pattern", items: ["↑", "↓", "→"], missingIndex: -1 }),
      p("오른쪽 화살표는?", ["→", "←", "↓"], "→", { type: "pattern", items: ["→", "←", "↓"], missingIndex: -1 }),
      p("두 칸 앞으로 가는 표시는?", ["↑ ↑", "↓ ↓", "← ←"], "↑ ↑", { type: "pattern", items: ["↑", "↑"], missingIndex: -1 }),
      p("한 칸 왼쪽, 한 칸 위는?", ["← ↑", "→ ↓", "↑ →"], "← ↑", { type: "pattern", items: ["←", "↑"], missingIndex: -1 }),
    ],
    transfer: [p("문이 책상의 오른쪽에 있어. 어느 방향으로 갈까?", ["오른쪽", "왼쪽", "뒤"], "오른쪽", { type: "pattern", items: ["책상", "→", "문"], missingIndex: -1 }), p("지도에서 공원이 학교 위쪽에 있어. 어느 방향?", ["위", "아래", "오른쪽"], "위", { type: "pattern", items: ["학교", "↑", "공원"], missingIndex: -1 })],
  }),

  lesson({
    id: "pattern-repeat", subject: "pattern", unit: "규칙·관계", title: "반복되는 규칙을 찾아요", level: 1,
    memoryTitle: ["되풀이되는 작은 묶음을 찾으면", "다음이 보여!"], rule: ["규칙은", "되풀이되는", "묶음을", "찾아!"], key: "되풀이되는", keyOptions: ["되풀이되는", "가장 큰", "마지막만"], distractor: "아무", hint: "처음부터 같은 순서가 다시 나오는 곳을 묶어.", misconception: "마지막 항목만 보고 다음 항목을 추측함", mistake: "동그라미-세모가 반복돼도 다음은 네모일 수 있지?",
    drills: [
      p("● ▲ ● ▲ 다음은?", ["●", "▲", "■"], "●", { type: "pattern", items: ["●", "▲", "●", "▲", "?"], missingIndex: 4 }),
      p("■ ■ ● ■ ■ ● 다음은?", ["■", "●", "▲"], "■", { type: "pattern", items: ["■", "■", "●", "■", "■", "●", "?"], missingIndex: 6 }),
      p("▲ ● ■ ▲ ● ■ 다음은?", ["▲", "●", "■"], "▲", { type: "pattern", items: ["▲", "●", "■", "▲", "●", "■", "?"], missingIndex: 6 }),
      p("큰 원-작은 원-큰 원 다음은?", ["작은 원", "큰 원", "세모"], "작은 원", { type: "pattern", items: ["큰 원", "작은 원", "큰 원", "?"], missingIndex: 3 }),
      p("왼-오-오-왼-오-오 다음은?", ["왼", "오", "위"], "왼", { type: "pattern", items: ["왼", "오", "오", "왼", "오", "오", "?"], missingIndex: 6 }),
      p("빨강-노랑-빨강-노랑 다음은?", ["빨강", "노랑", "파랑"], "빨강", { type: "pattern", items: ["빨강", "노랑", "빨강", "노랑", "?"], missingIndex: 4 }),
    ],
    transfer: [p("짝-짝-쉼이 반복돼. 다음은?", ["짝", "쉼", "쿵"], "짝", { type: "pattern", items: ["짝", "짝", "쉼", "짝", "짝", "쉼", "?"], missingIndex: 6 }), p("월-수-금-월-수 다음은?", ["금", "월", "화"], "금", { type: "pattern", items: ["월", "수", "금", "월", "수", "?"], missingIndex: 5 })],
  }),
  lesson({
    id: "pattern-number", subject: "pattern", unit: "규칙·관계", title: "수의 변화를 찾아요", level: 2,
    memoryTitle: ["얼마씩 변하는지 보면", "다음 수가 보여!"], rule: ["수 규칙은", "얼마씩", "변하는지", "찾아!"], key: "얼마씩", keyOptions: ["얼마씩", "몇 자리인지", "색이 어떤지"], distractor: "마지막만", hint: "이웃한 두 수의 차이를 차례로 확인해.", misconception: "처음과 끝 수만 보고 변화량을 추측함", mistake: "2, 4, 6은 4씩 커지는 규칙이지?",
    drills: [
      p("2, 4, 6, 8 다음 수는?", ["10", "9", "12"], "10", { type: "number-line", start: 2, end: 10, marks: [2, 4, 6, 8, 10], missing: 10 }),
      p("5, 10, 15, 20 다음 수는?", ["25", "21", "30"], "25", { type: "number-line", start: 5, end: 25, marks: [5, 10, 15, 20, 25], missing: 25 }),
      p("30, 27, 24, 21 다음 수는?", ["18", "20", "17"], "18", { type: "number-line", start: 18, end: 30, marks: [18, 21, 24, 27, 30], missing: 18 }),
      p("10, 20, 30, 40 다음 수는?", ["50", "41", "60"], "50", { type: "number-line", start: 10, end: 50, marks: [10, 20, 30, 40, 50], missing: 50 }),
      p("1, 3, 5, 7 다음 수는?", ["9", "8", "10"], "9", { type: "number-line", start: 1, end: 9, marks: [1, 3, 5, 7, 9], missing: 9 }),
      p("20, 18, 16, 14 다음 수는?", ["12", "13", "10"], "12", { type: "number-line", start: 12, end: 20, marks: [12, 14, 16, 18, 20], missing: 12 }),
    ],
    transfer: [p("저금액이 1,000, 2,000, 3,000원으로 늘어. 다음은?", ["4,000원", "3,100원", "5,000원"], "4,000원", { type: "number-line", start: 1, end: 4, marks: [1, 2, 3, 4], missing: 4 }), p("버스가 10분, 20분, 30분에 와. 다음은?", ["40분", "31분", "50분"], "40분", { type: "number-line", start: 10, end: 40, marks: [10, 20, 30, 40], missing: 40 })],
  }),
  lesson({
    id: "pattern-unknown", subject: "pattern", unit: "규칙·관계", title: "빈칸의 수를 찾아요", level: 3,
    memoryTitle: ["양쪽이 같아지게 보면", "빈칸을 찾을 수 있어!"], rule: ["빈칸은", "양쪽 관계를", "거꾸로", "생각해!"], key: "거꾸로", keyOptions: ["거꾸로", "그대로만", "짐작으로"], distractor: "무시하고", hint: "더한 문제는 빼서, 뺀 문제는 더해서 확인해.", misconception: "빈칸을 결과로만 보고 역연산을 사용하지 못함", mistake: "□+3=8의 빈칸은 8이지?",
    drills: [
      p("□ + 3 = 8에서 □는?", ["5", "11", "8"], "5", { type: "pattern", items: ["□", "+3", "8"], missingIndex: 0 }),
      p("□ + 6 = 10에서 □는?", ["4", "16", "10"], "4", { type: "pattern", items: ["□", "+6", "10"], missingIndex: 0 }),
      p("9 - □ = 4에서 □는?", ["5", "13", "4"], "5", { type: "pattern", items: ["9", "-□", "4"], missingIndex: 1 }),
      p("15 - □ = 7에서 □는?", ["8", "22", "7"], "8", { type: "pattern", items: ["15", "-□", "7"], missingIndex: 1 }),
      p("□ × 3 = 12에서 □는?", ["4", "9", "12"], "4", { type: "pattern", items: ["□", "×3", "12"], missingIndex: 0 }),
      p("20 ÷ □ = 5에서 □는?", ["4", "15", "5"], "4", { type: "pattern", items: ["20", "÷□", "5"], missingIndex: 1 }),
    ],
    transfer: [p("가진 돈에 2,000원을 더하니 5,000원이야. 처음 돈은?", ["3,000원", "7,000원", "5,000원"], "3,000원", { type: "pattern", items: ["□", "+2,000", "5,000"], missingIndex: 0 }), p("상자 몇 개에 4개씩 넣으니 16개야. 상자는?", ["4개", "12개", "16개"], "4개", { type: "pattern", items: ["□", "×4", "16"], missingIndex: 0 })],
  }),

  lesson({
    id: "data-classify", subject: "data", unit: "자료·가능성", title: "기준을 정해 분류해요", level: 1,
    memoryTitle: ["한 번에 한 기준으로", "같은 것끼리 모아!"], rule: ["분류는", "한 기준으로", "같은 것끼리", "모아!"], key: "한 기준으로", keyOptions: ["한 기준으로", "여러 기준을 섞어", "느낌대로"], distractor: "아무렇게나", hint: "색, 모양, 크기 중 기준 하나를 먼저 말해.", misconception: "분류 도중 기준을 바꾸어 중복·누락이 생김", mistake: "빨간 세모를 색 상자와 모양 상자에 모두 넣어도 되지?",
    drills: [
      p("모양이 같은 것끼리 모을 때 다른 것은?", ["원", "삼각형", "동그라미"], "삼각형", { type: "shapes", shapes: ["circle", "triangle", "circle"] }),
      p("네 변 도형끼리 모을 때 들어가지 않는 것은?", ["삼각형", "정사각형", "직사각형"], "삼각형", { type: "shapes", shapes: ["triangle", "square", "rectangle"] }),
      p("짝수끼리 모을 때 다른 수는?", ["5", "2", "8"], "5", { type: "pattern", items: ["2", "5", "8"], missingIndex: -1 }),
      p("10보다 큰 수끼리 모을 때 다른 수는?", ["7", "12", "15"], "7", { type: "pattern", items: ["7", "12", "15"], missingIndex: -1 }),
      p("돈 단위끼리 모을 때 다른 것은?", ["3시", "500원", "1,000원"], "3시", { type: "pattern", items: ["500원", "3시", "1,000원"], missingIndex: -1 }),
      p("길이 단위끼리 모을 때 다른 것은?", ["2kg", "5cm", "1m"], "2kg", { type: "pattern", items: ["5cm", "2kg", "1m"], missingIndex: -1 }),
    ],
    transfer: [p("세탁물을 색 기준으로 나눌 때 흰옷 상자에 넣을 것은?", ["흰 셔츠", "검은 바지", "빨간 양말"], "흰 셔츠", { type: "pattern", items: ["흰 셔츠", "검은 바지", "빨간 양말"], missingIndex: -1 }), p("재활용품을 재질로 나눌 때 종이류는?", ["신문", "유리병", "캔"], "신문", { type: "pattern", items: ["신문", "유리병", "캔"], missingIndex: -1 })],
  }),
  lesson({
    id: "data-chart", subject: "data", unit: "자료·가능성", title: "표와 그래프를 읽어요", level: 2,
    memoryTitle: ["제목과 눈금을 먼저 보면", "그래프가 말해 줘!"], rule: ["그래프는", "제목과", "눈금을", "먼저 봐!"], key: "눈금을", keyOptions: ["눈금을", "색만", "막대 폭만"], distractor: "그림만", hint: "한 칸이 몇을 뜻하는지 확인하고 막대 끝을 읽어.", misconception: "막대의 시각적 크기만 보고 눈금 값을 세지 않음", mistake: "막대가 가장 진한 항목이 언제나 가장 많지?",
    drills: [
      p("가장 많은 과일은?", ["사과", "배", "귤"], "사과", { type: "chart", labels: ["사과", "배", "귤"], values: [6, 3, 5] }),
      p("가장 적은 색은?", ["파랑", "빨강", "노랑"], "파랑", { type: "chart", labels: ["빨강", "파랑", "노랑"], values: [5, 2, 4] }),
      p("책을 몇 권 읽었을까?", ["7권", "5권", "9권"], "7권", { type: "chart", labels: ["책"], values: [7] }),
      p("고양이와 강아지는 몇 표 차이일까?", ["3표", "7표", "10표"], "3표", { type: "chart", labels: ["고양이", "강아지"], values: [7, 4] }),
      p("같은 수인 것은?", ["A와 C", "A와 B", "B와 C"], "A와 C", { type: "chart", labels: ["A", "B", "C"], values: [5, 3, 5] }),
      p("전체 표 수는?", ["12표", "7표", "5표"], "12표", { type: "chart", labels: ["찬성", "반대"], values: [7, 5] }),
    ],
    transfer: [p("매점에서 가장 많이 팔린 것은?", ["물", "우유", "주스"], "물", { type: "chart", labels: ["물", "우유", "주스"], values: [9, 5, 7] }), p("버스 이용자가 가장 적은 날은?", ["화", "월", "수"], "화", { type: "chart", labels: ["월", "화", "수"], values: [8, 4, 6] })],
  }),
  lesson({
    id: "data-chance", subject: "data", unit: "자료·가능성", title: "가능성을 말해요", level: 3,
    memoryTitle: ["들어 있는 것을 살펴보면", "나올 가능성을 말할 수 있어!"], rule: ["가능성은", "자료를", "보고", "비교해!"], key: "자료를", keyOptions: ["자료를", "기분을", "소원을"], distractor: "찍어서", hint: "더 많이 들어 있으면 나올 가능성이 더 커.", misconception: "원하는 결과가 더 잘 나올 것이라고 판단함", mistake: "빨강 1개, 파랑 5개여도 내가 빨강을 원하면 빨강이 더 잘 나오지?",
    drills: [
      p("빨강 2개, 파랑 6개 중 더 잘 나올 색은?", ["파랑", "빨강", "같아"], "파랑", { type: "chart", labels: ["빨강", "파랑"], values: [2, 6] }),
      p("A 4개, B 4개면 가능성은?", ["같아", "A", "B"], "같아", { type: "chart", labels: ["A", "B"], values: [4, 4] }),
      p("노랑 0개면 노랑이 나올 수 있을까?", ["나올 수 없어", "잘 나와", "언제나 나와"], "나올 수 없어", { type: "chart", labels: ["노랑", "초록"], values: [0, 5] }),
      p("1부터 6까지 주사위에서 7이 나올 수 있을까?", ["나올 수 없어", "가끔 나와", "언제나 나와"], "나올 수 없어", { type: "chart", labels: ["1~6", "7"], values: [6, 0] }),
      p("동전 앞뒤의 가능성은?", ["비슷해", "앞만", "뒤만"], "비슷해", { type: "chart", labels: ["앞", "뒤"], values: [1, 1] }),
      p("비 예보 80%와 20% 중 우산이 더 필요한 날은?", ["80%", "20%", "같아"], "80%", { type: "chart", labels: ["80%", "20%"], values: [8, 2] }),
    ],
    transfer: [p("버스가 정시에 온 날 8번, 늦은 날 2번이야. 다음에 더 기대되는 것은?", ["정시 도착", "늦게 도착", "판단 불가"], "정시 도착", { type: "chart", labels: ["정시", "늦음"], values: [8, 2] }), p("간식 상자에 사과맛 5개, 포도맛 1개야. 더 잘 집힐 것은?", ["사과맛", "포도맛", "같아"], "사과맛", { type: "chart", labels: ["사과", "포도"], values: [5, 1] })],
  }),
];

const originalById = new Map(originalSessions.map((session) => [session.id, session]));
const addedById = new Map(addedSessions.map((session) => [session.id, session]));

export const mathAreas: MathArea[] = [
  {
    id: "number-operations", title: "수와 연산", description: "수를 세고 비교하는 기초부터 덧셈·뺄셈·곱셈·나눗셈을 생활 장면에 연결해요.", color: "#2f9f77",
    sessionIds: ["number-count", "number-compare", "number-make-ten", "number-place-value", "add-pictures", "add-place", "add-make-ten", "sub-pictures", "sub-place", "sub-borrow", "multiply-groups", "multiply-addition", "multiply-easy-tables", "multiply-tables", "divide-share", "divide-group", "money-count", "money-price", "money-budget", "money-mission"],
    gradeBands: [
      { label: "1~2학년군", topics: "네 자리 이하 수 · 덧셈과 뺄셈 · 곱셈" },
      { label: "3~4학년군", topics: "큰 수 · 사칙계산 · 분수와 소수" },
      { label: "5~6학년군", topics: "혼합 계산 · 약수와 배수 · 분수·소수 연산" },
    ],
  },
  {
    id: "change-relations", title: "변화와 관계", description: "물체와 수의 반복·증가 규칙을 찾고, 나만의 방법으로 표현해요.", color: "#5078c8", sessionIds: ["pattern-repeat", "pattern-number", "pattern-unknown"],
    gradeBands: [
      { label: "1~2학년군", topics: "물체·무늬·수의 규칙 찾기" },
      { label: "3~4학년군", topics: "변화 규칙 · 계산식 배열 · 등식" },
      { label: "5~6학년군", topics: "대응 관계 · 비와 비율 · 비례식" },
    ],
  },
  {
    id: "geometry-measurement", title: "도형과 측정", description: "시각과 시간, 길이·무게·들이, 모양과 위치를 직접 다루며 익혀요.", color: "#e17858", sessionIds: ["clock-basic", "clock-quarter", "time-duration", "time-calendar", "measure-compare", "measure-ruler", "measure-weight-capacity", "geometry-shapes", "geometry-compose", "geometry-position"],
    gradeBands: [
      { label: "1~2학년군", topics: "입체·평면 모양 · 시각과 시간 · 길이" },
      { label: "3~4학년군", topics: "각과 도형 · 이동 · 들이·무게·각도" },
      { label: "5~6학년군", topics: "합동·대칭 · 넓이 · 입체도형의 부피" },
    ],
  },
  {
    id: "data-chance", title: "자료와 가능성", description: "생활 자료를 분류하고 표와 그래프로 나타내며 가능성을 판단해요.", color: "#d56f91", sessionIds: ["data-classify", "data-chart", "data-chance"],
    gradeBands: [
      { label: "1~2학년군", topics: "분류 · 표 · 간단한 그래프" },
      { label: "3~4학년군", topics: "그림·막대·꺾은선그래프" },
      { label: "5~6학년군", topics: "평균 · 띠·원그래프 · 가능성" },
    ],
  },
];

export const sessions: Session[] = mathAreas.flatMap((area) =>
  area.sessionIds.map((id) => originalById.get(id) ?? addedById.get(id)).filter((session): session is Session => Boolean(session)),
);

const standards: Record<string, CurriculumAlignment> = {
  count: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-01]", achievement: "0과 100까지의 수 개념을 이해하고 수를 세고 읽고 쓸 수 있다." },
  place: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-02]", achievement: "자릿값과 위치적 기수법을 이해하고 네 자리 이하의 수를 읽고 쓸 수 있다." },
  compare: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-03]", achievement: "네 자리 이하 수의 계열을 이해하고 수의 크기를 비교할 수 있다." },
  compose: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-04]", achievement: "수를 분해하고 합성하는 활동을 통하여 수 감각을 기른다." },
  addSubLife: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-05]", achievement: "실생활 상황과 연결하여 덧셈과 뺄셈의 의미를 이해한다." },
  addSub: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-06]", achievement: "두 자리 수 범위의 덧셈과 뺄셈 계산 원리를 이해하고 계산할 수 있다." },
  unknown: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-09]", achievement: "□가 사용된 덧셈식과 뺄셈식을 만들고 □의 값을 구할 수 있다." },
  multiplyMeaning: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-10]", achievement: "실생활 상황과 연결하여 곱셈의 의미를 이해한다." },
  multiply: { domain: "수와 연산", gradeBand: "1~2학년군", code: "[2수01-11]", achievement: "곱셈구구를 이해하고 한 자리 수의 곱셈을 할 수 있다." },
  divide: { domain: "수와 연산", gradeBand: "3~4학년군", code: "[4수01-05]", achievement: "실생활 상황과 연결하여 나눗셈의 의미와 곱셈과의 관계를 이해한다." },
  pattern: { domain: "변화와 관계", gradeBand: "1~2학년군", code: "[2수02-01]", achievement: "물체, 무늬, 수의 배열에서 규칙을 찾아 여러 가지 방법으로 표현할 수 있다." },
  patternMake: { domain: "변화와 관계", gradeBand: "1~2학년군", code: "[2수02-02]", achievement: "자신이 정한 규칙에 따라 물체, 무늬, 수 등을 배열할 수 있다." },
  shape: { domain: "도형과 측정", gradeBand: "1~2학년군", code: "[2수03-03]", achievement: "생활 주변에서 삼각형, 사각형, 원을 찾고 여러 가지 모양을 만들 수 있다." },
  position: { domain: "도형과 측정", gradeBand: "1~2학년군", code: "[2수03-02]", achievement: "입체도형의 모양을 만들고 위치나 방향을 이용하여 말할 수 있다." },
  compareMeasure: { domain: "도형과 측정", gradeBand: "1~2학년군", code: "[2수03-06]", achievement: "구체물의 길이, 들이, 무게, 넓이를 비교하여 말할 수 있다." },
  clock: { domain: "도형과 측정", gradeBand: "1~2학년군", code: "[2수03-07]", achievement: "시계를 보고 시각을 몇 시 몇 분까지 읽을 수 있다." },
  calendar: { domain: "도형과 측정", gradeBand: "1~2학년군", code: "[2수03-09]", achievement: "실생활 상황과 연결하여 시간과 달력 단위 사이의 관계를 이해한다." },
  length: { domain: "도형과 측정", gradeBand: "1~2학년군", code: "[2수03-10]", achievement: "길이 단위 cm와 m를 알고 주변 사물의 길이를 측정할 수 있다." },
  capacityWeight: { domain: "도형과 측정", gradeBand: "3~4학년군", code: "[4수03-20]", achievement: "g과 kg을 알고 무게를 측정하고 어림하며 수학의 유용성을 인식할 수 있다." },
  classify: { domain: "자료와 가능성", gradeBand: "1~2학년군", code: "[2수04-01]", achievement: "사물을 기준에 따라 분류하여 개수를 세고 결과를 말할 수 있다." },
  chart: { domain: "자료와 가능성", gradeBand: "1~2학년군", code: "[2수04-03]", achievement: "자료를 분류하여 그래프로 나타내고 편리한 점을 말할 수 있다." },
  chance: { domain: "자료와 가능성", gradeBand: "5~6학년군", code: "[6수04-04]", achievement: "사건이 일어날 가능성을 말로 표현하고 비교할 수 있다." },
};

export function curriculumForSession(session: Session): CurriculumAlignment {
  if (session.id === "number-count") return standards.count;
  if (session.id === "number-compare") return standards.compare;
  if (session.id === "number-place-value") return standards.place;
  if (session.id === "number-make-ten") return standards.compose;
  if (session.id === "pattern-unknown") return standards.patternMake;
  if (session.subject === "pattern") return standards.pattern;
  if (session.id === "data-classify") return standards.classify;
  if (session.id === "data-chart") return standards.chart;
  if (session.id === "data-chance") return standards.chance;
  if (session.subject === "clock") return session.id === "time-calendar" ? standards.calendar : standards.clock;
  if (session.subject === "geometry") return session.id === "geometry-position" ? standards.position : standards.shape;
  if (session.subject === "measurement") return session.id === "measure-ruler" ? standards.length : session.id === "measure-compare" ? standards.compareMeasure : standards.capacityWeight;
  if (session.subject === "money") return standards.addSubLife;
  if (session.subject === "division") return standards.divide;
  if (session.subject === "multiplication") return session.id === "multiply-groups" || session.id === "multiply-addition" ? standards.multiplyMeaning : standards.multiply;
  if (session.subject === "addition" || session.subject === "subtraction") return session.id.endsWith("pictures") ? standards.addSubLife : session.id.includes("make-ten") ? standards.unknown : standards.addSub;
  return standards.count;
}

export const areaForSession = (sessionId: string) => mathAreas.find((area) => area.sessionIds.includes(sessionId));
export const masteryTarget = 10;
export const transferTarget = 3;
