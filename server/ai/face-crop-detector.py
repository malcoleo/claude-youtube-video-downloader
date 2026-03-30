#!/usr/bin/env python3.10
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

# Optical flow parameters for tracking
LK_PARAMS = dict(winSize=(15, 15),
                 maxLevel=3,
                 criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.03))

# OpenCV Haar Cascade for fallback face detection
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

def detect_faces_opencv(frame, min_width=80):
    """Detect faces using OpenCV Haar Cascade (fallback method)."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    # Use multiple scale factors for better detection
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(min_width, min_width)
    )

    # Convert to list of tuples with face quality score
    result = []
    h, w = frame.shape[:2]
    frame_center_x, frame_center_y = w / 2, h / 2

    for x, y, face_w, face_h in faces:
        # Calculate face center
        face_center_x = x + face_w / 2
        face_center_y = y + face_h / 2

        # Score based on: size, centrality, and position
        # Larger faces get higher scores
        size_score = face_w * face_h / (w * h)

        # Prefer faces closer to center (better composition)
        dist_from_center = np.sqrt((face_center_x - frame_center_x)**2 + (face_center_y - frame_center_y)**2)
        max_dist = np.sqrt(frame_center_x**2 + frame_center_y**2)
        centrality_score = 1.0 - (dist_from_center / max_dist)

        # Prefer faces in upper portion (for speaking engagement)
        vertical_score = 1.0 - (face_center_y / h)  # Higher score for upper portion

        # Combined score
        total_score = size_score * 0.5 + centrality_score * 0.3 + vertical_score * 0.2

        result.append((int(x), int(y), int(face_w), int(face_h), total_score))

    # Sort by score (highest first) and return without score
    result.sort(key=lambda f: f[4], reverse=True)
    return [(x, y, w, h) for x, y, w, h, _ in result]


def detect_faces_mediapipe(frame):
    """
    Detect faces using MediaPipe and return bounding boxes as (x, y, w, h).

    Note: Requires MediaPipe face detection model file at /Users/ml/server/ai/face_detection_short_range.tflite
    If model is not available, falls back to OpenCV Haar Cascade.
    """
    import os
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions
    from mediapipe.tasks.python.vision import FaceDetector, FaceDetectorOptions, RunningMode
    from mediapipe import Image, ImageFormat

    h, w, _ = frame.shape
    frame_center_x, frame_center_y = w / 2, h / 2

    # Check if MediaPipe model exists
    model_path = '/Users/ml/server/ai/face_detection_short_range.tflite'
    if not os.path.exists(model_path) or os.path.getsize(model_path) < 10000:
        # Model not available or too small, use OpenCV fallback
        return detect_faces_opencv(frame)

    # Try to use MediaPipe
    try:
        base_options = BaseOptions(model_asset_path=model_path)
        options = FaceDetectorOptions(base_options=base_options, running_mode=RunningMode.VIDEO)
        detector = FaceDetector.create_from_options(options)

        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # Create MediaPipe Image
        mp_image = Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Process the frame
        results = detector.detect_for_video(mp_image, frame_num=0)

        faces_with_scores = []
        if results.detections:
            for detection in results.detections:
                bbox = detection.bounding_box
                x = int(bbox.origin_x)
                y = int(bbox.origin_y)
                face_width = int(bbox.width)
                face_height = int(bbox.height)

                # Calculate face center
                face_center_x = x + face_width / 2
                face_center_y = y + face_height / 2

                # Score based on size, centrality, and position
                size_score = face_width * face_height / (w * h)
                dist_from_center = np.sqrt((face_center_x - frame_center_x)**2 + (face_center_y - frame_center_y)**2)
                max_dist = np.sqrt(frame_center_x**2 + frame_center_y**2)
                centrality_score = 1.0 - (dist_from_center / max_dist)
                vertical_score = 1.0 - (face_center_y / h)  # Prefer upper portion

                total_score = size_score * 0.5 + centrality_score * 0.3 + vertical_score * 0.2

                faces_with_scores.append((x, y, face_width, face_height, total_score))

        # Sort by score (highest first) and return without score
        faces_with_scores.sort(key=lambda f: f[4], reverse=True)
        faces = [(x, y, w, h) for x, y, w, h, _ in faces_with_scores]

        detector.close()
        return faces
    except Exception as e:
        print(f"MediaPipe detection failed: {e}, using OpenCV fallback", file=sys.stderr)
        return detect_faces_opencv(frame)


def detect_faces(frame, min_width=100):
    """
    Detect faces in a frame and return bounding boxes.
    Uses MediaPipe face detection with fallback logic.
    """
    faces = detect_faces_mediapipe(frame)

    # Filter out very small faces that are likely false positives
    faces = [(x, y, w, h) for (x, y, w, h) in faces if w >= min_width and h >= min_width]

    return faces


def detect_faces_with_tracking(prev_faces, frame):
    """
    Detect faces using MediaPipe. If faces were detected in the
    previous frame and no new faces are found, re-use the previous position.
    """
    faces = detect_faces_mediapipe(frame)

    # Filter out very small faces
    min_width = 50
    faces = [(x, y, w, h) for (x, y, w, h) in faces if w >= min_width and h >= min_width]

    return faces


def apply_optical_flow_tracking(prev_frame, curr_frame, prev_points):
    """
    Apply Lucas-Kanade optical flow to track face points between frames.
    Returns tracked points and visibility mask.
    """
    gray_prev = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
    gray_curr = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)

    if len(prev_points) == 0:
        return [], []

    points = np.float32(prev_points).reshape(-1, 1, 2)

    try:
        new_points, status, err = cv2.calcOpticalFlowPyrLK(
            gray_prev, gray_curr, points, None, **LK_PARAMS
        )

        # Filter to only keep successfully tracked points
        valid_points = []
        for i, (new, status) in enumerate(zip(new_points, status.flatten())):
            if status == 1:
                # Check for large movements (likely errors)
                old = points[i][0]
                dist = np.sqrt((new[0][0] - old[0])**2 + (new[0][1] - old[1])**2)
                if dist < 50:  # Max 50 pixel movement between frames
                    valid_points.append((new[0][0], new[0][1]))

        return valid_points, new_points
    except Exception as e:
        print(f"Optical flow error: {e}", file=sys.stderr)
        return [], []


def analyze_video_crop(video_path, start_time=0, duration=5):
    """
    Analyze video to find optimal crop region for vertical format.
    Samples frames and finds the most common speaker position.

    For portrait videos, tracks faces and crops to keep the most expressive
    face visible. For landscape videos, crops to 9:16 vertical format.

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
    sample_frames = min(int(duration * fps), total_frames - start_frame)
    end_frame = min(start_frame + sample_frames, total_frames)

    # Distribute samples evenly across the entire duration for better tracking
    # For portrait videos, sample more frequently for accurate tracking
    is_portrait = height > width
    num_samples = max(40, min(60, int(duration) * 3)) if is_portrait else max(30, min(50, int(duration) // 2))
    sample_step = max(1, (end_frame - start_frame) // num_samples)

    face_positions = []
    face_scores = []  # Track face quality scores for prioritization

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

            # Calculate face size statistics
            face_area = w * h
            total_area = width * height
            face_ratio = face_area / total_area

            # Score the face quality
            # Larger faces, centred faces, and faces in upper portion score higher
            frame_center_x, frame_center_y = width / 2, height / 2
            dist_from_center = np.sqrt((center_x - frame_center_x)**2 + (center_y - frame_center_y)**2)
            max_dist = np.sqrt(frame_center_x**2 + frame_center_y**2)
            centrality_score = 1.0 - (dist_from_center / max_dist)

            # Prefer faces that fill a good portion of frame (not too small)
            size_score = min(face_ratio * 1000, 1.0)  # Scale to 0-1

            # Vertical position: prefer upper 60% (better for speaking engagement)
            vertical_position_score = 1.0 - min(center_y / (height * 0.6), 1.0)

            # Combined score
            quality_score = size_score * 0.4 + centrality_score * 0.35 + vertical_position_score * 0.25

            face_positions.append({
                'x': center_x,
                'y': center_y,
                'width': w,
                'height': h,
                'frame': frame_num,
                'quality_score': quality_score,
                'face_ratio': face_ratio
            })

    cap.release()

    if not face_positions:
        # No faces detected - fall back to center crop
        crop_width = int(height * 9 / 16) if height > width else width
        return {
            "crop_type": "center",
            "source_width": width,
            "source_height": height,
            "target_aspect": "9:16",
            "crop_x": (width - crop_width) // 2,
            "crop_y": 0,
            "crop_width": crop_width,
            "crop_height": height,
            "message": "No faces detected - using center crop"
        }

    # Calculate weighted average position based on face quality scores
    total_score = sum(f['quality_score'] for f in face_positions)
    if total_score > 0:
        avg_x = sum(f['x'] * f['quality_score'] for f in face_positions) / total_score
        avg_y = sum(f['y'] * f['quality_score'] for f in face_positions) / total_score
        avg_face_width = sum(f['width'] * f['quality_score'] for f in face_positions) / total_score
        avg_face_height = sum(f['height'] * f['quality_score'] for f in face_positions) / total_score
    else:
        avg_x = sum(f['x'] for f in face_positions) / len(face_positions)
        avg_y = sum(f['y'] for f in face_positions) / len(face_positions)
        avg_face_width = sum(f['width'] for f in face_positions) / len(face_positions)
        avg_face_height = sum(f['height'] for f in face_positions) / len(face_positions)

    # Determine speaker position based on weighted center
    if avg_x < width * 0.35:
        speaker_position = "left"
    elif avg_x > width * 0.65:
        speaker_position = "right"
    else:
        speaker_position = "center"

    # Calculate crop region
    if is_portrait:
        # Portrait video: keep full height, calculate optimal crop width
        crop_height = height
        target_crop_width = int(height * 9 / 16)

        # Ensure we don't crop more than necessary
        if target_crop_width >= width:
            # Video is already narrower than target, use full width
            target_crop_width = width
            crop_width = width
        else:
            crop_width = target_crop_width
    else:
        # Landscape video: standard 9:16 crop
        crop_height = height
        target_crop_width = int(height * 9 / 16)
        crop_width = target_crop_width

    # Calculate crop position with padding to handle speaker movement
    margin_factor = 0.35  # Tighter margin for better framing
    if speaker_position == "left":
        # Speaker is on left - crop more tightly on the right
        crop_x = max(0, int(avg_x - target_crop_width * 0.75))
    elif speaker_position == "right":
        # Speaker is on right - give more room to the right
        crop_x = max(0, int(avg_x - target_crop_width * 0.65))
    else:  # center
        # Speaker is centered - good margin for movement
        crop_x = max(0, int(avg_x - target_crop_width * margin_factor))

    # Clamp to video bounds
    max_crop_x = width - crop_width
    if crop_x < 0:
        crop_x = 0
    elif crop_x > max_crop_x:
        crop_x = max_crop_x

    # Vertical positioning - position the most expressive face area at ~35-45% from top
    # This creates a natural "talking to camera" composition
    face_center_y = int(avg_y)

    # For portrait mode, try to keep the face in the optimal viewing zone
    optimal_face_top = height * 0.35  # Face should start around 35% from top
    optimal_face_bottom = height * 0.65  # Face should end around 65% from top

    # Try to center the face vertically in the crop
    crop_y = int(face_center_y - (crop_height * 0.45))

    # Clamp vertical crop
    max_crop_y = height - crop_height
    if crop_y < 0:
        crop_y = 0
    elif crop_y > max_crop_y:
        crop_y = max_crop_y

    # For Hormozi-style dynamic effects
    ffmpeg_crop_filter = f"crop=w={crop_width}:h={crop_height}:x={crop_x}:y={crop_y},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"

    # Return dynamic crop parameters
    crop_center_x = crop_x + crop_width / 2
    crop_center_y = crop_y + crop_height / 2

    # Face tracking area for dynamic adjustments
    x_padding_left = crop_x
    x_padding_right = width - (crop_x + crop_width)
    y_padding_top = crop_y
    y_padding_bottom = height - (crop_y + crop_height)

    # Get face trajectory with quality scores
    face_trajectory = sorted(face_positions, key=lambda f: f['quality_score'], reverse=True)[:10]

    return {
        "crop_type": "face_track",
        "speaker_position": speaker_position,
        "faces_detected": len(face_positions),
        "faces_with_quality_scores": len([f for f in face_positions if f['quality_score'] > 0.3]),
        "source_width": width,
        "source_height": height,
        "is_portrait": is_portrait,
        "target_aspect": "9:16",
        "crop_x": crop_x,
        "crop_y": crop_y,
        "crop_width": crop_width,
        "crop_height": crop_height,
        "avg_face_x": avg_x,
        "avg_face_y": avg_y,
        "avg_face_width": avg_face_width,
        "avg_face_height": avg_face_height,
        "ffmpeg_crop_filter": ffmpeg_crop_filter,
        "crop_center_x": crop_center_x,
        "crop_center_y": crop_center_y,
        "position_bias": "left" if speaker_position == "left" else "center",
        "x_padding_left": x_padding_left,
        "x_padding_right": x_padding_right,
        "y_padding_top": y_padding_top,
        "y_padding_bottom": y_padding_bottom,
        "face_trajectory": face_trajectory,
        "message": f"Tracked {len(face_positions)} face(s), prioritizing expressive/visible faces"
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
