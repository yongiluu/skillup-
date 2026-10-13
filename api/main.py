import json
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd

app = FastAPI(title="SkillUp Dotación Laboral API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
PROCESSED_DATA_DIR = BASE_DIR / "data" / "clinic" / "processed"

@app.get("/api/v1/metrics")
def get_metrics():
    metrics_path = PROCESSED_DATA_DIR / "clinic_staffing_metrics.json"
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"error": "Metrics file not found"}

@app.get("/api/v1/shap-summary")
def get_shap_summary():
    shap_path = PROCESSED_DATA_DIR / "clinic_risk_shap_summary.json"
    if shap_path.exists():
        with open(shap_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"error": "SHAP summary file not found"}

@app.get("/api/v1/predictions")
def get_predictions(limit: int = 10000):
    preds_path = PROCESSED_DATA_DIR / "clinic_staffing_predictions.csv"
    if preds_path.exists():
        df = pd.read_csv(preds_path)
        
        # Sort by predicted_deficit_probability descending to get highest risk first
        df_sorted = df.sort_values(by="predicted_deficit_probability", ascending=False)
        
        # Take the top N
        df_top = df_sorted.head(limit)
        
        # Convert to records format (list of dicts)
        return df_top.to_dict(orient="records")
    return {"error": "Predictions file not found"}
