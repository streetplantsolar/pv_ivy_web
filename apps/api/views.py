from apps.api.serializers import ProductSerializer
from apps.common.models import Product
from rest_framework import viewsets
from rest_framework import permissions

from django.http import JsonResponse
import pandas as pd
import numpy as np
import pvlib


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
    temp_cell = float(25)
    irr = float(1000)

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

    return JsonResponse({
        'voltage': V.tolist(),
        'current': I.tolist()
    })