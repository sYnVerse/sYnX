import { describe, it, expectTypeOf } from "vitest";
import type { Route as IdRoute } from "../app/routes/+types/$id";
import type { Route as IndexRoute } from "../app/routes/+types/_index";
import type { Route as TodosIdRoute } from "../app/routes/+types/api.v1.todos.$id";
import { loader as idLoader, action as idAction } from "../app/routes/$id";
import { loader as indexLoader } from "../app/routes/_index";

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

  it("enforces generated Route.ActionArgs for API routes", () => {
    expectTypeOf<TodosIdRoute.ActionArgs["params"]>().toEqualTypeOf<{ id: string }>();
  });
});
