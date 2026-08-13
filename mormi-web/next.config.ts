import type { NextConfig } from "next";

/**
 * 브라우저는 Spring 백엔드를 직접 부르지 않고 `/api/be/*` 프록시를 거친다.
 *
 * 배포된 화면은 https 인데 EC2 백엔드는 http 라, 브라우저에서 바로 부르면
 * 혼합 콘텐츠로 차단된다. 서버에서 대신 호출하면 그 문제가 없고
 * 같은 출처가 되므로 CORS 설정도 필요 없다.
 *
 * BACKEND_ORIGIN 은 서버 전용이다. NEXT_PUBLIC_ 접두사를 붙이면
 * 백엔드 주소가 브라우저 번들에 그대로 노출된다.
 */
const backendOrigin = (process.env.BACKEND_ORIGIN || "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    // 주소가 없으면 프록시를 걸지 않는다. 빈 destination 은 빌드를 깨뜨린다.
    if (!backendOrigin) return [];
    return [
      {
        source: "/api/be/:path*",
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
