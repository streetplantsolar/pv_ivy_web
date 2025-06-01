import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import pvlib
from pvlib import pvsystem
from sklearn.model_selection import train_test_split, GroupKFold, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
import joblib
import random
from scipy.signal import find_peaks
from scipy.stats import linregress

# Load your real module database
module_db = pd.read_csv('module_db.csv')

# Create a mapping for module type to numeric code
module_type_map = {'Mono-c-Si': 0, 'Multi-c-Si': 1, 'Thin Film': 2}

# --- Module parameters for a typical mono c-Si module ---
parameters = {
    'Name': 'Generic Mono-Si Module',
    'N_s': 96,
    'I_sc_ref': 5.1,
    'V_oc_ref': 59.4,
    'I_mp_ref': 4.69,
    'V_mp_ref': 46.9,
    'alpha_sc': 0.004539,
    'beta_oc': -0.22216,
    'a_ref': 2.6373,
    'I_L_ref': 5.114,
    'I_o_ref': 8.196e-10,
    'R_s': 1.065,
    'R_sh_ref': 381.68,
}

# --- Module parameters for each technology type ---
module_types = {
    'Mono-c-Si': {**parameters, 'Technology': 'Mono-c-Si'},
    'Multi-c-Si': {**parameters, 'Technology': 'Multi-c-Si'},
    'Thin Film': {**parameters, 'Technology': 'Thin Film'}
}

# --- Simulation parameters ---
G = 1000  # Irradiance
Tcell = 25  # Temperature

# --- IV curve simulation function ---
def simulate_iv_curve(params):
    IL, I0, Rs, Rsh, nNsVth = pvsystem.calcparams_desoto(
        effective_irradiance=G,
        temp_cell=Tcell,
        alpha_sc=params['alpha_sc'],
        a_ref=params['a_ref'],
        I_L_ref=params['I_L_ref'],
        I_o_ref=params['I_o_ref'],
        R_sh_ref=params['R_sh_ref'],
        R_s=params['R_s'],
        EgRef=1.121,
        dEgdT=-0.0002677,
        irrad_ref=1000,
        temp_ref=25
    )
    SDE_params = {
        'photocurrent': IL,
        'saturation_current': I0,
        'resistance_series': Rs,
        'resistance_shunt': Rsh,
        'nNsVth': nNsVth
    }
    curve = pvsystem.singlediode(method='lambertw', **SDE_params)
    voltage = np.linspace(0, curve['v_oc'], 100)
    current = pvlib.pvsystem.i_from_v(voltage=voltage, method='lambertw', **SDE_params)
    return voltage, current

# --- Feature extraction ---
def extract_iv_features(voltage, current, nameplate):
    Isc = current[0]
    Voc = voltage[-1]

    Isc_norm = Isc / nameplate['I_sc_ref'] if nameplate['I_sc_ref'] else 0
    Voc_norm = Voc / nameplate['V_oc_ref'] if nameplate['V_oc_ref'] else 0

    power = voltage * current
    idx_max_power = np.argmax(power)
    Imp = current[idx_max_power]
    Vmp = voltage[idx_max_power]

    Imp_norm = Imp / nameplate['I_mp_ref'] if nameplate['I_mp_ref'] else 0
    Vmp_norm = Vmp / nameplate['V_mp_ref'] if nameplate['V_mp_ref'] else 0

    FF = (Vmp * Imp) / (Voc * Isc) if (Isc != 0 and Voc != 0) else 0

    slope_at_Isc = (current[1] - current[0]) / (voltage[1] - voltage[0]) if voltage[1] != voltage[0] else 0
    slope_at_Voc = (current[-1] - current[-2]) / (voltage[-1] - voltage[-2]) if voltage[-1] != voltage[-2] else 0

    curvature = np.gradient(np.gradient(current, voltage), voltage)
    max_curvature = np.max(np.abs(curvature)) if not np.isnan(curvature).any() else 0

    # Diode ideality factor approximation
    try:
        exp_region_mask = (voltage > 0.1 * Voc) & (voltage < 0.9 * Voc)
        lnI = np.log(np.clip(current[exp_region_mask], 1e-10, None))
        slope, intercept, _, _, _ = linregress(voltage[exp_region_mask], lnI)
        diode_ideality_fit = 1 / slope if slope != 0 else 0
    except Exception:
        diode_ideality_fit = 0

    # Steps (bypass diodes, shading, mismatch)
    dI = np.diff(current)
    step_indices = np.where(np.abs(dI) > 0.1 * Isc)[0]
    num_steps = len(step_indices)

    peaks, _ = find_peaks(power)
    if len(peaks) >= 2:
        top_two = np.sort(power[peaks])[-2:]
        Pmp_ratio = top_two[-1] / top_two[-2] if top_two[-2] != 0 else 1
    else:
        Pmp_ratio = 1

    # NEW: Area under IV curve vs ideal area (rectangular shape ideal)
    area_under_curve = np.trapz(current, voltage)
    ideal_area = Isc * Voc
    area_ratio = area_under_curve / ideal_area if ideal_area != 0 else 0

    # NEW: Knee sharpness (curvature at MPP region)
    if 2 <= idx_max_power < len(curvature) - 2:
        knee_curvature = np.abs(curvature[idx_max_power])
    else:
        knee_curvature = 0

    features = {
        'Isc_norm': Isc_norm,
        'Voc_norm': Voc_norm,
        'Imp_norm': Imp_norm,
        'Vmp_norm': Vmp_norm,
        'FF': FF if not np.isnan(FF) else 0,
        'slope_at_Isc': slope_at_Isc if not np.isnan(slope_at_Isc) else 0,
        'slope_at_Voc': slope_at_Voc if not np.isnan(slope_at_Voc) else 0,
        'max_curvature': max_curvature if not np.isnan(max_curvature) else 0,
        'diode_ideality_fit': diode_ideality_fit if not np.isnan(diode_ideality_fit) else 0,
        'num_steps': num_steps,
        'Pmp_ratio': Pmp_ratio if not np.isnan(Pmp_ratio) else 1,
        'area_ratio': area_ratio if not np.isnan(area_ratio) else 0,
        'knee_curvature': knee_curvature if not np.isnan(knee_curvature) else 0
    }
    return features

