import type { AutocompleteProvider } from "./autocomplete.ts";
import type { Component } from "./tui.ts";

/** Interface for pluggable editor components (e.g. vim mode, emacs mode). */
export interface EditorComponent extends Component {
  /** Get the current text content */
  getText(): string;

  /** Set the text content */
  setText(text: string): void;

  /** Handle raw terminal input (key presses, paste sequences, etc.) */
  handleInput(data: string): void;

  /** Called when user submits (e.g., Enter key) */
  onSubmit?: (text: string) => void;

  /** Called when text changes */
  onChange?: (text: string) => void;

  /** Add text to history for up/down navigation */
  addToHistory?(text: string): void;

  /** Insert text at current cursor position */
  insertTextAtCursor?(text: string): void;

  /** Get text with markers expanded (e.g. paste markers); falls back to getText(). */
  getExpandedText?(): string;

  /** Set the autocomplete provider */
  setAutocompleteProvider?(provider: AutocompleteProvider): void;

  /** Border color function */
  borderColor?: (str: string) => string;

  /** Set horizontal padding */
  setPaddingX?(padding: number): void;

  /** Set max visible items in autocomplete dropdown */
  setAutocompleteMaxVisible?(maxVisible: number): void;
}
