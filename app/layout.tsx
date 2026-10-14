import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import "./globals.css";

const sans = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Fube",
  description: "Feed personalizado de tus canales de YouTube.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-neutral-950">{children}</body>
    </html>
  );
}
