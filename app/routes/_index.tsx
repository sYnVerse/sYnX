import { type LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { requireUser } from "~/auth.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { userId } = await requireUser(request, context.cloudflare.env);
  return redirect(`/${userId}`);
};

export default function Index() {
  return null;
}
