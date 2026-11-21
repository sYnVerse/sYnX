import type { Route } from "./+types/api.v1.completions.export";
import { getCloudflareContext } from "~/context.server";
import { getRequestApiAuth } from "~/auth-context.server";
import { getUserCompletionsForExport } from "../to-do-manager";
import { formatCompletionsCsv } from "../../shared";

/**
 * GET /api/v1/completions/export
 * Downloads the authenticated caller's own non-voided completion history as RFC-4180 CSV.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getCloudflareContext(context).env;
  const db = env.DB as D1Database;
  const user = await getRequestApiAuth(request, context);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getUserCompletionsForExport(db, user.userId);
  const csv = formatCompletionsCsv(rows);
  const safeId = user.userId.replace(/[^a-zA-Z0-9_-]/g, "_");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="synx_completions_${safeId}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
