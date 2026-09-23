import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression
from sklearn.tree import DecisionTreeRegressor
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from xgboost import XGBRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

def engineer_features(df):
    data = df.copy()
    data['doctor_to_patient_ratio'] = np.round(data['doctor_available'] / np.maximum(data['queue_length'], 1), 3)
    data['peak_hour_flag'] = ((data['time_of_day'].between(9, 11)) | (data['time_of_day'].between(15, 17))).astype(int)
    data['weekend_flag'] = (data['day_of_week'] >= 5).astype(int)
    data['emergency_ratio'] = np.round(data['emergency_cases'] / np.maximum(data['patient_count'], 1), 3)
    data['department_load'] = np.round(data['queue_length'] * data['avg_consultation_time'], 1)
    data['doctor_workload'] = np.round(data['patient_count'] / np.maximum(data['doctor_available'], 1), 1)
    return data

def train_and_evaluate():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    csv_path = os.path.join(base_dir, 'datasets', 'hospital_wait_times.csv')
    
    print(f"Loading dataset from {csv_path}...")
    df = pd.read_csv(csv_path)
    df = engineer_features(df)
    
    # We train models directly on operational variables to reflect genuine hospital dynamics
    numeric_features = [
        'queue_length',
        'doctor_available',
        'emergency_cases',
        'avg_consultation_time',
        'department_load',
        'doctor_to_patient_ratio',
        'patient_count',
        'time_of_day',
        'doctor_workload',
        'peak_hour_flag',
        'emergency_ratio',
        'day_of_week',
        'is_holiday',
        'weekend_flag'
    ]
    categorical_features = ['department']
    
    X = df[numeric_features + categorical_features]
    y = df['actual_wait_time']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', 'passthrough', numeric_features),
            ('cat', OneHotEncoder(drop='first', sparse_output=False, handle_unknown='ignore'), categorical_features)
        ]
    )
    
    models = {
        'Gradient Boosting Regressor': GradientBoostingRegressor(n_estimators=160, learning_rate=0.08, max_depth=5, random_state=42),
        'XGBoost Regressor': XGBRegressor(n_estimators=160, learning_rate=0.08, max_depth=5, random_state=42, n_jobs=-1),
        'Random Forest Regressor': RandomForestRegressor(n_estimators=120, max_depth=12, random_state=42, n_jobs=-1),
        'Decision Tree Regressor': DecisionTreeRegressor(max_depth=8, random_state=42),
        'Linear Regression': LinearRegression()
    }
    
    results = {}
    fitted_pipelines = {}
    
    print("\nTraining and evaluating models on 20% holdout test set...")
    for name, model in models.items():
        pipeline = Pipeline(steps=[('preprocessor', preprocessor), ('regressor', model)])
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)
        
        mae = float(mean_absolute_error(y_test, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
        r2 = float(r2_score(y_test, y_pred))
        
        results[name] = {
            'mae': round(mae, 2),
            'rmse': round(rmse, 2),
            'r2': round(r2, 4),
            'accuracy_pct': round(max(0.0, min(100.0, r2 * 100)), 1)
        }
        fitted_pipelines[name] = pipeline
        print(f"[{name}] MAE: {mae:.2f} min | RMSE: {rmse:.2f} min | R²: {r2:.4f}")
        
    # Select best model based on R²
    best_model_name = max(results, key=lambda k: results[k]['r2'])
    best_pipeline = fitted_pipelines[best_model_name]
    print(f"\n--> Best Performing Model: {best_model_name} (R² = {results[best_model_name]['r2']})")
    
    # Extract feature importances
    regressor = best_pipeline.named_steps['regressor']
    fitted_prep = best_pipeline.named_steps['preprocessor']
    cat_cols = list(fitted_prep.named_transformers_['cat'].get_feature_names_out(categorical_features))
    all_feature_names = numeric_features + cat_cols
    
    feature_importances = []
    if hasattr(regressor, 'feature_importances_'):
        raw_imp = regressor.feature_importances_
        norm_imp = raw_imp / np.sum(raw_imp)
        for feat, score in zip(all_feature_names, norm_imp):
            feature_importances.append({'feature': feat, 'importance': round(float(score), 4)})
        feature_importances.sort(key=lambda x: x['importance'], reverse=True)
    elif hasattr(regressor, 'coef_'):
        raw_imp = np.abs(regressor.coef_)
        norm_imp = raw_imp / np.sum(raw_imp)
        for feat, score in zip(all_feature_names, norm_imp):
            feature_importances.append({'feature': feat, 'importance': round(float(score), 4)})
        feature_importances.sort(key=lambda x: x['importance'], reverse=True)
        
    # Department baseline statistics
    dept_stats = {}
    for d, group in df.groupby('department'):
        dept_stats[d] = {
            'avg_wait_time': round(float(group['actual_wait_time'].mean()), 1),
            'avg_queue_length': round(float(group['queue_length'].mean()), 1),
            'avg_consult_time': round(float(group['avg_consultation_time'].mean()), 1),
            'avg_doctors': round(float(group['doctor_available'].mean()), 1)
        }
        
    metrics_data = {
        'best_model': best_model_name,
        'best_metrics': results[best_model_name],
        'all_models': results,
        'feature_importances': feature_importances,
        'dataset_size': len(df),
        'train_samples': len(X_train),
        'test_samples': len(X_test),
        'department_statistics': dept_stats,
        'features_used': numeric_features + categorical_features,
        'engineered_features': [
            'doctor_to_patient_ratio', 'peak_hour_flag', 'weekend_flag',
            'emergency_ratio', 'department_load', 'doctor_workload'
        ],
        'data_source': 'Synthetic Hospital Operational Dataset (5,000 observations)'
    }
    
    models_dir = os.path.join(base_dir, 'models')
    os.makedirs(models_dir, exist_ok=True)
    
    best_model_path = os.path.join(models_dir, 'best_model.joblib')
    joblib.dump(best_pipeline, best_model_path)
    
    metrics_path = os.path.join(models_dir, 'metrics.json')
    with open(metrics_path, 'w') as f:
        json.dump(metrics_data, f, indent=2)
        
    # Synchronize with backend/app/ml/
    backend_ml_dir = os.path.join(os.path.dirname(base_dir), 'backend', 'app', 'ml')
    os.makedirs(backend_ml_dir, exist_ok=True)
    joblib.dump(best_pipeline, os.path.join(backend_ml_dir, 'best_model.joblib'))
    with open(os.path.join(backend_ml_dir, 'metrics.json'), 'w') as f:
        json.dump(metrics_data, f, indent=2)
        
    print(f"Artifacts successfully generated and synchronized to backend/app/ml/.")

if __name__ == '__main__':
    train_and_evaluate()
