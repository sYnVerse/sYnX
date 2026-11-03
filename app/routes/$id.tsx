import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { loader as listLoader } from "~/features/list/loader.server";
import { action as listAction } from "~/features/list/action.server";
import TodoPage from "~/features/list/TodoPage";

export const loader = async (args: LoaderFunctionArgs) => {
  return listLoader(args);
};

export const action = async (args: ActionFunctionArgs) => {
  return listAction(args);
};

export default TodoPage;

export {
  GUEST_STORAGE_KEY,
  type GuestList,
  parseGuestLists,
} from "~/features/list/guest-lists";
