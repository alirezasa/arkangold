"use client";
// نصب interceptor جابه‌جایی پارامترهای حساس جستجو به سرآیند (FDP_ACC_EXT.1.1) روی axios سراسری.
// در سطح ماژول اجرا می‌شود تا پیش از اولین درخواست هر کامپوننت (حتی effectهای فرزند) فعال باشد.
import axios from "axios";
import { installSensitiveQueryGuard } from "@/app/utils/sensitive-query";

if (typeof window !== "undefined") installSensitiveQueryGuard(axios);

export default function SensitiveQueryGuard() {
  return null;
}
