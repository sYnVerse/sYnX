import { describe, it, expectTypeOf } from "vitest";
import type { Route as IdRoute } from "../web/app/routes/+types/$id";
import type { Route as IndexRoute } from "../web/app/routes/+types/_index";
import type { ApiRouteArgs } from "../backend/api/types";
import { action as todosIdAction } from "../backend/api/v1/todos.$id";
import { loader as idLoader, action as idAction } from "../web/app/routes/$id";
import { loader as indexLoader } from "../web/app/routes/_index";

describe("generated route types conformance", () => {
  it("enforces generated Route.LoaderArgs and Route.ActionArgs on dynamic routes", () => {
    // $id route must require an 'id' param in LoaderArgs and ActionArgs
    expectTypeOf<IdRoute.LoaderArgs["params"]>().toEqualTypeOf<{ id: string }>();
    expectTypeOf<IdRoute.ActionArgs["params"]>().toEqualTypeOf<{ id: string }>();

    // loader and action functions must accept Route.LoaderArgs and Route.ActionArgs
    expectTypeOf(idLoader).toBeCallableWith({} as IdRoute.LoaderArgs);
    expectTypeOf(idAction).toBeCallableWith({} as IdRoute.ActionArgs);
  });

  it("enforces empty params on root index route", () => {
    expectTypeOf<keyof IndexRoute.LoaderArgs["params"]>().toBeNever();
    expectTypeOf(indexLoader).toBeCallableWith({} as IndexRoute.LoaderArgs);
  });

  it("enforces ApiRouteArgs for backend API routes", () => {
    expectTypeOf<ApiRouteArgs<{ id: string }>["params"]>().toEqualTypeOf<{ id: string }>();
    expectTypeOf(todosIdAction).toBeCallableWith({} as ApiRouteArgs<{ id: string }>);
  });
});
