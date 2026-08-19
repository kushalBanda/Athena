/**
 * Session naming example.
 *
 * Shows setSessionName/getSessionName to give sessions friendly names
 * that appear in the session selector instead of the first message.
 *
 * Usage: /session-name [name] - set or show session name
 */

import type { ExtensionAPI } from "@kushalbanda/athena";

export default function (athena: ExtensionAPI) {
	athena.registerCommand("session-name", {
		description: "Set or show session name (usage: /session-name [new name])",
		handler: async (args, ctx) => {
			const name = args.trim();

			if (name) {
				athena.setSessionName(name);
				ctx.ui.notify(`Session named: ${name}`, "info");
			} else {
				const current = athena.getSessionName();
				ctx.ui.notify(current ? `Session: ${current}` : "No session name set", "info");
			}
		},
	});
}
