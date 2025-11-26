// ============================================
// Text Styles Module
// Handles grouping, analysis, and application of text style changes
// ============================================

import { 
  TextNodeInfo, 
  StyleAdaptation, 
  GlobalChanges,
  LineHeight,
  StylePreview
} from './types';

/**
 * Extract text node information from selected frames
 */
export function extractTextNodes(frames: readonly SceneNode[]): TextNodeInfo[] {
  const textNodes: TextNodeInfo[] = [];
  
  for (const frame of frames) {
    if (frame.type !== 'FRAME') continue;
    
    const frameNode = frame as FrameNode;
    const texts = frameNode.findAll(node => node.type === 'TEXT') as TextNode[];
    
    for (const textNode of texts) {
      // Get style information
      let styleId: string | null = null;
      let styleName: string | null = null;
      
      if (typeof textNode.textStyleId === 'string' && textNode.textStyleId !== '') {
        styleId = textNode.textStyleId;
        const style = figma.getStyleById(styleId);
        if (style) {
          styleName = style.name;
        }
      }
      
      // Get font size (handle mixed styles)
      let fontSize = 12; // default
      if (typeof textNode.fontSize === 'number') {
        fontSize = textNode.fontSize;
      } else if (textNode.fontSize !== figma.mixed) {
        fontSize = textNode.fontSize;
      }
      
      // Get line height
      let lineHeight: LineHeight = { value: 0, unit: 'AUTO' };
      if (textNode.lineHeight !== figma.mixed) {
        const lh = textNode.lineHeight as { value?: number; unit: string };
        if (lh.unit === 'AUTO') {
          lineHeight = { value: 0, unit: 'AUTO' };
        } else if (lh.unit === 'PIXELS') {
          lineHeight = { value: lh.value || 0, unit: 'PIXELS' };
        } else if (lh.unit === 'PERCENT') {
          lineHeight = { value: lh.value || 100, unit: 'PERCENT' };
        }
      }
      
      textNodes.push({
        nodeId: textNode.id,
        text: textNode.characters,
        styleId,
        styleName,
        fontSize,
        lineHeight,
        width: textNode.width,
        height: textNode.height,
        x: textNode.x,
        y: textNode.y,
        parentFrameId: frameNode.id,
        parentFrameWidth: frameNode.width,
        parentFrameHeight: frameNode.height
      });
    }
  }
  
  return textNodes;
}

/**
 * Group text nodes by their style ID
 * Nodes without a style are grouped by font-size + font-family as fallback
 */
export function groupByStyles(textNodes: TextNodeInfo[]): Map<string, TextNodeInfo[]> {
  const styleGroups = new Map<string, TextNodeInfo[]>();
  
  for (const node of textNodes) {
    // Use styleId if available, otherwise create a pseudo-key based on fontSize
    const key = node.styleId || `unstyledã${node.fontSize}`;
    
    if (!styleGroups.has(key)) {
      styleGroups.set(key, []);
    }
    styleGroups.get(key)!.push(node);
  }
  
  return styleGroups;
}

/**
 * Calculate style adaptations based on overflow analysis
 */
export function calculateStyleAdaptations(
  styleGroups: Map<string, TextNodeInfo[]>,
  overflowMap: Map<string, number> // nodeId -> overflow percentage
): StyleAdaptation[] {
  const adaptations: StyleAdaptation[] = [];
  
  for (const [styleKey, nodes] of styleGroups) {
    // Determine style name
    let styleName = 'Unnamed Style';
    let styleId = styleKey;
    
    if (styleKey.startsWith('unstyled_')) {
      const fontSize = styleKey.split('_')[1];
      styleName = `Unstyled (${fontSize}pt)`;
      styleId = '';
    } else if (nodes[0]?.styleName) {
      styleName = nodes[0].styleName;
    }
    
    // Get original values from first node
    const originalFontSize = nodes[0]?.fontSize || 12;
    const originalLineHeight = nodes[0]?.lineHeight || { value: 0, unit: 'AUTO' as const };
    
    // Calculate max overflow across all nodes with this style
    let maxOverflow = 0;
    let nodesWithOverflow = 0;
    
    for (const node of nodes) {
      const overflow = overflowMap.get(node.nodeId) || 0;
      if (overflow > 0) {
        nodesWithOverflow++;
        maxOverflow = Math.max(maxOverflow, overflow);
      }
    }
    
    // Calculate required reductions based on max overflow
    const { fontSizeReduction, lineHeightReduction, widthIncrease, gapReduction } = 
      calculateRequiredReductions(maxOverflow, originalFontSize, originalLineHeight);
    
    adaptations.push({
      styleId,
      styleName,
      originalFontSize,
      originalLineHeight,
      maxFontSizeReduction: fontSizeReduction,
      maxLineHeightReduction: lineHeightReduction,
      maxWidthIncrease: widthIncrease,
      maxGapReduction: gapReduction,
      affectedNodesCount: nodes.length,
      nodesWithOverflow
    });
  }
  
  return adaptations;
}

