// admin/app/login/page.tsx
// یک صفحه‌ی ورود، دو پنل: admin.arkan.gold → کارشناسان، panel.arkan.gold → نمایندگان فروش
import { headers } from "next/headers";
import { portalFromHeaders } from "@/lib/portal";
import LoginShell from "./LoginShell";
import AdminLoginForm from "./AdminLoginForm";
import AgentLoginForm from "./AgentLoginForm";

export default async function LoginPage() {
  const portal = portalFromHeaders(await headers());
  return (
    <LoginShell portal={portal}>
      {portal === "agent" ? <AgentLoginForm /> : <AdminLoginForm />}
    </LoginShell>
  );
}
