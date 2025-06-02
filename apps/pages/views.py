# apps/pages/views.py
from django.shortcuts import render
from django.core.mail import send_mail
from django.conf import settings

def landing_view(request):
    return render(request, "pages/starter.html")

def contact_view(request):
    message_sent = False

    if request.method == "POST":
        name = request.POST.get("name")
        email = request.POST.get("email")
        message = request.POST.get("message")

        full_message = f"Message from {name} ({email}):\n\n{message}"

        send_mail(
            subject=f"New Contact Form Message from {name}",
            message=full_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=["streetplantsolar@gmail.com"],
            fail_silently=False,
        )

        message_sent = True  # <=== ✅

    return render(request, "pages/contact.html", {"message_sent": message_sent})

def privacy_view(request):
    return render(request, "pages/privacy.html")