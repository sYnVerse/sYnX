import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describeRouteError } from "../app/components/RouteErrorBoundary";
import * as idRoute from "../app/routes/$id";
import * as listIdRoute from "../app/routes/list.$id";
import * as indexRoute from "../app/routes/_index";
import * as loginRoute from "../app/routes/login";
import * as callbackRoute from "../app/routes/callback";
import * as mobileCallbackRoute from "../app/routes/mobile.callback";
import * as logoutRoute from "../app/routes/logout";
import * as rootRoute from "../app/root";

function makeRouteErrorResponse(
  status: number,
  statusText: string,
  data: unknown
) {
  return {
    status,
    statusText,
    data,
    internal: true,
  };
}

describe("route ErrorBoundary components (#169)", () => {
  it("describes React Router ErrorResponse statuses clearly", () => {
    expect(
      describeRouteError(
        makeRouteErrorResponse(404, "Not Found", "List does not exist"),
        "list"
      )
    ).toEqual({
      statusLabel: "404 Not Found",
      title: "List not found",
      message: "List does not exist",
    });

    expect(
      describeRouteError(
        makeRouteErrorResponse(403, "Forbidden", { error: "Private list" }),
        "list"
      )
    ).toEqual({
      statusLabel: "403 Forbidden",
      title: "Access denied",
      message: "Private list",
    });

    expect(
      describeRouteError(
        makeRouteErrorResponse(503, "Service Unavailable", ""),
        "auth"
      )
    ).toEqual({
      statusLabel: "503 Service Unavailable",
      title: "Sign-in hit a snag",
      message:
        "We couldn't complete that authentication request. Please return and try signing in again.",
    });
  });

  it("sanitizes raw Error instances so internal details do not leak to users", () => {
    const described = describeRouteError(
      new Error("D1_ERROR: SQLITE_CONSTRAINT in users table"),
      "list"
    );
    expect(described.statusLabel).toBe("Error");
    expect(described.title).toBe("Couldn't load this list");
    expect(described.message).not.toContain("D1_ERROR");
    expect(described.message).not.toContain("SQLITE");
  });

  it("exports ErrorBoundary from $id and API-adjacent UI routes plus root", () => {
    const routes = [
      { routeId: "$id", mod: idRoute, expectedTitle: "Couldn&#x27;t load this list" },
      { routeId: "list.$id", mod: listIdRoute, expectedTitle: "Couldn&#x27;t load this list" },
      { routeId: "_index", mod: indexRoute, expectedTitle: "Couldn&#x27;t open your tasks" },
      { routeId: "login", mod: loginRoute, expectedTitle: "Sign-in hit a snag" },
      { routeId: "callback", mod: callbackRoute, expectedTitle: "Sign-in hit a snag" },
      {
        routeId: "mobile.callback",
        mod: mobileCallbackRoute,
        expectedTitle: "Mobile sign-in handoff failed",
      },
      { routeId: "logout", mod: logoutRoute, expectedTitle: "Sign-in hit a snag" },
      { routeId: "root", mod: rootRoute, expectedTitle: "Something went wrong" },
    ] as const;

    for (const { routeId, mod, expectedTitle } of routes) {
      expect(typeof mod.ErrorBoundary, `${routeId} must export ErrorBoundary`).toBe("function");
      const html = renderToStaticMarkup(
        createElement(mod.ErrorBoundary as (props: Record<string, unknown>) => ReturnType<typeof createElement>, {
          params: { id: "list-1" },
          loaderData: undefined,
          actionData: undefined,
          error: new Error("Boom"),
        })
      );
      expect(html).toContain('data-testid="route-error-boundary"');
      expect(html).toContain(`data-route-id="${routeId}"`);
      expect(html).toContain(expectedTitle);
      expect(html).toContain("Try again");
      expect(html).toContain('href="/"');
    }
  });
});
