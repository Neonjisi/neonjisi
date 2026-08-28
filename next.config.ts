import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 디렉터리의 package-lock.json을 워크스페이스 루트로 오인하지 않도록 고정
  turbopack: {
    root: __dirname,
  },
  // dev 전용: 127.0.0.1 로 접속해도 HMR 등 dev 리소스가 차단되지 않게 한다.
  // (Next 16 은 호스트가 다르면 cross-origin 으로 보고 기본 차단한다)
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
