#!/usr/bin/env python3
"""
QA Detector for Podcast Clips
==============================
Detects Question→Answer pairs from Whisper transcript with speaker diarization.

Usage:
    python3 qa-detector.py transcript.json

Input format (Whisper output with diarization):
{
  "segments": [
    {
      "speaker": "SPEAKER_00",
      "start": 0.0,
      "end": 5.2,
      "text": "Can you explain how your company works?"
    },
    {
      "speaker": "SPEAKER_01",
      "start": 5.5,
      "end": 15.3,
      "text": "Sure! We help podcasters turn their long episodes into short clips..."
    }
  ]
}

Output format:
{
  "qa_pairs": [
    {
      "question_start": 0.0,
      "question_end": 5.2,
      "answer_start": 5.5,
      "answer_end": 15.3,
      "question_text": "Can you explain how your company works?",
      "answer_text": "Sure! We help podcasters...",
      "question_speaker": "SPEAKER_00",
      "answer_speaker": "SPEAKER_01",
      "score": 85,
      "reasons": ["question_pattern", "speaker_change", "good_length"]
    }
  ]
}
"""

import json
import re
import sys
from typing import List, Dict, Any, Optional, Tuple

# Question detection patterns
QUESTION_PATTERNS = [
    # WH-questions
    r'\b(what|why|how|when|where|who|which)\b.*\?',
    r'\b(what|why|how|when|where|who|which)\b.*[?!]',
    # Yes/No questions
    r'\b(do|does|did|is|are|was|were|can|could|will|would|should|may|might)\b.*\?',
    # Invitation questions
    r'\b(tell me|explain|describe|share)\b.*',
    r'\bcan you\b.*',
    r'\bcould you\b.*',
    r'\bwould you\b.*',
    r'\bdo you\b.*',
]