/**
 * Calculate required reductions based on overflow percentage
 * Following the 4-step priority:
 * 1. Width increase (handled separately per-node)
 * 2. Gap reduction
 * 3. Line height reduction
 * 4. Font size reduction (last resort)
 */
function calculateRequiredReductions(
  overflow: number,
  fontSize: number,
  lineHeight: LineHeight
): { fontSizeReduction: number; lineHeightReduction: number; widthIncrease: number; gapReduction: number } {
  
  if (overflow <= 0) {
    return { fontSizeReduction: 0, lineHeightReduction: 0, widthIncrease: 0, gapReduction: 0 };
  }
  
  let remainingOverflow = overflow;
  let widthIncrease = 0;
  let gapReduction = 0;
  let lineHeightReduction = 0;
  let fontSizeReduction = 0;
  
  // Step 1: Width increase (max 10% of container width) - compensates up to 10% overflow
  const maxWidthCompensation = 0.10;
  if (remainingOverflow > 0 && remainingOverflow <= maxWidthCompensation) {
    widthIncrease = remainingOverflow;
    remainingOverflow = 0;
  } else if (remainingOverflow > maxWidthCompensation) {
    widthIncrease = maxWidthCompensation;
    remainingOverflow -= maxWidthCompensation;
  }
  
  // Step 2: Gap reduction (max 20% reduction) - compensates up to 5% overflow
  const maxGapCompensation = 0.05;
  const maxGapReductionPercent = 0.20;
  if (remainingOverflow > 0 && remainingOverflow <= maxGapCompensation) {
    gapReduction = (remainingOverflow / maxGapCompensation) * maxGapReductionPercent;
    remainingOverflow = 0;
  } else if (remainingOverflow > maxGapCompensation) {
    gapReduction = maxGapReductionPercent;
    remainingOverflow -= maxGapCompensation;
  }
  
  // Step 3: Line height reduction (max 10% reduction) - compensates up to 8% overflow
  const maxLineHeightCompensation = 0.08;
  const maxLineHeightReductionPercent = 0.10;
  if (remainingOverflow > 0 && remainingOverflow <= maxLineHeightCompensation) {
    lineHeightReduction = (remainingOverflow / maxLineHeightCompensation) * maxLineHeightReductionPercent;
    remainingOverflow = 0;
  } else if (remainingOverflow > maxLineHeightCompensation) {
    lineHeightReduction = maxLineHeightReductionPercent;
    remainingOverflow -= maxLineHeightCompensation;
  }
  
  // Step 4: Font size reduction (last resort)
  // Each 1pt reduction compensates roughly 8-10% text expansion
  if (remainingOverflow > 0) {
    // Calculate required font size reduction
    // Approximation: 1pt reduction for every 8% overflow
    const ptPerOverflow = 1 / 0.08;
    fontSizeReduction = Math.ceil(remainingOverflow * ptPerOverflow);
    
    // Cap at reasonable maximum (25% of original font size)
    const maxFontReduction = Math.ceil(fontSize * 0.25);
    fontSizeReduction = Math.min(fontSizeReduction, maxFontReduction);
  }
  
  return { fontSizeReduction, lineHeightReduction, widthIncrease, gapReduction };
}

/**
 * Apply style adaptations to the document
 * This modifies Text Styles directly, which auto-updates all linked nodes
 */
export async function applyStyleAdaptations(
  adaptations: StyleAdaptation[],
  frames: readonly SceneNode[]
): Promise<number> {
  let stylesModified = 0;
  
  // First, handle styled text nodes (modify the style itself)
  for (const adaptation of adaptations) {
    if (!adaptation.styleId || adaptation.maxFontSizeReduction === 0) continue;
    
    try {
      const style = figma.getStyleById(adaptation.styleId) as TextStyle | null;
      if (style && style.type === 'TEXT') {
        // Clone the style to modify it
        const newFontSize = adaptation.originalFontSize - adaptation.maxFontSizeReduction;
        
        // Note: In Figma Plugin API, TextStyle doesn't have direct fontSize property
        // We need to modify all text nodes using this style
        await modifyNodesWithStyle(frames, adaptation.styleId, {
          fontSize: newFontSize,
          lineHeightReduction: adaptation.maxLineHeightReduction
        });
        
        stylesModified++;
      }
    } catch (error) {
      console.error(`Failed to modify style ${adaptation.styleName}:`, error);
    }
  }
  
  // Handle unstyled text nodes (modify directly)
  for (const adaptation of adaptations) {
    if (adaptation.styleId || adaptation.maxFontSizeReduction === 0) continue;
    
    // Extract fontSize from style key (unstyled_12)
    const originalFontSize = adaptation.originalFontSize;
    const newFontSize = originalFontSize - adaptation.maxFontSizeReduction;
    
    await modifyUnstyledNodes(frames, originalFontSize, {
      fontSize: newFontSize,
      lineHeightReduction: adaptation.maxLineHeightReduction
    });
  }
  
  return stylesModified;
}

