# Python Object Detection Backend

This folder contains a FastAPI server that runs TensorFlow object detection on a separate process, keeping the browser UI completely smooth.

## Setup

1. Create a virtual environment:
```bash
cd backend
python -m venv venv
```

2. Activate the virtual environment:
```bash
# Windows
.\venv\Scripts\activate

# Linux/Mac  
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the server:
```bash
uvicorn main:app --reload --port 8000
```

The server will be available at `http://localhost:8000`

## API Endpoints

- `GET /health` - Health check
- `POST /detect` - Object detection

## How It Works

1. Browser captures video frame as base64 JPEG
2. Sends to Python backend via HTTP POST
3. TensorFlow SSD MobileNet runs detection
4. Returns predictions with bounding boxes
5. Browser draws results on canvas overlay

This keeps the browser main thread completely free for smooth joystick controls!
