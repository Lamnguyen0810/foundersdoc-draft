import { redirect } from "next/navigation";
import { signAccount } from "@/lib/sign/account";
import Wizard from "../Wizard";

export const metadata = { title: "New signing request" };
export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  if (!(await signAccount())) redirect("/login?next=/fd-sign/new");
  return <Wizard />;
}
