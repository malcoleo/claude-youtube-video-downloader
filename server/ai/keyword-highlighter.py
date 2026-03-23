#!/usr/bin/env python3
"""
Keyword highlighter for Hormozi-style subtitles.
Uses spaCy POS tagging to identify words worth highlighting.

Highlight strategy:
- Highlight nouns, verbs, adjectives, adverbs (content words)
- Skip stopwords (pronouns, articles, prepositions, auxiliaries)
- Extra emphasis on emotional words (adjectives) and action words (verbs)
"""

import sys
import json
import os

# Use Python 3.11 venv for spaCy
SPACY_PYTHON = '/opt/homebrew/bin/python3.11'
SPACY_VENV = '/Users/ml/server/ai/venv311/bin/python'


def highlight_keywords(words_with_timestamps):
    """
    Given a list of words with timestamps, add highlight flags.

    Input format:
    [{'word': 'I', 'start': 0.0, 'end': 0.1}, ...]

    Output format:
    [{'word': 'I', 'start': 0.0, 'end': 0.1, 'highlight': False, 'pos': 'PRON'}, ...]
    """
    # Run spaCy POS tagging via subprocess (uses Python 3.11 venv)
    import subprocess

    # Extract just the words for POS tagging
    words_only = [w['word'] for w in words_with_timestamps]
    text = ' '.join(words_only)

    # Run POS tagging in the spaCy venv
    cmd = [
        SPACY_VENV, '-c', '''
import spacy
import sys
import json

nlp = spacy.load('en_core_web_sm')
text = sys.argv[1]
doc = nlp(text)
result = [(token.text, token.pos_) for token in doc]
print(json.dumps(result))
''', text
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        pos_tags = json.loads(result.stdout.strip())
    except Exception as e:
        # Fallback: no highlighting if spaCy fails
        pos_tags = [(w, 'UNK') for w in words_only]

    # POS categories to highlight
    HIGHLIGHT_POS = {'NOUN', 'VERB', 'ADJ', 'ADV', 'PROPN'}  # Content words
    EXTRA_HIGHLIGHT_POS = {'ADJ', 'VERB'}  # Emotional/action words

    # Build output with highlight flags
    highlighted = []
    for i, word_data in enumerate(words_with_timestamps):
        pos = pos_tags[i][1] if i < len(pos_tags) else 'UNK'

        # Determine highlight level
        if pos in EXTRA_HIGHLIGHT_POS:
            highlight = 'strong'  # Gold color
        elif pos in HIGHLIGHT_POS:
            highlight = 'normal'  # Slightly emphasized
        else:
            highlight = False  # No highlight

        highlighted.append({
            'word': word_data['word'],
            'start': word_data['start'],
            'end': word_data['end'],
            'highlight': highlight,
            'pos': pos
        })

    return highlighted


def get_stopwords():
    """Common English stopwords to skip for highlighting."""
    return {
        'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves',
        'you', 'your', 'yours', 'yourself', 'yourselves', 'he', 'him',
        'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
        'itself', 'they', 'them', 'their', 'theirs', 'themselves',
        'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
        'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
        'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as',
        'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about',
        'against', 'between', 'into', 'through', 'during', 'before',
        'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in',
        'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then',
        'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
        'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
        'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
        'can', 'will', 'just', 'don', 'should', 'now', 'to', 'and', 'but'
    }


def highlight_keywords_rulebased(words_with_timestamps):
    """
    Fallback rule-based highlighter (no spaCy dependency).
    Highlights content words, skips stopwords.
    """
    stopwords = get_stopwords()
    highlighted = []

    for word_data in words_with_timestamps:
        word = word_data['word'].lower().strip('.,!?;:')

        # Simple heuristic: highlight if not a stopword and > 3 chars
        if word not in stopwords and len(word) > 3:
            highlight = 'normal'
        else:
            highlight = False

        highlighted.append({
            **word_data,
            'highlight': highlight,
            'pos': 'UNKNOWN'
        })

    return highlighted


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No input provided'}))
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        with open(input_file, 'r') as f:
            words_data = json.load(f)

        # Try spaCy first, fallback to rule-based
        try:
            result = highlight_keywords(words_data)
        except Exception as e:
            print(f"spaCy failed, using rule-based: {e}", file=sys.stderr)
            result = highlight_keywords_rulebased(words_data)

        print(json.dumps(result, indent=2))

    except FileNotFoundError:
        print(json.dumps({'error': f'File not found: {input_file}'}))
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON: {str(e)}'}))
        sys.exit(1)
