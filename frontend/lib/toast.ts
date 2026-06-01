import { toast as sonnerToast } from "sonner";

import { extractApiError } from "./api";

export const notify = {
  success(msg: string) {
    sonnerToast.success(msg);
  },
  error(input: unknown) {
    sonnerToast.error(typeof input === "string" ? input : extractApiError(input));
  },
  warning(msg: string) {
    sonnerToast.warning(msg);
  },
  info(msg: string) {
    sonnerToast.info(msg);
  },
};
