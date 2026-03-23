#!/usr/bin/env python3
"""
Face-based crop detector for vertical video export.
Analyzes video frames to find speaker position and returns optimal crop coordinates.

Usage: python3 face-crop-detector.py <video_path> [start_time] [duration]
Output: JSON with crop parameters {x, y, width, height, speaker_position}
"""

import sys
import json
import cv2
import numpy as np

# Load Haar cascade for face detection
FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
EYE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

def detect_faces(frame):
    """Detect faces in a frame and return bounding boxes."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = FACE_CASCADE.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(50, 50),
        maxSize=(500, 500)
    )
    return faces

def analyze_video_crop(video_path, start_time=0, duration=5):
    """
    Analyze video to find optimal crop region for vertical format.
    Samples frames and finds the most common speaker position.

    Returns crop parameters for 9:16 aspect ratio.
    """
    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        return {"error": f"Cannot open video: {video_path}"}

    # Get video properties
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = int(cap.get(cv2.CAP_PROP_FPS))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Calculate frame range to sample
    start_frame = int(start_time * fps)
    sample_frames = int(duration * fps)
    end_frame = min(start_frame + sample_frames, total_frames)

    # Sample every N frames to avoid processing too many
    sample_step = max(1, (end_frame - start_frame) // 30)

    face_positions = []

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    for frame_num in range(start_frame, end_frame, sample_step):
        ret, frame = cap.read()
        if not ret:
            break

        faces = detect_faces(frame)

        for (x, y, w, h) in faces:
            # Calculate face center
            center_x = x + w // 2
            center_y = y + h // 2
            face_positions.append({
                'x': center_x,
                'y': center_y,
                'width': w,
                'height': h,
                'frame': frame_num
            })

    cap.release()

    if not face_positions:
        # No faces detected - fall back to center crop
        return {
            "crop_type": "center",
            "source_width": width,
            "source_height": height,
            "target_aspect": "9:16",
            "crop_x": (width - int(height * 9/16)) // 2,
            "crop_y": 0,
            "crop_width": int(height * 9/16),
            "crop_height": height,
            "message": "No faces detected - using center crop"
        }

    # Find the most common horizontal position (left, center, or right speaker)
    avg_x = sum(f['x'] for f in face_positions) / len(face_positions)
    avg_y = sum(f['y'] for f in face_positions) / len(face_positions)

    # Determine speaker position
    if avg_x < width * 0.4:
        speaker_position = "left"
    elif avg_x > width * 0.6:
        speaker_position = "right"
    else:
        speaker_position = "center"

    # Calculate crop region for 9:16 aspect ratio
    # Crop width should be 9/16 of height
    crop_height = height
    crop_width = int(height * 9 / 16)

    # Center crop on the speaker's horizontal position
    crop_x = int(avg_x - crop_width / 2)

    # Clamp to video bounds
    if crop_x < 0:
        crop_x = 0
    elif crop_x + crop_width > width:
        crop_x = width - crop_width

    # Vertical crop - center on speaker's average Y position
    # For head-and-shoulders shot, we want speaker's face in upper third
    crop_y = int(avg_y - crop_height * 0.3)

    # Clamp vertical crop
    if crop_y < 0:
        crop_y = 0
    elif crop_y + crop_height > height:
        crop_y = height - crop_height

    return {
        "crop_type": "face_track",
        "speaker_position": speaker_position,
        "faces_detected": len(face_positions),
        "source_width": width,
        "source_height": height,
        "target_aspect": "9:16",
        "crop_x": crop_x,
        "crop_y": crop_y,
        "crop_width": crop_width,
        "crop_height": crop_height,
        "avg_face_x": avg_x,
        "avg_face_y": avg_y,
        "ffmpeg_crop_filter": f"crop={crop_width}:{crop_height}:{crop_x}:{crop_y},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python3 face-crop-detector.py <video_path> [start_time] [duration]"}))
        sys.exit(1)

    video_path = sys.argv[1]
    start_time = float(sys.argv[2]) if len(sys.argv) > 2 else 0
    duration = float(sys.argv[3]) if len(sys.argv) > 3 else 5

    result = analyze_video_crop(video_path, start_time, duration)
    print(json.dumps(result))
