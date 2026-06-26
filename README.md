# ChurnIQ — Customer Churn Prediction System

A full-stack machine learning application that predicts customer churn for a telecom company using the CRISP-DM methodology. It combines a trained Random Forest model with a FastAPI backend and an interactive web dashboard.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Project Structure](#project-structure)
- [Dataset](#dataset)
- [Machine Learning Pipeline](#machine-learning-pipeline)
- [Model Results](#model-results)
- [Web Application](#web-application)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Key Insights](#key-insights)
- [Technologies Used](#technologies-used)

---

## Project Overview

Customer churn — when subscribers cancel their service — is a major revenue problem for telecom companies. Acquiring a new customer costs 5–7× more than retaining an existing one. ChurnIQ identifies at-risk customers before they leave, enabling retention teams to intervene proactively.

**Business Goals:**

| Metric | Target | Achieved |
|--------|--------|----------|
| ROC-AUC | ≥ 0.85 | 0.8551 ✓ |
| Recall (Churn) | ≥ 0.75 | 0.79 ✓ |
| F1-Score (Churn) | ≥ 0.70 | 0.64 (near) |

High recall is prioritized — missing a churner is more costly than a false alarm.

---

## Project Structure

```
Customer Churn Prediction/
├── ML/
│   ├── main.ipynb                          # Full CRISP-DM analysis & model training
│   ├── Dataset/
│   │   └── Telco_customer_churn.xlsx       # Source data (7,043 customers)
│   └── models/
│       ├── Random_Forest_churn_model.pkl   # Production model (200 trees)
│       ├── scaler.pkl                      # StandardScaler for preprocessing
│       └── feature_names.pkl              # Ordered feature list for inference
└── Website/
    ├── backend/
    │   ├── main.py                         # FastAPI app (10+ endpoints)
    │   ├── database.py                     # MySQL connection config
    │   ├── setup_db.py                     # DB initialization script
    │   └── requirements.txt               # Python dependencies
    └── frontend/
        ├── index.html                      # Analytics dashboard
        ├── predict.html                    # Prediction interface
        ├── css/style.css
        └── js/
            ├── dashboard.js
            └── predict.js
```

---

## Dataset

**Source:** IBM Telco Customer Churn dataset (https://www.kaggle.com/datasets/yeanzc/telco-customer-churn-ibm-dataset)

| Property | Value |
|----------|-------|
| Records | 7,043 customers |
| Features | 33 columns (raw) → 31 (after cleaning & engineering) |
| Target | `Churn Value` (1 = Churned, 0 = Retained) |
| Churn Rate | 26.5% (class imbalance ~3:1) |
| Geography | All California customers |

**Feature Categories:**

- **Demographics:** Gender, Senior Citizen, Partner, Dependents
- **Services:** Phone, Multiple Lines, Internet (DSL / Fiber Optic / None)
- **Add-ons:** Online Security, Backup, Device Protection, Tech Support, Streaming TV/Movies
- **Account:** Contract type, Paperless Billing, Payment Method
- **Financial:** Monthly Charges, Total Charges
- **Tenure:** 0–72 months with the company

---

## Machine Learning Pipeline

### 1. Data Preparation

- **Leakage removal:** Dropped `Churn Label`, `Churn Score`, `Churn Reason` (post-churn knowledge)
- **ID/geo removal:** Dropped `CustomerID`, `Lat Long`, `Zip Code`, etc.
- **Missing values:** 11 records with blank `Total Charges` (Tenure = 0) imputed to 0

**Feature Engineering:**

| Feature | Description |
|---------|-------------|
| `Avg Monthly Spend` | `Total Charges / Tenure` — loyalty signal vs current billing |
| `Tenure Band` | Ordinal buckets: 0–12m, 13–24m, 25–48m, 49–72m |
| `Num Services` | Count of active add-on services (0–6 scale) |

**Encoding:**
- Binary: Yes/No → 1/0, Male/Female → 1/0
- One-Hot: Multiple Lines, Internet Service, Contract, Payment Method
- Ordinal: Tenure Band (0–3)

**Split:** 80% train (5,634) / 20% test (1,409), stratified by churn rate

### 2. Models Trained

All models use `class_weight='balanced'` to handle the 3:1 class imbalance. Evaluated with 5-fold stratified cross-validation.

| Model | CV ROC-AUC |
|-------|------------|
| Logistic Regression | 0.8584 ± 0.0123 |
| Decision Tree | 0.8288 ± 0.0089 |
| **Random Forest** | **0.8600 ± 0.0101** |
| Gradient Boosting | 0.8555 ± 0.0067 |
| XGBoost | 0.8580 ± 0.0076 |

**Selected model:** Random Forest (200 trees, max_depth=12, min_samples_leaf=10)

---

## Model Results

### Test Set Performance (Random Forest)

| Metric | Value |
|--------|-------|
| ROC-AUC | 0.8551 |
| Accuracy | 0.77 |
| Recall (Churn) | 0.79 |
| Precision (Churn) | 0.54 |
| F1-Score (Churn) | 0.64 |
| Precision (No Churn) | 0.91 |

### Confusion Matrix

```
                  Predicted: No Churn   Predicted: Churn
Actual: No Churn       787                  248
Actual: Churn           79                  295
```

79% of churners are caught before they leave.

### Top Feature Importances

1. Month-to-month Contract
2. Tenure Months
3. Total Charges
4. Fiber Optic Internet
5. Monthly Charges
6. Num Services (engineered)
7. Avg Monthly Spend (engineered)
8. Online Security
9. Tech Support
10. DSL Internet

### Risk Tiers

| Tier | Churn Probability | Action |
|------|-------------------|--------|
| HIGH | ≥ 70% | Immediate retention outreach |
| MEDIUM | 40–70% | Targeted engagement offer |
| LOW | < 40% | Monitor, standard retention |

**Example predictions:**

```
New customer, fiber optic, month-to-month contract → CHURN (81.9% probability, HIGH risk)
60-month tenure, DSL, 2-year contract            → STAY  (3.0%  probability, LOW risk)
```

---

## Web Application

### Dashboard (`index.html`)

- KPI cards: total customers, churn rate, average revenue, average tenure
- Charts: churn distribution, tenure histogram, contract-type breakdown, payment method breakdown
- Real-time updates via WebSocket

### Prediction Interface (`predict.html`)

- Single customer form (20+ fields) with instant prediction
- Batch CSV upload for bulk scoring
- Color-coded results table (red = high risk, yellow = medium, green = low)
- Download results as CSV

### Backend (FastAPI)

RESTful API + WebSocket serving the ML model and MySQL analytics data.

---

## Getting Started

### Prerequisites

- Python 3.9+
- MySQL server

### 1. Install dependencies

```bash
cd Website/backend
pip install -r requirements.txt
```

### 2. Configure database

Edit `Website/backend/database.py` with your MySQL credentials, then run:

```bash
python setup_db.py
```

This creates the `customers` table and loads all 7,043 records from the Excel dataset.

### 3. Start the API server

```bash
uvicorn main:app --reload --port 8000
```

### 4. Open the frontend

Open `Website/frontend/index.html` in your browser, or serve it via any static file server.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stats/summary` | GET | KPIs: total customers, churn rate, avg revenue |
| `/api/stats/churn-distribution` | GET | Churn vs retention count |
| `/api/stats/by-contract` | GET | Churn rates by contract type |
| `/api/stats/by-internet` | GET | Churn rates by internet service |
| `/api/stats/by-payment` | GET | Churn rates by payment method |
| `/api/stats/by-senior` | GET | Senior citizen churn comparison |
| `/api/stats/tenure-histogram` | GET | Tenure distribution by churn status |
| `/api/predict` | POST | Single customer churn prediction |
| `/api/predict/batch` | POST | Bulk CSV prediction upload |
| `ws://…/ws` | WebSocket | Real-time dashboard updates |

Interactive API docs available at `http://localhost:8000/docs`.

---

## Key Insights

- **Month-to-month contracts** are the single strongest churn predictor — ~3× higher risk than 2-year contracts
- **New customers (0–12 months)** are at highest risk; early engagement matters most
- **Fiber optic customers** churn more despite paying higher monthly charges — service quality issues
- **Customers with fewer than 4 add-on services** are at elevated risk; bundles improve stickiness
- **Electronic check users** have higher churn rates than auto-pay customers
- **Top stated reason for churning:** attitude of support person (192 customers)

---

## Technologies Used

**Machine Learning**

- `pandas`, `numpy` — data processing
- `scikit-learn` — models, preprocessing, metrics
- `xgboost` — gradient boosting
- `matplotlib`, `seaborn` — visualization
- `joblib` — model serialization

**Web Application**

- `FastAPI` — REST API + WebSocket backend
- `uvicorn` — ASGI server
- `pymysql` — MySQL connectivity
- `python-multipart` — CSV file upload
- HTML5 / CSS3 / Vanilla JavaScript — frontend

**Infrastructure**

- MySQL — customer data persistence
- Git — version control
