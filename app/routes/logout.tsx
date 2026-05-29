import { LoaderFunctionArgs, redirect } from "@remix-run/cloudflare";

export const loader = async () => {
  return redirect("/", {
    headers: {
      "Set-Cookie": "auth_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    },
  });
};

export default function Logout() {
  return null;
}
