"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path, re_path
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView

from django.views.static import serve 

urlpatterns = [
    path("", include("apps.pages.urls")),
    path("admin/", admin.site.urls),
    path("api/", include("apps.api.urls")),
    path("users/", include(("apps.users.urls", "users"), namespace="users")),
    path("signout/", auth_views.LogoutView.as_view(), name="signout"),
    path("charts/", include("apps.charts.urls")),
    path("tables/", include("apps.tables.urls")),
    path("tasks/", include("apps.tasks.urls")),
    path('api/docs/schema', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/'      , SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path("__debug__/", include("debug_toolbar.urls")),

    re_path(r'^media/(?P<path>.*)$', serve,{'document_root': settings.MEDIA_ROOT}), 
    re_path(r'^static/(?P<path>.*)$', serve,{'document_root': settings.STATIC_ROOT}),     
]

urlpatterns += static(settings.CELERY_LOGS_URL, document_root=settings.CELERY_LOGS_DIR)
urlpatterns += static(settings.MEDIA_URL      , document_root=settings.MEDIA_ROOT     )

urlpatterns += [
    path('accounts/password_reset/', auth_views.PasswordResetView.as_view(), name='password_reset'),
    path('accounts/password_reset/done/', auth_views.PasswordResetDoneView.as_view(), name='password_reset_done'),
    path('accounts/reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('accounts/reset/done/', auth_views.PasswordResetCompleteView.as_view(), name='password_reset_complete'),
]
