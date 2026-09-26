// یک‌بار هنگام بالا آمدن سرور Next.js اجرا می‌شود
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installClientIdentityForwarding } = await import("./lib/client-identity");
    installClientIdentityForwarding();
  }
}
