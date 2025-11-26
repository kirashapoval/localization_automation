"use strict";
(() => {
  // src/styles.ts
  function extractTextNodes(frames) {
    const textNodes = [];
    for (const frame of frames) {
      if (frame.type !== "FRAME")
        continue;
      const frameNode = frame;
      const texts = frameNode.findAll((node) => node.type === "TEXT");
      for (const textNode of texts) {
        let styleId = null;
        let styleName = null;
        if (typeof textNode.textStyleId === "string" && textNode.textStyleId !== "") {
          styleId = textNode.textStyleId;
          const style = figma.getStyleById(styleId);
          if (style) {
            styleName = style.name;
          }
        }
        let fontSize = 12;
        if (typeof textNode.fontSize === "number") {
          fontSize = textNode.fontSize;
        } else if (textNode.fontSize !== figma.mixed) {
          fontSize = textNode.fontSize;
        }
        let lineHeight = { value: 0, unit: "AUTO" };
        if (textNode.lineHeight !== figma.mixed) {
          const lh = textNode.lineHeight;
          if (lh.unit === "AUTO") {
            lineHeight = { value: 0, unit: "AUTO" };
          } else if (lh.unit === "PIXELS") {
            lineHeight = { value: lh.value || 0, unit: "PIXELS" };
          } else if (lh.unit === "PERCENT") {
            lineHeight = { value: lh.value || 100, unit: "PERCENT" };
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
  function groupByStyles(textNodes) {
    const styleGroups = /* @__PURE__ */ new Map();
    for (const node of textNodes) {
      const key = node.styleId || `unstyled\xE3${node.fontSize}`;
      if (!styleGroups.has(key)) {
        styleGroups.set(key, []);
      }
      styleGroups.get(key).push(node);
    }
    return styleGroups;
  }
  function calculateStyleAdaptations(styleGroups, overflowMap) {
    var _a, _b, _c;
    const adaptations = [];
    for (const [styleKey, nodes] of styleGroups) {
      let styleName = "Unnamed Style";
      let styleId = styleKey;
      if (styleKey.startsWith("unstyled_")) {
        const fontSize = styleKey.split("_")[1];
        styleName = `Unstyled (${fontSize}pt)`;
        styleId = "";
      } else if ((_a = nodes[0]) == null ? void 0 : _a.styleName) {
        styleName = nodes[0].styleName;
      }
      const originalFontSize = ((_b = nodes[0]) == null ? void 0 : _b.fontSize) || 12;
      const originalLineHeight = ((_c = nodes[0]) == null ? void 0 : _c.lineHeight) || { value: 0, unit: "AUTO" };
      let maxOverflow = 0;
      let nodesWithOverflow = 0;
      for (const node of nodes) {
        const overflow = overflowMap.get(node.nodeId) || 0;
        if (overflow > 0) {
          nodesWithOverflow++;
          maxOverflow = Math.max(maxOverflow, overflow);
        }
      }
      const { fontSizeReduction, lineHeightReduction, widthIncrease, gapReduction } = calculateRequiredReductions(maxOverflow, originalFontSize, originalLineHeight);
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
  function calculateRequiredReductions(overflow, fontSize, lineHeight) {
    if (overflow <= 0) {
      return { fontSizeReduction: 0, lineHeightReduction: 0, widthIncrease: 0, gapReduction: 0 };
    }
    let remainingOverflow = overflow;
    let widthIncrease = 0;
    let gapReduction = 0;
    let lineHeightReduction = 0;
    let fontSizeReduction = 0;
    const maxWidthCompensation = 0.1;
    if (remainingOverflow > 0 && remainingOverflow <= maxWidthCompensation) {
      widthIncrease = remainingOverflow;
      remainingOverflow = 0;
    } else if (remainingOverflow > maxWidthCompensation) {
      widthIncrease = maxWidthCompensation;
      remainingOverflow -= maxWidthCompensation;
    }
    const maxGapCompensation = 0.05;
    const maxGapReductionPercent = 0.2;
    if (remainingOverflow > 0 && remainingOverflow <= maxGapCompensation) {
      gapReduction = remainingOverflow / maxGapCompensation * maxGapReductionPercent;
      remainingOverflow = 0;
    } else if (remainingOverflow > maxGapCompensation) {
      gapReduction = maxGapReductionPercent;
      remainingOverflow -= maxGapCompensation;
    }
    const maxLineHeightCompensation = 0.08;
    const maxLineHeightReductionPercent = 0.1;
    if (remainingOverflow > 0 && remainingOverflow <= maxLineHeightCompensation) {
      lineHeightReduction = remainingOverflow / maxLineHeightCompensation * maxLineHeightReductionPercent;
      remainingOverflow = 0;
    } else if (remainingOverflow > maxLineHeightCompensation) {
      lineHeightReduction = maxLineHeightReductionPercent;
      remainingOverflow -= maxLineHeightCompensation;
    }
    if (remainingOverflow > 0) {
      const ptPerOverflow = 1 / 0.08;
      fontSizeReduction = Math.ceil(remainingOverflow * ptPerOverflow);
      const maxFontReduction = Math.ceil(fontSize * 0.25);
      fontSizeReduction = Math.min(fontSizeReduction, maxFontReduction);
    }
    return { fontSizeReduction, lineHeightReduction, widthIncrease, gapReduction };
  }
  async function applyStyleAdaptations(adaptations, frames) {
    let stylesModified = 0;
    for (const adaptation of adaptations) {
      if (!adaptation.styleId || adaptation.maxFontSizeReduction === 0)
        continue;
      try {
        const style = figma.getStyleById(adaptation.styleId);
        if (style && style.type === "TEXT") {
          const newFontSize = adaptation.originalFontSize - adaptation.maxFontSizeReduction;
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
    for (const adaptation of adaptations) {
      if (adaptation.styleId || adaptation.maxFontSizeReduction === 0)
        continue;
      const originalFontSize = adaptation.originalFontSize;
      const newFontSize = originalFontSize - adaptation.maxFontSizeReduction;
      await modifyUnstyledNodes(frames, originalFontSize, {
        fontSize: newFontSize,
        lineHeightReduction: adaptation.maxLineHeightReduction
      });
    }
    return stylesModified;
  }
  async function modifyNodesWithStyle(frames, styleId, changes) {
    for (const frame of frames) {
      if (frame.type !== "FRAME")
        continue;
      const textNodes = frame.findAll(
        (node) => node.type === "TEXT" && node.textStyleId === styleId
      );
      for (const textNode of textNodes) {
        await modifyTextNode(textNode, changes);
      }
    }
  }
  async function modifyUnstyledNodes(frames, originalFontSize, changes) {
    for (const frame of frames) {
      if (frame.type !== "FRAME")
        continue;
      const textNodes = frame.findAll((node) => {
        if (node.type !== "TEXT")
          return false;
        const textNode = node;
        const isUnstyled = !textNode.textStyleId || textNode.textStyleId === "";
        const hasMatchingSize = textNode.fontSize === originalFontSize;
        return isUnstyled && hasMatchingSize;
      });
      for (const textNode of textNodes) {
        await modifyTextNode(textNode, changes);
      }
    }
  }
  async function modifyTextNode(textNode, changes) {
    try {
      await loadFontsForNode(textNode);
      if (changes.fontSize > 0) {
        textNode.fontSize = changes.fontSize;
      }
      if (changes.lineHeightReduction > 0 && textNode.lineHeight !== figma.mixed) {
        const currentLH = textNode.lineHeight;
        if (currentLH.unit === "PIXELS" && currentLH.value) {
          textNode.lineHeight = {
            value: currentLH.value * (1 - changes.lineHeightReduction),
            unit: "PIXELS"
          };
        } else if (currentLH.unit === "PERCENT" && currentLH.value) {
          textNode.lineHeight = {
            value: currentLH.value * (1 - changes.lineHeightReduction),
            unit: "PERCENT"
          };
        }
      }
    } catch (error) {
      console.error(`Failed to modify text node:`, error);
    }
  }
  async function loadFontsForNode(textNode) {
    const fontNames = textNode.getRangeAllFontNames(0, textNode.characters.length);
    for (const fontName of fontNames) {
      await figma.loadFontAsync(fontName);
    }
  }
  function toStylePreviews(adaptations) {
    return adaptations.map((a) => ({
      styleName: a.styleName,
      originalFontSize: a.originalFontSize,
      newFontSize: a.originalFontSize - a.maxFontSizeReduction,
      fontSizeChange: -a.maxFontSizeReduction,
      lineHeightChange: -a.maxLineHeightReduction * 100,
      // as percentage
      affectedNodes: a.affectedNodesCount
    }));
  }
  function createGlobalChanges(adaptations, totalFrames, totalTextNodes) {
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

  // src/types.ts
  var SUPPORTED_LANGUAGES = {
    de: "German (Deutsch)",
    es: "Spanish (Espa\xF1ol)",
    fr: "French (Fran\xE7ais)",
    it: "Italian (Italiano)",
    pt: "Portuguese (Portugu\xEAs)",
    ru: "Russian (\u0420\u0443\u0441\u0441\u043A\u0438\u0439)",
    pl: "Polish (Polski)",
    nl: "Dutch (Nederlands)",
    el: "Greek (\u0395\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC)",
    hr: "Croatian (Hrvatski)",
    cs: "Czech (\u010Ce\u0161tina)",
    sk: "Slovak (Sloven\u010Dina)",
    hu: "Hungarian (Magyar)",
    ro: "Romanian (Rom\xE2n\u0103)",
    bg: "Bulgarian (\u0411\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438)",
    uk: "Ukrainian (\u0423\u043A\u0440\u0430\u0457\u043D\u0441\u044C\u043A\u0430)",
    sv: "Swedish (Svenska)",
    da: "Danish (Dansk)",
    fi: "Finnish (Suomi)",
    no: "Norwegian (Norsk)"
  };

  // src/translator.ts
  var GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  async function translateBatch(texts, targetLanguage, apiKey, onProgress) {
    var _a, _b, _c, _d, _e;
    if (texts.length === 0)
      return [];
    const languageName = SUPPORTED_LANGUAGES[targetLanguage];
    const numberedTexts = texts.map((text, i) => `${i + 1}. ${text}`).join("\n");
    const prompt = `Translate the following numbered text segments from English to ${languageName}.

CRITICAL RULES:
1. Preserve ALL formatting, punctuation, and special characters
2. Return ONLY the translations, numbered exactly as the input
3. Do NOT add any explanations, notes, or extra text
4. Maintain the exact same number of segments as input (${texts.length} segments)
5. Keep the same numbering format (1. 2. 3. etc.)
6. Preserve any HTML entities or special characters exactly
7. Maintain appropriate capitalization for the target language
8. Keep brand names, proper nouns, and technical terms as-is when appropriate

Text segments to translate:
${numberedTexts}

Respond with ONLY the numbered translations in ${languageName}:`;
    try {
      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
          ]
        })
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
      }
      const data = await response.json();
      const responseText = (_e = (_d = (_c = (_b = (_a = data.candidates) == null ? void 0 : _a[0]) == null ? void 0 : _b.content) == null ? void 0 : _c.parts) == null ? void 0 : _d[0]) == null ? void 0 : _e.text;
      if (!responseText) {
        throw new Error("Empty response from Gemini API");
      }
      const translations = parseNumberedResponse(responseText, texts.length);
      if (translations.length !== texts.length) {
        console.warn(`Translation count mismatch: expected ${texts.length}, got ${translations.length}`);
        while (translations.length < texts.length) {
          translations.push(texts[translations.length]);
        }
      }
      return translations;
    } catch (error) {
      console.error("Translation error:", error);
      throw error;
    }
  }
  function parseNumberedResponse(response, expectedCount) {
    var _a;
    const lines = response.trim().split("\n");
    const translations = [];
    const numberPattern = /^\d+\.\s*(.+)$/;
    let currentText = "";
    let currentNumber = 0;
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine)
        continue;
      const match = trimmedLine.match(numberPattern);
      if (match) {
        if (currentNumber > 0 && currentText) {
          translations[currentNumber - 1] = currentText.trim();
        }
        currentNumber = parseInt(((_a = trimmedLine.match(/^(\d+)\./)) == null ? void 0 : _a[1]) || "0");
        currentText = match[1];
      } else if (currentNumber > 0) {
        currentText += " " + trimmedLine;
      }
    }
    if (currentNumber > 0 && currentText) {
      translations[currentNumber - 1] = currentText.trim();
    }
    const result = [];
    for (let i = 0; i < expectedCount; i++) {
      result.push(translations[i] || "");
    }
    return result;
  }
  async function translateInChunks(texts, targetLanguage, apiKey, chunkSize = 15, delayMs = 1e3, onProgress) {
    const results = [];
    const totalChunks = Math.ceil(texts.length / chunkSize);
    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);
      const chunkIndex = Math.floor(i / chunkSize) + 1;
      onProgress == null ? void 0 : onProgress(
        i,
        texts.length,
        `Translating batch ${chunkIndex}/${totalChunks} (${chunk.length} segments)...`
      );
      try {
        const translated = await translateBatch(chunk, targetLanguage, apiKey);
        results.push(...translated);
      } catch (error) {
        console.error(`Chunk ${chunkIndex} failed:`, error);
        results.push(...chunk);
      }
      if (i + chunkSize < texts.length) {
        await delay(delayMs);
      }
    }
    return results;
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // src/adapter.ts
  function calculateOverflow(originalNode, translatedText) {
    const originalLength = originalNode.text.length;
    const translatedLength = translatedText.length;
    if (originalLength === 0)
      return 0;
    const charRatio = translatedLength / originalLength;
    const estimatedNewWidth = originalNode.width * charRatio;
    const availableWidth = originalNode.parentFrameWidth - originalNode.x;
    if (estimatedNewWidth <= availableWidth) {
      return 0;
    }
    return (estimatedNewWidth - availableWidth) / availableWidth;
  }
  function calculateAdaptation(nodeInfo, translatedText, targetLanguage) {
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
  function calculateRequiredChanges(overflow, nodeInfo, targetLanguage) {
    let remainingOverflow = overflow;
    const changes = {};
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
    const maxGapReduction = 0.25;
    const gapCompensation = 0.06;
    if (remainingOverflow <= gapCompensation) {
      changes.gapReduction = remainingOverflow / gapCompensation * maxGapReduction;
      remainingOverflow = 0;
    } else {
      changes.gapReduction = maxGapReduction;
      remainingOverflow -= gapCompensation;
    }
    if (remainingOverflow <= 0.01) {
      return changes;
    }
    const maxLineHeightReduction = 0.12;
    const lineHeightCompensation = 0.1;
    if (remainingOverflow <= lineHeightCompensation) {
      changes.lineHeightReduction = remainingOverflow / lineHeightCompensation * maxLineHeightReduction;
      remainingOverflow = 0;
    } else {
      changes.lineHeightReduction = maxLineHeightReduction;
      remainingOverflow -= lineHeightCompensation;
    }
    if (remainingOverflow <= 0.01) {
      return changes;
    }
    const fontSize = nodeInfo.fontSize;
    const ptPerOverflow = 1 / 0.08;
    let fontSizeReduction = Math.ceil(remainingOverflow * ptPerOverflow);
    const maxReduction = Math.ceil(fontSize * 0.25);
    fontSizeReduction = Math.min(fontSizeReduction, maxReduction);
    if (fontSizeReduction > 0 && fontSizeReduction < 0.5) {
      fontSizeReduction = 0.5;
    }
    changes.fontSizeReduction = fontSizeReduction;
    return changes;
  }
  function calculateMaxWidthIncrease(nodeInfo) {
    const availableSpace = nodeInfo.parentFrameWidth - nodeInfo.x - nodeInfo.width;
    const margin = 20;
    const maxIncrease = Math.max(0, availableSpace - margin);
    const cappedIncrease = Math.min(maxIncrease, nodeInfo.width * 0.2);
    return cappedIncrease;
  }
  function analyzeAllNodes(nodeInfos, translations, targetLanguage) {
    const adaptations = [];
    for (const nodeInfo of nodeInfos) {
      const translatedText = translations.get(nodeInfo.nodeId) || nodeInfo.text;
      const adaptation = calculateAdaptation(nodeInfo, translatedText, targetLanguage);
      adaptations.push(adaptation);
    }
    return adaptations;
  }
  async function applyWidthChanges(frames, adaptations) {
    const adaptationMap = /* @__PURE__ */ new Map();
    for (const adaptation of adaptations) {
      if (adaptation.requiredChanges.widthIncrease) {
        adaptationMap.set(adaptation.nodeId, adaptation);
      }
    }
    for (const frame of frames) {
      if (frame.type !== "FRAME")
        continue;
      const textNodes = frame.findAll((n) => n.type === "TEXT");
      for (const textNode of textNodes) {
        const adaptation = adaptationMap.get(textNode.id);
        if (adaptation == null ? void 0 : adaptation.requiredChanges.widthIncrease) {
          textNode.resize(
            textNode.width + adaptation.requiredChanges.widthIncrease,
            textNode.height
          );
        }
      }
    }
  }
  async function applyGapReduction(frames, reductionPercent) {
    if (reductionPercent <= 0)
      return;
    for (const frame of frames) {
      if (frame.type !== "FRAME")
        continue;
      const frameNode = frame;
      if (frameNode.layoutMode !== "NONE") {
        frameNode.itemSpacing = frameNode.itemSpacing * (1 - reductionPercent);
      } else {
        const textNodes = frameNode.findAll((n) => n.type === "TEXT");
        textNodes.sort((a, b) => a.y - b.y);
        let cumulativeShift = 0;
        for (let i = 1; i < textNodes.length; i++) {
          const prevNode = textNodes[i - 1];
          const currNode = textNodes[i];
          const gap = currNode.y - (prevNode.y + prevNode.height);
          if (gap > 0) {
            const reduction = gap * reductionPercent;
            cumulativeShift += reduction;
          }
          if (cumulativeShift > 0) {
            currNode.y = currNode.y - cumulativeShift;
          }
        }
      }
    }
  }

  // src/code.ts
  var currentFrames = [];
  var currentTextNodes = [];
  var currentTranslations = /* @__PURE__ */ new Map();
  var currentAdaptations = [];
  var currentStyleAdaptations = [];
  var isCancelled = false;
  var STORAGE_KEY = "book-translator-settings";
  figma.showUI(__html__, {
    width: 360,
    height: 560,
    themeColors: true
  });
  updateSelectionInfo();
  figma.on("selectionchange", updateSelectionInfo);
  figma.ui.onmessage = async (msg) => {
    switch (msg.type) {
      case "getSettings":
        await loadSettings();
        break;
      case "saveSettings":
        await saveSettings(msg.settings);
        break;
      case "translate":
        isCancelled = false;
        await handleTranslation(
          msg.targetLanguage,
          msg.apiKey,
          msg.analyzeOnly
        );
        break;
      case "applyChanges":
        await applyAllChanges();
        break;
      case "cancel":
        isCancelled = true;
        break;
    }
  };
  function updateSelectionInfo() {
    const selection = figma.currentPage.selection;
    const frames = selection.filter((node) => node.type === "FRAME");
    let textNodeCount = 0;
    for (const frame of frames) {
      const texts = frame.findAll((n) => n.type === "TEXT");
      textNodeCount += texts.length;
    }
    sendToUI({
      type: "selectionInfo",
      frameCount: frames.length,
      textNodeCount
    });
  }
  async function handleTranslation(targetLanguage, apiKey, analyzeOnly) {
    try {
      currentFrames = figma.currentPage.selection.filter(
        (node) => node.type === "FRAME"
      );
      if (currentFrames.length === 0) {
        sendError("No frames selected", "Please select frames containing book pages.");
        return;
      }
      sendProgress("extracting", 0, 100, "Extracting text nodes...");
      currentTextNodes = extractTextNodes(currentFrames);
      if (currentTextNodes.length === 0) {
        sendError("No text found", "Selected frames contain no text layers.");
        return;
      }
      sendProgress("extracting", 100, 100, `Found ${currentTextNodes.length} text nodes`);
      if (isCancelled)
        return;
      sendProgress("translating", 0, currentTextNodes.length, "Starting translation...");
      const textsToTranslate = currentTextNodes.map((n) => n.text);
      const translations = await translateInChunks(
        textsToTranslate,
        targetLanguage,
        apiKey,
        15,
        // chunk size
        1e3,
        // delay between chunks
        (current, total, message) => {
          if (!isCancelled) {
            sendProgress("translating", current, total, message);
          }
        }
      );
      if (isCancelled)
        return;
      currentTranslations = /* @__PURE__ */ new Map();
      for (let i = 0; i < currentTextNodes.length; i++) {
        currentTranslations.set(currentTextNodes[i].nodeId, translations[i]);
      }
      sendProgress("analyzing", 0, 100, "Analyzing text overflow...");
      currentAdaptations = analyzeAllNodes(
        currentTextNodes,
        currentTranslations,
        targetLanguage
      );
      const overflowMap = /* @__PURE__ */ new Map();
      for (const adaptation of currentAdaptations) {
        overflowMap.set(adaptation.nodeId, adaptation.overflow);
      }
      const styleGroups = groupByStyles(currentTextNodes);
      currentStyleAdaptations = calculateStyleAdaptations(styleGroups, overflowMap);
      sendProgress("analyzing", 100, 100, "Analysis complete");
      const globalChanges = createGlobalChanges(
        currentStyleAdaptations,
        currentFrames.length,
        currentTextNodes.length
      );
      const preview = toStylePreviews(currentStyleAdaptations);
      sendToUI({
        type: "analysis",
        globalChanges,
        preview
      });
      if (!analyzeOnly) {
        await applyAllChanges();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendError("Translation failed", errorMessage);
    }
  }
  async function applyAllChanges() {
    try {
      sendProgress("applying", 0, 100, "Applying translations...");
      let nodesTranslated = 0;
      for (const frame of currentFrames) {
        if (frame.type !== "FRAME")
          continue;
        const textNodes = frame.findAll((n) => n.type === "TEXT");
        for (const textNode of textNodes) {
          const translation = currentTranslations.get(textNode.id);
          if (translation) {
            try {
              const fontNames = textNode.getRangeAllFontNames(0, textNode.characters.length);
              for (const fontName of fontNames) {
                await figma.loadFontAsync(fontName);
              }
              textNode.characters = translation;
              nodesTranslated++;
              if (nodesTranslated % 10 === 0) {
                sendProgress(
                  "applying",
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
      sendProgress("applying", 50, 100, "Applying style adaptations...");
      const stylesModified = await applyStyleAdaptations(
        currentStyleAdaptations,
        currentFrames
      );
      sendProgress("applying", 75, 100, "Applying width and gap adjustments...");
      await applyWidthChanges(currentFrames, currentAdaptations);
      const avgGapReduction = currentStyleAdaptations.reduce(
        (sum, s) => sum + s.maxGapReduction,
        0
      ) / currentStyleAdaptations.length;
      if (avgGapReduction > 0.05) {
        await applyGapReduction(currentFrames, avgGapReduction);
      }
      sendProgress("applying", 100, 100, "Complete!");
      sendToUI({
        type: "complete",
        framesProcessed: currentFrames.length,
        nodesTranslated,
        stylesModified
      });
      figma.commitUndo();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendError("Failed to apply changes", errorMessage);
    }
  }
  async function loadSettings() {
    try {
      const settings = await figma.clientStorage.getAsync(STORAGE_KEY);
      sendToUI({
        type: "settings",
        settings: settings || {}
      });
    } catch (error) {
      console.error("Failed to load settings:", error);
      sendToUI({
        type: "settings",
        settings: {}
      });
    }
  }
  async function saveSettings(settings) {
    try {
      await figma.clientStorage.setAsync(STORAGE_KEY, settings);
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }
  function sendToUI(message) {
    figma.ui.postMessage(message);
  }
  function sendProgress(phase, current, total, message) {
    sendToUI({
      type: "progress",
      phase,
      current,
      total,
      message
    });
  }
  function sendError(message, details) {
    sendToUI({
      type: "error",
      message,
      details
    });
  }
})();
