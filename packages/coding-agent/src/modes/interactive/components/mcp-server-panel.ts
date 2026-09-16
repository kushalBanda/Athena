/**
 * Live status panel for one MCP server, shown by `/mcp`. Unlike a plain
 * selector, this component is mutated in place (via `update()`) rather than
 * torn down and rebuilt — so a Reconnect/Disable/Login/etc action can show
 * its result (new status, new options) without ever handing focus back to
 * the chat editor.
 */

import { Container, getKeybindings, Spacer, Text } from "@kushalbanda/tui";
import { theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint, rawKeyHint } from "./keybinding-hints.ts";

export interface McpServerPanelState {
	/** Header line, e.g. `playwright (stdio) · connected`. */
	header: string;
	/** Action labels, e.g. ["Reconnect", "Disable", "Back"]. */
	actions: string[];
}

export class McpServerPanelComponent extends Container {
	private selectedIndex = 0;
	private headerText: Text;
	private listContainer: Container;
	private busyText: Text;
	private busyMessage: string | undefined;
	private actions: string[] = [];
	private onSelectCallback: (action: string) => void;
	private onCancelCallback: () => void;

	constructor(state: McpServerPanelState, onSelect: (action: string) => void, onCancel: () => void) {
		super();
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.headerText = new Text("", 1, 0);
		this.addChild(this.headerText);
		this.addChild(new Spacer(1));
		this.busyText = new Text("", 1, 0);
		this.addChild(this.busyText);
		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				rawKeyHint("↑↓", "navigate") + "  " + keyHint("tui.select.confirm", "select") + "  " +
					keyHint("tui.select.cancel", "back"),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		this.update(state);
	}

	/** Replaces the header and action list in place — call after an action completes to show its result. */
	update(state: McpServerPanelState): void {
		this.headerText.setText(theme.fg("accent", theme.bold(state.header)));
		this.actions = state.actions;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.actions.length - 1));
		this.setBusy(undefined);
	}

	/** Shows a transient message (e.g. "Reconnecting...") in place of the action list, and ignores input meanwhile. */
	setBusy(message: string | undefined): void {
		this.busyMessage = message;
		this.busyText.setText(message ? theme.fg("dim", message) : "");
		this.renderList();
	}

	private renderList(): void {
		this.listContainer.clear();
		if (this.busyMessage) return;
		for (let i = 0; i < this.actions.length; i++) {
			const isSelected = i === this.selectedIndex;
			const text = isSelected
				? theme.fg("accent", "→ ") + theme.fg("accent", this.actions[i])
				: `  ${theme.fg("text", this.actions[i])}`;
			this.listContainer.addChild(new Text(text, 1, 0));
		}
	}

	handleInput(keyData: string): void {
		if (this.busyMessage) {
			// Still allow bailing out of a stuck action.
			const kb = getKeybindings();
			if (kb.matches(keyData, "tui.select.cancel")) this.onCancelCallback();
			return;
		}
		const kb = getKeybindings();
		if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.renderList();
		} else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
			this.selectedIndex = Math.min(this.actions.length - 1, this.selectedIndex + 1);
			this.renderList();
		} else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
			const selected = this.actions[this.selectedIndex];
			if (selected) this.onSelectCallback(selected);
		} else if (kb.matches(keyData, "tui.select.cancel")) {
			this.onCancelCallback();
		}
	}
}
