/**
 * Arguments passed to `/api/v1/*` handlers by `backend/api/router.ts`.
 */
export interface ApiRouteArgs<
  P extends Record<string, string | undefined> = Record<string, string | undefined>,
> {
  request: Request;
  params: P;
  context: unknown;
  url?: URL;
  pattern?: string;
}
