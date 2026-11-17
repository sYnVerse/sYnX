import { isRouteErrorResponse } from "react-router";

export type RouteErrorPreset = "list" | "index" | "auth" | "mobileCallback" | "root";

export interface DescribedRouteError {
  statusLabel: string;
  title: string;
  message: string;
}

const PRESET_COPY: Record<
  RouteErrorPreset,
  {
    title: string;
    message: string;
    homeHref: string;
    homeLabel: string;
  }
> = {
  list: {
    title: "Couldn't load this list",
    message:
      "We ran into a problem loading or saving this list. Try reloading, or return to your primary list.",
    homeHref: "/",
    homeLabel: "Go to my list",
  },
  index: {
    title: "Couldn't open your tasks",
    message:
      "We ran into a problem loading the workspace. Please try again in a moment.",
    homeHref: "/",
    homeLabel: "Reload home",
  },
  auth: {
    title: "Sign-in hit a snag",
    message:
      "We couldn't complete that authentication request. Please return and try signing in again.",
    homeHref: "/",
    homeLabel: "Go to home",
  },
  mobileCallback: {
    title: "Mobile sign-in handoff failed",
    message:
      "Return to the sYnX app and start sign-in again if the handoff did not complete.",
    homeHref: "/",
    homeLabel: "Open sYnX web",
  },
  root: {
    title: "Something went wrong",
    message: "An unexpected error occurred while rendering this page.",
    homeHref: "/",
    homeLabel: "Go to home",
  },
};

function extractResponseDetail(data: unknown): string | null {
  if (typeof data === "string") {
    const trimmed = data.trim();
    return trimmed || null;
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["error", "message"] as const) {
      if (typeof record[key] === "string" && record[key].trim()) {
        return record[key].trim();
      }
    }
  }
  return null;
}

export function describeRouteError(
  error: unknown,
  preset: RouteErrorPreset = "root"
): DescribedRouteError {
  const defaults = PRESET_COPY[preset];

  if (isRouteErrorResponse(error)) {
    const status = error.status;
    const detail = extractResponseDetail(error.data);
    if (status === 404) {
      return {
        statusLabel: "404 Not Found",
        title: preset === "list" ? "List not found" : "Page not found",
        message:
          detail ?? "This list or page doesn't exist or is no longer available.",
      };
    }
    if (status === 401) {
      return {
        statusLabel: "401 Unauthorized",
        title: "Sign-in required",
        message: detail ?? "Please sign in and try again.",
      };
    }
    if (status === 403) {
      return {
        statusLabel: "403 Forbidden",
        title: "Access denied",
        message:
          detail ?? "You don't have permission to access this resource.",
      };
    }
    const statusText = error.statusText?.trim();
    return {
      statusLabel: statusText ? `${status} ${statusText}` : `${status}`,
      title: defaults.title,
      message: detail ?? defaults.message,
    };
  }

  // Avoid surfacing raw internal Error messages (e.g. D1 SQL details) to users.
  return {
    statusLabel: "Error",
    title: defaults.title,
    message: defaults.message,
  };
}

export interface RouteErrorBoundaryProps {
  error: unknown;
  routeId: string;
  preset?: RouteErrorPreset;
}

export function RouteErrorBoundary({
  error,
  routeId,
  preset = "root",
}: RouteErrorBoundaryProps) {
  const copy = PRESET_COPY[preset];
  const described = describeRouteError(error, preset);

  return (
    <main
      role="main"
      data-testid="route-error-boundary"
      data-route-id={routeId}
      aria-labelledby="route-error-heading"
      className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans"
    >
      <div className="max-w-md w-full rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl space-y-4 text-left">
        <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
          {described.statusLabel}
        </div>
        <h1
          id="route-error-heading"
          className="text-xl font-bold tracking-tight text-white"
        >
          {described.title}
        </h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          {described.message}
        </p>
        <div className="pt-2 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
          >
            Try again
          </button>
          <a
            href={copy.homeHref}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 transition-colors"
          >
            {copy.homeLabel}
          </a>
        </div>
      </div>
    </main>
  );
}
