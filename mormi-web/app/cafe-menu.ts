/** 카페 메뉴판. 화면과 AI 대화가 같은 목록을 봐야 하므로 한 곳에서만 정의한다. */
export const menu = [
  { id: "americano", name: "커피", price: 3000, image: "/figma/cafe/americano.png?v=2" },
  { id: "milk", name: "우유", price: 2000, image: "/figma/cafe/milk.png?v=2" },
  { id: "strawberry-juice", name: "딸기주스", price: 4000, image: "/figma/cafe/strawberry-juice.png?v=2" },
  { id: "cookie", name: "쿠키", price: 2000, image: "/figma/cafe/cookie.png?v=2" },
  { id: "strawberry-cake", name: "딸기케이크", price: 4500, image: "/figma/cafe/strawberry-cake.png?v=2" },
  { id: "sandwich", name: "샌드위치", price: 5000, image: "/figma/cafe/sandwich.png?v=2" },
] as const;

export type CafeMenuItem = (typeof menu)[number];

export type CafeMenuChoice = {
  id: string;
  disabled?: boolean | null;
};

type MenuContractItem = { id: string; price: number };
type MenuContractContext = {
  menu_items: readonly MenuContractItem[];
  mormi_menu_id: string;
  budget?: number;
};
type CafeProblemStage = "queue" | "menu" | "calculate" | "change";
type CafeProblemScenarioContext = {
  queue_context?: { left_count: number; right_count: number };
  cafe_context?: MenuContractContext;
};
type CafeProblemVisual = { type: string; data: Record<string, unknown> };

export type MenuSelectionValidation =
  | { valid: true; mormiMenuId: string; childMenuId: string; budget: number; total: number }
  | { valid: false; reason: "missing" | "mismatch" | "duplicate" };

export const menuItemsForAi = menu.map(({ id, name, price, image }) => ({
  id,
  name,
  price,
  image_url: image,
}));

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function contractMenuBoard(context: MenuContractContext) {
  if (context.menu_items.length !== menu.length) return null;
  const byId = new Map<string, MenuContractItem>();
  for (const item of context.menu_items) {
    if (byId.has(item.id)) return null;
    byId.set(item.id, item);
  }
  const matches = menu.every((item) => byId.get(item.id)?.price === item.price);
  return matches ? byId : null;
}

function visualMenuMatches(value: unknown, board: Map<string, MenuContractItem>, expectedId?: string) {
  const item = objectValue(value);
  if (!item || typeof item.id !== "string" || typeof item.price !== "number") return false;
  return (!expectedId || item.id === expectedId) && board.get(item.id)?.price === item.price;
}

/** 서버 컨텍스트와 AI 시각자료가 아이에게 보여 줄 한 문제를 가리키는지 렌더링 전에 확인한다. */
export function cafeProblemContextMatches(
  stage: CafeProblemStage,
  scenarioContext: CafeProblemScenarioContext | undefined,
  visual: CafeProblemVisual,
) {
  if (stage === "queue") {
    const queue = scenarioContext?.queue_context;
    if (!queue || !((queue.left_count === 2 && queue.right_count === 1)
      || (queue.left_count === 1 && queue.right_count === 2))) return false;
    if (visual.type !== "cafe_queues") return true;
    return visual.data.left_people === queue.left_count && visual.data.right_people === queue.right_count;
  }

  const context = scenarioContext?.cafe_context;
  if (!context) return false;
  const board = contractMenuBoard(context);
  if (!board || !board.has(context.mormi_menu_id)) return false;
  if (stage === "menu" && ![7000, 8000].includes(context.budget ?? -1)) return false;

  if (visual.type === "cafe_menu") {
    const visualItems = Array.isArray(visual.data.menu_items) ? visual.data.menu_items : [];
    if (visualItems.length !== context.menu_items.length
      || !visualItems.every((item) => visualMenuMatches(item, board))) return false;
    const mormiPick = objectValue(visual.data.mormi_pick);
    if (mormiPick?.id !== context.mormi_menu_id) return false;
    const childPick = visual.data.child_pick == null ? null : objectValue(visual.data.child_pick);
    if (visual.data.child_pick != null && (!childPick || !visualMenuMatches(childPick, board))) return false;
    if (typeof context.budget === "number" && visual.data.budget !== context.budget) return false;
  }

  if (["cafe_calculation", "money_calculation", "joint_money_calculation", "vertical_equation"].includes(visual.type)) {
    const mormiMenu = objectValue(visual.data.mormi_menu);
    if (mormiMenu && !visualMenuMatches(mormiMenu, board, context.mormi_menu_id)) return false;
    const childMenu = objectValue(visual.data.child_menu);
    if (childMenu && !visualMenuMatches(childMenu, board)) return false;
    if (visual.type === "cafe_calculation" && stage === "calculate") {
      if (visual.data.operation !== "addition" || !mormiMenu || !childMenu
        || visual.data.left !== mormiMenu.price || visual.data.right !== childMenu.price) return false;
    }
    if (visual.data.operation === "subtraction") {
      if (visual.data.left !== 10000 || !mormiMenu || visual.data.right !== mormiMenu.price) return false;
    }
  }
  return true;
}

