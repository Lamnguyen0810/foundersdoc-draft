import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { signAccount } from "@/lib/sign/account";
import Detail from "../../Detail";

export const metadata = { title: "Request" };
export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!(await signAccount())) redirect(`/login?next=/fd-sign/d/${id}`);
  return (
    <Suspense>
      <Detail id={id} />
    </Suspense>
  );
}
