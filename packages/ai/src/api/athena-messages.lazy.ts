import type { ProviderStreams } from "../types.ts";
import { lazyApi } from "./lazy.ts";

export const athenaMessagesApi = (): ProviderStreams => lazyApi(() => import("./athena-messages.ts"));
