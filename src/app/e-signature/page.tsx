import { PRODUCTS } from "@/lib/products/data";
import ProductPage, { productMetadata } from "./ProductPage";

/** /e-signature — FD Sign, described for search engines and new users (the app itself is /fd-sign). */
export const metadata = productMetadata(PRODUCTS.sign);

export default function ESignaturePage() {
  return <ProductPage p={PRODUCTS.sign} />;
}
