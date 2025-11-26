// ============================================
// Book Translator - Main Plugin Code
// ============================================

import { 
  UIMessage, 
  PluginMessage, 
  PluginSettings,
  LanguageCode,
  TextNodeInfo,
  StyleAdaptation,
  NodeAdaptation
} from './types';

import { 
  extractTextNodes, 
  groupByStyles, 
  calculateStyleAdaptations,
  applyStyleAdaptations,
  toStylePreviews,
  createGlobalChanges
} from './styles';

import { translateInChunks } from './translator';

import { 
  analyzeAllNodes,
  applyWidthChanges,
  applyGapReduction
} from './adapter';

// Plugin state
let currentFrames: readonly SceneNode[] = [];
let currentTextNodes: TextNodeInfo[] = [];
let currentTranslations: Map<string, string> = new Map();
let currentAdaptations: NodeAdaptation[] = [];
let currentStyleAdaptations: StyleAdaptation[] = [];
let isCancelled = false;

// Constants
const STORAGE_KEY = 'book-translator-settings';

// Initialize plugin
figma.showUI(__html__, { 
  width: 360, 
  height: 560,
  themeColors: true
});

// Send initial selection info
updateSelectionInfo();

// Listen for selection changes
figma.on('selectionchange', updateSelectionInfo);

// Handle messages from UI
figma.ui.onmessage = async (msg: UIMessage) => {
  switch (msg.type) {
    case 'getSettings':
      await loadSettings();
      break;
      
    case 'saveSettings':
      await saveSettings(msg.settings);
      break;
      
    case 'translate':
      isCancelled = false;
      await handleTranslation(
        msg.targetLanguage,
        msg.apiKey,
        msg.analyzeOnly
      );
      break;
      
    case 'applyChanges':
      await applyAllChanges();
      break;
      
    case 'cancel':
      isCancelled = true;
      break;
  }
};

/**
 * Update UI with current selection info
 */
function updateSelectionInfo(): void {
  const selection = figma.currentPage.selection;
  const frames = selection.filter(node => node.type === 'FRAME');
  
  let textNodeCount = 0;
  for (const frame of frames) {
    const texts = (frame as FrameNode).findAll(n => n.type === 'TEXT');
    textNodeCount += texts.length;
  }
  
  sendToUI({
    type: 'selectionInfo',
    frameCount: frames.length,
    textNodeCount
  });
}

/**
 * Main translation handler
 */
