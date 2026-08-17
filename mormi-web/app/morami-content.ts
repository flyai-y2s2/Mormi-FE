export type Subject =
  | "number"
  | "addition"
  | "subtraction"
  | "multiplication"
  | "division"
  | "money"
  | "clock"
  | "measurement"
  | "geometry"
  | "pattern"
  | "data";

export type Visual =
  | { type: "clock"; hour: number; minute: number }
  | { type: "objects"; left: number; right: number; operation: "+" | "-" }
  | { type: "equation"; left: number; right: number; operation: "+" | "-" }
  | { type: "money"; amounts: number[]; paid?: number; labels?: string[] }
  | { type: "ten-frame"; count: number; secondCount?: number; item?: "dot" | "strawberry" | "cup" | "apple" }
  | { type: "groups"; groups: number; each: number; mode: "multiply" | "share" }
  | { type: "number-line"; start: number; end: number; marks: number[]; missing?: number }
  | { type: "measurement"; kind: "length" | "weight" | "capacity"; left: number; right?: number; unit: string }
  | { type: "shapes"; shapes: Array<"circle" | "triangle" | "square" | "rectangle"> }
  | { type: "pattern"; items: string[]; missingIndex: number }
  | { type: "chart"; labels: string[]; values: number[] }
  | { type: "calendar"; month: number; highlight: number; note?: string };

export type Problem = {
  prompt: string;
  answers: string[];
  correct: string;
  visual: Visual;
};

export type Session = {
  id: string;
  subject: Subject;
  unit: string;
  title: string;
  level: number;
  memoryTitle: string;
  memoryDialogue: string;
  drillIntro: string;
  drills: Problem[];
  teachPrompt: string;
  learnedLine: string;
  sentenceWords: string[];
  targetSentence: string[];
  fillBefore: string;
  fillAfter: string;
  fillCorrect: string;
  fillOptions: string[];
  oneWordPrompt: string;
  oneWordCorrect: string;
  oneWordOptions: string[];
  hint: string;
  dictionaryLines: string[];
  dictionaryProblem: Problem;
  pointPrompt: string;
  pointOptions: string[];
  pointCorrect: string;
  pointClockMarker?: number;
  homework: Problem[];
  misconception: string;
};

const mathProblem = (left: number, right: number, operation: "+" | "-", answers: number[]): Problem => ({
  prompt: operation === "+" ? "모두 몇 개일까?" : "남은 것은 몇 개일까?",
  correct: String(operation === "+" ? left + right : left - right),
  answers: answers.map(String),
  visual: { type: left <= 10 ? "objects" : "equation", left, right, operation },
});

const moneyProblem = (amounts: number[], answers: number[], paid?: number, labels?: string[]): Problem => {
  const total = amounts.reduce((sum, value) => sum + value, 0);
  const correct = paid ? paid - total : total;
  return {
    prompt: paid ? `${paid.toLocaleString("ko-KR")}원을 냈어. 얼마를 돌려받을까?` : "모두 얼마일까?",
    correct: `${correct.toLocaleString("ko-KR")}원`,
    answers: answers.map((value) => `${value.toLocaleString("ko-KR")}원`),
    visual: { type: "money", amounts, paid, labels },
  };
};

const clockProblem = (hour: number, minute: number, answers: string[]): Problem => ({
  prompt: "이 시계는 몇 시일까?",
  correct: minute === 0 ? `${hour}시` : `${hour}시 ${minute}분`,
  answers,
  visual: { type: "clock", hour, minute },
});

