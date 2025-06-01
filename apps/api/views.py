from apps.api.serializers import ProductSerializer
from apps.common.models import Product
from rest_framework import viewsets
from rest_framework import permissions

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from apps.api.anomaly_classifier import extract_iv_features
import pandas as pd
import numpy as np
import pvlib
import joblib


class ProductPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method == 'GET':
            return True
        return request.user and request.user.is_authenticated


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    queryset = Product.objects.all()
    permission_classes = (ProductPermission, )
    lookup_field = 'id'

MODULE_CSV_URL = 'https://raw.githubusercontent.com/streetplantsolar/pv_ivy_web/refs/heads/main/module_db.csv'

def iv_curve_api(request):
    model = request.GET.get('model')
    manufacturer = request.GET.get('manufacturer')
    temp_cell = float(request.GET.get('temperature',25))
    irr = int(request.GET.get('irradiance',1000))
    mods_per_string = int(request.GET.get('modules',1))

    df = pd.read_csv(MODULE_CSV_URL)
    match = df[
    (df['Manufacturer'].str.strip() == manufacturer.strip()) & (df['Model'].str.strip() == model.strip())
    ]

    if match.empty:
        possible = df[df['Manufacturer'].str.contains(manufacturer.split()[0], case=False, na=False)]
        return JsonResponse({
            'error': 'Module not found',
            'manufacturer_query': manufacturer,
            'model_query': model,
            'closest_matches': possible[['Manufacturer', 'Model']].head(5).to_dict(orient='records')
        }, status=404)

    m = match.iloc[0]

    cec = {
        'effective_irradiance': irr,
        'temp_cell': temp_cell,
        'alpha_sc': m.alpha_sc,
        'a_ref': m.a_ref,
        'I_L_ref': m.I_L_ref,
        'I_o_ref': m.I_o_ref,
        'R_sh_ref': m.R_sh_ref,
        'R_s': m.R_s,
        'Adjust': m.Adjust,
        'EgRef': 1.121,
        'dEgdT': -0.0002677,
    }

    IL, I0, Rs, Rsh, nNsVth = pvlib.pvsystem.calcparams_cec(**cec)
    curve = pvlib.pvsystem.singlediode(IL, I0, Rs, Rsh, nNsVth, method='lambertw')

    V = np.linspace(0, curve['v_oc'], 100)
    I = pvlib.pvsystem.i_from_v(voltage=V, method='lambertw',
                                 photocurrent=IL, saturation_current=I0,
                                 resistance_series=Rs, resistance_shunt=Rsh,
                                 nNsVth=nNsVth)
    V = V * mods_per_string
    P = I * V

    return JsonResponse({
        'voltage': V.tolist(),
        'current': I.tolist(),
        'power': P.tolist()
    })

@csrf_exempt  # Only for dev; use proper CSRF token in prod
def detect_anomaly_api(request):
    if request.method == 'POST':
        # Read JSON payload
        import json
        data = json.loads(request.body)

        measured_voltage = np.array(data.get('measured_voltage', []))
        measured_current = np.array(data.get('measured_current', []))
        modeled_voltage = np.array(data.get('modeled_voltage', []))
        modeled_current = np.array(data.get('modeled_current', []))
        module_type_code = data.get('module_type_code', 0)  # Example default

        # Check measured data presence
        if measured_voltage.size == 0 or measured_current.size == 0:
            return JsonResponse({'error': 'Please upload measured data.'})

        P_modeled = modeled_voltage * modeled_current
        max_power_index = np.argmax(P_modeled)

        nameplate = {
            'I_sc_ref': max(modeled_current),
            'V_oc_ref': max(modeled_voltage),
            'I_mp_ref': modeled_current[max_power_index],
            'V_mp_ref': modeled_voltage[max_power_index],
        }
        measured_features = extract_iv_features(measured_voltage, measured_current, nameplate)
        measured_features['module_type_code'] = module_type_code

        feature_vector = pd.DataFrame([measured_features])

        # Load models
        scaler = joblib.load('scaler.pkl')
        classifier = joblib.load('random_forest_classifier.pkl')

        # Reindex columns to match exactly what the scaler was trained with
        expected_features = scaler.feature_names_in_
        feature_vector = feature_vector.reindex(columns=expected_features).fillna(0)

        scaled_features = scaler.transform(feature_vector)
        prediction = classifier.predict(scaled_features)[0]

        return JsonResponse({'anomaly': prediction})

    return JsonResponse({'error': 'Invalid request method'})