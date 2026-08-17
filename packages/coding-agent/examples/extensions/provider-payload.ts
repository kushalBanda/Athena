import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_DIR_NAME, type ExtensionAPI } from "@kushalbanda/coding-agent";

export default function (athena: ExtensionAPI) {
	athena.on("before_provider_request", (event, ctx) => {
		const logFile = join(ctx.cwd, CONFIG_DIR_NAME, "provider-payload.log");
		appendFileSync(logFile, `${JSON.stringify(event.payload, null, 2)}\n\n`, "utf8");

		// Optional: replace the payload instead of only logging it.
		// return { ...event.payload, temperature: 0 };
	});

	athena.on("after_provider_response", (event, ctx) => {
		const logFile = join(ctx.cwd, CONFIG_DIR_NAME, "provider-payload.log");
		appendFileSync(logFile, `[${event.status}] ${JSON.stringify(event.headers)}\n\n`, "utf8");
	});
}