/**
 * Modify all text nodes using a specific style
 */
async function modifyNodesWithStyle(
  frames: readonly SceneNode[],
  styleId: string,
  changes: { fontSize: number; lineHeightReduction: number }
): Promise<void> {
  for (const frame of frames) {
    if (frame.type !== 'FRAME') continue;
    
    const textNodes = (frame as FrameNode).findAll(
      node => node.type === 'TEXT' && node.textStyleId === styleId
    ) as TextNode[];
    
    for (const textNode of textNodes) {
      await modifyTextNode(textNode, changes);
    }
  }
}

/**
 * Modify unstyled text nodes with specific font size
 */
async function modifyUnstyledNodes(
  frames: readonly SceneNode[],
  originalFontSize: number,
  changes: { fontSize: number; lineHeightReduction: number }
): Promise<void> {
  for (const frame of frames) {
    if (frame.type !== 'FRAME') continue;
    
    const textNodes = (frame as FrameNode).findAll(node => {
      if (node.type !== 'TEXT') return false;
      const textNode = node as TextNode;
      // Check if unstyled and has matching font size
      const isUnstyled = !textNode.textStyleId || textNode.textStyleId === '';
      const hasMatchingSize = textNode.fontSize === originalFontSize;
      return isUnstyled && hasMatchingSize;
    }) as TextNode[];
    
    for (const textNode of textNodes) {
      await modifyTextNode(textNode, changes);
    }
  }
}

/**
 * Modify a single text node
 */
async function modifyTextNode(
  textNode: TextNode,
  changes: { fontSize: number; lineHeightReduction: number }
): Promise<void> {
  try {
    // Load fonts before modifying
    await loadFontsForNode(textNode);
    
    // Apply font size change
    if (changes.fontSize > 0) {
      textNode.fontSize = changes.fontSize;
    }
    
    // Apply line height reduction
    if (changes.lineHeightReduction > 0 && textNode.lineHeight !== figma.mixed) {
      const currentLH = textNode.lineHeight as { value?: number; unit: string };
      
      if (currentLH.unit === 'PIXELS' && currentLH.value) {
        textNode.lineHeight = {
          value: currentLH.value * (1 - changes.lineHeightReduction),
          unit: 'PIXELS'
        };
      } else if (currentLH.unit === 'PERCENT' && currentLH.value) {
        textNode.lineHeight = {
          value: currentLH.value * (1 - changes.lineHeightReduction),
          unit: 'PERCENT'
        };
      }
    }
  } catch (error) {
    console.error(`Failed to modify text node:`, error);
  }
}

/**
 * Load all fonts used in a text node
 */
async function loadFontsForNode(textNode: TextNode): Promise<void> {
  const fontNames = textNode.getRangeAllFontNames(0, textNode.characters.length);
  for (const fontName of fontNames) {
    await figma.loadFontAsync(fontName);
  }
}

/**
 * Convert StyleAdaptation to StylePreview for UI display
 */
export function toStylePreviews(adaptations: StyleAdaptation[]): StylePreview[] {
  return adaptations.map(a => ({
    styleName: a.styleName,
    originalFontSize: a.originalFontSize,
    newFontSize: a.originalFontSize - a.maxFontSizeReduction,
    fontSizeChange: -a.maxFontSizeReduction,
    lineHeightChange: -a.maxLineHeightReduction * 100, // as percentage
    affectedNodes: a.affectedNodesCount
  }));
}

/**
 * Create GlobalChanges summary
 */
export function createGlobalChanges(
  adaptations: StyleAdaptation[],
  totalFrames: number,
  totalTextNodes: number
): GlobalChanges {
  const nodesRequiringChanges = adaptations.reduce(
    (sum, a) => sum + a.nodesWithOverflow, 
    0
  );
  
  return {
    styleAdaptations: adaptations,
    totalFrames,
    totalTextNodes,
    nodesRequiringChanges
  };
}

