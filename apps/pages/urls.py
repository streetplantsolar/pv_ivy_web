# apps/pages/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Other static pages
    path('contact/', views.contact_view, name='contact'),
    path('privacy/', views.privacy_view, name='privacy') 
]
