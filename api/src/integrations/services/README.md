# ساخت سرویس Contract جدید (وقتی مستندات یک Provider جدید رسید)

برای هرکدام از سرویس‌های زیر — IBAN_NATIONAL_ID_MATCH، CARD_NATIONAL_ID_MATCH،
COMPANY_INQUIRY، GOLD_PRICE، SMS، PAYMENT_GATEWAY — دقیقاً همین الگو را که برای
IDENTITY_VERIFICATION پیاده شده تکرار کن:

1. اگر Interface اش از قبل نیست، در `../interfaces/` بساز (نمونه: `sms.interface.ts`).
2. یک Adapter در `../providers/<provider-name>/` بساز که آن Interface را پیاده می‌کند
   (نمونه: `../providers/finotech/finotech-identity.provider.ts`).
3. یک Service مثل این فایل بساز:

```typescript
@Injectable()
export class SmsService {
  private readonly providerMap: Map<string, SmsProvider>;

  constructor(
    private readonly resolver: ProviderResolverService,
    someProvider: SomeSmsProvider, // Adapter واقعی که ساختی
  ) {
    this.providerMap = new Map([[someProvider.providerCode, someProvider]]);
  }

  async send(input: SendSmsInput): Promise<SendSmsResult> {
    const { result } = await this.resolver.resolveAndExecute('SMS', this.providerMap, (p) => p.send(input));
    return result;
  }
}
```

4. یک Module بساز که این Service را export می‌کند و در ماژول Business مصرف‌کننده import کن.
5. در `../sync/integration-sync.service.ts` آرایه `INITIAL_LINKS` را با یک لینک جدید
   (serviceCode ↔ providerCode) آپدیت کن تا بعد از Deploy، رابطه اولیه در دیتابیس ساخته شود.
6. Credential های Provider جدید را از پنل ادمین (`/admin/integrations`) وارد کن.

تا وقتی این مراحل برای یک سرویس انجام نشده، صدا زدن آن به‌درستی خطای
`CONFIGURATION_ERROR` می‌دهد (چون در سند اصلی هم دقیقاً همین رفتار خواسته شده بود).
