#!/usr/bin/env python3
"""
Highlight Detector for Video Clips
Extracts audio, motion, and scene change highlights from video files.
"""
import json
import sys
import subprocess
import numpy as np
from scipy.io import wavfile
import cv2
import os

def extract_audio(video_path, audio_path):
    """Extract audio from video using FFmpeg"""
    cmd = [
        'ffmpeg',
        '-i', video_path,
        '-ab', '160k',
        '-ac', '2',
        '-ar', '44100',
        '-vn', audio_path,
        '-y'  # Overwrite output file
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error extracting audio: {e}", file=sys.stderr)
        return False

def analyze_audio_highlights(audio_path, threshold_multiplier=1.5):
    """Analyze audio for highlights based on volume changes"""
    try:
        sample_rate, audio_data = wavfile.read(audio_path)

        # Convert to mono if stereo
        if len(audio_data.shape) > 1:
            audio_data = np.mean(audio_data, axis=1)

        # Calculate RMS energy in chunks
        chunk_size = int(sample_rate * 0.5)  # 0.5 second chunks
        rms_values = []

        for i in range(0, len(audio_data), chunk_size):
            chunk = audio_data[i:i+chunk_size]
            rms = np.sqrt(np.mean(chunk**2))
            rms_values.append(rms)

        # Calculate average RMS and determine threshold
        avg_rms = np.mean(rms_values)
        std_rms = np.std(rms_values)
        threshold = avg_rms + (threshold_multiplier * std_rms)

        # Identify high energy segments
        highlights = []
        for i, rms in enumerate(rms_values):
            if rms > threshold:
                start_time = i * 0.5  # 0.5 second chunks
                end_time = start_time + 0.5
                highlights.append({
                    'start': round(start_time, 2),
                    'end': round(end_time, 2),
                    'rms': round(rms, 2),
                    'type': 'high_volume'
                })

        # Merge adjacent high energy segments
        merged_highlights = []
        if highlights:
            current = highlights[0]

            for highlight in highlights[1:]:
                if highlight['start'] <= current['end']:
                    # Merge with current highlight
                    current['end'] = highlight['end']
                    current['rms'] = max(current['rms'], highlight['rms'])
                else:
                    # Add current highlight to merged list
                    merged_highlights.append(current)
                    current = highlight

            merged_highlights.append(current)

        return merged_highlights
    except Exception as e:
        print(f"Error analyzing audio: {e}", file=sys.stderr)
        return []

def analyze_video_motion(video_path):
    """Analyze video for motion highlights"""
    try:
        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            print("Error opening video file", file=sys.stderr)
            return []

        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Capture first frame for comparison
        ret, prev_frame = cap.read()
        if not ret:
            cap.release()
            return []

        prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
        motion_scores = []
        frame_times = []

        for i in range(1, frame_count):
            ret, frame = cap.read()
            if not ret:
                break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # Calculate optical flow
            flow = cv2.calcOpticalFlowFarneback(
                prev_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0
            )

            # Calculate motion magnitude
            mag, _ = cv2.cartToPolar(flow[..., 0], flow[..., 1])
            motion_score = np.mean(mag)

            time_stamp = i / fps
            motion_scores.append(motion_score)
            frame_times.append(time_stamp)

            prev_gray = gray

        cap.release()

        # Find peaks in motion scores
        highlights = []
        avg_motion = np.mean(motion_scores)
        std_motion = np.std(motion_scores)
        motion_threshold = avg_motion + (1.2 * std_motion)

        for i, score in enumerate(motion_scores):
            if score > motion_threshold:
                start_time = frame_times[i]
                end_time = start_time + (1.0 / fps) * 30  # 1-second segments
                highlights.append({
                    'start': round(start_time, 2),
                    'end': round(end_time, 2),
                    'motion_score': round(score, 2),
                    'type': 'motion'
                })

        # Merge adjacent motion segments
        merged_highlights = []
        if highlights:
            current = highlights[0]

            for highlight in highlights[1:]:
                if highlight['start'] <= current['end'] + 1.0:  # Allow 1 sec gap
                    # Merge with current highlight
                    current['end'] = highlight['end']
                    current['motion_score'] = max(current['motion_score'], highlight['motion_score'])
                else:
                    # Add current highlight to merged list
                    merged_highlights.append(current)
                    current = highlight

            merged_highlights.append(current)

        return merged_highlights
    except Exception as e:
        print(f"Error analyzing video motion: {e}", file=sys.stderr)
        return []

def analyze_scene_changes(video_path):
    """Analyze video for scene changes"""
    try:
        cap = cv2.VideoCapture(video_path)

        if not cap.isOpened():
            print("Error opening video file", file=sys.stderr)
            return []

        prev_frame = None
        frame_idx = 0
        fps = cap.get(cv2.CAP_PROP_FPS)
        scene_changes = []

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            # Convert to grayscale
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            if prev_frame is not None:
                # Calculate difference between frames
                diff = cv2.absdiff(prev_frame, gray)
                diff_score = np.mean(diff)

                # Detect significant differences indicating scene changes
                if diff_score > 30:  # Threshold for scene change
                    time_stamp = frame_idx / fps
                    scene_changes.append({
                        'time': round(time_stamp, 2),
                        'score': round(diff_score, 2),
                        'type': 'scene_change'
                    })

            prev_frame = gray
            frame_idx += 1

        cap.release()

        # Filter scene changes to avoid too many close events
        filtered_changes = []
        last_time = -10  # Minimum 10 seconds between scene changes

        for change in scene_changes:
            if change['time'] - last_time > 10:  # At least 10 seconds apart
                filtered_changes.append(change)
                last_time = change['time']

        return filtered_changes
    except Exception as e:
        print(f"Error analyzing scene changes: {e}", file=sys.stderr)
        return []

def detect_highlights(video_path):
    """Main function to detect highlights using multiple methods"""
    # Create temporary audio file
    audio_path = f"/tmp/temp_audio_{os.getpid()}.wav"

    try:
        # Extract audio
        if not extract_audio(video_path, audio_path):
            return {"error": "Could not extract audio from video"}

        # Analyze different aspects
        audio_highlights = analyze_audio_highlights(audio_path)
        motion_highlights = analyze_video_motion(video_path)
        scene_changes = analyze_scene_changes(video_path)

        # Combine all highlights
        all_highlights = {
            'audio_highlights': audio_highlights,
            'motion_highlights': motion_highlights,
            'scene_changes': scene_changes
        }

        # Delete temporary audio file
        if os.path.exists(audio_path):
            os.remove(audio_path)

        return all_highlights
    except Exception as e:
        # Ensure temp file is deleted in case of error
        if os.path.exists(audio_path):
            os.remove(audio_path)

        print(f"Error detecting highlights: {e}", file=sys.stderr)
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python highlight-detector.py <video_path>", file=sys.stderr)
        sys.exit(1)

    video_path = sys.argv[1]
    highlights = detect_highlights(video_path)
    print(json.dumps(highlights))