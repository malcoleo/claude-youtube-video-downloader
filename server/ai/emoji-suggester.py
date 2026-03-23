#!/usr/bin/env python3
"""
Emoji auto-suggestion engine for Hormozi-style subtitles.
Maps sentiment and keywords to relevant emojis.

Emoji placement strategy:
- Add emoji after key phrases (every 3-5 words OR on emotional content)
- Sentiment-based: positive → 😊🎉⭐, negative → 😢😤💔, neutral → 🤔💡
- Keyword-based: money → 💰, success → 🏆, thinking → 🤔, fire → 🔥
"""

import sys
import json
import re


# Emoji mappings by keyword
KEYWORD_EMOJIS = {
    # Positive emotions
    'love': '❤️', 'like': '👍', 'happy': '😊', 'excited': '🤩', 'amazing': '✨',
    'great': '👏', 'awesome': '🔥', 'fantastic': '⭐', 'wonderful': '💫',
    'best': '🏆', 'perfect': '💯', 'beautiful': '🌟', 'good': '✅',

    # Negative emotions
    'hate': '💔', 'dislike': '👎', 'sad': '😢', 'angry': '😤', 'terrible': '❌',
    'worst': '📉', 'bad': '⚠️', 'wrong': '❌', 'fail': '💥',

    # Success/achievement
    'success': '🎯', 'win': '🏆', 'achieve': '⭐', 'goal': '🎯', 'result': '📊',
    'growth': '📈', 'money': '💰', 'profit': '💵', 'business': '💼',

    # Thinking/ideas
    'think': '🤔', 'idea': '💡', 'learn': '📚', 'know': '🧠', 'understand': '💭',
    'question': '❓', 'answer': '✅', 'truth': '💯', 'real': '🎯',

    # Action words
    'go': '🚀', 'start': '▶️', 'stop': '⏹️', 'change': '🔄', 'build': '🔨',
    'create': '✨', 'make': '🛠️', 'do': '✅', 'work': '💪',

    # Fire/hype emojis for emphasis
    'fire': '🔥', 'lit': '🔥', 'crush': '💥', 'destroy': '💥', 'kill': '🔥',
    'power': '⚡', 'energy': '⚡', 'fast': '⚡', 'quick': '⚡',

    # People/audience
    'people': '👥', 'team': '👨‍👩‍👧', 'friend': '🤝', 'customer': '👤',
    'you': '👉', 'we': '🤝', 'together': '🤝',

    # Time
    'now': '⏰', 'today': '📅', 'tomorrow': '🌅', 'future': '🔮', 'time': '⏱️',

    # Common podcast/interview phrases
    'podcast': '🎙️', 'show': '📺', 'video': '🎬', 'watch': '👀', 'listen': '👂',
    'story': '📖', 'truth': '💯', 'secret': '🤫', 'tip': '💡', 'advice': '📝'
}

# Sentiment-based emoji mappings
SENTIMENT_EMOJIS = {
    'positive': ['😊', '👍', '✨', '🎉', '⭐', '🔥', '💯', '👏'],
    'negative': ['😢', '⚠️', '❌', '📉', '💔', '😤'],
    'neutral': ['🤔', '💭', '📝', '👀', '💡']
}


def analyze_sentiment(text):
    """
    Simple sentiment analysis based on keyword matching.
    Returns: 'positive', 'negative', or 'neutral'
    """
    text_lower = text.lower()

    positive_words = {
        'good', 'great', 'amazing', 'awesome', 'fantastic', 'wonderful',
        'love', 'like', 'happy', 'excited', 'best', 'perfect', 'beautiful',
        'success', 'win', 'achieve', 'growth', 'profit', 'help', 'benefit'
    }

    negative_words = {
        'bad', 'terrible', 'worst', 'hate', 'dislike', 'sad', 'angry',
        'fail', 'wrong', 'problem', 'issue', 'difficult', 'hard', 'struggle',
        'lose', 'loss', 'waste', 'hurt', 'pain', 'wrong'
    }

    words = re.findall(r'\b\w+\b', text_lower)

    pos_count = sum(1 for w in words if w in positive_words)
    neg_count = sum(1 for w in words if w in negative_words)

    if pos_count > neg_count:
        return 'positive'
    elif neg_count > pos_count:
        return 'negative'
    else:
        return 'neutral'


def get_emoji_for_word(word):
    """Get emoji for a specific word if one exists."""
    word_lower = word.lower().strip('.,!?;:')
    return KEYWORD_EMOJIS.get(word_lower)


def suggest_emojis(words_with_timestamps, max_emojis=5):
    """
    Suggest emoji placements for a list of words with timestamps.

    Input format:
    [{'word': 'I', 'start': 0.0, 'end': 0.1, 'highlight': 'normal'}, ...]

    Output format:
    [{'emoji': '🔥', 'start': 1.5, 'end': 2.0, 'position': 'after_word'}, ...]
    """
    emoji_placements = []
    words_since_last_emoji = 0
    emojis_placed = 0

    # First pass: find keyword-based emojis (highest priority)
    for i, word_data in enumerate(words_with_timestamps):
        word = word_data['word']
        emoji = get_emoji_for_word(word)

        if emoji and emojis_placed < max_emojis:
            emoji_placements.append({
                'emoji': emoji,
                'start': word_data['end'],  # Appear after the word
                'end': word_data['end'] + 2.0,  # Stay for 2 seconds
                'position': 'above',
                'trigger_word': word
            })
            emojis_placed += 1
            words_since_last_emoji = 0

    # Second pass: add sentiment-based emojis every 3-5 words
    if emojis_placed < max_emojis:
        # Analyze sentiment of chunks
        chunk_size = 4  # Every 4 words on average
        chunk_start = 0

        while chunk_start < len(words_with_timestamps) and emojis_placed < max_emojis:
            chunk_end = min(chunk_start + chunk_size, len(words_with_timestamps))
            chunk_words = [words_with_timestamps[i]['word'] for i in range(chunk_start, chunk_end)]
            chunk_text = ' '.join(chunk_words)

            sentiment = analyze_sentiment(chunk_text)

            # Only add emoji if we have a clear sentiment and not too many emojis already
            if sentiment != 'neutral' and emojis_placed < max_emojis:
                # Check if we already placed an emoji in this chunk
                chunk_start_time = words_with_timestamps[chunk_start]['start']
                chunk_end_time = words_with_timestamps[chunk_end - 1]['end']

                already_has_emoji = any(
                    chunk_start_time <= p['start'] <= chunk_end_time
                    for p in emoji_placements
                )

                if not already_has_emoji:
                    import random
                    emoji_options = SENTIMENT_EMOJIS[sentiment]
                    selected_emoji = random.choice(emoji_options)

                    emoji_placements.append({
                        'emoji': selected_emoji,
                        'start': chunk_end_time,
                        'end': chunk_end_time + 1.5,
                        'position': 'above',
                        'sentiment': sentiment
                    })
                    emojis_placed += 1

            chunk_start = chunk_end
            words_since_last_emoji = 0

    # Sort by start time
    emoji_placements.sort(key=lambda x: x['start'])

    return emoji_placements


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No input provided'}))
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        with open(input_file, 'r') as f:
            words_data = json.load(f)

        result = suggest_emojis(words_data)
        print(json.dumps(result, indent=2))

    except FileNotFoundError:
        print(json.dumps({'error': f'File not found: {input_file}'}))
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON: {str(e)}'}))
        sys.exit(1)
