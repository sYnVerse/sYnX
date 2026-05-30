import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getCookieDomain } from "~/auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const domain = getCookieDomain(request.url);
  const domainAttr = domain ? `; Domain=${domain}` : "";
  return redirect("/", {
    headers: {
      "Set-Cookie": `auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${domainAttr}`,
    },
  });
};

export default function Logout() {
  return null;
}
