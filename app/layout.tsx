import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Builder",
  description: "Plug-and-play agent builder, powered by Claude.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ maxWidth: "1800px", margin: "0 auto", padding: "1.5rem 2rem" }}>
          {children}
        </div>
      </body>
    </html>
  );
}
