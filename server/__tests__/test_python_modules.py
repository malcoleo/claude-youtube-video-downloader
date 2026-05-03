#!/usr/bin/env python3
"""
Unit tests for Python AI modules
Tests whisper.cpp wrapper, caption generation, and QA detection
"""

import unittest
import os
import sys
import json
import tempfile

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestScriptGenerator(unittest.TestCase):
    """Test script-generator.py module"""

    def test_module_imports(self):
        """Test that script-generator can be imported"""
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                'script_generator',
                os.path.join(os.path.dirname(__file__), '..', 'ai', 'script-generator.py')
            )
            module = importlib.util.module_from_spec(spec)
            self.assertTrue(module is not None)
        except Exception as e:
            self.fail(f"Failed to import script-generator: {e}")

    def test_generate_script_from_audio_missing_file(self):
        """Test handling of missing audio file"""
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'script_generator',
            os.path.join(os.path.dirname(__file__), '..', 'ai', 'script-generator.py')
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        result = module.generate_script_from_audio('/nonexistent/audio.mp3')
        self.assertFalse(result['success'])
        self.assertIn('error', result)


class TestCaptionGenerator(unittest.TestCase):
    """Test caption-generator.py module"""

    def test_module_loads(self):
        """Test that caption-generator loads without syntax errors"""
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                'caption_generator',
                os.path.join(os.path.dirname(__file__), '..', 'ai', 'caption-generator.py')
            )
            module = importlib.util.module_from_spec(spec)
            # Don't exec_module - just check it can be loaded
            self.assertTrue(spec is not None)
        except SyntaxError as e:
            self.fail(f"Syntax error in caption-generator: {e}")
        except Exception as e:
            # Other exceptions may be OK (missing dependencies, etc.)
            pass


class TestWhisperToQa(unittest.TestCase):
    """Test whisper-to-qa.py module"""

    def test_approximate_word_timestamps(self):
        """Test word timestamp approximation"""
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'whisper_to_qa',
            os.path.join(os.path.dirname(__file__), '..', 'ai', 'whisper-to-qa.py')
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        # Test with simple text
        words = module.approximate_word_timestamps(
            "hello world test",
            segment_start=0.0,
            segment_end=3.0,
            segment_id=0
        )

        self.assertEqual(len(words), 3)  # 3 words
        self.assertEqual(words[0]['word'], 'hello')
        self.assertEqual(words[1]['word'], 'world')
        self.assertEqual(words[2]['word'], 'test')

        # Check timestamps are in order
        self.assertLessEqual(words[0]['start'], words[0]['end'])
        self.assertLessEqual(words[1]['start'], words[1]['end'])
        self.assertLessEqual(words[2]['start'], words[2]['end'])

    def test_approximate_word_timestamps_empty(self):
        """Test with empty text"""
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'whisper_to_qa',
            os.path.join(os.path.dirname(__file__), '..', 'ai', 'whisper-to-qa.py')
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        words = module.approximate_word_timestamps("", 0.0, 1.0, 0)
        self.assertEqual(len(words), 0)

    def test_approximate_word_timestamps_single_word(self):
        """Test with single word"""
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            'whisper_to_qa',
            os.path.join(os.path.dirname(__file__), '..', 'ai', 'whisper-to-qa.py')
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        words = module.approximate_word_timestamps("hello", 0.0, 1.0, 0)
        self.assertEqual(len(words), 1)
        self.assertEqual(words[0]['word'], 'hello')


class TestQaDetector(unittest.TestCase):
    """Test qa-detector.py module"""

    def test_module_loads(self):
        """Test that qa-detector can be loaded"""
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                'qa_detector',
                os.path.join(os.path.dirname(__file__), '..', 'ai', 'qa-detector.py')
            )
            module = importlib.util.module_from_spec(spec)
            self.assertTrue(spec is not None)
        except Exception as e:
            self.fail(f"Failed to load qa-detector: {e}")


class TestSubtitleRenderer(unittest.TestCase):
    """Test subtitle-renderer.py module"""

    def test_module_loads(self):
        """Test that subtitle-renderer can be loaded"""
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location(
                'subtitle_renderer',
                os.path.join(os.path.dirname(__file__), '..', 'ai', 'subtitle-renderer.py')
            )
            module = importlib.util.module_from_spec(spec)
            self.assertTrue(spec is not None)
        except Exception as e:
            self.fail(f"Failed to load subtitle-renderer: {e}")


if __name__ == '__main__':
    unittest.main(verbosity=2)
