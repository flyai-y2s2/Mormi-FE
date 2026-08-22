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

export type MenuSelectionValidation =
  | { valid: true; mormiMenuId: string; childMenuId: string; budget: number; total: number }
  | { valid: false; reason: "missing" | "mismatch" | "duplicate" };

export const menuItemsForAi = menu.map(({ id, name, price, image }) => ({
  id,
  name,
  price,
  image_url: image,
}));

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
