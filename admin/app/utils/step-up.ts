// admin/app/utils/step-up.ts
// FTA_TSE_EXT.4.2 — کد برنامه‌ی احراز هویت (TOTP) پیش از عملیات حساس پنل. پنجره را AdminStepUpProvider
// (در layout داشبورد) ثبت می‌کند؛ کد در سرآیند X-Step-Up-Code همان درخواست فرستاده و در API یک‌بار
// مصرف می‌شود.
export const ADMIN_STEP_UP_HEADER = "X-Step-Up-Code";

type Requester = (action: string) => Promise<string | null>;
let requester: Requester | null = null;

export function registerAdminStepUp(fn: Requester | null) {
  requester = fn;
}

export class StepUpCancelledError extends Error {
  constructor() {
    super("عملیات بدون تأیید هویت انجام نشد");
  }
}

/** سرآیند تأیید ثانویه؛ اگر کارشناس انصراف دهد StepUpCancelledError */
export async function adminStepUpHeaders(action: string) {
  if (!requester) throw new Error("AdminStepUpProvider mounted نشده است");
  const code = await requester(action);
  if (!code) throw new StepUpCancelledError();
  return { [ADMIN_STEP_UP_HEADER]: code };
}
