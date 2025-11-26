// ============================================
// Translation Module
// Handles translation via Google Gemini API
// ============================================

import { LanguageCode, SUPPORTED_LANGUAGES } from './types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Translate a batch of texts using Gemini API
 */
export async function translateBatch(
  texts: string[],
  targetLanguage: LanguageCode,
  apiKey: string,
  onProgress?: (current: number, total: number) => void
): Promise<string[]> {
  if (texts.length === 0) return [];
  
  const languageName = SUPPORTED_LANGUAGES[targetLanguage];
  
  // Create numbered list of texts
  const numberedTexts = texts.map((text, i) => `${i + 1}. ${text}`).join('\n');
  
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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
          maxOutputTokens: 8192,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }
    
    const data = await response.json();
    
    // Extract text from response
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error('Empty response from Gemini API');
    }
    
    // Parse numbered translations
    const translations = parseNumberedResponse(responseText, texts.length);
    
    if (translations.length !== texts.length) {
      console.warn(`Translation count mismatch: expected ${texts.length}, got ${translations.length}`);
      // Pad with original texts if needed
      while (translations.length < texts.length) {
        translations.push(texts[translations.length]);
      }
    }
    
    return translations;
    
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

/**
 * Parse numbered response from Gemini
 */
function parseNumberedResponse(response: string, expectedCount: number): string[] {
  const lines = response.trim().split('\n');
  const translations: string[] = [];
  
  // Pattern to match numbered lines: "1. Translation text"
  const numberPattern = /^\d+\.\s*(.+)$/;
  
  let currentText = '';
  let currentNumber = 0;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    const match = trimmedLine.match(numberPattern);
    if (match) {
      // Save previous accumulated text
      if (currentNumber > 0 && currentText) {
        translations[currentNumber - 1] = currentText.trim();
      }
      
      // Start new item
      currentNumber = parseInt(trimmedLine.match(/^(\d+)\./)?.[1] || '0');
      currentText = match[1];
    } else if (currentNumber > 0) {
      // Continuation of previous line
      currentText += ' ' + trimmedLine;
    }
  }
  
  // Save last item
  if (currentNumber > 0 && currentText) {
    translations[currentNumber - 1] = currentText.trim();
  }
  
  // Fill any gaps with empty strings
  const result: string[] = [];
  for (let i = 0; i < expectedCount; i++) {
    result.push(translations[i] || '');
  }
  
  return result;
}

/**
 * Translate texts in chunks with rate limiting
 */
export async function translateInChunks(
  texts: string[],
  targetLanguage: LanguageCode,
  apiKey: string,
  chunkSize: number = 15,
  delayMs: number = 1000,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<string[]> {
  const results: string[] = [];
  const totalChunks = Math.ceil(texts.length / chunkSize);
  
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const chunkIndex = Math.floor(i / chunkSize) + 1;
    
    onProgress?.(
      i, 
      texts.length, 
      `Translating batch ${chunkIndex}/${totalChunks} (${chunk.length} segments)...`
    );
    
    try {
      const translated = await translateBatch(chunk, targetLanguage, apiKey);
      results.push(...translated);
    } catch (error) {
      console.error(`Chunk ${chunkIndex} failed:`, error);
      // On error, keep original texts
      results.push(...chunk);
    }
    
    // Rate limiting delay between chunks
    if (i + chunkSize < texts.length) {
      await delay(delayMs);
    }
  }
  
  return results;
}

/**
 * Validate API key by making a simple request
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello' }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Estimate translation text expansion for a target language
 * Returns multiplier (e.g., 1.3 = 30% longer)
 */
export function getExpansionFactor(targetLanguage: LanguageCode): number {
  // Approximate text expansion factors compared to English
  const expansionFactors: Record<LanguageCode, number> = {
    de: 1.30,  // German - often 20-35% longer
    es: 1.25,  // Spanish - 20-30% longer
    fr: 1.25,  // French - 20-30% longer
    it: 1.20,  // Italian - 15-25% longer
    pt: 1.25,  // Portuguese - 20-30% longer
    ru: 1.15,  // Russian - 10-20% longer (Cyrillic is denser)
    pl: 1.20,  // Polish - 15-25% longer
    nl: 1.20,  // Dutch - 15-25% longer
    el: 1.20,  // Greek - 15-25% longer
    hr: 1.15,  // Croatian - 10-20% longer
    cs: 1.15,  // Czech - 10-20% longer
    sk: 1.15,  // Slovak - 10-20% longer
    hu: 1.20,  // Hungarian - 15-25% longer
    ro: 1.20,  // Romanian - 15-25% longer
    bg: 1.15,  // Bulgarian - 10-20% longer (Cyrillic)
    uk: 1.15,  // Ukrainian - 10-20% longer (Cyrillic)
    sv: 1.15,  // Swedish - 10-20% longer
    da: 1.15,  // Danish - 10-20% longer
    fi: 1.25,  // Finnish - 20-30% longer (long compound words)
    no: 1.15,  // Norwegian - 10-20% longer
  };
  
  return expansionFactors[targetLanguage] || 1.20;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

