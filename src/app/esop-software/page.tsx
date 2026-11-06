import { PRODUCTS } from "@/lib/products/data";
import ProductPage, { productMetadata } from "../e-signature/ProductPage";

/** /esop-software — the ESOP dashboard, described for search engines and new users (the app itself is /esop). */
export const metadata = productMetadata(PRODUCTS.esop);

export default function EsopSoftwarePage() {
  return <ProductPage p={PRODUCTS.esop} />;
}
