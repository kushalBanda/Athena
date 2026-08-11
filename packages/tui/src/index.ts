export {
  type Component,
  Container,
  CURSOR_MARKER,
  compositeTuiLine,
  type Focusable,
  isFocusable,
  isViewportTUI,
  type OverlayAnchor,
  type OverlayHandle,
  type OverlayMargin,
  type OverlayOptions,
  type OverlayUnfocusOptions,
  type SizeValue,
  type TUI,
  TuiBase,
  type TuiInputListener,
  type TuiInputListenerResult,
  type TuiMode,
  type TuiStopOptions,
  VIEWPORT_TUI,
  type ViewportTUI,
} from "./tui.ts";
export { TuiAltScreen, type TuiAltScreenOptions } from "./tui-alt-screen.ts";
export { TuiMainScreen, type TuiMainScreenRenderState } from "./tui-main-screen.ts";

export {
  isAppleTerminalSession,
  type KeyboardProtocolNegotiationSequence,
  normalizeAppleTerminalInput,
  parseKeyboardProtocolNegotiationSequence,
  ProcessTerminal,
  type Terminal,
} from "./terminal.ts";
export {
  isOsc11BackgroundColorResponse,
  parseOsc11BackgroundColor,
  parseTerminalColorSchemeReport,
  type RgbColor,
  type TerminalColorScheme,
} from "./terminal-colors.ts";

export {
  allocateImageId,
  calculateImageCellSize,
  calculateImageRows,
  type CellDimensions,
  cropKittyImageLine,
  deleteAllKittyImages,
  deleteAllKittyPlacements,
  deleteKittyImage,
  detectCapabilities,
  encodeITerm2,
  encodeKitty,
  getCapabilities,
  getCellDimensions,
  getGifDimensions,
  getImageDimensions,
  getJpegDimensions,
  getKittyImageMetadata,
  getKittyImagePlacement,
  getPngDimensions,
  getWebpDimensions,
  hyperlink,
  type ImageCellSize,
  type ImageDimensions,
  imageFallback,
  type ImageProtocol,
  type ImageRenderOptions,
  isImageLine,
  type KittyImageMetadata,
  type KittyImagePlacement,
  registerKittyImageMetadata,
  renderImage,
  resetCapabilitiesCache,
  setCapabilities,
  setCellDimensions,
  type TerminalCapabilities,
} from "./terminal-image.ts";

export {
  decodeKittyPrintable,
  decodePrintableKey,
  isKeyRelease,
  isKeyRepeat,
  isKittyProtocolActive,
  Key,
  type KeyEventType,
  type KeyId,
  matchesKey,
  parseKey,
  setKittyProtocolActive,
} from "./keys.ts";
export { isNativeModifierPressed, type ModifierKey } from "./native-modifiers.ts";

export {
  type Keybinding,
  type KeybindingConflict,
  type KeybindingDefinition,
  type KeybindingDefinitions,
  type Keybindings,
  type KeybindingsConfig,
  KeybindingsManager,
  getKeybindings,
  setKeybindings,
  TUI_KEYBINDINGS,
} from "./keybindings.ts";

export { StdinBuffer, type StdinBufferEventMap, type StdinBufferOptions } from "./stdin-buffer.ts";
export {
  findWordBackward,
  findWordForward,
  type WordNavigationOptions,
} from "./word-navigation.ts";
export { UndoStack } from "./undo-stack.ts";
export { KillRing } from "./kill-ring.ts";

export {
  applyBackgroundToLine,
  cjkBreakRegex,
  extractAnsiCode,
  extractSegments,
  getGraphemeCellRange,
  getGraphemeSegmenter,
  getOsc8LinkAtColumn,
  getWordSegmenter,
  isPunctuationChar,
  isWhitespaceChar,
  normalizeTerminalOutput,
  PUNCTUATION_REGEX,
  sliceByColumn,
  sliceWithWidth,
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "./utils.ts";

export {
  getScrollbarGeometry,
  getScrollViewBox,
  getScrollViewsAt,
  type LayoutBox,
  type LayoutFrame,
  type LayoutRect,
  renderLayoutFrame,
  type ScrollbarGeometry,
} from "./layout.ts";

export {
  ScrollView,
  type ScrollViewOptions,
  type ScrollViewScrollbar,
} from "./components/scroll-view.ts";
export {
  type StackChild,
  type StackEntry,
  type StackEntryOptions,
  type StackOptions,
} from "./components/stack.ts";

// Primitive components
export { Box } from "./components/box.ts";
export { VStack } from "./components/v-stack.ts";
export { HStack } from "./components/h-stack.ts";
export { Text } from "./components/text.ts";
export { TruncatedText } from "./components/truncated-text.ts";
export { Spacer } from "./components/spacer.ts";
export {
  type DefaultTextStyle,
  Markdown,
  type MarkdownOptions,
  type MarkdownTheme,
} from "./components/markdown.ts";

// Input/editor/search components
export {
  type SelectItem,
  SelectList,
  type SelectListLayoutOptions,
  type SelectListTheme,
  type SelectListTruncatePrimaryContext,
} from "./components/select-list.ts";
export { type FuzzyMatch, fuzzyFilter, fuzzyMatch } from "./fuzzy.ts";
export { Input } from "./components/input.ts";
export {
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  CombinedAutocompleteProvider,
  type SlashCommand,
} from "./autocomplete.ts";
export {
  Editor,
  type EditorOptions,
  type EditorTheme,
  type TextChunk,
  wordWrapLine,
} from "./components/editor.ts";
export type { EditorComponent } from "./editor-component.ts";

// App-level components
export { Loader, type LoaderIndicatorOptions } from "./components/loader.ts";
export { CancellableLoader } from "./components/cancellable-loader.ts";
export {
  type SettingItem,
  SettingsList,
  type SettingsListOptions,
  type SettingsListTheme,
} from "./components/settings-list.ts";
export { Image, type ImageOptions, type ImageTheme } from "./components/image.ts";

// Athena app-level wiring
export {
  type AgentStatus,
  type AppState,
  type DiffLine,
  type Message,
  type PickerOption,
  type PickerState,
  type Role,
  type TextPromptState,
  type ToolCall,
} from "./app-types.ts";
export { type AthenaTheme, defaultTheme } from "./theme.ts";
export {
  CompactionStatusIndicator,
  RetryStatusIndicator,
  type StatusIndicatorKind,
  WorkingStatusIndicator,
} from "./components/status-indicator.ts";
export { Transcript } from "./components/transcript.ts";
export { getGitInfo, type GitInfo, Header } from "./components/header.ts";
export { StatusBar, type StatusBarState } from "./components/status-bar.ts";
export { Welcome } from "./components/welcome.ts";
export { type AgentCallbacks, TuiApp, type TuiAppOptions } from "./app.ts";
