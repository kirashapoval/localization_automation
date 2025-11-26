// ============================================
// Text Adaptation Module
// 4-step algorithm for adapting text after translation
// ============================================

import { TextNodeInfo, RequiredChanges, NodeAdaptation, LanguageCode } from './types';
import { getExpansionFactor } from './translator';

/**
 * Calculate overflow for a text node after translation
 * Returns overflow as a percentage (e.g., 0.15 = 15% overflow)
 */
export function calculateOverflow(
  originalNode: TextNodeInfo,
  translatedText: string
): number {
  // Estimate new text dimensions based on character count ratio
  const originalLength = originalNode.text.length;
  const translatedLength = translatedText.length;
  
  if (originalLength === 0) return 0;
  
  // Character expansion ratio
  const charRatio = translatedLength / originalLength;
  
  // Estimate new width needed (simplified - assumes linear relationship)
  // In reality, this depends on character widths, but this is a good approximation
  const estimatedNewWidth = originalNode.width * charRatio;
  
  // Calculate overflow relative to parent container
  const availableWidth = originalNode.parentFrameWidth - originalNode.x;
  
  if (estimatedNewWidth <= availableWidth) {
    return 0;
  }
  
  // Return overflow as percentage
  return (estimatedNewWidth - availableWidth) / availableWidth;
}

/**
 * Calculate overflow based on actual text measurement
 * This is more accurate but requires modifying the node temporarily
 */
export async function measureActualOverflow(
  textNode: TextNode,
  translatedText: string,
  parentFrame: FrameNode
): Promise<number> {
  // Store original values
  const originalText = textNode.characters;
  const originalWidth = textNode.width;
  const originalHeight = textNode.height;
  
  try {
    // Load fonts
    const fontNames = textNode.getRangeAllFontNames(0, textNode.characters.length);
    for (const fontName of fontNames) {
      await figma.loadFontAsync(fontName);
    }
    
    // Temporarily set translated text to measure
    textNode.characters = translatedText;
    
    // Get actual dimensions after text change
    const newWidth = textNode.width;
    const newHeight = textNode.height;
    
    // Restore original text
    textNode.characters = originalText;
    
    // Calculate overflow
    const availableWidth = parentFrame.width - textNode.x - 20; // 20px padding
    const availableHeight = parentFrame.height - textNode.y - 20;
    
    const widthOverflow = Math.max(0, (newWidth - availableWidth) / availableWidth);
    const heightOverflow = Math.max(0, (newHeight - availableHeight) / availableHeight);
    
    // Return the larger overflow
    return Math.max(widthOverflow, heightOverflow);
    
  } catch (error) {
    console.error('Error measuring overflow:', error);
    // Restore original text on error
    try {
      const fontNames = textNode.getRangeAllFontNames(0, textNode.characters.length);
      for (const fontName of fontNames) {
        await figma.loadFontAsync(fontName);
      }
      textNode.characters = originalText;
    } catch {}
    
    // Fallback to estimation
    return calculateOverflow(
      {
        nodeId: textNode.id,
        text: originalText,
        styleId: null,
        styleName: null,
        fontSize: typeof textNode.fontSize === 'number' ? textNode.fontSize : 12,
        lineHeight: { value: 0, unit: 'AUTO' },
        width: originalWidth,
        height: originalHeight,
        x: textNode.x,
        y: textNode.y,
        parentFrameId: parentFrame.id,
        parentFrameWidth: parentFrame.width,
        parentFrameHeight: parentFrame.height
      },
      translatedText
    );
  }
}

/**
 * Calculate required adaptations using the 4-step priority algorithm
 * 
 * Priority order:
 * 1. Width increase (if fits in parent)
 * 2. Gap/margin reduction
 * 3. Line height reduction
 * 4. Font size reduction (last resort)
 */
