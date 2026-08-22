import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { THEME_INITIALIZER } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RestroPilot AI — Restaurant Operations OS", template: "%s · RestroPilot AI" },
  description: "Manage restaurant operations, inventory, purchasing, reservations, sales analytics and AI-assisted decision support from one workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INITIALIZER }} /></head>
      <body className="min-h-full flex flex-col">
        <ClerkProvider appearance={{ variables: { colorPrimary: "#047857", colorBackground: "var(--surface)", colorForeground: "var(--foreground)", colorInput: "var(--surface-muted)", colorInputForeground: "var(--foreground)", borderRadius: "0.75rem" } }}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
