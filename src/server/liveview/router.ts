import { LiveViewRouter } from "liveviewjs";
import { branchesLiveView } from "./bank";

// configure LiveView routes for Bank-management-app
export const liveRouter: LiveViewRouter = {
  "/": branchesLiveView,
};