export function calculateAdaptation(
  nodeInfo: TextNodeInfo,
  translatedText: string,
  targetLanguage: LanguageCode
): NodeAdaptation {
  // Calculate overflow
  const overflow = calculateOverflow(nodeInfo, translatedText);
  
  if (overflow <= 0) {
    return {
      nodeId: nodeInfo.nodeId,
      originalText: nodeInfo.text,
      translatedText,
      overflow: 0,
      requiredChanges: {}
    };
  }
  
  // Apply 4-step algorithm
  const changes = calculateRequiredChanges(
    overflow,
    nodeInfo,
    targetLanguage
  );
  
  return {
    nodeId: nodeInfo.nodeId,
    originalText: nodeInfo.text,
    translatedText,
    overflow,
    requiredChanges: changes
  };
}

/**
 * 4-step priority algorithm for calculating required changes
 */
function calculateRequiredChanges(
  overflow: number,
  nodeInfo: TextNodeInfo,
  targetLanguage: LanguageCode
): RequiredChanges {
  let remainingOverflow = overflow;
  const changes: RequiredChanges = {};
  
  // Step 1: Width increase
  // Check if we can expand width within parent container
  const maxWidthIncrease = calculateMaxWidthIncrease(nodeInfo);
  if (maxWidthIncrease > 0) {
    const widthCompensation = Math.min(maxWidthIncrease / nodeInfo.width, remainingOverflow);
    if (widthCompensation > 0) {
      changes.widthIncrease = widthCompensation * nodeInfo.width;
      remainingOverflow -= widthCompensation;
    }
  }
  
  if (remainingOverflow <= 0.01) {
    return changes;
  }
  
  // Step 2: Gap reduction (between adjacent text blocks)
  // Max 25% gap reduction, compensates up to 6% overflow
  const maxGapReduction = 0.25;
  const gapCompensation = 0.06;
  
  if (remainingOverflow <= gapCompensation) {
    changes.gapReduction = (remainingOverflow / gapCompensation) * maxGapReduction;
    remainingOverflow = 0;
  } else {
    changes.gapReduction = maxGapReduction;
    remainingOverflow -= gapCompensation;
  }
  
  if (remainingOverflow <= 0.01) {
    return changes;
  }
  
  // Step 3: Line height reduction
  // Max 12% line height reduction, compensates up to 10% overflow
  const maxLineHeightReduction = 0.12;
  const lineHeightCompensation = 0.10;
  
  if (remainingOverflow <= lineHeightCompensation) {
    changes.lineHeightReduction = (remainingOverflow / lineHeightCompensation) * maxLineHeightReduction;
    remainingOverflow = 0;
  } else {
    changes.lineHeightReduction = maxLineHeightReduction;
    remainingOverflow -= lineHeightCompensation;
  }
  
  if (remainingOverflow <= 0.01) {
    return changes;
  }
  
  // Step 4: Font size reduction (last resort)
  // Calculate minimum font size reduction needed
  // Rule of thumb: 1pt reduction per ~8% overflow
  const fontSize = nodeInfo.fontSize;
  const ptPerOverflow = 1 / 0.08;
  
  let fontSizeReduction = Math.ceil(remainingOverflow * ptPerOverflow);
  
  // Cap at 25% of original font size
  const maxReduction = Math.ceil(fontSize * 0.25);
  fontSizeReduction = Math.min(fontSizeReduction, maxReduction);
  
  // Minimum reduction of 0.5pt if needed
  if (fontSizeReduction > 0 && fontSizeReduction < 0.5) {
    fontSizeReduction = 0.5;
  }
  
  changes.fontSizeReduction = fontSizeReduction;
  
  return changes;
}

/**
 * Calculate maximum width increase possible within parent container
 */
function calculateMaxWidthIncrease(nodeInfo: TextNodeInfo): number {
  // Available space to the right of the text node
  const availableSpace = nodeInfo.parentFrameWidth - nodeInfo.x - nodeInfo.width;
  
  // Keep at least 20px margin from edge
  const margin = 20;
  const maxIncrease = Math.max(0, availableSpace - margin);
  
  // Cap at 20% of current width
  const cappedIncrease = Math.min(maxIncrease, nodeInfo.width * 0.20);
  
  return cappedIncrease;
}

