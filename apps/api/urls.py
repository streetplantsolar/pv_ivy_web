from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.api.views import ProductViewSet, iv_curve_api

router = DefaultRouter()
router.register(r'product', ProductViewSet, basename='product')

urlpatterns = [
    path('iv-curve/', iv_curve_api, name='iv_curve_api'), 
    path('', include(router.urls)),
]
