export interface UserData {
  name: string;
  phone: string;
}

export interface GoldPrice {
  type: string;
  price: number;
  change: number;
}

export interface StatCard {
  label: string;
  value: string;
  subLabel: string;
  change: string;
  changeType: "up" | "down";
  variant: "gold" | "green" | "blue" | "red";
  icon: string;
}

export interface Transaction {
  id: string;
  type: "buy" | "sell" | "transfer";
  title: string;
  date: string;
  time: string;
  amount: string;
  amountType: "plus" | "minus";
  value: string;
}

export interface GoldHolding {
  label: string;
  emoji: string;
  amount: string;
}

export interface ChartBar {
  day: string;
  value: number;
  prevValue: number;
}

export interface NavItem {
  name: string;
  icon: string;
  path: string;
  badge?: number;
}
