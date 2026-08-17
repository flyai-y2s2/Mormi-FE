/**
 * 앱 코드를 빌드 없이 node --test 로 부르기 위한 해석기.
 *
 * app/ 은 번들러 기준으로 확장자 없이 import 한다("./api-client"). 순수 Node 는
 * 그걸 못 찾으므로 .ts 를 붙여 다시 시도한다. 먼저 원래대로 해석해 보고 실패할
 * 때만 손대므로, 빌드 결과물(dist/)처럼 이미 해석되는 경로는 건드리지 않는다.
 */
import { register } from "node:module";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}

// --import 로 불리면 이 파일이 자기 자신을 훅으로 등록한다.
register(import.meta.url);
