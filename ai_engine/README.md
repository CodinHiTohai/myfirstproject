# 🚀 Eye-In AI Road Hazard & Distance Detection Engine

This folder contains the Python YOLOv8 Edge AI implementation for detecting:
1. **Potholes (गड्ढे)**
2. **Speed Breakers (स्पीड ब्रेकर)**
3. **Stalled / Broken-down Vehicles (खराब गाड़ियां)**
4. **Pedestrians & Cattle (पैदल यात्री / जानवर)**

Along with real-time **Distance Estimation (in Meters)** and **Voice Alerts**.

---

## 📦 Installation

```bash
# 1. Install required packages
pip install ultralytics opencv-python pyttsx3 numpy
```

---

## 🏃 Run the Detector

```bash
# Run with Webcam / Dashcam
python road_hazard_detector.py
```

To test on a recorded driving video, edit `video_source` in `road_hazard_detector.py`:
```python
video_source = "path/to/my_dashcam_video.mp4"
```

---

## 🎯 How Distance Estimation Works (Without Costly LiDAR)

Using calibrated camera focal length and perspective geometry:

$$\text{Distance (Meters)} = \frac{H_{\text{real}} \times f}{h_{\text{bbox}} \times 100}$$

- $H_{\text{real}}$ = Physical object height in cm (e.g., Pothole ~25cm, Car ~150cm)
- $f$ = Calibrated camera focal length in pixels
- $h_{\text{bbox}}$ = Bounding box pixel height on the dashcam screen

---

## 🏋️ Training Custom Model on Road Datasets (YOLOv8)

To train on 40,000+ real road damage images:

1. Download **RDD2022 (Road Damage Dataset)** or **Roboflow Pothole Dataset**.
2. Train with 1 command:
```bash
yolo detect train data=road_hazards.yaml model=yolov8n.pt epochs=50 imgsz=640 batch=16
```
3. Copy `runs/detect/train/weights/best.pt` and replace `yolov8n.pt` in `road_hazard_detector.py`.