/** AI 시각자료가 넘겨준 메뉴에 그림이 비어 있으면 메뉴판에서 같은 id 를 찾아 채운다. */
export function menuImage(id: unknown, imageUrl?: unknown) {
  if (typeof imageUrl === "string" && imageUrl) return imageUrl;
  const item = menu.find((candidate) => candidate.id === id);
  return item ? item.image : "/figma/cafe/cookie.png?v=2";
}

/** 화면 이름만 다듬고 서버가 발급한 선택지 ID는 절대 바꾸지 않는다. */
export function menuDisplayName(id: unknown, name: unknown) {
  if (id === "americano" || name === "아메리카노") return "커피";
  return typeof name === "string" && name.trim() ? name : "메뉴";
}

/** 메뉴 선택 직후의 서버 문구를 화면 행동에 맞는 자연스러운 연결 문장으로 다듬는다. */
export function calculationDialogueLine(line: string | undefined) {
  if (!line) return line;
  return line.replace(/^네가 알려줘서 알겠어\.\s*나\s*/, "메뉴를 골랐구나! 이제 ");
}

/** 중앙 메뉴 카드와 서버 선택지를 ID로만 연결한다. 배열 순서는 사용하지 않는다. */
export function menuChoiceById<T extends CafeMenuChoice>(menuId: unknown, choices: readonly T[]) {
  if (typeof menuId !== "string") return undefined;
  return choices.find((choice) => choice.id === menuId && !choice.disabled);
}

export function menuPairTotal(mormiMenuId: string, childMenuId: string) {
  const mormiMenu = menu.find((item) => item.id === mormiMenuId);
  const childMenu = menu.find((item) => item.id === childMenuId);
  return mormiMenu && childMenu ? mormiMenu.price + childMenu.price : null;
}

/**
 * 아이에게 보여 준 메뉴와 서버가 판정할 scenario_context가 같은 문제인지 확인한다.
 * 하나라도 다르면 로컬 가격으로 추측하지 않고 문제를 다시 받는다.
 */
export function validateMenuSelectionContext(
  context: MenuContractContext | undefined,
  visualData: Record<string, unknown>,
  childMenuId: string,
): MenuSelectionValidation {
  if (!context || typeof context.budget !== "number") return { valid: false, reason: "missing" };
  if (context.mormi_menu_id === childMenuId) return { valid: false, reason: "duplicate" };

  const contextById = new Map(context.menu_items.map((item) => [item.id, item]));
  const mormiItem = contextById.get(context.mormi_menu_id);
  const childItem = contextById.get(childMenuId);
  if (!mormiItem || !childItem) return { valid: false, reason: "mismatch" };

  const visualPick = visualData.mormi_pick;
  const visualPickId = visualPick && typeof visualPick === "object" && !Array.isArray(visualPick)
    ? (visualPick as { id?: unknown }).id
    : undefined;
  const visualItems = Array.isArray(visualData.menu_items)
    ? visualData.menu_items.filter((item): item is MenuContractItem => Boolean(
      item && typeof item === "object" && !Array.isArray(item)
      && typeof (item as MenuContractItem).id === "string"
      && typeof (item as MenuContractItem).price === "number",
    ))
    : [];
  const visualById = new Map(visualItems.map((item) => [item.id, item]));
  const canonicalById = new Map(menu.map((item) => [item.id, item]));
  const idsToVerify = [context.mormi_menu_id, childMenuId];
  const contractMatches = idsToVerify.every((id) => {
    const contextItem = contextById.get(id);
    const visualItem = visualById.get(id);
    const canonicalItem = canonicalById.get(id as CafeMenuItem["id"]);
    return Boolean(contextItem && visualItem && canonicalItem
      && contextItem.price === visualItem.price
      && contextItem.price === canonicalItem.price);
  });
  if (visualPickId !== context.mormi_menu_id
    || visualData.budget !== context.budget
    || !contractMatches) {
    return { valid: false, reason: "mismatch" };
  }

  return {
    valid: true,
    mormiMenuId: context.mormi_menu_id,
    childMenuId,
    budget: context.budget,
    total: mormiItem.price + childItem.price,
  };
}
