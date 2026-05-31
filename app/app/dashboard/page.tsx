"use client";

import { STAT_CARDS, CHART_DATA, TRANSACTIONS, GOLD_HOLDINGS, GOLD_PRICES } from "@/app/utils/mock-data";
import type { StatCard, Transaction } from "@/app/utils/types";

// ─── Stat card variant styles ────────────────────────────────
const variantDot: Record<StatCard["variant"], string> = {
  gold: "var(--color-gold-500)",
  green: "#10b981",
  blue: "#3b82f6",
  red: "#ef4444",
};

// ─── Sub-components ──────────────────────────────────────────

// فایل: app/dashboard/page.tsx

function StatCardItem({ card }: { card: StatCard }) {
  return (
    <div
      className="relative overflow-hidden rounded-[20px] p-5" // گردی لبه‌ها بیشتر شد
      style={{
        backgroundColor: "var(--color-surface)",
        // حذف border و جایگزینی با سایه‌ای بسیار ملایم و شیک
        boxShadow: "0 4px 20px rgba(0,0,0,0.04)", 
      }}
    >
      {/* Background blob برای ایجاد همان افکت وال گلد */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -left-8 h-24 w-24 rounded-full opacity-[0.06]"
        style={{ background: variantDot[card.variant] }}
      />
      
      {/* Icon */}
      <i
        className={`ti ${card.icon} pointer-events-none absolute top-5 left-5 text-[24px] opacity-[0.15]`}
        aria-hidden="true"
        style={{ color: variantDot[card.variant] }}
      />

      {/* بقیه محتوا... */}
      <p className="text-[12px] font-bold text-gray-500 mb-1">{card.label}</p>
      <h3 className="text-[20px] font-black text-gray-900">{card.value}</h3>
      <div className="mt-2 flex items-center gap-1">
        <span className={`text-[11px] font-bold ${card.changeType === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
          {card.change}
        </span>
        <span className="text-[11px] text-gray-400">{card.subLabel}</span>
      </div>
    </div>
  );
}

function TxIcon({ type }: { type: Transaction["type"] }) {
  const map = {
    buy: { bg: "#dcfce7", color: "#16a34a", icon: "ti-arrow-down" },
    sell: { bg: "#fee2e2", color: "#dc2626", icon: "ti-arrow-up" },
    transfer: { bg: "#dbeafe", color: "#2563eb", icon: "ti-transfer" },
  };
  const s = map[type];
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px]"
      style={{ background: s.bg, color: s.color }}
    >
      <i className={`ti ${s.icon}`} aria-hidden="true" />
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────
export default function DashboardPage() {
  const maxBar = Math.max(...CHART_DATA.map((d) => d.value));

  return (
    <div className="space-y-5">

      {/* ── Stats grid (desktop 4-col / mobile 2-col) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {STAT_CARDS.map((card) => (
          <StatCardItem key={card.label} card={card} />
        ))}
      </div>

      {/* ── Chart + Wallet row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">

        {/* Weekly chart */}
        <div
          className="rounded-[14px] p-5"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-[15px] font-bold"
              style={{ color: "var(--color-text-primary)" }}
            >
              نمودار ارزش دارایی (هفتگی)
            </h3>
            <button
              className="text-[12px] font-semibold transition-opacity hover:opacity-70"
              style={{ color: "var(--color-emerald)" }}
            >
              گزارش کامل ←
            </button>
          </div>

          {/* Bars */}
          <div className="flex items-end gap-1.5 h-30">
            {CHART_DATA.map((d, i) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-md transition-all duration-300 cursor-pointer min-h-1"
                  style={{
                    height: `${(d.value / maxBar) * 100}%`,
                    background:
                      i === 5
                        ? "var(--color-gold-500)"
                        : "var(--color-emerald-light)",
                  }}
                  title={`${d.value}م تومان`}
                />
                <span
                  className="text-[10px] font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {d.day}
                </span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-4">
            {[
              { color: "var(--color-gold-500)", label: "این هفته" },
              { color: "var(--color-emerald-light)", label: "هفته قبل" },
            ].map((l) => (
              <div key={l.label} className="flex items-center gap-1.5 text-[11px]"
                style={{ color: "var(--color-text-secondary)" }}>
                <span
                  className="inline-block h-2.5 w-2.5 rounded-[3px]"
                  style={{ background: l.color }}
                />
                {l.label}
              </div>
            ))}
          </div>
        </div>

        {/* Wallet */}
        <div
          className="rounded-[14px] p-5 flex flex-col gap-3"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <h3
            className="text-[15px] font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            کیف پول
          </h3>

          {/* Wallet card */}
          <div
            className="relative overflow-hidden rounded-xl p-4.5 text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-emerald) 0%, #0d6b52 100%)",
            }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-3 left-2 text-[80px] font-black opacity-[.06]"
            >
              ﷼
            </div>
            <p className="mb-1 text-[11px] text-white/60">موجودی نقدی</p>
            <p className="text-[26px] font-black">۱۲,۳۵۰,۰۰۰ ت</p>
            <p
              className="mt-1 text-[13px]"
              style={{ color: "var(--color-gold-500)" }}
            >
              معادل ۲.۸۸ گرم طلا
            </p>
            <div className="mt-3 flex gap-2">
              {["واریز", "برداشت"].map((label, i) => (
                <button
                  key={label}
                  className="flex-1 rounded-lg py-2.25 text-[12px] font-bold transition-opacity hover:opacity-90 active:scale-[.98]"
                  style={
                    i === 0
                      ? {
                          background: "var(--color-gold-500)",
                          color: "var(--color-emerald)",
                          border: "none",
                        }
                      : {
                          background: "rgba(255,255,255,.15)",
                          color: "#fff",
                          border: "none",
                        }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Gold breakdown */}
          <div className="flex flex-col gap-2">
            {GOLD_HOLDINGS.map((h) => (
              <div
                key={h.label}
                className="flex items-center justify-between rounded-[10px] px-3 py-2.5"
                style={{ background: "var(--color-bg-page)" }}
              >
                <div
                  className="flex items-center gap-2 text-[12px]"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  <span className="text-[16px]">{h.emoji}</span>
                  {h.label}
                </div>
                <span
                  className="text-[13px] font-bold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {h.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Live gold prices (mobile only, desktop shows in sidebar) ── */}
      <div
        className="lg:hidden rounded-[14px] p-4"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3
            className="text-[14px] font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            قیمت لحظه‌ای
          </h3>
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.75 text-[10px] font-bold text-green-700">
            <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
            زنده
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GOLD_PRICES.map((g) => (
            <div
              key={g.type}
              className="rounded-lg p-2 text-center"
              style={{ background: "var(--color-bg-page)" }}
            >
              <p
                className="text-[10px] mb-1"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {g.type}
              </p>
              <p
                className="text-[14px] font-black"
                style={{ color: "var(--color-text-primary)" }}
              >
                {(g.price / 1_000_000).toFixed(2)}م
              </p>
              <p className="mt-0.5 text-[10px] text-green-600">
                +{g.change}٪
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent transactions ── */}
      <div
        className="rounded-[14px] p-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className="text-[15px] font-bold"
            style={{ color: "var(--color-text-primary)" }}
          >
            آخرین تراکنش‌ها
          </h3>
          <button
            className="text-[12px] font-semibold transition-opacity hover:opacity-70"
            style={{ color: "var(--color-emerald)" }}
          >
            همه تراکنش‌ها ←
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {TRANSACTIONS.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors"
              style={{ background: "var(--color-bg-page)" }}
            >
              <TxIcon type={tx.type} />
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-bold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {tx.title}
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {tx.date} · {tx.time}
                </p>
              </div>
              <div className="text-left">
                <p
                  className="text-[14px] font-bold"
                  style={{
                    color:
                      tx.amountType === "plus" ? "#16a34a" : "var(--color-red)",
                  }}
                >
                  {tx.amount}
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {tx.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
