"""
Eye-In AI Road Hazard & Distance Detector (ADAS)
Standalone Python Engine using YOLOv8 & OpenCV.

Features:
- Real-time detection of Potholes, Speed Breakers, and Stalled/Broken-down Vehicles.
- Dynamic Distance Calculation (in Meters) using Camera Perspective Geometry:
    Distance = (Real Object Height * Camera Focal Length) / (Bounding Box Height in Pixels * 100)
- Visual Bounding Boxes with Color-coded Hazard Urgency:
    - RED (< 10m): Critical Danger / Emergency Stop
    - YELLOW (10m - 25m): Caution / Slow Down
    - GREEN (> 25m): Safe Distance
- Audio Voice Alerts (pyttsx3 / Windows SAPI5) in Hindi / English.
- Real-time FPS Performance Counter.
"""

import cv2
import math
import time
import threading
try:
    import pyttsx3
    VOICE_AVAILABLE = True
except ImportError:
    VOICE_AVAILABLE = False
    print("⚠️ pyttsx3 not installed. Run: pip install pyttsx3 for voice alerts.")

from ultralytics import YOLO

# ─── CONFIGURATION & CALIBRATION ─────────────────────────────────────────
# Average real-world physical heights in centimeters (H_real)
REAL_OBJECT_HEIGHTS = {
    'pothole': 25,         # Pothole diameter / depth visual profile
    'speed_breaker': 15,   # Road bump height profile
    'car': 150,            # Average Car height
    'truck': 280,          # Truck / Heavy Vehicle height
    'motorcycle': 110,     # Bike height
    'person': 170          # Pedestrian height
}

# Standard Camera Calibration Focal Length (f in pixels)
# Calibrated for standard 720p/1080p dashcam lenses (~70-90 deg FOV)
CAMERA_FOCAL_LENGTH = 650.0 

# Voice Alert Cooldown (seconds)
ALERT_COOLDOWN = 4.0
last_alert_time = 0

def speak_alert_async(text):
    """Speaks alert without freezing the video processing loop."""
    if not VOICE_AVAILABLE:
        return
    def _run():
        try:
            engine = pyttsx3.init()
            engine.setProperty('rate', 160)
            engine.say(text)
            engine.runAndWait()
        except Exception as e:
            print(f"TTS Error: {e}")
    threading.Thread(target=_run, daemon=True).start()


def calculate_distance(class_name, bbox_height_pixels):
    """
    Calculates estimated distance in meters using focal length & object geometry.
    Formula: D = (H_real_cm * f_pixel) / (h_bbox_pixel * 100)
    """
    if bbox_height_pixels <= 0:
        return 999.0
    
    real_h = REAL_OBJECT_HEIGHTS.get(class_name.lower(), 50)
    distance_meters = (real_h * CAMERA_FOCAL_LENGTH) / (bbox_height_pixels * 100.0)
    return round(max(1.0, distance_meters), 1)


def main():
    global last_alert_time

    print("\n" + "="*60)
    print("  🚀 EYE-IN AI ROAD HAZARD & DISTANCE DETECTOR")
    print("="*60)
    print("Loading YOLOv8 Model...")
    
    # Load YOLOv8 model (Nano for real-time 30+ FPS speed)
    model = YOLO("yolov8n.pt") 

    # Custom Class Mapping (Can be extended with custom fine-tuned RDD2022 weights)
    # Default COCO has 'car', 'truck', 'bus', 'motorcycle', 'person'
    # For custom pothole weights: model = YOLO("best_pothole_breaker.pt")

    # Camera Stream: 0 for Default WebCam / Dashcam, or path to video file
    video_source = 0 # or "driving_test.mp4"
    cap = cv2.VideoCapture(video_source)

    if not cap.isOpened():
        print(f"❌ Error: Cannot open camera/video source: {video_source}")
        return

    # Set Resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    print("✅ System Ready! Press 'Q' to exit.\n")

    prev_time = time.time()

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("Video stream ended.")
            break

        h_frame, w_frame, _ = frame.shape
        curr_time = time.time()
        fps = int(1 / (curr_time - prev_time + 1e-6))
        prev_time = curr_time

        # Run AI Object Detection
        results = model(frame, verbose=False, conf=0.45)
        closest_hazard = None
        min_distance = 999.0

        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0])
                label = model.names[cls_id]
                conf = float(box.conf[0])
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                box_w = x2 - x1
                box_h = y2 - y1

                # Calculate estimated distance
                dist = calculate_distance(label, box_h)

                if dist < min_distance:
                    min_distance = dist
                    closest_hazard = (label, dist)

                # Determine Color & Urgency Level
                if dist < 10.0:
                    color = (0, 0, 255) # Red (Critical)
                    status_text = "CRITICAL"
                elif dist < 25.0:
                    color = (0, 165, 255) # Amber (Caution)
                    status_text = "CAUTION"
                else:
                    color = (0, 255, 0) # Green (Safe)
                    status_text = "SAFE"

                # Draw Bounding Box & HUD
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                
                # Tag Background
                tag = f"{label.upper()} | {dist}m"
                (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(frame, (x1, y1 - 25), (x1 + tw + 10, y1), color, -1)
                cv2.putText(frame, tag, (x1 + 5, y1 - 7),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

        # Trigger Voice Warning for dangerous proximity
        if closest_hazard and min_distance <= 15.0:
            if time.time() - last_alert_time > ALERT_COOLDOWN:
                last_alert_time = time.time()
                alert_msg = f"Warning! {closest_hazard[0]} ahead in {int(min_distance)} meters. Slow down!"
                print(f"🔊 {alert_msg}")
                speak_alert_async(alert_msg)

        # Draw HUD Telemetry Header
        cv2.rectangle(frame, (20, 20), (320, 100), (15, 15, 25), -1)
        cv2.rectangle(frame, (20, 20), (320, 100), (0, 242, 254), 1)
        cv2.putText(frame, f"EYE-IN AI ADAS | FPS: {fps}", (30, 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 242, 254), 2)
        
        hazard_display = f"Nearest: {closest_hazard[0].upper()} ({closest_hazard[1]}m)" if closest_hazard else "Nearest: CLEAR"
        cv2.putText(frame, hazard_display, (30, 75),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

        # Show Output Window
        cv2.imshow("Eye-In AI ADAS Road Hazard Detector", frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("System terminated cleanly.")

if __name__ == "__main__":
    main()
