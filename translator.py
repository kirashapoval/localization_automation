#!/usr/bin/env python3
"""
HTML Translation Automation Tool
Translates HTML files while preserving structure and technical elements
"""

import os
import sys
import time
import logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import re

from bs4 import BeautifulSoup, NavigableString, Tag
import google.generativeai as genai
from tqdm import tqdm
import yaml


@dataclass
class TranslationConfig:
    """Configuration for translation process"""
    source_language: str
    target_languages: List[str]
    skip_already_translated: bool
    batch_size: int
    max_retries: int
    retry_delay: int
    output_suffix: bool
    output_directory: Optional[str]
    api_rate_limit: int
    timeout: int
    api_key: str


class HTMLTranslator:
    """Main translation class for HTML files"""
    
    def __init__(self, config: TranslationConfig, progress_callback=None):
        self.config = config
        self.logger = self._setup_logging()
        self._setup_gemini()
        self.progress_callback = progress_callback
        self.stats = {
            'processed': 0,
            'success': 0,
            'failed': 0,
            'skipped': 0
        }
    
    def _report_progress(self, message: str, percent: Optional[float] = None):
        """Report progress via callback if available"""
        if self.progress_callback:
            self.progress_callback({
                'message': message,
                'percent': percent,
                'stats': self.stats
            })
    
    def _setup_logging(self) -> logging.Logger:
        """Configure logging"""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler('translation.log'),
                logging.StreamHandler(sys.stdout)
            ]
        )
        return logging.getLogger(__name__)
    
    def _setup_gemini(self):
        """Initialize Gemini API"""
        try:
            genai.configure(api_key=self.config.api_key)
            # Use Gemini 2.5 Flash model
            self.model = genai.GenerativeModel('gemini-2.5-flash')
            self.logger.info("Gemini API initialized successfully")
        except Exception as e:
            self.logger.error(f"Failed to initialize Gemini API: {e}")
            raise
    
    def extract_translatable_text(self, soup: BeautifulSoup) -> List[Tuple]:
        """
        Extract all translatable text nodes from HTML
        Returns list of (node, text_content, attribute_name) tuples
        attribute_name is None for text nodes, or 'alt', 'title', 'content' for attributes
        """
        translatable_nodes = []
        
        # Tags to skip entirely
        skip_tags = {'script', 'style', 'code', 'pre'}
        
        def should_translate(tag):
            """Check if tag's content should be translated"""
            if tag.name in skip_tags:
                return False
            return True
        
        def extract_from_element(element):
            """Recursively extract text from element"""
            if isinstance(element, NavigableString):
                text = str(element).strip()
                if text and not text.isspace():
                    translatable_nodes.append((element, text, None))
            elif isinstance(element, Tag):
                if should_translate(element):
                    # Check for translatable attributes
                    if element.name == 'img' and element.get('alt'):
                        translatable_nodes.append((element, element['alt'], 'alt'))
                    if element.get('title'):
                        translatable_nodes.append((element, element['title'], 'title'))
                    if element.name == 'meta':
                        if element.get('name') in ['description', 'keywords'] and element.get('content'):
                            translatable_nodes.append((element, element['content'], 'content'))
                    
                    # Recursively process children
                    for child in element.children:
                        extract_from_element(child)
        
        extract_from_element(soup)
        return translatable_nodes
    
    def translate_text_batch(self, texts: List[str], target_lang: str) -> List[str]:
        """
        Translate a batch of text segments using Gemini
        """
        if not texts:
            return []
        
        # Create a structured prompt for batch translation
        text_items = "\n".join([f"{i+1}. {text}" for i, text in enumerate(texts)])
        
        prompt = f"""Translate the following text segments from {self.config.source_language} to {target_lang}.

CRITICAL RULES:
1. Preserve ALL HTML entities exactly as they are (e.g., &nbsp;, &amp;, &#x...)
2. Preserve ALL special formatting characters
3. Return ONLY the translations, numbered exactly as the input
4. Do NOT add any explanations or extra text
5. Maintain the same number of segments as input
6. Keep punctuation and capitalization appropriate for the target language

Text segments to translate:
{text_items}

Respond with ONLY the numbered translations:"""
        
        for attempt in range(self.config.max_retries):
            try:
                response = self.model.generate_content(
                    prompt,
                    generation_config={
                        'temperature': 0.3,
                        'top_p': 0.95,
                        'top_k': 40,
                        'max_output_tokens': 8192,
                    }
                )
                
                # Parse the response
                translations = self._parse_translation_response(response.text, len(texts))
                
                if len(translations) == len(texts):
                    return translations
                else:
                    self.logger.warning(f"Translation count mismatch. Expected {len(texts)}, got {len(translations)}")
                    if attempt < self.config.max_retries - 1:
                        time.sleep(self.config.retry_delay * (attempt + 1))
                        continue
                    return translations
                    
            except Exception as e:
                self.logger.error(f"Translation attempt {attempt + 1} failed: {e}")
                if attempt < self.config.max_retries - 1:
                    time.sleep(self.config.retry_delay * (attempt + 1))
                else:
                    raise
        
        return texts  # Return original if all retries failed
    
    def _parse_translation_response(self, response: str, expected_count: int) -> List[str]:
        """Parse numbered translation response from API"""
        lines = response.strip().split('\n')
        translations = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Match numbered format: "1. Translation text"
            match = re.match(r'^\d+\.\s*(.+)$', line)
            if match:
                translations.append(match.group(1))
        
        return translations
    
    def apply_translations(self, soup: BeautifulSoup, nodes: List[Tuple], translations: List[str]):
        """Apply translations back to the HTML nodes"""
        for (node, original, attr_name), translation in zip(nodes, translations):
            try:
                if isinstance(node, NavigableString):
                    # Replace text node content
                    node.replace_with(translation)
                elif isinstance(node, Tag):
                    # Handle attribute translations based on attribute name
                    if attr_name:
                        node[attr_name] = translation
            except Exception as e:
                self.logger.warning(f"Failed to apply translation: {e}")
    
    def translate_html_file(self, input_path: Path, target_lang: str) -> Optional[Path]:
        """
        Translate a single HTML file
        Returns output path if successful, None otherwise
        """
        try:
            # Read HTML file
            with open(input_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            # Parse HTML
            soup = BeautifulSoup(html_content, 'lxml')
            
            # Extract translatable text
            nodes = self.extract_translatable_text(soup)
            texts = [text for _, text, _ in nodes]
            
            if not texts:
                self.logger.warning(f"No translatable text found in {input_path}")
                return None
            
            self.logger.info(f"Extracting {len(texts)} text segments from {input_path.name}")
            self._report_progress(f"Translating {input_path.name} to {target_lang}", 0)
            
            # Translate in batches
            all_translations = []
            total_batches = (len(texts) + self.config.batch_size - 1) // self.config.batch_size
            
            # Use tqdm only if no callback is provided (CLI mode)
            iterator = range(0, len(texts), self.config.batch_size)
            if not self.progress_callback:
                iterator = tqdm(iterator, desc=f"Translating to {target_lang}", leave=False)
            
            for batch_idx, i in enumerate(iterator):
                batch = texts[i:i + self.config.batch_size]
                translations = self.translate_text_batch(batch, target_lang)
                all_translations.extend(translations)
                
                # Report progress
                if self.progress_callback:
                    percent = ((batch_idx + 1) / total_batches) * 100
                    self._report_progress(f"Translating {input_path.name} ({int(percent)}%)", percent)
                
                # Rate limiting
                time.sleep(60 / self.config.api_rate_limit)
            
            # Apply translations
            self.apply_translations(soup, nodes, all_translations)
            
            # Generate output path
            output_path = self._generate_output_path(input_path, target_lang)
            
            # Ensure output directory exists
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Write translated HTML
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(str(soup))
            
            self.logger.info(f"Successfully translated {input_path.name} -> {output_path.name}")
            return output_path
            
        except Exception as e:
            self.logger.error(f"Failed to translate {input_path}: {e}")
            return None
    
    def _generate_output_path(self, input_path: Path, target_lang: str) -> Path:
        """Generate output file path with language suffix"""
        if self.config.output_directory:
            output_dir = Path(self.config.output_directory)
        else:
            output_dir = input_path.parent
        
        if self.config.output_suffix:
            stem = input_path.stem
            suffix = input_path.suffix
            new_name = f"{stem}-{target_lang}{suffix}"
        else:
            new_name = input_path.name
        
        return output_dir / new_name
    
    def process_directory(self, input_dir: Path, target_languages: Optional[List[str]] = None):
        """
        Process all HTML files in a directory
        """
        if target_languages is None:
            target_languages = self.config.target_languages
        
        # Find all HTML files
        html_files = list(input_dir.rglob("*.html")) + list(input_dir.rglob("*.htm"))
        
        if not html_files:
            self.logger.warning(f"No HTML files found in {input_dir}")
            return
        
        self.logger.info(f"Found {len(html_files)} HTML file(s)")
        
        # Process each file for each target language
        total_tasks = len(html_files) * len(target_languages)
        
        with tqdm(total=total_tasks, desc="Overall Progress") as pbar:
            for html_file in html_files:
                for target_lang in target_languages:
                    # Check if already translated
                    output_path = self._generate_output_path(html_file, target_lang)
                    
                    if self.config.skip_already_translated and output_path.exists():
                        self.logger.info(f"Skipping {html_file.name} (already translated to {target_lang})")
                        self.stats['skipped'] += 1
                        pbar.update(1)
                        continue
                    
                    # Translate file
                    self.stats['processed'] += 1
                    result = self.translate_html_file(html_file, target_lang)
                    
                    if result:
                        self.stats['success'] += 1
                    else:
                        self.stats['failed'] += 1
                    
                    pbar.update(1)
        
        # Print summary
        self._print_summary()
    
    def process_single_file(self, file_path: Path, target_languages: Optional[List[str]] = None):
        """Process a single HTML file"""
        if target_languages is None:
            target_languages = self.config.target_languages
        
        for target_lang in target_languages:
            self.stats['processed'] += 1
            result = self.translate_html_file(file_path, target_lang)
            
            if result:
                self.stats['success'] += 1
            else:
                self.stats['failed'] += 1
        
        self._print_summary()
    
    def _print_summary(self):
        """Print translation statistics"""
        print("\n" + "="*50)
        print("TRANSLATION SUMMARY")
        print("="*50)
        print(f"Processed: {self.stats['processed']}")
        print(f"Success:   {self.stats['success']}")
        print(f"Failed:    {self.stats['failed']}")
        print(f"Skipped:   {self.stats['skipped']}")
        print("="*50 + "\n")


def load_config(config_path: str = "config.yaml", api_key_path: str = "api_key.txt") -> TranslationConfig:
    """Load configuration from YAML file and API key from file"""
    
    # Load YAML config
    with open(config_path, 'r') as f:
        config_dict = yaml.safe_load(f)
    
    # Load API key
    if os.path.exists(api_key_path):
        with open(api_key_path, 'r') as f:
            api_key = f.read().strip()
    else:
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            raise ValueError("API key not found. Please create api_key.txt or set GEMINI_API_KEY environment variable")
    
    return TranslationConfig(
        source_language=config_dict.get('source_language', 'en'),
        target_languages=config_dict.get('target_languages', ['de']),
        skip_already_translated=config_dict.get('skip_already_translated', True),
        batch_size=config_dict.get('batch_size', 10),
        max_retries=config_dict.get('max_retries', 3),
        retry_delay=config_dict.get('retry_delay', 1),
        output_suffix=config_dict.get('output_suffix', True),
        output_directory=config_dict.get('output_directory'),
        api_rate_limit=config_dict.get('api_rate_limit', 60),
        timeout=config_dict.get('timeout', 30),
        api_key=api_key
    )


def main():
    """Main CLI entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='HTML Translation Automation Tool',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Translate all HTML files in a directory
  python translator.py --dir ./html_files
  
  # Translate a single file
  python translator.py --file index.html
  
  # Translate to specific languages
  python translator.py --dir ./html_files --languages de es fr
  
  # Use custom config
  python translator.py --dir ./html_files --config my_config.yaml
        """
    )
    
    parser.add_argument('--dir', type=str, help='Directory containing HTML files')
    parser.add_argument('--file', type=str, help='Single HTML file to translate')
    parser.add_argument('--languages', nargs='+', help='Target languages (overrides config)')
    parser.add_argument('--config', type=str, default='config.yaml', help='Config file path')
    parser.add_argument('--api-key-file', type=str, default='api_key.txt', help='API key file path')
    
    args = parser.parse_args()
    
    if not args.dir and not args.file:
        parser.error("Either --dir or --file must be specified")
    
    try:
        # Load configuration
        config = load_config(args.config, args.api_key_file)
        
        # Override languages if specified
        if args.languages:
            config.target_languages = args.languages
        
        # Create translator
        translator = HTMLTranslator(config)
        
        # Process files
        if args.dir:
            input_dir = Path(args.dir)
            if not input_dir.exists():
                print(f"Error: Directory '{args.dir}' not found")
                sys.exit(1)
            translator.process_directory(input_dir)
        
        elif args.file:
            input_file = Path(args.file)
            if not input_file.exists():
                print(f"Error: File '{args.file}' not found")
                sys.exit(1)
            translator.process_single_file(input_file)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

