import { Banknote, CreditCard, Smartphone } from "lucide-react";

export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash", icon: Banknote },
  { id: "mobile_money", label: "Mobile Money", icon: Smartphone },
  { id: "card", label: "Card", icon: CreditCard },
];

export function getPaymentMethod(id) {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? PAYMENT_METHODS[0];
}
