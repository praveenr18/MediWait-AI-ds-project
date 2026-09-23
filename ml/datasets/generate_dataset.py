import os
import numpy as np
import pandas as pd

def generate_hospital_dataset(n_samples=5000, random_state=42):
    """
    Generates realistic hospital operational data where patient wait times depend
    organically on queue dynamics, doctor staffing, emergency interruptions, 
    consultation durations, and peak-hour hospital congestion.
    """
    np.random.seed(random_state)
    
    departments = ['Cardiology', 'Orthopedics', 'General Medicine', 'ENT', 'Dermatology']
    dept_weights = [0.25, 0.20, 0.30, 0.15, 0.10]
    
    dept_consult_params = {
        'Cardiology': (14.0, 3.0),
        'Orthopedics': (13.0, 2.5),
        'General Medicine': (10.0, 2.0),
        'ENT': (9.0, 1.8),
        'Dermatology': (8.0, 1.5)
    }
    
    dept_choices = np.random.choice(departments, size=n_samples, p=dept_weights)
    
    # Hours between 8 AM (8) and 7 PM (19)
    hours = np.random.choice(range(8, 20), size=n_samples, p=[
        0.05, 0.12, 0.15, 0.13, 0.08, 0.06, 0.07, 0.11, 0.11, 0.07, 0.04, 0.01
    ])
    day_of_week = np.random.choice(range(7), size=n_samples, p=[0.20, 0.18, 0.16, 0.16, 0.15, 0.10, 0.05])
    is_holiday = np.random.choice([0, 1], size=n_samples, p=[0.96, 0.04])
    
    doctor_available = []
    avg_consultation_time = []
    queue_length = []
    patient_count = []
    emergency_cases = []
    
    for i in range(n_samples):
        dept = dept_choices[i]
        hr = hours[i]
        dow = day_of_week[i]
        
        # Staffing levels
        if dept in ['Cardiology', 'General Medicine']:
            docs = int(np.random.choice([2, 3, 4, 5, 6], p=[0.10, 0.30, 0.35, 0.18, 0.07]))
        elif dept == 'Orthopedics':
            docs = int(np.random.choice([2, 3, 4], p=[0.25, 0.50, 0.25]))
        else:
            docs = int(np.random.choice([1, 2, 3], p=[0.30, 0.50, 0.20]))
            
        if (hr >= 18 or dow == 6) and docs > 1:
            docs -= 1
        doctor_available.append(docs)
        
        # Consultation duration
        mean_c, std_c = dept_consult_params[dept]
        c_time = max(5.0, np.random.normal(mean_c, std_c))
        avg_consultation_time.append(round(c_time, 1))
        
        # Patient volume & Queue length
        is_peak = 1 if (9 <= hr <= 11 or 15 <= hr <= 17) else 0
        peak_mult = 1.45 if is_peak else 1.0
        
        p_vol = int(np.random.randint(18, 55) * peak_mult)
        patient_count.append(p_vol)
        
        # Queue length depends on department demand and doctor capacity
        lam = max(2, int((p_vol * 0.4) / max(1, docs * 0.7)))
        q_len = int(np.random.poisson(lam=lam))
        queue_length.append(q_len)
        
        # Emergency cases triage priority
        if dept in ['Cardiology', 'Orthopedics']:
            emerg = int(np.random.choice([0, 1, 2, 3], p=[0.55, 0.25, 0.14, 0.06]))
        elif dept == 'General Medicine':
            emerg = int(np.random.choice([0, 1, 2], p=[0.75, 0.20, 0.05]))
        else:
            emerg = int(np.random.choice([0, 1], p=[0.92, 0.08]))
        emergency_cases.append(emerg)
        
    df = pd.DataFrame({
        'patient_count': patient_count,
        'queue_length': queue_length,
        'doctor_available': doctor_available,
        'department': dept_choices,
        'emergency_cases': emergency_cases,
        'avg_consultation_time': avg_consultation_time,
        'time_of_day': hours,
        'day_of_week': day_of_week,
        'is_holiday': is_holiday,
    })
    
    # Physics-based operational wait time formula:
    # 1. Base queue wait: (queue_length * avg_consultation_time) / doctor_available
    # 2. Emergency disruption factor: each emergency delays the normal queue by 1.25 * consultation time
    # 3. Peak congestion overhead factor: 1.10x during rush hours
    # 4. Stochastic hospital variance: Gaussian noise (mean 0, std 2.5)
    base_queue_wait = (df['queue_length'] * df['avg_consultation_time']) / np.maximum(df['doctor_available'], 1)
    emergency_delay = df['emergency_cases'] * (df['avg_consultation_time'] * 1.25)
    peak_multiplier = np.where((df['time_of_day'].between(9, 11)) | (df['time_of_day'].between(15, 17)), 1.10, 1.0)
    
    noise = np.random.normal(0, 2.5, size=n_samples)
    actual_wait = (base_queue_wait * peak_multiplier) + emergency_delay + noise
    df['actual_wait_time'] = np.maximum(3.0, np.round(actual_wait, 1))
    
    # Historical wait is a noisy observation of past averages
    hist_noise = np.random.normal(0, 4.0, size=n_samples)
    df['historical_wait_time'] = np.maximum(4.0, np.round(base_queue_wait + emergency_delay * 0.7 + hist_noise, 1))
    
    return df

if __name__ == '__main__':
    out_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(out_dir, 'hospital_wait_times.csv')
    df = generate_hospital_dataset(n_samples=5000)
    df.to_csv(csv_path, index=False)
    print(f"Hospital operational dataset generated at {csv_path} ({len(df)} records).")
