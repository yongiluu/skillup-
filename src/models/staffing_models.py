"""Modelos y funciones de entrenamiento para predicción de dotación laboral."""

import logging
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.dummy import DummyClassifier
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.metrics import (
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_score,
    recall_score,
    accuracy_score
)
from xgboost import XGBClassifier

logger = logging.getLogger(__name__)


class DummyProbClassifier(BaseEstimator, ClassifierMixin):
    """Un clasificador dummy que siempre retorna predict_proba como un array 2D."""
    def __init__(self, constant_class=1):
        self.constant_class = constant_class
        self.classes_ = np.array([0, 1])
        
    def fit(self, X, y):
        return self
        
    def predict(self, X):
        return np.full(X.shape[0], self.constant_class)
        
    def predict_proba(self, X):
        probs = np.zeros((X.shape[0], 2))
        probs[:, self.constant_class] = 1.0
        return probs



def train_headcount_regressor(X_train, y_train_reg):
    """Modelo 1: Regresor de Headcount para predecir la dotación disponible.
    
    Usa RandomForestRegressor.
    """
    logger.info("Entrenando Modelo 1: Regresor de Headcount (RandomForest)...")
    regressor = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    regressor.fit(X_train, y_train_reg)
    return regressor


def train_deficit_classifier(X_train, y_train_class):
    """Modelo 2: Clasificador de Riesgo de Déficit.
    
    Usa XGBClassifier para estimar la probabilidad directa de déficit.
    """
    logger.info("Entrenando Modelo 2: Clasificador de Déficit (XGBoost)...")
    if len(np.unique(y_train_class)) < 2:
        logger.warning("Solo hay una clase en los datos de entrenamiento. Usando DummyProbClassifier.")
        constant_val = int(y_train_class.iloc[0]) if hasattr(y_train_class, 'iloc') else int(y_train_class[0])
        classifier = DummyProbClassifier(constant_class=constant_val)
        classifier.fit(X_train, y_train_class)
        return classifier
        
    classifier = XGBClassifier(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=4,
        random_state=42,
        eval_metric="logloss",
        base_score=0.5,
        n_jobs=-1
    )
    classifier.fit(X_train, y_train_class)
    return classifier


def train_calibrated_ensemble(X_train, y_train_class):
    """Modelo 3: Ensamble Calibrado.
    
    Envuelve un clasificador XGBoost en un CalibratedClassifierCV usando
    calibración isotónica para obtener estimados de probabilidad confiables.
    """
    logger.info("Entrenando Modelo 3: Ensamble Calibrado (Calibrated XGBoost)...")
    if len(np.unique(y_train_class)) < 2:
        logger.warning("Solo hay una clase en los datos de entrenamiento. Usando DummyProbClassifier.")
        constant_val = int(y_train_class.iloc[0]) if hasattr(y_train_class, 'iloc') else int(y_train_class[0])
        classifier = DummyProbClassifier(constant_class=constant_val)
        classifier.fit(X_train, y_train_class)
        return classifier
        
    base_clf = XGBClassifier(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=4,
        random_state=42,
        eval_metric="logloss",
        base_score=0.5,
        n_jobs=-1
    )
    
    try:
        # Calibrar usando validación cruzada interna de 3 folds
        calibrated_clf = CalibratedClassifierCV(
            estimator=base_clf,
            method="isotonic",
            cv=3
        )
        calibrated_clf.fit(X_train, y_train_class)
        return calibrated_clf
    except ValueError as e:
        logger.warning("No se pudo calibrar el modelo (posiblemente pocas muestras de una clase). Usando modelo sin calibrar. Error: %s", e)
        base_clf.fit(X_train, y_train_class)
        return base_clf


def evaluate_regression(y_true, y_pred):
    """Evalúa métricas de regresión para el headcount."""
    mae = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2 = r2_score(y_true, y_pred)
    return {
        "MAE": mae,
        "RMSE": rmse,
        "R2": r2
    }


def evaluate_classification(y_true, y_prob, threshold=0.5):
    """Evalúa métricas de clasificación para el déficit."""
    y_pred = (y_prob >= threshold).astype(int)
    
    # Manejar caso de una sola clase
    if len(np.unique(y_true)) < 2:
        auc = 0.5  # Neutral para una sola clase
        ap = 0.0
    else:
        auc = roc_auc_score(y_true, y_prob)
        ap = average_precision_score(y_true, y_prob)
        
    brier = brier_score_loss(y_true, y_prob)
    
    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    
    return {
        "AUC-ROC": auc,
        "PR-AUC": ap,
        "Brier Score": brier,
        "Accuracy": acc,
        "Precision": prec,
        "Recall": rec,
        "F1-Score": f1
    }
