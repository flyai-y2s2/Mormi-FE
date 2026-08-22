export type DialogueStartMode = "restart" | "resume";
export type RememberedDialogueScreen = "home-teach" | "cafe-queue" | "cafe-menu" | "cafe-calculate" | "cafe-change";

const DIALOGUE_SCREEN_KEY = "mormi-active-dialogue-screen";
const DIALOGUE_ID_KEY = "mormi-active-dialogue-id";
const rememberedScreens = new Set<RememberedDialogueScreen>([
  "home-teach",
  "cafe-queue",
  "cafe-menu",
  "cafe-calculate",
  "cafe-change",
]);
type DialogueScreenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function navigationWasReloaded(entries?: readonly Pick<PerformanceNavigationTiming, "type">[]) {
  if (!entries && typeof performance === "undefined") return false;
  const navigation = entries?.[0]
    ?? performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type === "reload";
}

/** 새로고침 직전에 실제로 열려 있던 대화 화면만 재시작 대상으로 복구한다. */
export function readReloadDialogueScreen(
  storage: DialogueScreenStorage | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage,
  navigationEntries?: readonly Pick<PerformanceNavigationTiming, "type">[],
): RememberedDialogueScreen | null {
  if (!storage || !navigationWasReloaded(navigationEntries)) return null;
  try {
    const screen = storage.getItem(DIALOGUE_SCREEN_KEY) as RememberedDialogueScreen | null;
    return screen && rememberedScreens.has(screen) ? screen : null;
  } catch {
    return null;
  }
}

export function readReloadDialogueId(
  storage: DialogueScreenStorage | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage,
  navigationEntries?: readonly Pick<PerformanceNavigationTiming, "type">[],
) {
  if (!storage || !navigationWasReloaded(navigationEntries)) return null;
  try {
    return storage.getItem(DIALOGUE_ID_KEY);
  } catch {
    return null;
  }
}

/** 앱 내부 이동은 resume, 실제 새로고침만 restart가 되도록 현재 화면을 탭 단위로 기억한다. */
export function rememberDialogueScreen(
  screen: RememberedDialogueScreen | null,
  storage: DialogueScreenStorage | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  if (!storage) return;
  try {
    if (screen) storage.setItem(DIALOGUE_SCREEN_KEY, screen);
    else {
      storage.removeItem(DIALOGUE_SCREEN_KEY);
      storage.removeItem(DIALOGUE_ID_KEY);
    }
  } catch {
    // 사생활 보호 모드에서 sessionStorage가 막혀도 학습 자체는 계속한다.
  }
}

export function rememberDialogueId(
  conversationId: string,
  storage: DialogueScreenStorage | undefined = typeof sessionStorage === "undefined" ? undefined : sessionStorage,
) {
  if (!storage) return;
  try {
    storage.setItem(DIALOGUE_ID_KEY, conversationId);
  } catch {
    // 화면 기억은 부가 기능이므로 저장소가 막혀도 대화를 중단하지 않는다.
  }
}

/** 한 시작 요청과 모든 네트워크 재시도가 같은 멱등키를 공유한다. */
export function createDialogueStartIntent(
  startMode: DialogueStartMode,
  requestId = crypto.randomUUID(),
) {
  return { start_mode: startMode, request_id: requestId } as const;
}

export function cafeStageFromRememberedScreen(screen: RememberedDialogueScreen | null) {
  if (!screen?.startsWith("cafe-")) return null;
  return screen.slice("cafe-".length) as "queue" | "menu" | "calculate" | "change";
}
