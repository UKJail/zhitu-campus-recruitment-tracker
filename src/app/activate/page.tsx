import { ActivateAccount } from "@/components/activate-account";

export default async function ActivatePage({ searchParams }: PageProps<"/activate">) {
  const params = await searchParams;
  return <ActivateAccount token={typeof params.token === "string" ? params.token : ""} />;
}
