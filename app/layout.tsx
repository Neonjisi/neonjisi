import type { Metadata, Viewport } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "넌지시",
  description: "나를 아는 선물. 취향을 넌지시 남기면, 어긋나지 않는 선물이 돌아옵니다.",
  icons: {
    icon: "/brand/trans_neonjisi_logo_icon.png",
    shortcut: "/brand/trans_neonjisi_logo_icon.png",
    apple: "/brand/trans_neonjisi_logo_icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFF7F8",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}
