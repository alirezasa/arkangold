"use client";
// فرم افزودن آدرس جدید (inline) در صفحات تحویل فیزیکی — همان فرم دفترچه‌ی آدرس
import type { AddressItem } from "@/app/hooks/usePhysicalDelivery";
import AddressForm from "@/app/dashboard/components/address/AddressForm";

export default function AddAddressForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: (address: AddressItem) => void;
  onCancel: () => void;
}) {
  return <AddressForm onSuccess={onSuccess} onCancel={onCancel} />;
}
