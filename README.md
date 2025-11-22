# 🌐 HTML Localization Automation Tool

A powerful web-based tool that automatically translates HTML files into multiple languages while preserving all structure, formatting, and technical elements using Google Gemini AI.

![HTML Localizer](https://img.shields.io/badge/AI-Gemini%202.5%20Flash-green)
![Python](https://img.shields.io/badge/Python-3.8+-blue)
![Flask](https://img.shields.io/badge/Flask-3.0-lightgrey)

## ✨ Features

- 🎨 **Beautiful Dark UI** - Modern glassmorphism design with emerald accents
- 🤖 **AI-Powered Translation** - Uses Google Gemini 2.5 Flash for high-quality translations
- 📁 **Batch Processing** - Upload and translate multiple HTML files simultaneously
- 🌍 **Multi-Language Support** - Translate to German, Spanish, French, Italian, Japanese, Dutch, Turkish
- 🔄 **Real-Time Progress** - Watch translations happen with live terminal output and animated progress bar
- 🎯 **Structure Preservation** - Maintains all HTML tags, CSS classes, attributes, and formatting
- 📊 **Smart Text Extraction** - Only translates visible content, keeps scripts and code intact
- ⚡ **Fast & Efficient** - Optimized API calls with batching and rate limiting

## 🚀 Quick Start

### Prerequisites

- Python 3.8 or higher
- Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/kirashapoval/localization_automation.git
cd localization_automation
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Set up your API key**

Create a file named `api_key.txt` in the project root and paste your Gemini API key:
```bash
echo "YOUR_GEMINI_API_KEY" > api_key.txt
```

4. **Run the application**
```bash
python app.py
```

5. **Open your browser**

Navigate to `http://127.0.0.1:5000`

## 💻 Usage

### Web Interface

1. **Upload Files**: Drag and drop HTML files or click to browse
2. **Select Languages**: Choose target languages from the available options
3. **Run Localization**: Click the "Run Localization" button
4. **Download Results**: Get your translated files from the results panel

### Command Line Interface

For headless/automated workflows, use the CLI:

```bash
# Translate a single file
python translator.py --file index.html --languages de es fr

# Translate an entire directory
python translator.py --dir ./html_files --languages de

# Use custom configuration
python translator.py --file index.html --config custom_config.yaml
```

## 📋 Configuration

Edit `config.yaml` to customize behavior:

```yaml
source_language: "en"
target_languages:
  - "de"  # German
  - "es"  # Spanish
  - "fr"  # French

skip_already_translated: true
batch_size: 10
max_retries: 3
retry_delay: 1
output_suffix: true
output_directory: null
api_rate_limit: 60
timeout: 30
```

## 🌍 Supported Languages

| Language | Code | | Language | Code |
|----------|------|-|----------|------|
| German 🇩🇪 | `de` | | Italian 🇮🇹 | `it` |
| Spanish 🇪🇸 | `es` | | Japanese 🇯🇵 | `ja` |
| French 🇫🇷 | `fr` | | Dutch 🇳🇱 | `nl` |
| Turkish 🇹🇷 | `tr` | | | |

*More languages can be added easily by editing the HTML template.*

## 🎯 What Gets Translated

✅ **Translated:**
- All visible text content (headings, paragraphs, lists)
- Image alt attributes
- Title attributes  
- Meta descriptions and keywords

❌ **Preserved Exactly:**
- HTML tags and structure
- CSS classes and IDs
- Inline styles
- Image paths and URLs
- Links (href attributes)
- Data attributes
- Scripts and code blocks

## 🏗️ Project Structure

```
localization_automation/
├── app.py                 # Flask web server
├── translator.py          # Core translation engine & CLI
├── config.yaml           # Configuration file
├── requirements.txt      # Python dependencies
├── templates/
│   └── index.html       # Web UI
├── uploads/             # Temporary upload folder (auto-created)
└── translated_output/   # Translation results (auto-created)
```

## 🔧 Development

### Run in Debug Mode

```bash
python app.py
```

The server will run on `http://127.0.0.1:5000` with auto-reload enabled.

### Run Tests

```bash
# Test with example file
python translator.py --file example/sample.html --languages de
```

## 📝 Technical Details

- **Backend**: Python Flask 3.0
- **AI Model**: Google Gemini 2.5 Flash
- **HTML Parser**: Beautiful Soup 4 with lxml
- **Frontend**: Tailwind CSS, Vanilla JavaScript
- **Real-time Updates**: Server-Sent Events (SSE)

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - feel free to use this project for any purpose.

## 🙏 Acknowledgments

- Google Gemini AI for translation capabilities
- Tailwind CSS for the beautiful UI framework
- Flask for the lightweight web framework

## 📧 Contact

For questions or support, please open an issue on GitHub.

---

Made with ❤️ by [Kira Shapoval](https://github.com/kirashapoval)
