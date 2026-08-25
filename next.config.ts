import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 디렉터리의 package-lock.json을 워크스페이스 루트로 오인하지 않도록 고정
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