/**
 * Estimate overflow based on language expansion factor
 * Useful for pre-analysis before actual translation
 */
export function estimateOverflow(
  nodeInfo: TextNodeInfo,
  targetLanguage: LanguageCode
): number {
  const expansionFactor = getExpansionFactor(targetLanguage);
  
  // Estimate new width
  const estimatedNewWidth = nodeInfo.width * expansionFactor;
  
  // Check against available space
  const availableWidth = nodeInfo.parentFrameWidth - nodeInfo.x - 20;
  
  if (estimatedNewWidth <= availableWidth) {
    return 0;
  }
  
  return (estimatedNewWidth - availableWidth) / availableWidth;
}

/**
 * Batch analyze all nodes and calculate adaptations
 */
export function analyzeAllNodes(
  nodeInfos: TextNodeInfo[],
  translations: Map<string, string>,
  targetLanguage: LanguageCode
): NodeAdaptation[] {
  const adaptations: NodeAdaptation[] = [];
  
  for (const nodeInfo of nodeInfos) {
    const translatedText = translations.get(nodeInfo.nodeId) || nodeInfo.text;
    const adaptation = calculateAdaptation(nodeInfo, translatedText, targetLanguage);
    adaptations.push(adaptation);
  }
  
  return adaptations;
}

/**
 * Apply width changes to text nodes
 * Note: This should be called after style changes are applied
 */
export async function applyWidthChanges(
  frames: readonly SceneNode[],
  adaptations: NodeAdaptation[]
): Promise<void> {
  // Group adaptations by nodeId for quick lookup
  const adaptationMap = new Map<string, NodeAdaptation>();
  for (const adaptation of adaptations) {
    if (adaptation.requiredChanges.widthIncrease) {
      adaptationMap.set(adaptation.nodeId, adaptation);
    }
  }
  
  // Apply width changes
  for (const frame of frames) {
    if (frame.type !== 'FRAME') continue;
    
    const textNodes = (frame as FrameNode).findAll(n => n.type === 'TEXT') as TextNode[];
    
    for (const textNode of textNodes) {
      const adaptation = adaptationMap.get(textNode.id);
      if (adaptation?.requiredChanges.widthIncrease) {
        // Resize text node width
        textNode.resize(
          textNode.width + adaptation.requiredChanges.widthIncrease,
          textNode.height
        );
      }
    }
  }
}

/**
 * Apply gap reduction between adjacent text nodes
 */
export async function applyGapReduction(
  frames: readonly SceneNode[],
  reductionPercent: number
): Promise<void> {
  if (reductionPercent <= 0) return;
  
  for (const frame of frames) {
    if (frame.type !== 'FRAME') continue;
    
    const frameNode = frame as FrameNode;
    
    // If frame uses auto-layout, reduce spacing
    if (frameNode.layoutMode !== 'NONE') {
      frameNode.itemSpacing = frameNode.itemSpacing * (1 - reductionPercent);
    } else {
      // For non-auto-layout frames, reduce vertical gaps manually
      const textNodes = frameNode.findAll(n => n.type === 'TEXT') as TextNode[];
      
      // Sort by Y position
      textNodes.sort((a, b) => a.y - b.y);
      
      // Calculate cumulative shift
      let cumulativeShift = 0;
      
      for (let i = 1; i < textNodes.length; i++) {
        const prevNode = textNodes[i - 1];
        const currNode = textNodes[i];
        
        // Calculate gap between nodes
        const gap = currNode.y - (prevNode.y + prevNode.height);
        
        if (gap > 0) {
          // Calculate reduction
          const reduction = gap * reductionPercent;
          cumulativeShift += reduction;
        }
        
        // Apply cumulative shift
        if (cumulativeShift > 0) {
          currNode.y = currNode.y - cumulativeShift;
        }
      }
    }
  }
}

