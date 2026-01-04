"""
Object Detection API using FastAPI and TensorFlow COCO-SSD
Run with: uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import tensorflow as tf
import tensorflow_hub as hub
import numpy as np
from PIL import Image
import base64
import io
from typing import List, Optional

app = FastAPI(title="Object Detection API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model variable
model = None
COCO_LABELS = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck',
    'boat', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench',
    'bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra',
    'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove',
    'skateboard', 'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
    'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
    'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse',
    'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster', 'sink',
    'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear', 'hair drier',
    'toothbrush'
]

class DetectionRequest(BaseModel):
    imageData: str  # Base64 encoded image
    width: int
    height: int

class Detection(BaseModel):
    class_name: str
    score: float
    bbox: List[float]  # [x, y, width, height]

class DetectionResponse(BaseModel):
    success: bool
    predictions: List[Detection]

@app.on_event("startup")
async def load_model():
    """Load the object detection model on startup"""
    global model
    print("[Server] Loading SSD MobileNet model...")
    # Using TensorFlow Hub SSD MobileNet V2
    model = hub.load("https://tfhub.dev/tensorflow/ssd_mobilenet_v2/2")
    print("[Server] Model loaded successfully!")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "model_loaded": model is not None}

@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(request: DetectionRequest):
    """Detect objects in an image"""
    global model
    
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet")
    
    try:
        # Decode base64 image
        image_bytes = base64.b64decode(request.imageData)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Resize to model input size
        image = image.resize((320, 320))
        
        # Convert to numpy array and add batch dimension
        image_np = np.array(image)
        input_tensor = tf.convert_to_tensor(image_np, dtype=tf.uint8)
        input_tensor = tf.expand_dims(input_tensor, axis=0)
        
        # Run detection
        results = model(input_tensor)
        
        # Extract results
        boxes = results['detection_boxes'][0].numpy()
        scores = results['detection_scores'][0].numpy()
        classes = results['detection_classes'][0].numpy().astype(int)
        
        # Filter by confidence threshold (0.4)
        predictions = []
        for i in range(len(scores)):
            if scores[i] > 0.4:
                # Convert from relative to absolute coordinates
                y1, x1, y2, x2 = boxes[i]
                bbox = [
                    float(x1 * request.width),
                    float(y1 * request.height),
                    float((x2 - x1) * request.width),
                    float((y2 - y1) * request.height)
                ]
                
                class_idx = classes[i] - 1  # Classes are 1-indexed
                class_name = COCO_LABELS[class_idx] if class_idx < len(COCO_LABELS) else f"class_{classes[i]}"
                
                predictions.append(Detection(
                    class_name=class_name,
                    score=float(scores[i]),
                    bbox=bbox
                ))
        
        print(f"[Server] Detected {len(predictions)} objects")
        return DetectionResponse(success=True, predictions=predictions)
        
    except Exception as e:
        print(f"[Server] Detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