async function handleTranslation(
  targetLanguage: LanguageCode,
  apiKey: string,
  analyzeOnly: boolean
): Promise<void> {
  try {
    // Get selected frames
    currentFrames = figma.currentPage.selection.filter(
      node => node.type === 'FRAME'
    );
    
    if (currentFrames.length === 0) {
      sendError('No frames selected', 'Please select frames containing book pages.');
      return;
    }
    
    // Phase 1: Extract text nodes
    sendProgress('extracting', 0, 100, 'Extracting text nodes...');
    currentTextNodes = extractTextNodes(currentFrames);
    
    if (currentTextNodes.length === 0) {
      sendError('No text found', 'Selected frames contain no text layers.');
      return;
    }
    
    sendProgress('extracting', 100, 100, `Found ${currentTextNodes.length} text nodes`);
    
    if (isCancelled) return;
    
    // Phase 2: Translate texts
    sendProgress('translating', 0, currentTextNodes.length, 'Starting translation...');
    
    const textsToTranslate = currentTextNodes.map(n => n.text);
    
    const translations = await translateInChunks(
      textsToTranslate,
      targetLanguage,
      apiKey,
      15, // chunk size
      1000, // delay between chunks
      (current, total, message) => {
        if (!isCancelled) {
          sendProgress('translating', current, total, message);
        }
      }
    );
    
    if (isCancelled) return;
    
    // Store translations
    currentTranslations = new Map();
    for (let i = 0; i < currentTextNodes.length; i++) {
      currentTranslations.set(currentTextNodes[i].nodeId, translations[i]);
    }
    
    // Phase 3: Analyze and calculate adaptations
    sendProgress('analyzing', 0, 100, 'Analyzing text overflow...');
    
    currentAdaptations = analyzeAllNodes(
      currentTextNodes,
      currentTranslations,
      targetLanguage
    );
    
    // Create overflow map for style adaptation calculation
    const overflowMap = new Map<string, number>();
    for (const adaptation of currentAdaptations) {
      overflowMap.set(adaptation.nodeId, adaptation.overflow);
    }
    
    // Group by styles and calculate style-level adaptations
    const styleGroups = groupByStyles(currentTextNodes);
    currentStyleAdaptations = calculateStyleAdaptations(styleGroups, overflowMap);
    
    sendProgress('analyzing', 100, 100, 'Analysis complete');
    
    // Create global changes summary
    const globalChanges = createGlobalChanges(
      currentStyleAdaptations,
      currentFrames.length,
      currentTextNodes.length
    );
    
    // Send analysis result to UI
    const preview = toStylePreviews(currentStyleAdaptations);
    
    sendToUI({
      type: 'analysis',
      globalChanges,
      preview
    });
    
    // If not analyze-only, automatically apply changes
    if (!analyzeOnly) {
      await applyAllChanges();
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendError('Translation failed', errorMessage);
  }
}

/**
 * Apply all calculated changes
 */
async function applyAllChanges(): Promise<void> {
  try {
    sendProgress('applying', 0, 100, 'Applying translations...');
    
    // Apply translations to text nodes
    let nodesTranslated = 0;
    
    for (const frame of currentFrames) {
      if (frame.type !== 'FRAME') continue;
      
      const textNodes = (frame as FrameNode).findAll(n => n.type === 'TEXT') as TextNode[];
      
      for (const textNode of textNodes) {
        const translation = currentTranslations.get(textNode.id);
        if (translation) {
          try {
            // Load fonts before modifying text
            const fontNames = textNode.getRangeAllFontNames(0, textNode.characters.length);
            for (const fontName of fontNames) {
              await figma.loadFontAsync(fontName);
            }
            
            // Apply translation
            textNode.characters = translation;
            nodesTranslated++;
            
            // Update progress periodically
            if (nodesTranslated % 10 === 0) {
              sendProgress(
                'applying', 
                nodesTranslated, 
                currentTextNodes.length, 
                `Applied ${nodesTranslated}/${currentTextNodes.length} translations...`
              );
            }
          } catch (error) {
            console.error(`Failed to translate node ${textNode.id}:`, error);
          }
        }
      }
    }
    
    sendProgress('applying', 50, 100, 'Applying style adaptations...');
    
    // Apply style adaptations
    const stylesModified = await applyStyleAdaptations(
      currentStyleAdaptations,
      currentFrames
    );
    
    sendProgress('applying', 75, 100, 'Applying width and gap adjustments...');
    
    // Apply width changes
    await applyWidthChanges(currentFrames, currentAdaptations);
    
    // Calculate average gap reduction needed
    const avgGapReduction = currentStyleAdaptations.reduce(
      (sum, s) => sum + s.maxGapReduction, 
      0
    ) / currentStyleAdaptations.length;
    
    // Apply gap reduction if significant
    if (avgGapReduction > 0.05) {
      await applyGapReduction(currentFrames, avgGapReduction);
    }
    
    sendProgress('applying', 100, 100, 'Complete!');
    
    // Send completion message
    sendToUI({
      type: 'complete',
      framesProcessed: currentFrames.length,
      nodesTranslated,
      stylesModified
    });
    
    // Commit undo point
    figma.commitUndo();
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendError('Failed to apply changes', errorMessage);
  }
}

/**
 * Load settings from client storage
 */
async function loadSettings(): Promise<void> {
  try {
    const settings = await figma.clientStorage.getAsync(STORAGE_KEY);
    sendToUI({
      type: 'settings',
      settings: settings || {}
    });
  } catch (error) {
    console.error('Failed to load settings:', error);
    sendToUI({
      type: 'settings',
      settings: {}
    });
  }
}

/**
 * Save settings to client storage
 */
async function saveSettings(settings: PluginSettings): Promise<void> {
  try {
    await figma.clientStorage.setAsync(STORAGE_KEY, settings);
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/**
 * Send message to UI
 */
function sendToUI(message: PluginMessage): void {
  figma.ui.postMessage(message);
}

/**
 * Send progress update to UI
 */
function sendProgress(
  phase: 'extracting' | 'translating' | 'analyzing' | 'applying',
  current: number,
  total: number,
  message: string
): void {
  sendToUI({
    type: 'progress',
    phase,
    current,
    total,
    message
  });
}

/**
 * Send error to UI
 */
function sendError(message: string, details?: string): void {
  sendToUI({
    type: 'error',
    message,
    details
  });
}

