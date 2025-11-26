// ============================================
// Type Definitions for Book Translator Plugin
// ============================================

/** Supported target languages */
export const SUPPORTED_LANGUAGES = {
  de: 'German (Deutsch)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  it: 'Italian (Italiano)',
  pt: 'Portuguese (Português)',
  ru: 'Russian (Русский)',
  pl: 'Polish (Polski)',
  nl: 'Dutch (Nederlands)',
  el: 'Greek (Ελληνικά)',
  hr: 'Croatian (Hrvatski)',
  cs: 'Czech (Čeština)',
  sk: 'Slovak (Slovenčina)',
  hu: 'Hungarian (Magyar)',
  ro: 'Romanian (Română)',
  bg: 'Bulgarian (Български)',
  uk: 'Ukrainian (Українська)',
  sv: 'Swedish (Svenska)',
  da: 'Danish (Dansk)',
  fi: 'Finnish (Suomi)',
  no: 'Norwegian (Norsk)',
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

/** Text node with its metadata */
export interface TextNodeInfo {
  nodeId: string;
  text: string;
  styleId: string | null;
  styleName: string | null;
  fontSize: number;
  lineHeight: LineHeight;
  width: number;
  height: number;
  x: number;
  y: number;
  parentFrameId: string;
  parentFrameWidth: number;
  parentFrameHeight: number;
}

/** Line height representation */
export interface LineHeight {
  value: number;
  unit: 'PIXELS' | 'PERCENT' | 'AUTO';
}

/** Required changes for a single text node */
export interface RequiredChanges {
  widthIncrease?: number;
  gapReduction?: number;
  lineHeightReduction?: number;
  fontSizeReduction?: number;
}

/** Adaptation result for a text node after translation */
export interface NodeAdaptation {
  nodeId: string;
  originalText: string;
  translatedText: string;
  overflow: number; // Percentage overflow (e.g., 0.15 = 15%)
  requiredChanges: RequiredChanges;
}

/** Aggregated style adaptation (MAX values for a style) */
export interface StyleAdaptation {
  styleId: string;
  styleName: string;
  originalFontSize: number;
  originalLineHeight: LineHeight;
  maxFontSizeReduction: number;
  maxLineHeightReduction: number;
  maxWidthIncrease: number;
  maxGapReduction: number;
  affectedNodesCount: number;
  nodesWithOverflow: number;
}

/** Global changes to apply to all frames */
export interface GlobalChanges {
  styleAdaptations: StyleAdaptation[];
  totalFrames: number;
  totalTextNodes: number;
  nodesRequiringChanges: number;
}

/** Translation request from UI to plugin */
export interface TranslationRequest {
  type: 'translate';
  targetLanguage: LanguageCode;
  apiKey: string;
  analyzeOnly: boolean;
}

/** Progress update from plugin to UI */
export interface ProgressUpdate {
  type: 'progress';
  phase: 'extracting' | 'translating' | 'analyzing' | 'applying';
  current: number;
  total: number;
  message: string;
}

/** Analysis result from plugin to UI */
export interface AnalysisResult {
  type: 'analysis';
  globalChanges: GlobalChanges;
  preview: StylePreview[];
}

/** Style preview for UI display */
export interface StylePreview {
  styleName: string;
  originalFontSize: number;
  newFontSize: number;
  fontSizeChange: number;
  lineHeightChange: number;
  affectedNodes: number;
}

/** Error message from plugin to UI */
export interface ErrorMessage {
  type: 'error';
  message: string;
  details?: string;
}

/** Completion message from plugin to UI */
export interface CompletionMessage {
  type: 'complete';
  framesProcessed: number;
  nodesTranslated: number;
  stylesModified: number;
}

/** Settings saved in client storage */
export interface PluginSettings {
  apiKey?: string;
  lastLanguage?: LanguageCode;
}

/** Messages from UI to Plugin */
export type UIMessage = 
  | TranslationRequest
  | { type: 'cancel' }
  | { type: 'getSettings' }
  | { type: 'saveSettings'; settings: PluginSettings }
  | { type: 'applyChanges' };

/** Messages from Plugin to UI */
export type PluginMessage = 
  | ProgressUpdate
  | AnalysisResult
  | ErrorMessage
  | CompletionMessage
  | { type: 'settings'; settings: PluginSettings }
  | { type: 'selectionInfo'; frameCount: number; textNodeCount: number };

