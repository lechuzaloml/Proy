from django import forms


class AccesoGoogleForm(forms.Form):
    credential = forms.CharField(widget=forms.HiddenInput)
    next = forms.CharField(required=False, widget=forms.HiddenInput)