class QADetector:
    def __init__(self, min_question_length: int = 10, max_clip_duration: int = 90):
        self.min_question_length = min_question_length
        self.max_clip_duration = max_clip_duration
        self.question_regexes = [re.compile(p, re.IGNORECASE) for p in QUESTION_PATTERNS]

    def is_question(self, text: str) -> bool:
        """Check if text contains a question pattern."""
        # Ends with question mark
        if text.strip().endswith('?'):
            return True
        # Matches question patterns
        for regex in self.question_regexes:
            if regex.search(text):
                return True
        return False

    def calculate_score(self, question_seg: Dict, answer_seg: Dict) -> Tuple[int, List[str]]:
        """
        Calculate quality score for a Q&A pair.
        Returns (score 0-100, list of reasons).
        """
        score = 50  # Base score
        reasons = []

        # Question detected (20 points)
        if self.is_question(question_seg['text']):
            score += 20
            reasons.append('question_pattern')

        # Speaker change (15 points) - indicates actual Q&A dynamic
        if question_seg.get('speaker') != answer_seg.get('speaker'):
            score += 15
            reasons.append('speaker_change')

        # Good duration (30s-90s is ideal for clips)
        duration = answer_seg['end'] - question_seg['start']
        if 30 <= duration <= 90:
            score += 20
            reasons.append('good_length')
        elif 15 <= duration < 30:
            score += 10
            reasons.append('short_but_usable')
        elif 90 < duration <= 120:
            score += 5
            reasons.append('long_but_usable')

        # Answer has substantive content (more than 20 words)
        word_count = len(answer_seg['text'].split())
        if word_count >= 20:
            score += 15
            reasons.append('substantive_answer')
        elif word_count >= 10:
            score += 5

        # Question is reasonably long (not just "Really?")
        q_word_count = len(question_seg['text'].split())
        if q_word_count >= 5:
            score += 10
            reasons.append('clear_question')

        return min(score, 100), reasons

    def detect_qa_pairs(self, segments: List[Dict]) -> List[Dict]:
        """
        Detect Q&A pairs from transcript segments.

        Algorithm:
        1. Find potential questions (segments ending with ? or matching patterns)
        2. For each question, find the following answer segment
        3. Score the pair based on quality signals
        4. Return top Q&A pairs sorted by score
        """
        qa_pairs = []

        if not segments:
            return qa_pairs

        i = 0
        while i < len(segments):
            seg = segments[i]

            # Check if this segment is a question
            if self.is_question(seg['text']) and len(seg['text']) >= self.min_question_length:
                # Found a question - now find the answer
                # Collect ALL consecutive segments from the other speaker as the answer
                if i + 1 < len(segments):
                    answer_start = segments[i + 1]['start']
                    answer_end = segments[i + 1]['end']
                    answer_text = segments[i + 1]['text']
                    answer_speaker = segments[i + 1].get('speaker', 'UNKNOWN')
                    answer_segments = [segments[i + 1]]

                    # Look ahead and collect all consecutive answer segments
                    # (segments that are not questions and from the same speaker)
                    j = i + 2
                    while j < len(segments):
                        next_seg = segments[j]
                        # Stop if we hit a question, or if speaker changed (new speaker might be answering)
                        if self.is_question(next_seg['text']):
                            break
                        if next_seg.get('speaker') != answer_speaker:
                            # Different speaker - could be a response, check if it's a continuation
                            # Only include if it's very close in time (within 2 seconds)
                            gap = next_seg['start'] - answer_end
                            if gap <= 2.0:
                                answer_segments.append(next_seg)
                                answer_end = next_seg['end']
                                answer_text += ' ' + next_seg['text']
                            else:
                                break
                        else:
                            # Same speaker, include this segment
                            answer_segments.append(next_seg)
                            answer_end = next_seg['end']
                            answer_text += ' ' + next_seg['text']
                        j += 1

                    # Skip if we only have the single segment and it's a question
                    if len(answer_segments) == 0 or self.is_question(answer_segments[0]['text']):
                        # No valid answer found, just move past the question
                        i += 1
                    else:
                        score, reasons = self.calculate_score(seg, {
                            'start': answer_start,
                            'end': answer_end,
                            'text': answer_text,
                            'speaker': answer_speaker
                        })

                        qa_pair = {
                            'question_start': seg['start'],
                            'question_end': seg['end'],
                            'answer_start': answer_start,
                            'answer_end': answer_end,
                            'question_text': seg['text'].strip(),
                            'answer_text': answer_text.strip(),
                            'question_speaker': seg.get('speaker', 'UNKNOWN'),
                            'answer_speaker': answer_speaker,
                            'score': score,
                            'reasons': reasons,
                            'priority': 'high' if score >= 70 else 'medium' if score >= 50 else 'low'
                        }

                        # Filter: only include if score is decent
                        if score >= 40:
                            qa_pairs.append(qa_pair)

                        # Skip to the last answer segment we processed
                        i = j
            else:
                i += 1

        # Sort by score descending
        qa_pairs.sort(key=lambda x: x['score'], reverse=True)

        return qa_pairs

    def merge_nearby_segments(self, segments: List[Dict], max_gap: float = 2.0) -> List[Dict]:
        """
        Merge segments that are very close together (within max_gap seconds).
        This helps when Whisper splits a continuous utterance.

        Handles two cases:
        1. Stereo audio with speaker labels (SPEAKER_00, SPEAKER_01, etc.)
        2. Mono audio without speaker labels (fallback to pause-based segmentation)
        """
        if not segments:
            return segments

        merged = [segments[0]]

        for seg in segments[1:]:
            last = merged[-1]
            gap = seg['start'] - last['end']

            # Check if speaker labels exist and are valid
            last_speaker = last.get('speaker', 'UNKNOWN')
            curr_speaker = seg.get('speaker', 'UNKNOWN')
            has_speaker_labels = last_speaker != 'UNKNOWN' and curr_speaker != 'UNKNOWN'

            # Same speaker (or no labels) and close together - merge
            if gap <= max_gap and (not has_speaker_labels or curr_speaker == last_speaker):
                last['end'] = seg['end']
                last['text'] = last['text'] + ' ' + seg['text']
            else:
                merged.append(seg)

        return merged

    def assign_speakers_by_turn(self, segments: List[Dict]) -> List[Dict]:
        """
        Assign alternating speakers when diarization failed (mono audio).
        Assumes conversation follows a turn-taking pattern.
        This is a fallback when Whisper's --diarize doesn't work (requires stereo).
        """
        if not segments:
            return segments

        # Check if speaker labels are already assigned
        has_labels = any(seg.get('speaker', 'UNKNOWN') not in ['UNKNOWN', '?'] for seg in segments)
        if has_labels:
            return segments

        # Assign alternating speakers based on segment turns
        for i, seg in enumerate(segments):
            seg['speaker'] = f'SPEAKER_{i % 2:02d}'

        return segments


def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No input file provided'}))
        sys.exit(1)

    input_file = sys.argv[1]

    try:
        # Read transcript
        with open(input_file, 'r') as f:
            transcript = json.load(f)

        segments = transcript.get('segments', [])

        if not segments:
            print(json.dumps({
                'qa_pairs': [],
                'message': 'No segments found in transcript'
            }))
            return

        # Initialize detector
        detector = QADetector()

        # Assign speakers by turn if diarization failed (mono audio fallback)
        segments = detector.assign_speakers_by_turn(segments)

        # Merge nearby segments first
        merged_segments = detector.merge_nearby_segments(segments)

        # Detect Q&A pairs
        qa_pairs = detector.detect_qa_pairs(merged_segments)

        # Output results
        output = {
            'qa_pairs': qa_pairs,
            'total_segments': len(segments),
            'merged_segments': len(merged_segments),
            'qa_pairs_found': len(qa_pairs),
            'message': f'Found {len(qa_pairs)} Q&A pairs'
        }

        print(json.dumps(output, indent=2))

    except FileNotFoundError:
        print(json.dumps({'error': f'File not found: {input_file}'}))
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON: {str(e)}'}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'error': f'Unexpected error: {str(e)}'}))
        sys.exit(1)


if __name__ == '__main__':
    main()