export const sessions: Session[] = [
  {
    id: "add-pictures", subject: "addition", unit: "덧셈", title: "그림을 모아요", level: 1,
    memoryTitle: "둘을 모으면\n더 많아져!", memoryDialogue: "어제 지우가 알려 준 ‘모으기’를 별노트에서 다시 봤어!",
    drillIntro: "두 무리를 한곳에 모아 보자. 모두 몇 개인지 알려 줘!",
    drills: [mathProblem(2,3,"+",[5,4,6]), mathProblem(4,2,"+",[6,5,7]), mathProblem(3,5,"+",[8,7,9]), mathProblem(1,6,"+",[7,6,8]), mathProblem(5,4,"+",[9,8,10]), mathProblem(2,7,"+",[9,8,7])],
    teachPrompt: "2개와 3개를 모으면… 4개지?", learnedLine: "더하기는 두 무리를 합치는 거야!",
    sentenceWords: ["더하기는", "두", "무리를", "합치는", "거야", "빼는"], targetSentence: ["더하기는", "두", "무리를", "합치는", "거야"],
    fillBefore: "더하기는 두 무리를", fillAfter: "거야", fillCorrect: "합치는", fillOptions: ["합치는", "빼는", "나누는"],
    oneWordPrompt: "더하기는 무엇을 할까?", oneWordCorrect: "합치기", oneWordOptions: ["합치기", "덜기", "가리기"], hint: "두 상자를 한 상자에 담아 봐.",
    dictionaryLines: ["더하기는 두 무리를 한데 모으는 일이야.", "모두 세면 답을 찾을 수 있어."], dictionaryProblem: mathProblem(3,2,"+",[5,4,6]),
    pointPrompt: "2개와 3개를 모은 수를 가리켜 줘", pointOptions: ["4", "5", "6"], pointCorrect: "5",
    homework: [moneyProblem([300,200],[500,400,600],undefined,["연필","지우개"]), mathProblem(4,3,"+",[7,6,8])], misconception: "두 무리 중 한쪽만 세거나 마지막 수를 빠뜨림",
  },
  {
    id: "add-place", subject: "addition", unit: "덧셈", title: "자리끼리 더해요", level: 2,
    memoryTitle: "낱개는 낱개끼리\n십은 십끼리!", memoryDialogue: "작은 수를 모으는 방법, 이제 나도 잘 기억해!",
    drillIntro: "십의 자리와 일의 자리를 나눠서 더해 보자.",
    drills: [mathProblem(12,5,"+",[17,16,18]), mathProblem(23,4,"+",[27,26,29]), mathProblem(31,8,"+",[39,38,41]), mathProblem(42,6,"+",[48,46,52]), mathProblem(15,12,"+",[27,26,28]), mathProblem(24,13,"+",[37,36,38])],
    teachPrompt: "23 더하기 4는 십끼리 더해서 63이지?", learnedLine: "같은 자리끼리 더해야 해!",
    sentenceWords: ["같은", "자리끼리", "더해야", "해", "다른", "빼야"], targetSentence: ["같은", "자리끼리", "더해야", "해"],
    fillBefore: "덧셈은 같은", fillAfter: "더해", fillCorrect: "자리끼리", fillOptions: ["자리끼리", "색끼리", "마음대로"],
    oneWordPrompt: "무엇끼리 더할까?", oneWordCorrect: "같은 자리", oneWordOptions: ["같은 자리", "다른 자리", "큰 수만"], hint: "일은 일 아래, 십은 십 아래에 놓아 봐.",
    dictionaryLines: ["일의 자리는 일의 자리끼리 더해.", "십의 자리는 십의 자리끼리 더해."], dictionaryProblem: mathProblem(21,6,"+",[27,26,28]),
    pointPrompt: "12 + 5의 답을 가리켜 줘", pointOptions: ["16", "17", "18"], pointCorrect: "17",
    homework: [moneyProblem([1200,500],[1700,1600,1800],undefined,["공책","연필"]), mathProblem(32,6,"+",[38,37,39])], misconception: "서로 다른 자릿수를 더하거나 수를 이어 붙임",
  },
  {
    id: "add-make-ten", subject: "addition", unit: "덧셈", title: "10을 먼저 만들어요", level: 3,
    memoryTitle: "10을 먼저 만들면\n더하기가 쉬워!", memoryDialogue: "같은 자리끼리 더하는 방법으로 혼자 문제를 풀어 봤어!",
    drillIntro: "10이 넘는 덧셈이야. 10을 먼저 만들어 보자.",
    drills: [mathProblem(8,5,"+",[13,12,14]), mathProblem(9,6,"+",[15,14,16]), mathProblem(7,8,"+",[15,14,16]), mathProblem(16,7,"+",[23,22,24]), mathProblem(28,5,"+",[33,32,34]), mathProblem(37,6,"+",[43,42,44])],
    teachPrompt: "8 더하기 5는 10보다 작으니까 3이지?", learnedLine: "10을 먼저 만들고 남은 수를 더해!",
    sentenceWords: ["10을", "먼저", "만들고", "남은", "수를", "더해", "빼"], targetSentence: ["10을", "먼저", "만들고", "남은", "수를", "더해"],
    fillBefore: "10을 먼저 만들고", fillAfter: "수를 더해", fillCorrect: "남은", fillOptions: ["남은", "처음", "큰"],
    oneWordPrompt: "무엇을 먼저 만들까?", oneWordCorrect: "10", oneWordOptions: ["10", "5", "20"], hint: "8에게 2를 주면 10, 5에서 2를 주고 3이 남아.",
    dictionaryLines: ["10이 되도록 필요한 수를 먼저 옮겨.", "10에 남은 수를 더하면 돼."], dictionaryProblem: mathProblem(8,4,"+",[12,11,13]),
    pointPrompt: "8 + 5의 답을 가리켜 줘", pointOptions: ["12", "13", "14"], pointCorrect: "13",
    homework: [moneyProblem([800,500],[1300,1200,1400],undefined,["빵","우유"]), mathProblem(19,4,"+",[23,22,24])], misconception: "10을 만든 뒤 옮겨 쓴 수를 다시 더함",
  },
  {
    id: "sub-pictures", subject: "subtraction", unit: "뺄셈", title: "남은 수를 찾아요", level: 1,
    memoryTitle: "덜어 내고\n남은 것을 세어!", memoryDialogue: "모으면 더하기였지! 이번엔 몇 개가 남는지 궁금해.",
    drillIntro: "있던 것에서 몇 개를 덜어 내고 남은 수를 알려 줘.",
    drills: [mathProblem(5,2,"-",[3,2,4]), mathProblem(7,3,"-",[4,3,5]), mathProblem(8,5,"-",[3,2,4]), mathProblem(9,4,"-",[5,4,6]), mathProblem(6,1,"-",[5,4,6]), mathProblem(10,6,"-",[4,3,5])],
    teachPrompt: "7개에서 3개를 가져가면 10개가 남지?", learnedLine: "뺄셈은 덜어 내고 남은 수를 찾는 거야!",
    sentenceWords: ["뺄셈은", "덜어", "내고", "남은", "수를", "찾아", "모아"], targetSentence: ["뺄셈은", "덜어", "내고", "남은", "수를", "찾아"],
    fillBefore: "뺄셈은 덜어 내고", fillAfter: "수를 찾아", fillCorrect: "남은", fillOptions: ["남은", "모든", "처음"],
    oneWordPrompt: "덜어 낸 뒤 무엇을 셀까?", oneWordCorrect: "남은 것", oneWordOptions: ["남은 것", "가져간 것만", "처음 것"], hint: "손가락으로 덜어 낼 만큼 가려 봐.",
    dictionaryLines: ["뺄셈은 있던 것에서 일부를 덜어 내는 일이야.", "가리지 않은 남은 것을 세어."], dictionaryProblem: mathProblem(6,2,"-",[4,3,5]),
    pointPrompt: "5 - 2의 답을 가리켜 줘", pointOptions: ["2", "3", "4"], pointCorrect: "3",
    homework: [moneyProblem([700],[400,300,500],1000,["간식"]), mathProblem(8,3,"-",[5,4,6])], misconception: "빼야 할 수와 남은 수를 혼동함",
  },
  {
    id: "sub-place", subject: "subtraction", unit: "뺄셈", title: "자리끼리 빼요", level: 2,
    memoryTitle: "일은 일끼리\n십은 십끼리!", memoryDialogue: "남은 수를 세는 방법으로 내 숙제를 풀어 봤어!",
    drillIntro: "받아내림이 없는 두 자리 뺄셈을 해 보자.",
    drills: [mathProblem(17,5,"-",[12,11,13]), mathProblem(28,6,"-",[22,21,23]), mathProblem(39,7,"-",[32,31,33]), mathProblem(46,12,"-",[34,33,35]), mathProblem(58,24,"-",[34,32,36]), mathProblem(75,33,"-",[42,41,43])],
    teachPrompt: "28에서 6을 빼려면 십의 자리에서 6을 빼지?", learnedLine: "뺄셈도 같은 자리끼리 계산해!",
    sentenceWords: ["뺄셈도", "같은", "자리끼리", "계산해", "다른", "더해"], targetSentence: ["뺄셈도", "같은", "자리끼리", "계산해"],
    fillBefore: "뺄셈도 같은", fillAfter: "계산해", fillCorrect: "자리끼리", fillOptions: ["자리끼리", "색끼리", "큰 수만"],
    oneWordPrompt: "무엇끼리 뺄까?", oneWordCorrect: "같은 자리", oneWordOptions: ["같은 자리", "다른 자리", "작은 수만"], hint: "일의 자리부터 같은 줄에 놓아 봐.",
    dictionaryLines: ["일의 자리끼리 먼저 빼.", "그다음 십의 자리끼리 빼."], dictionaryProblem: mathProblem(37,5,"-",[32,31,33]),
    pointPrompt: "17 - 5의 답을 가리켜 줘", pointOptions: ["11", "12", "13"], pointCorrect: "12",
    homework: [moneyProblem([2300],[2700,2600,2800],5000,["장난감"]), mathProblem(48,16,"-",[32,31,33])], misconception: "큰 자리에서 작은 수 전체를 빼려고 함",
  },
  {
    id: "sub-borrow", subject: "subtraction", unit: "뺄셈", title: "십 하나를 바꿔요", level: 3,
    memoryTitle: "일이 모자라면\n십 하나를 빌려!", memoryDialogue: "같은 자리끼리 빼는 건 이제 나도 자신 있어!",
    drillIntro: "일의 자리가 모자라면 십 하나를 낱개 10개로 바꿔 보자.",
    drills: [mathProblem(12,5,"-",[7,6,8]), mathProblem(21,7,"-",[14,13,15]), mathProblem(32,8,"-",[24,23,25]), mathProblem(43,16,"-",[27,26,28]), mathProblem(52,27,"-",[25,24,26]), mathProblem(61,38,"-",[23,22,24])],
    teachPrompt: "12에서 5를 못 빼니까 그냥 5에서 2를 빼면 되지?", learnedLine: "일이 모자라면 십 하나를 낱개 10개로 바꿔!",
    sentenceWords: ["일이", "모자라면", "십", "하나를", "10개로", "바꿔", "더해"], targetSentence: ["일이", "모자라면", "십", "하나를", "10개로", "바꿔"],
    fillBefore: "일이 모자라면 십 하나를", fillAfter: "바꿔", fillCorrect: "10개로", fillOptions: ["10개로", "1개로", "없게"],
    oneWordPrompt: "십 하나는 낱개 몇 개?", oneWordCorrect: "10개", oneWordOptions: ["10개", "1개", "5개"], hint: "십 막대 하나를 낱개 열 개로 풀어 봐.",
    dictionaryLines: ["일의 자리에서 바로 뺄 수 없으면 십 하나를 가져와.", "십 하나는 낱개 10개와 같아."], dictionaryProblem: mathProblem(12,4,"-",[8,7,9]),
    pointPrompt: "12 - 5의 답을 가리켜 줘", pointOptions: ["6", "7", "8"], pointCorrect: "7",
    homework: [moneyProblem([3800],[1200,1100,1300],5000,["색연필"]), mathProblem(31,7,"-",[24,23,25])], misconception: "받아내림 때 작은 수에서 큰 수를 거꾸로 뺌",
  },
  {
    id: "money-count", subject: "money", unit: "돈 계산", title: "돈을 세어요", level: 1,
    memoryTitle: "돈은 모양보다\n적힌 값을 봐!", memoryDialogue: "동전과 지폐에 적힌 수가 값이라는 걸 기억했어!",
    drillIntro: "지갑 속 돈을 하나씩 더해서 모두 얼마인지 알려 줘.",
    drills: [moneyProblem([500,100],[600,500,700]), moneyProblem([1000,500],[1500,1400,1600]), moneyProblem([1000,1000,500],[2500,2000,3000]), moneyProblem([5000,1000],[6000,5500,6500]), moneyProblem([1000,500,100],[1600,1500,1700]), moneyProblem([5000,1000,500],[6500,6000,7000])],
    teachPrompt: "1,000원 한 장과 500원 하나면 1,050원이지?", learnedLine: "돈은 적힌 값을 모두 더해서 세어!",
    sentenceWords: ["돈은", "적힌", "값을", "모두", "더해서", "세어", "개수만"], targetSentence: ["돈은", "적힌", "값을", "모두", "더해서", "세어"],
    fillBefore: "돈은 적힌 값을 모두", fillAfter: "세어", fillCorrect: "더해서", fillOptions: ["더해서", "빼서", "가려서"],
    oneWordPrompt: "돈의 무엇을 볼까?", oneWordCorrect: "값", oneWordOptions: ["값", "색", "크기"], hint: "큰 값부터 말하며 다음 돈을 이어 더해 봐.",
    dictionaryLines: ["동전과 지폐의 개수가 아니라 적힌 값을 봐.", "큰 값부터 차례로 더하면 쉬워."], dictionaryProblem: moneyProblem([1000,500],[1500,1400,1600]),
    pointPrompt: "1,000원과 500원을 합친 돈을 가리켜 줘", pointOptions: ["1,050원", "1,500원", "5,000원"], pointCorrect: "1,500원",
    homework: [moneyProblem([1000,500,100],[1600,1500,1700]), moneyProblem([5000,1000,500],[6500,6000,7000])], misconception: "돈의 개수나 0의 개수만 보고 금액을 판단함",
  },
  {
    id: "money-price", subject: "money", unit: "돈 계산", title: "물건값을 더해요", level: 2,
    memoryTitle: "두 물건을 사면\n값도 함께 더해!", memoryDialogue: "지갑 속 돈은 큰 값부터 세니까 잘 셀 수 있었어!",
    drillIntro: "가게에서 두 물건을 골랐어. 모두 얼마인지 계산해 줘.",
    drills: [moneyProblem([700,500],[1200,1100,1300],undefined,["주스","빵"]), moneyProblem([1200,800],[2000,1900,2100],undefined,["공책","연필"]), moneyProblem([1500,1000],[2500,2400,2600],undefined,["우유","과자"]), moneyProblem([2300,1200],[3500,3400,3600],undefined,["퍼즐","스티커"]), moneyProblem([2800,1700],[4500,4400,4600],undefined,["책","자"]), moneyProblem([3500,2400],[5900,5800,6000],undefined,["인형","공"] )],
    teachPrompt: "700원 빵과 500원 주스를 사면 200원이지?", learnedLine: "두 물건을 사면 두 값을 더해!",
    sentenceWords: ["두", "물건을", "사면", "두", "값을", "더해", "빼"], targetSentence: ["두", "물건을", "사면", "두", "값을", "더해"],
    fillBefore: "두 물건을 사면 두 값을", fillAfter: "", fillCorrect: "더해", fillOptions: ["더해", "빼", "그대로 둬"],
    oneWordPrompt: "두 물건값은 어떻게 할까?", oneWordCorrect: "더하기", oneWordOptions: ["더하기", "빼기", "세지 않기"], hint: "첫 물건값에 둘째 물건값을 이어 더해 봐.",
    dictionaryLines: ["여러 물건을 함께 사면 물건값을 모두 더해.", "원을 빠뜨리지 않고 같은 자리끼리 계산해."], dictionaryProblem: moneyProblem([800,600],[1400,1300,1500],undefined,["빵","우유"]),
    pointPrompt: "700원과 500원을 더한 값을 가리켜 줘", pointOptions: ["200원", "1,200원", "7,500원"], pointCorrect: "1,200원",
    homework: [moneyProblem([1800,1200],[3000,2900,3100],undefined,["주스","빵"]), moneyProblem([2500,1500],[4000,3900,4100],undefined,["커피","주스"] )], misconception: "두 가격 중 큰 값만 답하거나 0을 빠뜨림",
  },
  {
    id: "money-budget", subject: "money", unit: "돈 계산", title: "내 돈으로 살 수 있어요", level: 3,
    memoryTitle: "가진 돈과 물건값을\n비교해 봐!", memoryDialogue: "물건값을 모두 더하는 방법 덕분에 장보기 숙제를 끝냈어!",
    drillIntro: "가진 돈으로 살 수 있는지 값의 크기를 비교해 보자.",
    drills: [moneyProblem([1800],[200,100,300],2000,["간식"]), moneyProblem([3200],[1800,1700,1900],5000,["책"]), moneyProblem([4500],[500,400,600],5000,["장난감"]), moneyProblem([2700],[2300,2200,2400],5000,["색연필"]), moneyProblem([6500],[3500,3400,3600],10000,["가방"]), moneyProblem([7800],[2200,2100,2300],10000,["운동화"] )],
    teachPrompt: "5,000원이 있고 3,200원짜리를 사면 돈이 하나도 안 남지?", learnedLine: "남는 돈은 낸 돈에서 물건값을 빼!",
    sentenceWords: ["남는", "돈은", "낸", "돈에서", "물건값을", "빼", "더해"], targetSentence: ["남는", "돈은", "낸", "돈에서", "물건값을", "빼"],
    fillBefore: "남는 돈은 낸 돈에서 물건값을", fillAfter: "", fillCorrect: "빼", fillOptions: ["빼", "더해", "두 번 세어"],
    oneWordPrompt: "남는 돈은 어떤 계산?", oneWordCorrect: "빼기", oneWordOptions: ["빼기", "더하기", "곱하기"], hint: "낸 돈에서 물건값만큼 덜어 낸다고 생각해 봐.",
    dictionaryLines: ["가진 돈이 물건값보다 크거나 같아야 살 수 있어.", "거스름돈은 낸 돈에서 물건값을 빼."], dictionaryProblem: moneyProblem([3500],[1500,1400,1600],5000,["책"]),
    pointPrompt: "5,000원에서 3,200원을 뺀 돈을 가리켜 줘", pointOptions: ["1,800원", "2,200원", "8,200원"], pointCorrect: "1,800원",
    homework: [moneyProblem([4600],[400,300,500],5000,["커피 세트"]), moneyProblem([7300],[2700,2600,2800],10000,["카페 선물세트"] )], misconception: "거스름돈에서 물건값과 낸 돈의 순서를 바꿈",
  },
  {
    id: "money-mission", subject: "money", unit: "돈 계산", title: "마트 심부름", level: 4,
    memoryTitle: "더하고 빼면\n장보기도 척척!", memoryDialogue: "돈을 세고, 물건값을 더하고, 남은 돈까지 찾아냈어!",
    drillIntro: "오늘은 진짜 마트 심부름처럼 계산해 보자.",
    drills: [moneyProblem([1200,800],[2000,1900,2100],undefined,["우유","빵"]), moneyProblem([1500,700],[2800,2700,2900],5000,["과일","물"]), moneyProblem([2400,1600],[4000,3900,4100],undefined,["공책","풀"]), moneyProblem([3200,1800],[5000,4900,5100],undefined,["책","연필"]), moneyProblem([2700,1300],[1000,900,1100],5000,["간식","주스"]), moneyProblem([4500,2500],[3000,2900,3100],10000,["선물","카드"] )],
    teachPrompt: "두 물건을 사고 남는 돈은 가격을 각각 따로 빼면 되지?", learnedLine: "물건값을 먼저 더하고 낸 돈에서 한 번 빼!",
    sentenceWords: ["물건값을", "먼저", "더하고", "낸", "돈에서", "빼", "두 번"], targetSentence: ["물건값을", "먼저", "더하고", "낸", "돈에서", "빼"],
    fillBefore: "물건값을 먼저", fillAfter: "낸 돈에서 빼", fillCorrect: "더하고", fillOptions: ["더하고", "가리고", "두 번 빼고"],
    oneWordPrompt: "물건값은 먼저 어떤 계산?", oneWordCorrect: "더하기", oneWordOptions: ["더하기", "빼기", "세지 않기"], hint: "1단계: 물건값 모두 더하기. 2단계: 낸 돈에서 빼기.",
    dictionaryLines: ["여러 물건값을 먼저 모두 더해.", "그 합계를 낸 돈에서 한 번 빼면 남는 돈이야."], dictionaryProblem: moneyProblem([1200,800],[3000,2900,3100],5000,["우유","빵"]),
    pointPrompt: "1,200원과 800원을 사고 5,000원을 내면?", pointOptions: ["2,000원", "3,000원", "7,000원"], pointCorrect: "3,000원",
    homework: [moneyProblem([1800,1200],[2000,1900,2100],5000,["주스","빵"]), moneyProblem([3500,1500],[5000,4900,5100],10000,["커피","빵"] )], misconception: "여러 물건값을 합치지 않고 하나의 가격만 뺌",
  },
  {
    id: "clock-basic", subject: "clock", unit: "시계", title: "정각과 30분", level: 1,
    memoryTitle: "짧은 바늘은 시\n긴 바늘은 분!", memoryDialogue: "돈 계산을 가르쳐 줘서 고마워! 이번엔 약속 시간도 알려 줘.",
    drillIntro: "정각과 30분 시계를 번갈아 읽어 보자.",
    drills: [clockProblem(3,0,["3시","12시 3분","3시 30분"]), clockProblem(7,30,["7시 30분","7시 6분","6시 7분"]), clockProblem(9,0,["9시","9시 30분","12시 9분"]), clockProblem(2,30,["2시 30분","2시 6분","6시 2분"]), clockProblem(5,0,["5시","5시 12분","12시 5분"]), clockProblem(10,30,["10시 30분","10시 6분","6시 10분"])],
    teachPrompt: "긴 바늘이 6이면 6분이지?", learnedLine: "긴 바늘이 12면 정각, 6이면 30분이야!",
    sentenceWords: ["긴", "바늘이", "6이면", "30분", "이야", "6분"], targetSentence: ["긴", "바늘이", "6이면", "30분", "이야"],
    fillBefore: "긴 바늘이 6이면", fillAfter: "", fillCorrect: "30분", fillOptions: ["30분", "6분", "정각"],
    oneWordPrompt: "긴 바늘이 6이면?", oneWordCorrect: "30분", oneWordOptions: ["30분", "6분", "정각"], hint: "긴 바늘은 숫자 한 칸마다 5분씩 가.",
    dictionaryLines: ["짧은 바늘은 몇 시인지 알려 줘.", "긴 바늘이 12면 정각, 6이면 30분이야."], dictionaryProblem: clockProblem(7,30,["7시 30분","7시 6분","6시 7분"]),
    pointPrompt: "긴 바늘이 30분일 때 어디를 가리킬까?", pointOptions: ["12", "3", "6"], pointCorrect: "6", pointClockMarker: 6,
    homework: [clockProblem(4,30,["4시 30분","4시 6분","6시 20분"]), clockProblem(8,0,["8시","8시 12분","12시 8분"])], misconception: "긴 바늘 숫자를 그대로 분으로 읽음",
  },
  {
    id: "clock-quarter", subject: "clock", unit: "시계", title: "15분과 45분", level: 2,
    memoryTitle: "5분씩 세면\n분을 읽을 수 있어!", memoryDialogue: "정각과 30분 약속 시간은 이제 나도 놓치지 않아!",
    drillIntro: "긴 바늘이 3과 9에 있을 때를 읽어 보자.",
    drills: [clockProblem(1,15,["1시 15분","1시 3분","3시 5분"]), clockProblem(6,45,["6시 45분","6시 9분","9시 30분"]), clockProblem(9,15,["9시 15분","9시 3분","3시 45분"]), clockProblem(4,45,["4시 45분","4시 9분","9시 20분"]), clockProblem(8,15,["8시 15분","8시 3분","3시 40분"]), clockProblem(11,45,["11시 45분","11시 9분","9시 55분"])],
    teachPrompt: "긴 바늘이 3이면 3분이지?", learnedLine: "긴 바늘이 3이면 15분, 9면 45분이야!",
    sentenceWords: ["긴", "바늘이", "3이면", "15분", "이야", "3분"], targetSentence: ["긴", "바늘이", "3이면", "15분", "이야"],
    fillBefore: "긴 바늘이 3이면", fillAfter: "", fillCorrect: "15분", fillOptions: ["15분", "3분", "30분"],
    oneWordPrompt: "긴 바늘이 3이면?", oneWordCorrect: "15분", oneWordOptions: ["15분", "3분", "45분"], hint: "5, 10, 15처럼 숫자 칸마다 5분씩 세어 봐.",
    dictionaryLines: ["긴 바늘은 한 칸마다 5분씩 가.", "3은 15분, 9는 45분이야."], dictionaryProblem: clockProblem(2,15,["2시 15분","2시 3분","3시 10분"]),
    pointPrompt: "긴 바늘이 15분일 때 어디를 가리킬까?", pointOptions: ["12", "3", "6"], pointCorrect: "3", pointClockMarker: 3,
    homework: [clockProblem(5,15,["5시 15분","5시 3분","3시 25분"]), clockProblem(7,45,["7시 45분","7시 9분","9시 35분"])], misconception: "긴 바늘 숫자 3과 9를 그대로 분으로 읽음",
  },
];

export const masteryTarget = 10;
export const transferTarget = 3;
