"use client";
// admin/app/(dashboard)/livechat/knowledge/page.tsx — پایگاه دانش حالت هوشمند و پرسش‌های بی‌پاسخ
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { BrainCircuit, Check, FlaskConical, Loader2, Pencil, Plus, Save, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { PageHeader, Tabs } from "@/app/components/finance/ui";
import { cardStyle, fetcher, getErrorMessage, inputCls, primaryBtn, primaryBtnStyle, secondaryBtn } from "@/app/components/agents/ui";

interface KnowledgeItem {
  id: string;
  question: string;
  variants: string[];
  keywords: string[];
  answer: string;
  followUpNodeId: string | null;
  isActive: boolean;
  hits: number;
  helpful: number;
  notHelpful: number;
}
interface Unanswered {
  id: string;
  text: string;
  count: number;
  lastAskedAt: string;
}
interface Draft {
  id?: string;
  question: string;
  variantsText: string;
  keywordsText: string;
  answer: string;
  followUpNodeId: string;
  isActive: boolean;
  fromUnansweredId?: string;
}

const empty = (question = "", fromUnansweredId?: string): Draft => ({
  question,
  variantsText: "",
  keywordsText: "",
  answer: "",
  followUpNodeId: "",
  isActive: true,
  fromUnansweredId,
});

type TestResult =
  | { kind: "kb"; score: number; question: string; answer: string }
  | { kind: "node"; score: number; label: string; reply: string | null }
  | { kind: "suggest"; options: string[] }
  | { kind: "none"; normalized: string };

export default function LivechatKnowledgePage() {
  const { data: items, mutate } = useSWR<KnowledgeItem[]>("/api/admin/livechat/knowledge", fetcher);
  const { data: unanswered, mutate: mutateUnanswered } = useSWR<Unanswered[]>("/api/admin/livechat/unanswered", fetcher);
  const { data: nodes } = useSWR<{ id: string; label: string }[]>("/api/admin/livechat/bot-nodes", fetcher);
  const [tab, setTab] = useState<"items" | "unanswered">("items");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [testText, setTestText] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const split = (t: string) => t.split(/\n|،|,/).map((x) => x.trim()).filter(Boolean);
    const body = {
      question: draft.question.trim(),
      answer: draft.answer.trim(),
      variants: draft.variantsText.split("\n").map((x) => x.trim()).filter(Boolean),
      keywords: split(draft.keywordsText),
      followUpNodeId: draft.followUpNodeId || null,
      isActive: draft.isActive,
      ...(draft.fromUnansweredId && !draft.id ? { fromUnansweredId: draft.fromUnansweredId } : {}),
    };
    try {
      if (draft.id) await axios.patch(`/api/admin/livechat/knowledge/${draft.id}`, body);
      else await axios.post("/api/admin/livechat/knowledge", body);
      await Promise.all([mutate(), mutateUnanswered()]);
      setDraft(null);
    } catch (e) {
      setError(getErrorMessage(e, "ذخیره ناموفق بود"));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    try {
      const res = await axios.post<TestResult>("/api/admin/livechat/knowledge/test", { text: testText });
      setTestResult(res.data);
    } finally {
      setTesting(false);
    }
  };

  const shown = (items ?? []).filter(
    (k) => !filter || k.question.includes(filter) || k.answer.includes(filter) || k.variants.some((v) => v.includes(filter)),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon={BrainCircuit}
        title="پایگاه دانش (حالت هوشمند)"
        subtitle="وقتی بازدیدکننده به‌جای انتخاب از منو سؤالش را می‌نویسد، ربات پرسش را با این پایگاه دانش (و کلمات کلیدی منو) مقایسه می‌کند؛ پاسخ مطمئن را مستقیم می‌دهد و پاسخ‌های محتمل را پیشنهاد می‌کند. هرچه عبارت‌های مشابه بیشتری بنویسید، ربات دقیق‌تر می‌شود."
        actions={
          <button type="button" onClick={() => setDraft(empty())} className={primaryBtn} style={primaryBtnStyle}>
            <Plus className="h-4 w-4" /> پرسش و پاسخ جدید
          </button>
        }
      />

      <div className="rounded-2xl p-4" style={cardStyle}>
        <p className="mb-2 flex items-center gap-1 text-[12.5px] font-black text-gray-700">
          <FlaskConical className="h-4 w-4" /> آزمایش ربات
        </p>
        <div className="flex gap-2">
          <input value={testText} onChange={(e) => setTestText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && test()} placeholder="یک پرسش مثل بازدیدکننده بنویسید…" className={inputCls + " mt-0!"} />
          <button type="button" onClick={test} disabled={testing} className={secondaryBtn}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "بررسی"}
          </button>
        </div>
        {testResult && (
          <div className="mt-3 rounded-xl bg-gray-50 p-3 text-[12.5px] leading-6">
            {testResult.kind === "kb" && (
              <>
                <p className="font-bold text-emerald-700">✓ پاسخ مستقیم از پایگاه دانش (اطمینان {testResult.score.toLocaleString("fa-IR")}٪)</p>
                <p className="text-gray-500">«{testResult.question}»</p>
                <p className="mt-1 whitespace-pre-wrap text-gray-800">{testResult.answer}</p>
              </>
            )}
            {testResult.kind === "node" && (
              <>
                <p className="font-bold text-indigo-700">✓ اجرای گزینه‌ی منو «{testResult.label}» (اطمینان {testResult.score.toLocaleString("fa-IR")}٪)</p>
                {testResult.reply && <p className="mt-1 whitespace-pre-wrap text-gray-800">{testResult.reply}</p>}
              </>
            )}
            {testResult.kind === "suggest" && (
              <>
                <p className="font-bold text-amber-700">پاسخ مطمئنی نبود؛ این موارد پیشنهاد می‌شوند:</p>
                <ul className="list-disc pr-5">
                  {testResult.options.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </>
            )}
            {testResult.kind === "none" && (
              <p className="font-bold text-red-600">
                پاسخی پیدا نشد (متن یکسان‌شده: «{testResult.normalized}»).{" "}
                <button type="button" className="underline" onClick={() => setDraft(empty(testText))}>
                  افزودن به پایگاه دانش
                </button>
              </p>
            )}
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { key: "items", label: `پرسش و پاسخ‌ها (${(items?.length ?? 0).toLocaleString("fa-IR")})` },
          { key: "unanswered", label: `پرسش‌های بی‌پاسخ (${(unanswered?.length ?? 0).toLocaleString("fa-IR")})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-2">
          {tab === "items" ? (
            <>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="جستجو در پرسش‌ها و پاسخ‌ها" className={inputCls + " mt-0!"} />
              {!items ? (
                <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-gray-400" />
              ) : (
                shown.map((k) => (
                  <div key={k.id} className={`rounded-2xl p-3 ${k.isActive ? "" : "opacity-50"}`} style={cardStyle}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-black text-gray-800">{k.question}</p>
                        {k.variants.length > 0 && <p className="mt-0.5 truncate text-[11px] text-gray-400">هم‌معنا: {k.variants.join(" · ")}</p>}
                        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[12px] leading-6 text-gray-600">{k.answer}</p>
                        <p className="mt-1 flex items-center gap-3 text-[10.5px] text-gray-400">
                          <span>{k.hits.toLocaleString("fa-IR")} بار پاسخ داده شد</span>
                          <span className="flex items-center gap-0.5">
                            <ThumbsUp className="h-3 w-3" /> {k.helpful.toLocaleString("fa-IR")}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <ThumbsDown className="h-3 w-3" /> {k.notHelpful.toLocaleString("fa-IR")}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            id: k.id,
                            question: k.question,
                            variantsText: k.variants.join("\n"),
                            keywordsText: k.keywords.join("، "),
                            answer: k.answer,
                            followUpNodeId: k.followUpNodeId ?? "",
                            isActive: k.isActive,
                          })
                        }
                        className="rounded p-1.5 hover:bg-gray-100"
                        aria-label="ویرایش"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm("این پرسش و پاسخ حذف شود؟")) return;
                          await axios.delete(`/api/admin/livechat/knowledge/${k.id}`);
                          await mutate();
                        }}
                        className="rounded p-1.5 text-red-500 hover:bg-red-50"
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </>
          ) : (
            <>
              <p className="text-[11.5px] text-gray-400">پرسش‌هایی که ربات برایشان پاسخی نداشت (پرتکرارها بالاتر). با «پاسخ دادن» به پایگاه دانش اضافه می‌شوند.</p>
              {(unanswered ?? []).map((u) => (
                <div key={u.id} className="flex items-center gap-2 rounded-2xl p-3" style={cardStyle}>
                  <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">{u.count.toLocaleString("fa-IR")}×</span>
                  <p className="min-w-0 flex-1 text-[12.5px] text-gray-700">{u.text}</p>
                  <button type="button" onClick={() => setDraft(empty(u.text, u.id))} className="rounded-lg px-2 py-1 text-[11.5px] font-bold" style={{ color: "var(--color-emerald)" }}>
                    پاسخ دادن
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await axios.post(`/api/admin/livechat/unanswered/${u.id}/resolve`);
                      await mutateUnanswered();
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100"
                    title="نادیده گرفتن"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {unanswered?.length === 0 && <p className="py-10 text-center text-[12px] text-gray-400">پرسش بی‌پاسخی ثبت نشده است 🎉</p>}
            </>
          )}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          {draft ? (
            <div className="space-y-3 rounded-2xl p-4" style={cardStyle}>
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-black">{draft.id ? "ویرایش" : "پرسش و پاسخ جدید"}</h2>
                <button type="button" onClick={() => setDraft(null)} aria-label="بستن">
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <label className="block text-[12px] font-bold text-gray-600">
                پرسش
                <input value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} className={inputCls} />
              </label>
              <label className="block text-[12px] font-bold text-gray-600">
                عبارت‌های هم‌معنا (هر کدام یک خط)
                <textarea rows={4} value={draft.variantsText} onChange={(e) => setDraft({ ...draft, variantsText: e.target.value })} className={inputCls} placeholder={"قیمت طلا چنده؟\nنرخ امروز طلا"} />
              </label>
              <label className="block text-[12px] font-bold text-gray-600">
                کلمات کلیدی
                <input value={draft.keywordsText} onChange={(e) => setDraft({ ...draft, keywordsText: e.target.value })} className={inputCls} placeholder="با ویرگول جدا کنید" />
              </label>
              <label className="block text-[12px] font-bold text-gray-600">
                پاسخ
                <textarea rows={6} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} className={inputCls} />
                <span className="mt-1 block text-[10.5px] font-normal text-gray-400">متغیرها: {"{{name}}"}، {"{{gold_price}}"}، {"{{working_hours}}"}</span>
              </label>
              <label className="block text-[12px] font-bold text-gray-600">
                گزینه‌ی منوی بعد از پاسخ (اختیاری)
                <select value={draft.followUpNodeId} onChange={(e) => setDraft({ ...draft, followUpNodeId: e.target.value })} className={inputCls}>
                  <option value="">—</option>
                  {(nodes ?? []).map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> فعال
              </label>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">{error}</p>}
              <button type="button" onClick={save} disabled={saving || draft.question.trim().length < 2 || !draft.answer.trim()} className={primaryBtn + " w-full"} style={primaryBtnStyle}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} ذخیره
              </button>
            </div>
          ) : (
            <div className="rounded-2xl p-4 text-[12px] leading-6 text-gray-500" style={cardStyle}>
              نکته: ربات غلط‌های تایپی رایج، حروف عربی/فارسی، اعداد فارسی، نیم‌فاصله و پسوندهای جمع را یکسان در نظر می‌گیرد. اگر پاسخی اشتباه داده شد، پرسش را با «آزمایش ربات» بررسی و عبارت‌های هم‌معنا را دقیق‌تر کنید.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
