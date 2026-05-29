import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getAuthClient } from "~/auth.server";

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const client = getAuthClient(request, context.cloudflare.env);
  const callbackUrl = new URL(request.url).origin + "/callback";
  const { url } = await client.authorize(callbackUrl, "code");
  return redirect(url);
};

export default function Login() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
      <p>Redirecting to authentication server...</p>
    </div>
  );
}
