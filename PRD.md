# PRD: HTML Translation Automation Tool

## Overview
Build a tool to batch translate HTML files from English to any language while preserving all HTML structure, attributes, and technical elements.

## Core Requirements

### Input
- Accept a directory path containing HTML files
- Support single file or batch processing
- Configuration file for source/target languages

### Processing Rules
**Translate:**
- All visible text content (headings, paragraphs, list items)
- Alt text in images
- Title attributes
- Meta descriptions/keywords (if present)

**Preserve Exactly:**
- All HTML tags and structure
- CSS classes and IDs
- Inline styles
- Image paths and URLs
- External links (href attributes)
- Data attributes
- File structure and formatting

### Output
- Save translated files with language suffix (e.g., `work-home.html` → `work-home-de.html`)
- Maintain original directory structure
- Option to specify output directory

## Technical Specifications

### Stack
- HTML parser
- Translation API: Google Geminie 2.5 Flash

## Key Features

### 1. Smart Text Extraction
- Parse HTML and extract only translatable text nodes
- Handle nested HTML structures
- Preserve whitespace and formatting

### 2. Batch Processing
- Process multiple files sequentially
- Progress indicator
- Error handling with detailed logs
- Skip already translated files (optional)

### 3. Quality Controls
- Validate HTML structure before/after translation
- Character encoding preservation (UTF-8)
- Special character handling (ä, ö, ü, ß, etc.)

### 4. Translation Optimization
- Batch text segments to reduce API calls
- Handle rate limiting

## Error Handling
- Invalid HTML structure → log warning, attempt translation
- API failures → retry with exponential backoff
- Missing files → skip with error message
- Encoding issues → fallback to UTF-8

## Success Criteria
- Translated files are valid HTML
- All technical elements preserved exactly
- Translation quality matches manual translation
- Process 100+ files without manual intervention
- Complete translation in < 5 minutes for 50 files

## Future Enhancements
- Translation memory for consistency
- Diff view showing changes
- Dry-run mode
- Rollback capability