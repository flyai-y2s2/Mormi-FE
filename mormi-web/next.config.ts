import type { NextConfig } from "next";

// `/api/be/*`는 app/api/be/[...path]/route.ts가 서버에서 배포된 Spring BE로
// 전달한다. BACKEND_ORIGIN은 브라우저 번들에 포함되지 않는다.
const nextConfig: NextConfig = {};

export default nextConfig;
