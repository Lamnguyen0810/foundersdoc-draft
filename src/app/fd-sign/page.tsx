import { Suspense } from "react";
import { redirect } from "next/navigation";
import { signAccount } from "@/lib/sign/account";
import Home from "./Home";

export const metadata = { title: "My documents" };
export const dynamic = "force-dynamic";

export default async function FdSignPage() {
  if (!(await signAccount())) redirect("/login?next=/fd-sign");
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
