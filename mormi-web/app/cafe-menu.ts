/** 카페 메뉴판. 화면과 AI 대화가 같은 목록을 봐야 하므로 한 곳에서만 정의한다. */
export const menu = [
  { id: "americano", name: "커피", price: 3000, image: "/figma/cafe/americano.png?v=2" },
  { id: "milk", name: "우유", price: 2000, image: "/figma/cafe/milk.png?v=2" },
  { id: "strawberry-juice", name: "딸기주스", price: 4000, image: "/figma/cafe/strawberry-juice.png?v=2" },
  { id: "cookie", name: "쿠키", price: 2000, image: "/figma/cafe/cookie.png?v=2" },
  { id: "strawberry-cake", name: "딸기케이크", price: 4500, image: "/figma/cafe/strawberry-cake.png?v=2" },
  { id: "sandwich", name: "샌드위치", price: 5000, image: "/figma/cafe/sandwich.png?v=2" },
  { id: "bakery-set", name: "베이커리 세트", price: 6000, image: "/life-missions/bread.webp" },
] as const;

export type CafeMenuItem = (typeof menu)[number];

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
