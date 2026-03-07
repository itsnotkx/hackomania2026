"""
Pre-download the NII AntiDeepfake model to HuggingFace cache.
Run this inside the Docker build or before first startup to avoid cold-start delay.

Usage: python scripts/download_model.py
"""
import os
import sys

MODEL_ID = os.getenv("MODEL_ID", "nii-yamagishilab/wav2vec-large-anti-deepfake")

print(f"Downloading NII AntiDeepfake model: {MODEL_ID}")
print("This may take 2-3 minutes on first run (~1.2GB)...")

try:
    # Add parent directory to path so we can import app modules
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    
    from app.models.nii_deepfake import load_nii_model
    
    model = load_nii_model(MODEL_ID)
    print(f"Model downloaded successfully: {MODEL_ID}")
    print(f"Model parameters: {sum(p.numel() for p in model.parameters()):,}")
except Exception as e:
    print(f"ERROR: Failed to download model: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc()
    sys.exit(1)
