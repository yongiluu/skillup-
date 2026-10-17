#!/usr/bin/env python3
"""Genera data.js para los prototipos desktop/mobile del dominio restaurant.

Lee las predicciones y los CSV crudos del restaurant y escribe un snapshot
(`window.SKILLUP_DATA`) para una fecha de demo, de modo que los prototipos
funcionen abriendo el HTML directamente, sin levantar la API.
"""

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.restaurant_settings import (
    RESTAURANT_MODEL_CONFIG,
    RESTAURANT_PROCESSED_DIR,
    RESTAURANT_RAW_DIR,
    ROLE_BACKUPS,
    SERVICE_PERIODS,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIRS = [PROJECT_ROOT / "desktop-prototype", PROJECT_ROOT / "mobile-prototype"]
CRITICAL_ROLES = ["garzon", "cocinero_linea", "jefe_turno"]


def _round(value, digits=2):
    return None if pd.isna(value) else round(float(value), digits)


def build_snapshot(demo_date: str) -> dict:
    demo = pd.Timestamp(demo_date)
    week_start = demo - pd.Timedelta(days=demo.weekday())
    week_end = week_start + pd.Timedelta(days=6)

    preds = pd.read_csv(RESTAURANT_PROCESSED_DIR / "restaurant_staffing_predictions.csv", parse_dates=["date"])
    calendar = pd.read_csv(RESTAURANT_RAW_DIR / "restaurant_calendar_cl.csv", parse_dates=["date"])
    employees = pd.read_csv(RESTAURANT_RAW_DIR / "restaurant_employees.csv")
    work = pd.read_csv(RESTAURANT_RAW_DIR / "restaurant_work_records.csv", parse_dates=["date"])
    absences = pd.read_csv(RESTAURANT_RAW_DIR / "restaurant_absenteeism.csv", parse_dates=["date"])
    bio = pd.read_csv(RESTAURANT_RAW_DIR / "restaurant_biometrics.csv", parse_dates=["date"])

    week_preds = preds[(preds["date"] >= week_start) & (preds["date"] <= week_end)]
    services = [
        {
            "date": row.date.strftime("%Y-%m-%d"),
            "period": row.service_period,
            "required": int(row.required_headcount_total),
            "actual": int(row.actual_headcount_total),
            "predicted": _round(row.predicted_headcount_total, 1),
            "prob": _round(row.predicted_deficit_probability),
            "roleProb": {r: _round(getattr(row, f"predicted_role_deficit_prob_{r}")) for r in CRITICAL_ROLES},
            "covers": int(row.forecast_covers),
            "reservations": int(row.reservation_count),
            "action": row.recommended_action,
        }
        for row in week_preds.itertuples()
    ]

    month = calendar[calendar["date"].dt.to_period("M") == demo.to_period("M")]
    calendar_days = [
        {
            "date": row.date.strftime("%Y-%m-%d"),
            "holiday": row.holiday_name if bool(row.is_holiday) else None,
            "payday": bool(row.is_payday_window),
        }
        for row in month.itertuples()
    ]

    horizon = calendar[(calendar["date"] > demo) & (calendar["date"] <= demo + pd.Timedelta(days=21))]
    daily_risk = preds.groupby("date")["predicted_deficit_probability"].max()
    peaks = []
    for row in horizon.itertuples():
        reasons = []
        if bool(row.is_holiday):
            reasons.append("Feriado")
        if bool(row.is_payday_window):
            reasons.append("Día de pago")
        if row.date.weekday() in (4, 5):
            reasons.append("Viernes" if row.date.weekday() == 4 else "Sábado")
        if reasons:
            peaks.append({
                "date": row.date.strftime("%Y-%m-%d"),
                "reasons": reasons,
                "maxProb": _round(daily_risk.get(row.date)),
            })

    week_work = work[(work["date"] >= week_start) & (work["date"] <= week_end) & (~work["is_rest_day"])]
    past_week = work[(work["date"] > demo - pd.Timedelta(days=7)) & (work["date"] <= demo)]
    past_90 = absences[(absences["date"] > demo - pd.Timedelta(days=90)) & (absences["date"] <= demo) & (absences["is_absent"] == 1)]
    last_bio = bio[bio["date"] <= demo].sort_values("date").groupby("employee_id").tail(1).set_index("employee_id")
    last_work = work[work["date"] <= demo].sort_values("date").groupby("employee_id").tail(1).set_index("employee_id")

    staff = []
    for emp in employees.itertuples():
        shifts = week_work[week_work["employee_id"] == emp.employee_id]
        b = last_bio.loc[emp.employee_id] if emp.employee_id in last_bio.index else None
        staff.append({
            "id": emp.employee_id,
            "role": emp.role,
            "backupRole": emp.backup_role if isinstance(emp.backup_role, str) else None,
            "crossTrained": bool(emp.cross_trained),
            "seniority": int(emp.seniority_years),
            "contract": emp.contract_type,
            "preference": emp.shift_preference,
            "consecutiveDays": int(last_work.loc[emp.employee_id, "consecutive_work_days"]) if emp.employee_id in last_work.index else 0,
            "overtimeWeek": _round(past_week[past_week["employee_id"] == emp.employee_id]["overtime_hours"].sum(), 1),
            "absences90": int((past_90["employee_id"] == emp.employee_id).sum()),
            "shifts": [
                {"date": s.date.strftime("%Y-%m-%d"), "period": s.service_period, "role": s.role_assigned}
                for s in shifts.itertuples()
            ],
            "bio": None if b is None else {
                "sleep": _round(b["sleep_duration_hours"], 1),
                "steps": int(b["steps"]),
                "hr": _round(b["hr_mean_bpm"], 0),
                "stress": _round(b["stress_score"], 0),
                "fatigue": _round(b["fatigue_proxy"], 0),
            },
        })

    today_abs = absences[(absences["date"] == demo) & (absences["is_absent"] == 1)]
    absences_today = [
        {"id": a.employee_id, "reason": a.absence_reason, "hours": _round(a.absence_hours, 1), "shortNotice": bool(a.is_short_notice)}
        for a in today_abs.itertuples()
    ]

    return {
        "demoDate": demo.strftime("%Y-%m-%d"),
        "weekStart": week_start.strftime("%Y-%m-%d"),
        "thresholds": {
            "alert": RESTAURANT_MODEL_CONFIG["alert_probability_threshold"],
            "high": RESTAURANT_MODEL_CONFIG["high_risk_threshold"],
        },
        "periods": {key: value["label"] for key, value in SERVICE_PERIODS.items()},
        "roleBackups": ROLE_BACKUPS,
        "services": services,
        "calendar": calendar_days,
        "peaks": peaks,
        "employees": staff,
        "absencesToday": absences_today,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Genera data.js de los prototipos UI del restaurant")
    parser.add_argument("--demo-date", default="2025-10-17", help="Fecha que los prototipos muestran como 'hoy'")
    args = parser.parse_args()

    snapshot = build_snapshot(args.demo_date)
    payload = "// Generado por scripts/10_build_restaurant_ui_data.py — no editar a mano.\n"
    payload += "window.SKILLUP_DATA = " + json.dumps(snapshot, ensure_ascii=False) + ";\n"
    for out_dir in OUTPUT_DIRS:
        (out_dir / "data.js").write_text(payload, encoding="utf-8")
        print(f"Escrito {out_dir / 'data.js'}")


if __name__ == "__main__":
    main()
