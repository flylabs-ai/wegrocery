// The browser-check runner copies this fixture into the dev App Router.
// The production build never includes this route.
import { OrderForm } from "@/app/ordine/order-form";
import { saveOrder } from "@/lib/actions/order";

export default function BrowserOrderFixture() {
  return (
    <OrderForm
      cycleId="synthetic-cycle"
      cycleTitle="Synthetic cycle"
      supplierName={null}
      orderCloseAt={null}
      cycleNotes={null}
      products={[{
        productId: "synthetic-product",
        name: "Synthetic product",
        variant: null,
        format: null,
        unit: null,
        unitPrice: "2.00",
        pricePerKg: null,
        notes: null,
        category: null,
        emoji: null,
        sortOrder: 0,
      }]}
      productOrder="alpha"
      existingLines={[]}
      resumedDraft={{ lines: [{ productId: "synthetic-product", quantity: 1 }], dropped: 0 }}
      serverStateKey="synthetic-state"
      balance={20}
      saveAction={saveOrder}
    />
  );
}
