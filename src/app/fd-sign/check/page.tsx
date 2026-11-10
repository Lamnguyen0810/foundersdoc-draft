import { redirect } from "next/navigation";
import { signAccount } from "@/lib/sign/account";
import Check from "./Check";

export const metadata = { title: "Signing-ready check" };
export const dynamic = "force-dynamic";

export default async function CheckPage() {
  if (!(await signAccount())) redirect("/login?next=/fd-sign/check");
  return <Check />;
}
