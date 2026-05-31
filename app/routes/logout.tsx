import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";
import { getCookieAttributes } from "~/auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return redirect("/", {
    headers: {
      "Set-Cookie": `auth_session=; ${getCookieAttributes(request.url, 0)}`,
    },
  });
};

export default function Logout() {
  return null;
}
