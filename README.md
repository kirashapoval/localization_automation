# HTML Translation Automation Tool

Automatically translate HTML files while preserving all structure, formatting, and technical elements using Google Gemini AI.

## Features

- ✅ **Batch Processing**: Translate multiple HTML files at once
- ✅ **Structure Preservation**: Maintains all HTML tags, classes, IDs, and attributes
- ✅ **Smart Text Extraction**: Only translates visible content, preserves code/scripts
- ✅ **Multi-language Support**: Translate to multiple languages in one run
- ✅ **Progress Tracking**: Real-time progress bars and detailed logging
- ✅ **Error Handling**: Automatic retries with exponential backoff
- ✅ **Quality Controls**: UTF-8 encoding, HTML validation, special character handling

## Installation

1. **Install Python 3.8+** (if not already installed)

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```

3. **Set up API key**:
   - Your API key is already configured in `api_key.txt`
   - Alternatively, set environment variable: `export GEMINI_API_KEY=your_key_here`

## Quick Start

### Translate a Single File

```bash
python translator.py --file your-file.html
```

This will create translated versions like:
- `your-file-de.html` (German)
- `your-file-es.html` (Spanish)
- `your-file-fr.html` (French)

### Translate All Files in a Directory

```bash
python translator.py --dir ./html_files
```

### Translate to Specific Languages

```bash
python translator.py --file index.html --languages de es
```

## Configuration

Edit `config.yaml` to customize behavior:

```yaml
source_language: "en"           # Source language
target_languages:               # Languages to translate to
  - "de"  # German
  - "es"  # Spanish
  - "fr"  # French

skip_already_translated: true   # Skip existing translations
batch_size: 10                  # Text segments per API call
max_retries: 3                  # Retry failed translations
output_suffix: true             # Add language code to filename
```

### Supported Languages

Common language codes:
- `de` - German
- `es` - Spanish
- `fr` - French
- `it` - Italian
- `pt` - Portuguese
- `ru` - Russian
- `ja` - Japanese
- `zh` - Chinese
- `ko` - Korean
- `ar` - Arabic
- `nl` - Dutch
- `pl` - Polish
- `sv` - Swedish
- `no` - Norwegian
- `da` - Danish
- `fi` - Finnish

## What Gets Translated

✅ **Translated**:
- All visible text content (headings, paragraphs, lists)
- Image alt text
- Title attributes
- Meta descriptions and keywords

❌ **Preserved Exactly**:
- HTML tags and structure
- CSS classes and IDs
- Inline styles
- Image paths and URLs
- External links (href attributes)
- Data attributes
- Scripts and code blocks

## Command Line Options

```
python translator.py [OPTIONS]

Options:
  --dir PATH              Directory containing HTML files
  --file PATH             Single HTML file to translate
  --languages LANG [LANG] Target languages (overrides config)
  --config PATH           Config file path (default: config.yaml)
  --api-key-file PATH     API key file path (default: api_key.txt)
```

## Examples

### Example 1: Translate website files to German

```bash
python translator.py --dir ./website --languages de
```

### Example 2: Translate single page to multiple languages

```bash
python translator.py --file index.html --languages de es fr it
```

### Example 3: Use custom configuration

```bash
python translator.py --dir ./docs --config custom_config.yaml
```

## Output

Translated files are saved with language suffixes:
- `index.html` → `index-de.html`, `index-es.html`, etc.

Directory structure is maintained:
```
input/
  ├── index.html
  └── pages/
      └── about.html

output/
  ├── index-de.html
  ├── index-es.html
  └── pages/
      ├── about-de.html
      └── about-es.html
```

## Logs

Translation progress and errors are logged to:
- Console (real-time)
- `translation.log` (detailed logs)

## Performance

- **Speed**: ~50 files in < 5 minutes
- **Rate Limiting**: Respects API limits (60 requests/minute by default)
- **Batch Processing**: Optimizes API calls by grouping text segments
- **Caching**: Skip already translated files (configurable)

## Error Handling

The tool handles common issues automatically:
- **Invalid HTML**: Attempts to parse and translate anyway
- **API failures**: Retries with exponential backoff
- **Missing files**: Skips with error message
- **Encoding issues**: Forces UTF-8
- **Rate limiting**: Automatic throttling

## Troubleshooting

### "API key not found"
- Ensure `api_key.txt` exists with your key
- Or set `GEMINI_API_KEY` environment variable

### "No HTML files found"
- Check directory path is correct
- Ensure files have `.html` or `.htm` extension

### Translation quality issues
- Adjust `temperature` in `translate_text_batch()` method
- Reduce `batch_size` for better context
- Check source language is correctly set

### Rate limit errors
- Reduce `api_rate_limit` in config.yaml
- Increase delay between batches

## Advanced Usage

### Dry Run (check what would be translated)

```python
from translator import HTMLTranslator, load_config
from pathlib import Path

config = load_config()
translator = HTMLTranslator(config)

# Extract text without translating
from bs4 import BeautifulSoup
with open('file.html', 'r') as f:
    soup = BeautifulSoup(f.read(), 'lxml')
    nodes = translator.extract_translatable_text(soup)
    for _, text in nodes:
        print(f"Would translate: {text}")
```

### Custom Output Directory

```yaml
# In config.yaml
output_directory: "./translated"
```

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues or questions, check:
1. `translation.log` for detailed error messages
2. Ensure API key is valid and has quota remaining
3. Verify HTML files are valid and UTF-8 encoded

