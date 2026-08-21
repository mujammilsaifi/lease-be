# PaddleOCR Microservice

FastAPI microservice providing high-accuracy OCR for PDF documents using **PaddleOCR**. Pre-loads the PaddleOCR engine in memory for fast performance.

---

## 🚀 How to Run Locally

### 1. Setup Virtual Environment & Install Dependencies
Ensure Python 3.8+ is installed, then run in PowerShell:

```powershell
# Navigate to the microservice directory
cd paddle-ocr-service

# Create virtual environment
python -m venv venv

# Activate virtual environment (PowerShell)
.\venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

*(For Command Prompt, use `.\venv\Scripts\activate.bat`. For Linux/macOS, use `source venv/bin/activate`)*

---

### 2. Start the FastAPI Service

```powershell
python main.py
# OR
uvicorn main:app --host 0.0.0.0 --port 8000
```

The service will start at `http://localhost:8000`.

---

## ⚙️ Connecting to `lease-be` Backend

In your `lease-be` `.env` file, ensure:
```env
PADDLE_OCR_URL=http://localhost:8000/ocr
```

If the service is running, `lease-be` will automatically route all OCR requests to PaddleOCR. If the service is stopped or unreachable, `lease-be` will automatically fall back to **Tesseract.js**.