# --- Signature library ---
fault_signatures = []

# For each module type (Mono, Multi, Thin Film)
for tech, tech_code in module_type_map.items():
    tech_modules = module_db[module_db['Technology'] == tech]
    fault_modes = ['Healthy', 'PID', 'Soiling', 'Shading', 'Rs_increase']
    if tech in ['Mono-c-Si', 'Multi-c-Si']:
        fault_modes.append('Bypass_Diode_Short')

    for fault in fault_modes:
        for i in range(20):
            module_row = tech_modules.sample(1).iloc[0]
            p_mod = {
                'I_sc_ref': module_row['I_sc_ref'],
                'V_oc_ref': module_row['V_oc_ref'],
                'I_mp_ref': module_row['I_mp_ref'],
                'V_mp_ref': module_row['V_mp_ref'],
                'alpha_sc': module_row['alpha_sc'],
                'a_ref': module_row['a_ref'],
                'I_L_ref': module_row['I_L_ref'],
                'I_o_ref': module_row['I_o_ref'],
                'R_s': module_row['R_s'],
                'R_sh_ref': module_row['R_sh_ref'],
                'N_s': module_row['N_s']
            }

            # Apply refined anomaly thresholds
            if fault == 'Healthy':
                p_mod['R_sh_ref'] *= np.linspace(1.1, 0.9, 20)[i]
                p_mod['V_oc_ref'] *= np.linspace(1.1, 0.95, 20)[i]
                p_mod['I_L_ref'] *= np.linspace(1.1, 0.95, 20)[i]
                p_mod['V_mp_ref'] *= np.linspace(1.1, 0.95, 20)[i]
                p_mod['I_mp_ref'] *= np.linspace(1.1, 0.95, 20)[i]
                p_mod['R_s'] *= np.linspace(1.05, 1, 20)[i]
            elif fault == 'PID':
                # PID typically causes very low Rsh (order of magnitude drop) and mild Voc loss
                p_mod['R_sh_ref'] *= np.linspace(0.9, 0.2, 20)[i]
                p_mod['V_oc_ref'] *= np.linspace(1.0, 0.9, 20)[i]
            elif fault == 'Soiling':
                # Soiling: up to 30% current loss max
                p_mod['I_L_ref'] *= np.linspace(0.95, 0.7, 20)[i]
            elif fault == 'Shading':
                # Shading: can go down to 20% current
                p_mod['I_L_ref'] *= np.linspace(0.9, 0.2, 20)[i]
            elif fault == 'Rs_increase':
                # Rs can double or triple in severe cases
                p_mod['R_s'] *= np.linspace(1.5, 3.0, 20)[i]
            elif fault == 'Bypass_Diode_Short':
                reduction_factor = random.choice([1/3, 2/3])
                p_mod['V_oc_ref'] *= (1 - reduction_factor)
                p_mod['V_mp_ref'] *= (1 - reduction_factor)

            v, c = simulate_iv_curve(p_mod)
            features = extract_iv_features(v, c, p_mod)
            features['module_type_code'] = tech_code
            features['Fault'] = fault
            fault_signatures.append(features)

df = pd.DataFrame(fault_signatures)

# --- Train classifier ---
shape_features = [
    'FF', 'slope_at_Isc', 'slope_at_Voc', 'max_curvature', 'diode_ideality_fit',
    'num_steps', 'Pmp_ratio', 'area_ratio', 'knee_curvature',
    'Isc_norm', 'Voc_norm', 'module_type_code'
]
X = df[shape_features]
y = df['Fault']
groups = df['module_type_code']

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

rf = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced', n_jobs=-1)
rf.fit(X_scaled, y)

# --- Evaluation with GroupKFold to avoid module type bias ---
cv = GroupKFold(n_splits=3)
cv_scores = cross_val_score(rf, X_scaled, y, cv=cv, groups=groups)
print("3-Fold CV Accuracy Scores:", cv_scores)
print("Mean CV Accuracy:", np.mean(cv_scores))

# --- Save ---
joblib.dump(rf, 'random_forest_classifier.pkl')
joblib.dump(scaler, 'scaler.pkl')
print("Classifier and scaler saved!")