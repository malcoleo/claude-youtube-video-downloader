// server/ai/caption-generator.py
import json
import sys
import subprocess
import os
import re

def extract_audio_for_transcription(video_path, audio_path):
    """Extract audio from video in a format suitable for transcription"""
    cmd = [
        'ffmpeg',
        '-i', video_path,
        '-ab', '16k',
        '-ac', '1',
        '-ar', '16000',
        '-vn', audio_path,
        '-y'
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error extracting audio: {e}", file=sys.stderr)
        return False

def generate_captions_stub(video_path):
    """
    Stub function to simulate caption generation.
    In a real implementation, this would use a service like OpenAI Whisper
    or another speech-to-text API to transcribe the video.
    """

    # This is a simplified simulation - in reality, we'd call an STT API
    # For demo purposes, we'll return some sample captions based on video length

    # Get video duration
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        video_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        duration = float(result.stdout.strip())

        # Generate sample captions based on duration
        captions = []
        for i in range(0, int(duration), 10):  # Add a caption every 10 seconds
            captions.append({
                'start': i,
                'end': min(i + 5, duration),
                'text': f'Sample caption for section around {i}-{min(i + 5, duration)} seconds',
                'sentiment': 'neutral'
            })

        return captions
    except Exception as e:
        print(f"Error getting video duration: {e}", file=sys.stderr)
        return []

def analyze_engagement_factors(video_path):
    """
    Analyze factors that could influence engagement
    """
    # Get video information using ffprobe
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        video_path
    ]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        probe_data = json.loads(result.stdout)

        analysis = {
            'length_analysis': analyze_length(probe_data),
            'quality_indicators': analyze_quality(probe_data),
            'engagement_suggestions': generate_engagement_suggestions(probe_data)
        }

        return analysis
    except Exception as e:
        print(f"Error analyzing video: {e}", file=sys.stderr)
        return {}

def analyze_length(probe_data):
    """Analyze video length for platform suitability"""
    duration = float(probe_data['format'].get('duration', 0))

    recommendations = []

    if duration > 60:
        recommendations.append("Video is quite long for short-form platforms. Consider breaking it into multiple clips.")
    elif duration < 3:
        recommendations.append("Video might be too short to generate engagement. Consider extending.")
    else:
        recommendations.append("Video length is appropriate for short-form content.")

    return {
        'duration_seconds': duration,
        'duration_formatted': f"{int(duration // 60)}:{int(duration % 60):02d}",
        'recommendations': recommendations
    }

def analyze_quality(probe_data):
    """Analyze video quality indicators"""
    streams = probe_data.get('streams', [])
    video_stream = next((stream for stream in streams if stream['codec_type'] == 'video'), None)

    if not video_stream:
        return {'error': 'No video stream found'}

    width = int(video_stream.get('width', 0))
    height = int(video_stream.get('height', 0))
    bitrate = int(probe_data['format'].get('bit_rate', 0))

    quality_indicators = {
        'resolution': f'{width}x{height}',
        'is_hd': width >= 1280 and height >= 720,
        'aspect_ratio': round(width / height, 2),
        'estimated_bitrate_kbps': bitrate // 1000 if bitrate else 'unknown'
    }

    recommendations = []

    if width < 720 or height < 720:
        recommendations.append("Resolution is below HD. Higher resolution videos tend to perform better.")
    if quality_indicators['aspect_ratio'] != 0.56 and quality_indicators['aspect_ratio'] != 1.78:  # Not 9:16 or 16:9
        recommendations.append("Aspect ratio is not optimal for mobile viewing. Consider cropping to 9:16 for social platforms.")

    quality_indicators['recommendations'] = recommendations
    return quality_indicators

def generate_engagement_suggestions(probe_data):
    """Generate engagement-focused suggestions"""
    suggestions = [
        "Add captions for accessibility and silent viewing",
        "Include a compelling hook in the first 3 seconds",
        "Use trending sounds or music to increase discoverability",
        "End with a clear call-to-action to encourage engagement"
    ]

    # Check if video has audio
    streams = probe_data.get('streams', [])
    has_audio = any(stream['codec_type'] == 'audio' for stream in streams)

    if not has_audio:
        suggestions.append("Consider adding background music to enhance the video")
    else:
        suggestions.append("Ensure audio levels are balanced and clear")

    return suggestions

def analyze_video_content(video_path):
    """Main function to analyze video content for short creation"""
    try:
        # Generate sample captions (stub implementation)
        captions = generate_captions_stub(video_path)

        # Analyze engagement factors
        engagement_analysis = analyze_engagement_factors(video_path)

        result = {
            'captions': captions,
            'engagement_analysis': engagement_analysis,
            'success': True
        }

        return result
    except Exception as e:
        print(f"Error in video content analysis: {e}", file=sys.stderr)
        return {
            'error': str(e),
            'success': False
        }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python caption-generator.py <video_path>", file=sys.stderr)
        sys.exit(1)

    video_path = sys.argv[1]
    analysis_result = analyze_video_content(video_path)
    print(json.dumps(analysis_result))