import type { Route } from "./+types/$id";
import { loader as listLoader } from "~/features/list/loader.server";
import { action as listAction } from "~/features/list/action.server";
import TodoPage from "~/features/list/TodoPage";
import { RouteErrorBoundary } from "~/components/RouteErrorBoundary";

export const loader = async (args: Route.LoaderArgs) => {
  return listLoader(args);
};

export const action = async (args: Route.ActionArgs) => {
  return listAction(args);
};

export default TodoPage;

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteErrorBoundary error={error} routeId="$id" preset="list" />;
}

export {
  GUEST_STORAGE_KEY,
  type GuestList,
  parseGuestLists,
} from "~/features/list/guest-lists";
